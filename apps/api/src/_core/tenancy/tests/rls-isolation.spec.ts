/**
 * Tests adversariaux d'isolation RLS inter-agences.
 *
 * Deux connexions Prisma :
 *   - prismaAdmin → civora_admin (BYPASSRLS) : seed + vérifications globales
 *   - prismaApp   → civora_app  (soumis à RLS) : tests d'isolation
 *
 * Si un seul test échoue → l'étape n'est PAS terminée.
 */
import { PrismaClient } from '@prisma/client';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

const prismaAdmin = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env['DATABASE_ADMIN_URL'] ??
        'postgresql://civora_admin:civora_admin_secret@localhost:5432/civora',
    },
  },
});

const prismaApp = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env['DATABASE_APP_URL'] ??
        'postgresql://civora_app:civora_app_secret@localhost:5432/civora',
    },
  },
});

let agenceAId: string;
let agenceBId: string;
let entiteA1Id: string;
let entiteA2Id: string;
let entiteB1Id: string;

beforeAll(async () => {
  await prismaAdmin.$connect();
  await prismaApp.$connect();

  // Nettoyage
  await prismaAdmin.$executeRaw`DELETE FROM entites WHERE nom LIKE 'RLS-TEST%'`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE 'rls-test%'`;

  // Seed : 2 agences
  const agenceA = await prismaAdmin.agence.create({
    data: { nom: 'Agence A (RLS)', slug: 'rls-test-agence-a' },
  });
  const agenceB = await prismaAdmin.agence.create({
    data: { nom: 'Agence B (RLS)', slug: 'rls-test-agence-b' },
  });
  agenceAId = agenceA.id;
  agenceBId = agenceB.id;

  // Seed : 3 entites
  const [e1, e2, e3] = await Promise.all([
    prismaAdmin.entite.create({ data: { agence_id: agenceAId, nom: 'RLS-TEST-A1' } }),
    prismaAdmin.entite.create({ data: { agence_id: agenceAId, nom: 'RLS-TEST-A2' } }),
    prismaAdmin.entite.create({ data: { agence_id: agenceBId, nom: 'RLS-TEST-B1' } }),
  ]);
  entiteA1Id = e1.id;
  entiteA2Id = e2.id;
  entiteB1Id = e3.id;
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`DELETE FROM entites WHERE nom LIKE 'RLS-TEST%'`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE 'rls-test%'`;
  await prismaAdmin.$disconnect();
  await prismaApp.$disconnect();
});

describe('RLS — isolation inter-agences', () => {
  it("user de l'agence A ne voit que les entites de A", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceAId}`;
      const entites = await tx.entite.findMany({ where: { nom: { startsWith: 'RLS-TEST' } } });
      expect(entites).toHaveLength(2);
      const ids = entites.map((e) => e.id).sort();
      expect(ids).toEqual([entiteA1Id, entiteA2Id].sort());
    });
  });

  it("user de l'agence A ne peut PAS lire une entite de B meme par ID direct", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceAId}`;
      const found = await tx.entite.findUnique({ where: { id: entiteB1Id } });
      expect(found).toBeNull();
    });
  });

  it("user de l'agence A ne peut PAS update une entite de B", async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceAId}`;
        // Prisma leve P2025 (record not found) car la RLS masque la ligne
        await tx.entite.update({ where: { id: entiteB1Id }, data: { nom: 'pwned' } });
      }),
    ).rejects.toThrow();
  });

  it("user de l'agence A ne peut PAS inserer une entite avec agence_id de B", async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceAId}`;
        await tx.entite.create({ data: { agence_id: agenceBId, nom: 'RLS-TEST-INTRUS' } });
      }),
    ).rejects.toThrow();
  });

  it("sans app.agence_id positionne, aucune ligne n'est visible", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`RESET app.agence_id`;
      const entites = await tx.entite.findMany({ where: { nom: { startsWith: 'RLS-TEST' } } });
      expect(entites).toHaveLength(0);
    });
  });

  it('le role civora_admin (BYPASSRLS) voit toutes les entites', async () => {
    const all = await prismaAdmin.entite.findMany({ where: { nom: { startsWith: 'RLS-TEST' } } });
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});
