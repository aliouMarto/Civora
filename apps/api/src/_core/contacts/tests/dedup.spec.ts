/**
 * Tests du service ContactsDedupService.
 * Utilise prismaAdmin (BYPASSRLS) pour seed + nettoyage.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ContactsRepository } from '../contacts.repository';
import { ContactsDedupService } from '../contacts-dedup.service';

const prismaAdmin = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env['DATABASE_ADMIN_URL'] ??
        'postgresql://civora_admin:civora_admin_secret@localhost:5432/civora',
    },
  },
});

// Patch d'environnement pour que `new PrismaService()` se connecte avec le compte app.
process.env['DATABASE_APP_URL'] =
  process.env['DATABASE_APP_URL'] ??
  'postgresql://civora_app:civora_app_secret@localhost:5432/civora';

let prismaSvc: PrismaService;
let repo: ContactsRepository;
let dedup: ContactsDedupService;

const SLUG = 'dedup-spec-';
let agenceAId: string;
let cExistantId: string;

beforeAll(async () => {
  await prismaAdmin.$connect();
  prismaSvc = new PrismaService();
  await prismaSvc.onModuleInit();

  repo = new ContactsRepository(prismaSvc);
  dedup = new ContactsDedupService(repo);

  await prismaAdmin.$executeRaw`DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG}%`}`;

  const a = await prismaAdmin.agence.create({ data: { nom: 'DEDUP', slug: `${SLUG}a` } });
  agenceAId = a.id;
  const c = await prismaAdmin.contact.create({
    data: {
      agence_id: agenceAId,
      nom: 'Bamba',
      prenom: 'Sory',
      email: 'sory.bamba@example.ci',
      telephone: '+2250707000001',
      roles: ['prospect'],
    },
  });
  cExistantId = c.id;
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG}%`}`;
  await Promise.all([prismaSvc.onModuleDestroy(), prismaAdmin.$disconnect()]);
});

describe('ContactsDedupService', () => {
  it("retourne un match dur sur l'email exact", async () => {
    const matches = await dedup.check({
      agence_id: agenceAId,
      email: 'sory.bamba@example.ci',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(cExistantId);
    expect(matches[0]!.matched_on).toContain('email');
    expect(matches[0]!.isHardConflict).toBe(true);
  });

  it('normalise email avant comparaison (lower/trim)', async () => {
    const matches = await dedup.check({
      agence_id: agenceAId,
      email: '  SORY.BAMBA@example.CI  ',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(cExistantId);
  });

  it('retourne un match dur sur le téléphone exact', async () => {
    const matches = await dedup.check({
      agence_id: agenceAId,
      telephone: '+2250707000001',
    });
    expect(matches[0]!.matched_on).toContain('telephone');
    expect(matches[0]!.isHardConflict).toBe(true);
  });

  it('normalise un téléphone local CI avant comparaison', async () => {
    const matches = await dedup.check({
      agence_id: agenceAId,
      telephone: '0707000001',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(cExistantId);
  });

  it('détecte un nom similaire via pg_trgm (fuzzy)', async () => {
    const matches = await dedup.check({
      agence_id: agenceAId,
      nom: 'Bambaa', // typo
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.matched_on).toContain('nom_similaire');
    expect(matches[0]!.isHardConflict).toBe(false);
  });

  it('exclut un ID donné (utile pour update)', async () => {
    const matches = await dedup.check({
      agence_id: agenceAId,
      email: 'sory.bamba@example.ci',
      excludeId: cExistantId,
    });
    expect(matches).toHaveLength(0);
  });

  it('findHardConflict retourne null si aucun match dur', async () => {
    const conflict = await dedup.findHardConflict({
      agence_id: agenceAId,
      email: 'inconnu@example.ci',
      telephone: '+2250799999999',
    });
    expect(conflict).toBeNull();
  });

  it('findHardConflict ignore les matches nom-only', async () => {
    const conflict = await dedup.findHardConflict({
      agence_id: agenceAId,
      nom: 'Bamba',
    });
    expect(conflict).toBeNull();
  });

  it('retourne [] si aucun critère fourni', async () => {
    expect(await dedup.check({ agence_id: agenceAId })).toEqual([]);
  });
});
