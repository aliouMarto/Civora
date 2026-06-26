/**
 * Tests data-layer du module Biens.
 *
 * Couvre :
 *   1. Isolation RLS (6 patterns standard) — un Bien créé dans l'agence A
 *      n'est pas visible / modifiable / supprimable depuis l'agence B.
 *   2. PostGIS : INSERT avec ST_SetSRID(ST_MakePoint(...)), trigger sync
 *      lat/lng ↔ geo, requête spatiale ST_DWithin utilisant l'index GIST.
 *   3. Vue v_biens_par_commune : retourne uniquement les biens de l'agence
 *      courante (security_invoker=true → hérite de la RLS).
 *   4. Seed : count ≥ 30, diversité des statuts (au moins disponible /
 *      loue / saisonnier / hors_circuit présents).
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

const SLUG_PREFIX = 'biens-data-';

let agenceAId: string;
let agenceBId: string;
let bienA1Id: string;
let bienA2Id: string;
let bienB1Id: string;

// Coordonnées de référence (Cocody)
const COCODY = { lat: 5.3556, lng: -3.9854 };
const PLATEAU = { lat: 5.3237, lng: -4.0247 };
const GRAND_BASSAM = { lat: 5.2132, lng: -3.7384 };

beforeAll(async () => {
  await Promise.all([prismaAdmin.$connect(), prismaApp.$connect()]);

  // Nettoyage idempotent
  await prismaAdmin.$executeRaw`
    DELETE FROM biens WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}`;

  const [a, b] = await Promise.all([
    prismaAdmin.agence.create({ data: { nom: 'BDATA-A', slug: `${SLUG_PREFIX}a` } }),
    prismaAdmin.agence.create({ data: { nom: 'BDATA-B', slug: `${SLUG_PREFIX}b` } }),
  ]);
  agenceAId = a.id;
  agenceBId = b.id;

  const [b1, b2, b3] = await Promise.all([
    prismaAdmin.bien.create({
      data: {
        agence_id: agenceAId,
        reference: 'BDATA-A-001',
        nom: 'Villa Cocody A1',
        type: 'villa',
        usage: 'mixte',
        statut: 'disponible',
        adresse_ligne1: '1 rue test',
        ville: 'Abidjan',
        commune: 'Cocody',
        latitude: COCODY.lat,
        longitude: COCODY.lng,
        loyer_mensuel_xof: 200_000_000n * 100n,
        prix_vente_xof: 350_000_000n * 100n,
      },
    }),
    prismaAdmin.bien.create({
      data: {
        agence_id: agenceAId,
        reference: 'BDATA-A-002',
        nom: 'Appartement Plateau A2',
        type: 'appartement',
        usage: 'location_longue_duree',
        statut: 'loue',
        adresse_ligne1: '2 rue test',
        ville: 'Abidjan',
        commune: 'Plateau',
        latitude: PLATEAU.lat,
        longitude: PLATEAU.lng,
        loyer_mensuel_xof: 50_000_000n * 100n,
      },
    }),
    prismaAdmin.bien.create({
      data: {
        agence_id: agenceBId,
        reference: 'BDATA-B-001',
        nom: 'Villa Bassam B1',
        type: 'villa',
        usage: 'saisonnier',
        statut: 'saisonnier',
        adresse_ligne1: 'plage',
        ville: 'Grand-Bassam',
        commune: 'Centre',
        latitude: GRAND_BASSAM.lat,
        longitude: GRAND_BASSAM.lng,
      },
    }),
  ]);
  bienA1Id = b1.id;
  bienA2Id = b2.id;
  bienB1Id = b3.id;
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`
    DELETE FROM biens WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}`;
  await Promise.all([prismaAdmin.$disconnect(), prismaApp.$disconnect()]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. RLS — les 6 patterns standard appliqués à Bien
// ─────────────────────────────────────────────────────────────────────────────

describe('Biens RLS — isolation inter-agences', () => {
  it("user A ne voit que les biens de A (findMany)", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.bien.findMany({
        where: { reference: { startsWith: 'BDATA-' } },
      });
      const ids = rows.map((r) => r.id).sort();
      expect(ids).toEqual([bienA1Id, bienA2Id].sort());
    });
  });

  it("user A ne peut PAS lire un bien de B par ID direct", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const found = await tx.bien.findUnique({ where: { id: bienB1Id } });
      expect(found).toBeNull();
    });
  });

  it("user A ne peut PAS UPDATE un bien de B", async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.bien.update({ where: { id: bienB1Id }, data: { nom: 'pwned' } });
      }),
    ).rejects.toThrow();
  });

  it("user A ne peut PAS INSERT un bien avec agence_id=B", async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.bien.create({
          data: {
            agence_id: agenceBId, // tentative d'évasion
            reference: 'INTRUS-001',
            nom: 'Intrus',
            type: 'autre',
            adresse_ligne1: 'x',
            ville: 'X',
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("user A ne peut PAS DELETE un bien de B", async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.bien.delete({ where: { id: bienB1Id } });
      }),
    ).rejects.toThrow();
  });

  it("sans app.agence_id positionné, aucun bien n'est visible", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`RESET app.agence_id`;
      const rows = await tx.bien.findMany({
        where: { reference: { startsWith: 'BDATA-' } },
      });
      expect(rows).toHaveLength(0);
    });
  });

  it('civora_admin (BYPASSRLS) voit tous les biens seed', async () => {
    const rows = await prismaAdmin.bien.findMany({
      where: { reference: { startsWith: 'BDATA-' } },
    });
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PostGIS : trigger de sync lat/lng ↔ geo + requêtes spatiales
// ─────────────────────────────────────────────────────────────────────────────

describe('Biens PostGIS', () => {
  it('le trigger remplit geo à partir de latitude/longitude', async () => {
    const rows = await prismaAdmin.$queryRaw<Array<{ has_geo: boolean; lng: number; lat: number }>>`
      SELECT (geo IS NOT NULL) AS has_geo,
             ST_X(geo)::float8 AS lng,
             ST_Y(geo)::float8 AS lat
      FROM biens
      WHERE id = ${bienA1Id}::uuid
    `;
    expect(rows[0]?.has_geo).toBe(true);
    expect(rows[0]?.lng).toBeCloseTo(COCODY.lng, 3);
    expect(rows[0]?.lat).toBeCloseTo(COCODY.lat, 3);
  });

  it('insertion en raw SQL via ST_SetSRID(ST_MakePoint) fonctionne', async () => {
    const id = (await prismaAdmin.$queryRaw<Array<{ id: string }>>`
      INSERT INTO biens
        (agence_id, reference, nom, type, usage, statut, adresse_ligne1, ville, geo)
      VALUES (
        ${agenceAId}::uuid,
        'BDATA-A-RAW-001',
        'Bien insert raw',
        'studio'::"BienType",
        'location_longue_duree'::"BienUsage",
        'disponible'::"BienStatut",
        'adresse raw',
        'Abidjan',
        ST_SetSRID(ST_MakePoint(${COCODY.lng}, ${COCODY.lat}), 4326)
      )
      RETURNING id
    `)[0]!.id;

    // Trigger inverse : geo posé → lat/lng remplis automatiquement
    const back = await prismaAdmin.bien.findUnique({ where: { id } });
    expect(back?.latitude?.toString()).toMatch(/^5\.355/);
    expect(back?.longitude?.toString()).toMatch(/^-3\.985/);

    await prismaAdmin.bien.delete({ where: { id } });
  });

  it('ST_DWithin retourne les biens dans un rayon de 5 km autour de Cocody', async () => {
    const rows = await prismaAdmin.$queryRaw<Array<{ id: string; distance_m: number }>>`
      SELECT
        id,
        ST_Distance(
          geo::geography,
          ST_SetSRID(ST_MakePoint(${COCODY.lng}, ${COCODY.lat}), 4326)::geography
        ) AS distance_m
      FROM biens
      WHERE agence_id = ${agenceAId}::uuid
        AND ST_DWithin(
          geo::geography,
          ST_SetSRID(ST_MakePoint(${COCODY.lng}, ${COCODY.lat}), 4326)::geography,
          5000
        )
      ORDER BY distance_m
    `;
    // bienA1 est À Cocody → distance ≈ 0 m, doit apparaître
    expect(rows.some((r) => r.id === bienA1Id)).toBe(true);
    // bienA2 est à Plateau (~6 km de Cocody) → peut ou pas apparaître selon jitter
    // bienB1 est à Grand-Bassam (45+ km) → NE DOIT PAS apparaître
    expect(rows.some((r) => r.id === bienB1Id)).toBe(false);
  });

  it('le plan EXPLAIN du ST_DWithin utilise l\'index GIST', async () => {
    // Avec un petit volume Postgres peut préférer un Seq Scan : on force les index
    await prismaAdmin.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      const plan = await tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
        `EXPLAIN (FORMAT TEXT)
         SELECT id FROM biens
         WHERE ST_DWithin(
           geo::geography,
           ST_SetSRID(ST_MakePoint(${COCODY.lng}, ${COCODY.lat}), 4326)::geography,
           5000
         )`,
      );
      const text = plan.map((p) => p['QUERY PLAN']).join('\n');
      expect(text).toMatch(/biens_geo_gist_idx|Bitmap Index Scan|Index Scan/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Vue v_biens_par_commune avec security_invoker
// ─────────────────────────────────────────────────────────────────────────────

describe('Vue v_biens_par_commune — héritage RLS', () => {
  it('user A ne voit dans la vue que ses propres communes', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.$queryRaw<Array<{ commune: string; total: bigint; agence_id: string }>>`
        SELECT commune, total, agence_id FROM v_biens_par_commune
        WHERE agence_id = ${agenceAId}::uuid
           OR agence_id = ${agenceBId}::uuid
      `;
      // Ne doit retourner QUE les agrégats de l'agence A (RLS héritée via security_invoker)
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.agence_id === agenceAId)).toBe(true);
    });
  });

  it('compte cohérent : Cocody contient bienA1, Plateau contient bienA2', async () => {
    const rows = await prismaAdmin.$queryRaw<Array<{ commune: string; total: bigint }>>`
      SELECT commune, total FROM v_biens_par_commune
      WHERE agence_id = ${agenceAId}::uuid
      ORDER BY commune
    `;
    const cocody = rows.find((r) => r.commune === 'Cocody');
    const plateau = rows.find((r) => r.commune === 'Plateau');
    expect(Number(cocody?.total ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(plateau?.total ?? 0)).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Seed validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Seed Biens — vérification', () => {
  it("au moins 30 biens sur l'agence dev-agence (après seed:biens)", async () => {
    const agence = await prismaAdmin.agence.findUnique({ where: { slug: 'dev-agence' } });
    if (!agence) {
      // eslint-disable-next-line no-console
      console.warn('  ⚠️  Aucune agence dev-agence trouvée — passer pnpm seed:biens pour activer ce test.');
      return;
    }
    const count = await prismaAdmin.bien.count({
      where: { agence_id: agence.id, reference: { startsWith: 'BIE-2026-' } },
    });
    if (count === 0) {
      // eslint-disable-next-line no-console
      console.warn('  ⚠️  Aucun bien BIE-2026-* sur dev-agence — passer pnpm seed:biens pour activer ce test.');
      return;
    }
    expect(count).toBeGreaterThanOrEqual(30);

    // Diversité des statuts
    const byStatut = await prismaAdmin.bien.groupBy({
      by: ['statut'],
      where: { agence_id: agence.id, reference: { startsWith: 'BIE-2026-' } },
      _count: true,
    });
    const statuts = new Set(byStatut.map((s) => s.statut));
    expect(statuts.has('disponible')).toBe(true);
    expect(statuts.has('loue')).toBe(true);
    expect(statuts.has('saisonnier')).toBe(true);
    expect(statuts.has('hors_circuit')).toBe(true);

    // Tous les biens du seed ont des coordonnées (le seed met lat/lng systématiquement)
    const sansCoord = await prismaAdmin.bien.count({
      where: {
        agence_id: agence.id,
        reference: { startsWith: 'BIE-2026-' },
        OR: [{ latitude: null }, { longitude: null }],
      },
    });
    expect(sansCoord).toBe(0);
  });
});
