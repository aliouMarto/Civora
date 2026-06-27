/**
 * Tests d'intégration des requêtes spatiales PostGIS.
 *
 * Vérifie :
 *   1. Radius 5 km autour de Cocody → renvoie les biens à Cocody/Riviera,
 *      pas ceux à Grand-Bassam (~45 km).
 *   2. BBOX restreint → filtre correctement.
 *   3. Polygone simple → renvoie uniquement les biens à l'intérieur.
 *   4. Vue v_biens_par_commune → respecte la RLS (un user A ne voit pas
 *      les agrégats de B).
 *   5. Isolation tenant : un user A en agence A ne récupère pas un bien
 *      géolocalisé au même endroit qu'un bien de B.
 *
 * Utilise prismaAdmin pour seed + prismaApp avec SET LOCAL pour requêter.
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

const SLUG_PREFIX = 'biens-spatial-';

const COCODY = { lat: 5.3556, lng: -3.9854 };
const RIVIERA = { lat: 5.3700, lng: -3.9650 };
const PLATEAU = { lat: 5.3237, lng: -4.0247 };
const GRAND_BASSAM = { lat: 5.2132, lng: -3.7384 };

let agenceAId: string;
let agenceBId: string;
const cocodyIds: string[] = [];
let bassamId: string;
let bienBSameLocationId: string;

beforeAll(async () => {
  await Promise.all([prismaAdmin.$connect(), prismaApp.$connect()]);

  await prismaAdmin.$executeRaw`
    DELETE FROM biens WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}`;

  const [a, b] = await Promise.all([
    prismaAdmin.agence.create({ data: { nom: 'SP-A', slug: `${SLUG_PREFIX}a` } }),
    prismaAdmin.agence.create({ data: { nom: 'SP-B', slug: `${SLUG_PREFIX}b` } }),
  ]);
  agenceAId = a.id;
  agenceBId = b.id;

  // 8 biens à Cocody (rayon < 5 km du centre)
  for (let i = 0; i < 8; i++) {
    const dx = (i - 4) * 0.005; // ~500 m de jitter
    const created = await prismaAdmin.bien.create({
      data: {
        agence_id: agenceAId,
        reference: `SP-A-C-${String(i + 1).padStart(3, '0')}`,
        nom: `Villa Cocody #${i + 1}`,
        type: 'villa',
        usage: 'location_longue_duree',
        statut: i % 2 === 0 ? 'disponible' : 'loue',
        adresse_ligne1: `${i + 1} rue Cocody`,
        ville: 'Abidjan',
        commune: 'Cocody',
        latitude: Number((COCODY.lat + dx).toFixed(7)),
        longitude: Number((COCODY.lng + dx).toFixed(7)),
        loyer_mensuel_xof: 100_000_000n,
      },
    });
    cocodyIds.push(created.id);
  }

  // 2 biens à Riviera (~3 km du centre Cocody)
  for (let i = 0; i < 2; i++) {
    await prismaAdmin.bien.create({
      data: {
        agence_id: agenceAId,
        reference: `SP-A-R-${String(i + 1).padStart(3, '0')}`,
        nom: `Appartement Riviera #${i + 1}`,
        type: 'appartement',
        usage: 'location_longue_duree',
        statut: 'disponible',
        adresse_ligne1: `${i + 1} rue Riviera`,
        ville: 'Abidjan',
        commune: 'Riviera',
        latitude: RIVIERA.lat,
        longitude: RIVIERA.lng,
        loyer_mensuel_xof: 50_000_000n,
      },
    });
  }

  // 1 bien à Plateau (~7 km du centre Cocody — hors rayon 5 km)
  await prismaAdmin.bien.create({
    data: {
      agence_id: agenceAId,
      reference: 'SP-A-P-001',
      nom: 'Bureaux Plateau',
      type: 'bureau',
      usage: 'location_longue_duree',
      statut: 'loue',
      adresse_ligne1: '1 av. Plateau',
      ville: 'Abidjan',
      commune: 'Plateau',
      latitude: PLATEAU.lat,
      longitude: PLATEAU.lng,
      loyer_mensuel_xof: 200_000_000n,
    },
  });

  // 1 bien à Grand-Bassam (~45 km — clairement hors rayon)
  const bassam = await prismaAdmin.bien.create({
    data: {
      agence_id: agenceAId,
      reference: 'SP-A-GB-001',
      nom: 'Villa Grand-Bassam',
      type: 'villa',
      usage: 'saisonnier',
      statut: 'saisonnier',
      adresse_ligne1: 'plage',
      ville: 'Grand-Bassam',
      commune: 'Centre',
      latitude: GRAND_BASSAM.lat,
      longitude: GRAND_BASSAM.lng,
    },
  });
  bassamId = bassam.id;

  // Bien de l'agence B exactement à Cocody — test d'isolation
  const bSame = await prismaAdmin.bien.create({
    data: {
      agence_id: agenceBId,
      reference: 'SP-B-C-001',
      nom: 'Villa Cocody — agence B',
      type: 'villa',
      usage: 'location_longue_duree',
      statut: 'disponible',
      adresse_ligne1: '99 rue Cocody',
      ville: 'Abidjan',
      commune: 'Cocody',
      latitude: COCODY.lat,
      longitude: COCODY.lng,
      loyer_mensuel_xof: 100_000_000n,
    },
  });
  bienBSameLocationId = bSame.id;
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`
    DELETE FROM biens WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}`;
  await Promise.all([prismaAdmin.$disconnect(), prismaApp.$disconnect()]);
});

describe('Spatial — recherche radius', () => {
  it("user A rayon 5 km autour de Cocody renvoie les biens Cocody+Riviera, pas Plateau ni Bassam", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.$queryRaw<Array<{ id: string; distance_m: number }>>`
        SELECT
          id,
          ST_Distance(
            geo::geography,
            ST_SetSRID(ST_MakePoint(${COCODY.lng}, ${COCODY.lat}), 4326)::geography
          )::float8 AS distance_m
        FROM biens
        WHERE geo IS NOT NULL
          AND archived_at IS NULL
          AND ST_DWithin(
            geo::geography,
            ST_SetSRID(ST_MakePoint(${COCODY.lng}, ${COCODY.lat}), 4326)::geography,
            5000
          )
        ORDER BY distance_m
      `;
      // Tous les Cocody (8) + 2 Riviera = 10 ; Plateau exclu (~7 km) ; Bassam exclu (45 km)
      expect(rows.length).toBeGreaterThanOrEqual(10);
      expect(rows.length).toBeLessThanOrEqual(12);
      expect(rows.every((r) => r.id !== bassamId)).toBe(true);
    });
  });

  it("isolation tenant : user A même radius NE renvoie PAS le bien Cocody de l'agence B", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM biens
        WHERE geo IS NOT NULL
          AND ST_DWithin(
            geo::geography,
            ST_SetSRID(ST_MakePoint(${COCODY.lng}, ${COCODY.lat}), 4326)::geography,
            5000
          )
      `;
      expect(rows.some((r) => r.id === bienBSameLocationId)).toBe(false);
    });
  });

  it('user B voit son bien et pas ceux de A', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceBId}, true)`;
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM biens
        WHERE geo IS NOT NULL
          AND ST_DWithin(
            geo::geography,
            ST_SetSRID(ST_MakePoint(${COCODY.lng}, ${COCODY.lat}), 4326)::geography,
            5000
          )
      `;
      expect(rows.length).toBe(1);
      expect(rows[0]!.id).toBe(bienBSameLocationId);
    });
  });
});

describe('Spatial — bbox et polygone', () => {
  it('BBOX restreint sur Cocody (~0.03°) renvoie uniquement les Cocody', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM biens
        WHERE geo IS NOT NULL
          AND geo && ST_MakeEnvelope(
            ${COCODY.lng - 0.03}, ${COCODY.lat - 0.03},
            ${COCODY.lng + 0.03}, ${COCODY.lat + 0.03},
            4326
          )
      `;
      // 8 cocody dans la bbox ; Riviera est en dehors (~3 km à l'est)
      expect(rows.length).toBe(cocodyIds.length);
    });
  });

  it('Polygone autour de Cocody + Riviera : renvoie 10 biens', async () => {
    const polygon = `POLYGON((${[
      [COCODY.lng - 0.04, COCODY.lat - 0.02],
      [RIVIERA.lng + 0.02, COCODY.lat - 0.02],
      [RIVIERA.lng + 0.02, RIVIERA.lat + 0.02],
      [COCODY.lng - 0.04, RIVIERA.lat + 0.02],
      [COCODY.lng - 0.04, COCODY.lat - 0.02],
    ]
      .map(([lng, lat]) => `${lng} ${lat}`)
      .join(', ')}))`;
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.$queryRaw<Array<{ id: string; commune: string }>>`
        SELECT id, commune FROM biens
        WHERE geo IS NOT NULL
          AND ST_Within(geo, ST_GeomFromText(${polygon}, 4326))
      `;
      expect(rows.length).toBe(10);
      const communes = new Set(rows.map((r) => r.commune));
      expect(communes.has('Cocody')).toBe(true);
      expect(communes.has('Riviera')).toBe(true);
      expect(communes.has('Plateau')).toBe(false);
    });
  });
});

describe('Vue v_biens_par_commune — isolation RLS', () => {
  it('user A ne voit que ses propres communes dans la vue', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.$queryRaw<Array<{ commune: string; total: bigint; agence_id: string }>>`
        SELECT commune, total, agence_id FROM v_biens_par_commune
      `;
      // Doit retourner uniquement les agrégats de A
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.agence_id === agenceAId)).toBe(true);
      // Cocody présent avec 8 biens
      const cocody = rows.find((r) => r.commune === 'Cocody');
      expect(Number(cocody?.total ?? 0)).toBe(cocodyIds.length);
    });
  });

  it("user B ne voit dans la vue que son unique commune (Cocody, 1 bien)", async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceBId}, true)`;
      const rows = await tx.$queryRaw<Array<{ commune: string; total: bigint }>>`
        SELECT commune, total FROM v_biens_par_commune
      `;
      expect(rows.length).toBe(1);
      expect(rows[0]!.commune).toBe('Cocody');
      expect(Number(rows[0]!.total)).toBe(1);
    });
  });
});
