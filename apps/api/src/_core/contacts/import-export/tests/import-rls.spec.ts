/**
 * Test d'isolation tenant pour le pipeline d'import.
 *
 * On vérifie qu'un import lancé pour l'agence A ne peut JAMAIS écrire dans
 * l'agence B — même en cas de bug logique dans le worker — grâce à :
 *   1. SET LOCAL app.agence_id = A dans la transaction du worker.
 *   2. Politique RLS sur contacts avec FORCE.
 *
 * Le test simule l'effet du worker en faisant un INSERT manuel via la
 * connexion civora_app après SET app.agence_id = A, en tentant de pousser
 * agence_id = B. La politique RLS WITH CHECK doit refuser.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const SLUG = 'import-rls-';
let agenceAId: string;
let agenceBId: string;

beforeAll(async () => {
  await Promise.all([prismaAdmin.$connect(), prismaApp.$connect()]);
  await prismaAdmin.$executeRaw`
    DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})
  `;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG}%`}`;
  const [a, b] = await Promise.all([
    prismaAdmin.agence.create({ data: { nom: 'IR-A', slug: `${SLUG}a` } }),
    prismaAdmin.agence.create({ data: { nom: 'IR-B', slug: `${SLUG}b` } }),
  ]);
  agenceAId = a.id;
  agenceBId = b.id;
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`
    DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})
  `;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG}%`}`;
  await Promise.all([prismaAdmin.$disconnect(), prismaApp.$disconnect()]);
});

describe('Import — isolation tenant', () => {
  it('un worker A ne peut PAS insérer un contact dans l\'agence B', async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        // Tentative d'évasion : agence_id du payload pointe sur B
        await tx.contact.create({
          data: {
            agence_id: agenceBId,
            nom: 'Intrus-Import',
            email: 'intrus@example.ci',
            roles: ['prospect'],
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('un worker A peut insérer un contact dans l\'agence A', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      await tx.contact.create({
        data: {
          agence_id: agenceAId,
          nom: 'Legit-Import',
          email: 'legit-import@example.ci',
          roles: ['prospect'],
        },
      });
    });
    const found = await prismaAdmin.contact.findFirst({
      where: { email: 'legit-import@example.ci' },
    });
    expect(found?.agence_id).toBe(agenceAId);
  });

  it('sans app.agence_id, l\'INSERT échoue (RLS bloque la WITH CHECK)', async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`RESET app.agence_id`;
        await tx.contact.create({
          data: {
            agence_id: agenceAId,
            nom: 'Sans-Tenant',
            email: 'sans-tenant@example.ci',
            roles: ['prospect'],
          },
        });
      }),
    ).rejects.toThrow();
  });
});
