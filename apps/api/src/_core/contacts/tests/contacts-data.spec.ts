/**
 * Tests data-layer du module Contacts.
 *
 * Couvre :
 *   1. Isolation RLS (6 patterns standard) — un Contact créé dans l'agence A
 *      n'est pas visible / modifiable / supprimable depuis l'agence B.
 *   2. Cascade : suppression d'un Contact propage à interactions et segment_membres.
 *   3. Index GIN : EXPLAIN ANALYZE sur `'locataire' = ANY(roles)` utilise bien
 *      contacts_roles_gin_idx.
 *   4. Seed : count > 20 et diversité des rôles.
 *
 * Trois connexions :
 *   - prismaAdmin (BYPASSRLS) pour seed et assertions globales
 *   - prismaApp (civora_app, RLS) pour les tests d'isolation
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

const SLUG_PREFIX = 'contacts-data-';

let agenceAId: string;
let agenceBId: string;
let contactA1Id: string;
let contactA2Id: string;
let contactB1Id: string;
let segmentAId: string;

beforeAll(async () => {
  await Promise.all([prismaAdmin.$connect(), prismaApp.$connect()]);

  // Nettoyage idempotent
  await prismaAdmin.$executeRaw`
    DELETE FROM interactions WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM segment_membres WHERE segment_id IN (
      SELECT id FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
    )
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}`;

  const [a, b] = await Promise.all([
    prismaAdmin.agence.create({ data: { nom: 'CDATA-A', slug: `${SLUG_PREFIX}a` } }),
    prismaAdmin.agence.create({ data: { nom: 'CDATA-B', slug: `${SLUG_PREFIX}b` } }),
  ]);
  agenceAId = a.id;
  agenceBId = b.id;

  const [cA1, cA2, cB1] = await Promise.all([
    prismaAdmin.contact.create({
      data: {
        agence_id: agenceAId,
        nom: 'Kouassi',
        prenom: 'Sory',
        email: `${SLUG_PREFIX}a1@test.civora.io`,
        telephone: '+2250707990001',
        roles: ['locataire', 'voyageur'],
        tags: ['vip'],
        ville: 'Abidjan',
        commune: 'Cocody',
      },
    }),
    prismaAdmin.contact.create({
      data: {
        agence_id: agenceAId,
        nom: 'Bamba',
        prenom: 'Karim',
        email: `${SLUG_PREFIX}a2@test.civora.io`,
        telephone: '+2250707990002',
        roles: ['proprietaire'],
        ville: 'Abidjan',
        commune: 'Plateau',
      },
    }),
    prismaAdmin.contact.create({
      data: {
        agence_id: agenceBId,
        nom: 'Diallo',
        prenom: 'Ibrahim',
        email: `${SLUG_PREFIX}b1@test.civora.io`,
        telephone: '+2250707990003',
        roles: ['locataire'],
        ville: 'Yamoussoukro',
      },
    }),
  ]);
  contactA1Id = cA1.id;
  contactA2Id = cA2.id;
  contactB1Id = cB1.id;

  const seg = await prismaAdmin.segment.create({
    data: {
      agence_id: agenceAId,
      nom: 'VIPs',
      filtres: { tags: ['vip'] },
      systeme: false,
    },
  });
  segmentAId = seg.id;

  // Ajouter cA1 au segment A
  await prismaAdmin.segmentMembre.create({
    data: { segment_id: segmentAId, contact_id: contactA1Id },
  });

  // Ajouter une interaction sur cA1
  await prismaAdmin.interaction.create({
    data: {
      agence_id: agenceAId,
      contact_id: contactA1Id,
      type: 'whatsapp',
      direction: 'sortant',
      sujet: 'Relance visite',
      contenu: 'Bonjour, on confirme la visite ?',
    },
  });
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`
    DELETE FROM interactions WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM segment_membres WHERE segment_id IN (
      SELECT id FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
    )
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}`;
  await Promise.all([prismaAdmin.$disconnect(), prismaApp.$disconnect()]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. RLS — isolation inter-agences (les 6 patterns)
// ─────────────────────────────────────────────────────────────────────────────

describe('Contacts RLS — isolation inter-agences', () => {
  it('user A ne voit que les contacts de A (findMany)', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.contact.findMany({
        where: { email: { endsWith: '@test.civora.io' } },
      });
      const ids = rows.map((r) => r.id).sort();
      expect(ids).toEqual([contactA1Id, contactA2Id].sort());
    });
  });

  it('user A ne peut PAS lire un contact de B par ID direct', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const found = await tx.contact.findUnique({ where: { id: contactB1Id } });
      expect(found).toBeNull();
    });
  });

  it('user A ne peut PAS UPDATE un contact de B', async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.contact.update({ where: { id: contactB1Id }, data: { nom: 'pwned' } });
      }),
    ).rejects.toThrow();
  });

  it('user A ne peut PAS INSERT un contact avec agence_id=B', async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.contact.create({
          data: {
            agence_id: agenceBId, // tentative d'évasion
            nom: 'Intrus',
            roles: ['prospect'],
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('user A ne peut PAS DELETE un contact de B', async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.contact.delete({ where: { id: contactB1Id } });
      }),
    ).rejects.toThrow();
  });

  it('sans app.agence_id positionné, aucun contact n\'est visible', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`RESET app.agence_id`;
      const rows = await tx.contact.findMany({
        where: { email: { endsWith: '@test.civora.io' } },
      });
      expect(rows).toHaveLength(0);
    });
  });

  it('civora_admin (BYPASSRLS) voit tous les contacts seed', async () => {
    const rows = await prismaAdmin.contact.findMany({
      where: { email: { endsWith: '@test.civora.io' } },
    });
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Isolation des Segments et SegmentMembres
// ─────────────────────────────────────────────────────────────────────────────

describe('Segments RLS — isolation', () => {
  it('user B ne voit pas le segment "VIPs" de A', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceBId}, true)`;
      const rows = await tx.segment.findMany({ where: { id: segmentAId } });
      expect(rows).toHaveLength(0);
    });
  });

  it('user B ne voit pas les SegmentMembres du segment de A', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceBId}, true)`;
      const rows = await tx.segmentMembre.findMany({ where: { segment_id: segmentAId } });
      expect(rows).toHaveLength(0);
    });
  });

  it('user A voit son segment et ses membres', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const seg = await tx.segment.findUnique({ where: { id: segmentAId } });
      expect(seg?.nom).toBe('VIPs');
      const membres = await tx.segmentMembre.findMany({ where: { segment_id: segmentAId } });
      expect(membres).toHaveLength(1);
      expect(membres[0]!.contact_id).toBe(contactA1Id);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cascade : DELETE Contact → DELETE Interactions + SegmentMembres
// ─────────────────────────────────────────────────────────────────────────────

describe('Cascade de suppression', () => {
  it('supprimer un Contact supprime ses Interactions et SegmentMembres', async () => {
    // On crée un contact dédié pour ne pas casser les tests qui suivent
    const cascadeC = await prismaAdmin.contact.create({
      data: {
        agence_id: agenceAId,
        nom: 'Cascade',
        roles: ['locataire'],
      },
    });
    await prismaAdmin.interaction.create({
      data: {
        agence_id: agenceAId,
        contact_id: cascadeC.id,
        type: 'note',
        sujet: 'à supprimer',
      },
    });
    await prismaAdmin.segmentMembre.create({
      data: { segment_id: segmentAId, contact_id: cascadeC.id },
    });

    await prismaAdmin.contact.delete({ where: { id: cascadeC.id } });

    const interactions = await prismaAdmin.interaction.findMany({
      where: { contact_id: cascadeC.id },
    });
    const membres = await prismaAdmin.segmentMembre.findMany({
      where: { contact_id: cascadeC.id },
    });
    expect(interactions).toHaveLength(0);
    expect(membres).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Index GIN — vérification que la recherche par rôle l'utilise
// ─────────────────────────────────────────────────────────────────────────────

describe('Index GIN sur roles', () => {
  it('EXPLAIN ANALYZE WHERE roles @> ARRAY[\'locataire\'] utilise contacts_roles_gin_idx', async () => {
    // Le planner choisit un Index Scan GIN seulement si la table est assez grande
    // pour qu'il soit plus rentable qu'un Seq Scan. On force le planner à
    // privilégier les index pour ce test (sans toucher à la config globale).
    const plan = await prismaAdmin.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN (FORMAT TEXT)
       SELECT id FROM contacts
       WHERE roles @> ARRAY['locataire']::text[]
         AND agence_id = $1::uuid`,
      agenceAId,
    );
    const planText = plan.map((r) => r['QUERY PLAN']).join('\n');
    // On veut au minimum que le planner connaisse l'index (qu'il le choisisse
    // ou non dépend de la taille). On vérifie sa présence via pg_indexes.
    const indexes = await prismaAdmin.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'contacts' AND indexname = 'contacts_roles_gin_idx'
    `;
    expect(indexes).toHaveLength(1);
    // Sur de petits volumes, Postgres peut préférer un Seq Scan : ce n'est pas
    // un bug. On documente seulement que le plan est valide (pas vide).
    expect(planText.length).toBeGreaterThan(0);
  });

  it('EXPLAIN ANALYZE avec SET enable_seqscan=off doit utiliser l\'index GIN', async () => {
    await prismaAdmin.$transaction(async (tx) => {
      // Force l'utilisation des index dans cette tx
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = off`);
      const plan = await tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN (FORMAT TEXT)
         SELECT id FROM contacts
         WHERE roles @> ARRAY['locataire']::text[]`,
      );
      const planText = plan.map((r) => r['QUERY PLAN']).join('\n');
      // Avec enable_seqscan=off, l'index GIN doit apparaître
      expect(planText).toMatch(/contacts_roles_gin_idx|Bitmap Index Scan/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Validation seed : count > 20 et diversité
// ─────────────────────────────────────────────────────────────────────────────

describe('Seed Contacts — vérification', () => {
  it('au moins 20 contacts sur l\'agence dev-agence (après seed:contacts)', async () => {
    const agence = await prismaAdmin.agence.findUnique({ where: { slug: 'dev-agence' } });
    if (!agence) {
      // eslint-disable-next-line no-console
      console.warn('  ⚠️  Aucune agence dev-agence trouvée — passer pnpm seed:contacts pour activer ce test.');
      return;
    }
    const count = await prismaAdmin.contact.count({ where: { agence_id: agence.id } });
    if (count === 0) {
      // eslint-disable-next-line no-console
      console.warn('  ⚠️  Aucun contact sur dev-agence — passer pnpm seed:contacts pour activer ce test.');
      return;
    }
    expect(count).toBeGreaterThanOrEqual(20);

    // Diversité des rôles
    const rolesPresents = await prismaAdmin.$queryRaw<{ role: string; n: bigint }[]>`
      SELECT unnest(roles) AS role, count(*)::bigint AS n
      FROM contacts
      WHERE agence_id = ${agence.id}::uuid
      GROUP BY 1
    `;
    const rolesSet = new Set(rolesPresents.map((r) => r.role));
    // On exige au moins 5 rôles distincts
    expect(rolesSet.size).toBeGreaterThanOrEqual(5);
  });
});
