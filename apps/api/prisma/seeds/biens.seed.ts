/**
 * Seed dev — Module Biens.
 *
 * Crée 40 biens variés rattachés à l'agence de démo (slug "dev-agence").
 *
 * Diversité :
 *   - 4 statuts : disponible (40%), loue (40%), saisonnier (15%), hors_circuit (5%)
 *   - 8 types : villa, appartement, studio, bureau, local_commercial, terrain, immeuble, autre
 *   - 4 usages : vente, location_longue_duree, saisonnier, mixte
 *   - 7 communes d'Abidjan + 1 hors Abidjan (Bingerville, Grand-Bassam)
 *   - Coordonnées géographiques réelles (WGS84)
 *
 * Garde-fou : NE RIEN FAIRE en production.
 * Utilise civora_admin (BYPASSRLS) — légitime pour seed cross-tenant.
 *
 * Usage : pnpm --filter @civora/api seed:biens
 */
import { PrismaClient } from '@prisma/client';

if (process.env['NODE_ENV'] === 'production') {
  // eslint-disable-next-line no-console
  console.error('biens.seed.ts : refus d\'exécution en production.');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env['DATABASE_ADMIN_URL'] ??
        process.env['DATABASE_URL'] ??
        'postgresql://civora_admin:civora_admin_secret@localhost:5432/civora',
    },
  },
});

const DEMO_AGENCE_SLUG = 'dev-agence';

// ─── Localités d'Abidjan + alentours (coordonnées WGS84 réelles) ─────────────
interface Localite {
  ville: string;
  commune: string;
  lat: number;
  lng: number;
}

const LOCALITES: Localite[] = [
  { ville: 'Abidjan', commune: 'Cocody',      lat: 5.3556, lng: -3.9854 },
  { ville: 'Abidjan', commune: 'Plateau',     lat: 5.3237, lng: -4.0247 },
  { ville: 'Abidjan', commune: 'Marcory',     lat: 5.2902, lng: -3.9951 },
  { ville: 'Abidjan', commune: 'Yopougon',    lat: 5.3455, lng: -4.1106 },
  { ville: 'Abidjan', commune: 'Riviera',     lat: 5.3700, lng: -3.9650 },
  { ville: 'Abidjan', commune: 'Treichville', lat: 5.2987, lng: -4.0131 },
  { ville: 'Abidjan', commune: 'Angré',       lat: 5.3833, lng: -3.9842 },
  { ville: 'Bingerville', commune: 'Centre',  lat: 5.3590, lng: -3.8920 },
  { ville: 'Grand-Bassam', commune: 'Centre', lat: 5.2132, lng: -3.7384 },
];

// Petit jitter pour éviter que tous les biens d'une commune aient
// exactement la même coord (simule des adresses distinctes).
function jitter(value: number, range = 0.005): number {
  return Number((value + (Math.random() * 2 - 1) * range).toFixed(7));
}

// ─── Définition des biens ────────────────────────────────────────────────────
// Convention montants : centimes FCFA. Ex : 5_000_000 FCFA = 500_000_000n centimes.

type BienFixture = {
  type: 'villa' | 'appartement' | 'studio' | 'bureau' | 'local_commercial' | 'terrain' | 'immeuble' | 'autre';
  usage: 'vente' | 'location_longue_duree' | 'saisonnier' | 'mixte';
  statut: 'disponible' | 'loue' | 'saisonnier' | 'hors_circuit';
  nom: string;
  surface?: number;
  chambres?: number;
  loyer_xof?: bigint;
  vente_xof?: bigint;
  charges_xof?: bigint;
  amenities?: string[];
  locIdx: number;
  yield_pct?: number;
  scoreOcc?: 'A+' | 'A' | 'B' | 'C';
};

const F: BienFixture[] = [
  // ── 16 disponibles (40%)
  { type: 'villa',         usage: 'mixte',                 statut: 'disponible', nom: 'Villa 4ch piscine Cocody',          surface: 320, chambres: 4, loyer_xof: 250_000_000n * 100n, vente_xof: 350_000_000n * 100n, amenities: ['piscine','jardin','climatisation','parking'], locIdx: 0, yield_pct: 8.5, scoreOcc: 'A' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'disponible', nom: 'F3 Riviera',                          surface: 95,  chambres: 3, loyer_xof:  35_000_000n * 100n,                                  amenities: ['climatisation','parking'],                  locIdx: 4, yield_pct: 7.2, scoreOcc: 'A' },
  { type: 'studio',        usage: 'location_longue_duree', statut: 'disponible', nom: 'Studio meublé Plateau',               surface: 32,  chambres: 1, loyer_xof:  18_000_000n * 100n,                                  amenities: ['meuble','climatisation'],                   locIdx: 1, yield_pct: 9.1, scoreOcc: 'A+' },
  { type: 'bureau',        usage: 'location_longue_duree', statut: 'disponible', nom: 'Bureaux Plateau 200m²',               surface: 200,              loyer_xof:  90_000_000n * 100n,                                  amenities: ['climatisation','parking'],                  locIdx: 1, yield_pct: 6.8, scoreOcc: 'B' },
  { type: 'villa',         usage: 'vente',                 statut: 'disponible', nom: 'Villa Angré 5ch jardin',              surface: 400, chambres: 5,                              vente_xof: 280_000_000n * 100n, amenities: ['jardin','parking'],                          locIdx: 6, scoreOcc: 'A' },
  { type: 'appartement',   usage: 'vente',                 statut: 'disponible', nom: 'Appartement Cocody Standing',         surface: 140, chambres: 3,                              vente_xof: 175_000_000n * 100n, amenities: ['climatisation','parking'],                  locIdx: 0, scoreOcc: 'A' },
  { type: 'terrain',       usage: 'vente',                 statut: 'disponible', nom: 'Terrain 600m² Bingerville',           surface: 600,                                           vente_xof:  60_000_000n * 100n,                                                          locIdx: 7 },
  { type: 'local_commercial', usage: 'location_longue_duree', statut: 'disponible', nom: 'Local commercial Marcory',         surface: 80,               loyer_xof:  45_000_000n * 100n,                                                                                            locIdx: 2, yield_pct: 8.0, scoreOcc: 'B' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'disponible', nom: 'F2 Yopougon',                         surface: 55,  chambres: 2, loyer_xof:  15_000_000n * 100n,                                                                                            locIdx: 3, yield_pct: 7.8, scoreOcc: 'B' },
  { type: 'villa',         usage: 'mixte',                 statut: 'disponible', nom: 'Villa Riviera bord lagune',           surface: 280, chambres: 4, loyer_xof: 180_000_000n * 100n, vente_xof: 220_000_000n * 100n, amenities: ['vue_lagune','jardin','piscine'],            locIdx: 4, yield_pct: 9.8, scoreOcc: 'A+' },
  { type: 'studio',        usage: 'location_longue_duree', statut: 'disponible', nom: 'Studio Cocody Angré',                 surface: 28,  chambres: 1, loyer_xof:  12_000_000n * 100n,                                  amenities: ['climatisation'],                            locIdx: 6, yield_pct: 8.5, scoreOcc: 'A' },
  { type: 'immeuble',      usage: 'vente',                 statut: 'disponible', nom: 'Immeuble R+3 Treichville',            surface: 600,                                           vente_xof: 420_000_000n * 100n, amenities: ['ascenseur','parking'],                       locIdx: 5, scoreOcc: 'A' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'disponible', nom: 'F4 Plateau Vue Mer',                  surface: 130, chambres: 4, loyer_xof:  75_000_000n * 100n,                                  amenities: ['vue_mer','climatisation'],                  locIdx: 1, yield_pct: 7.5, scoreOcc: 'A' },
  { type: 'villa',         usage: 'location_longue_duree', statut: 'disponible', nom: 'Villa Marcory 3ch',                   surface: 220, chambres: 3, loyer_xof: 100_000_000n * 100n,                                  amenities: ['jardin'],                                   locIdx: 2, yield_pct: 7.0, scoreOcc: 'B' },
  { type: 'bureau',        usage: 'mixte',                 statut: 'disponible', nom: 'Coworking Plateau 6 postes',          surface: 120,              loyer_xof:  60_000_000n * 100n, vente_xof:  90_000_000n * 100n, amenities: ['fibre','climatisation'],                    locIdx: 1, yield_pct: 8.2, scoreOcc: 'A' },
  { type: 'autre',         usage: 'location_longue_duree', statut: 'disponible', nom: 'Entrepôt Yopougon 800m²',             surface: 800,              loyer_xof:  55_000_000n * 100n,                                                                                            locIdx: 3, yield_pct: 6.5, scoreOcc: 'B' },

  // ── 16 loués (40%)
  { type: 'villa',         usage: 'location_longue_duree', statut: 'loue', nom: 'Villa 3ch Cocody Diplomatique', surface: 260, chambres: 3, loyer_xof: 220_000_000n * 100n, amenities: ['piscine','jardin','climatisation'],  locIdx: 0, yield_pct: 9.0, scoreOcc: 'A+' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'loue', nom: 'F3 Cocody II Plateaux',         surface: 90,  chambres: 3, loyer_xof:  40_000_000n * 100n, amenities: ['climatisation','parking'],            locIdx: 0, yield_pct: 7.5, scoreOcc: 'A' },
  { type: 'studio',        usage: 'location_longue_duree', statut: 'loue', nom: 'Studio Treichville',            surface: 30,  chambres: 1, loyer_xof:   8_000_000n * 100n,                                                  locIdx: 5, yield_pct: 8.0, scoreOcc: 'B' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'loue', nom: 'F2 Riviera',                    surface: 60,  chambres: 2, loyer_xof:  22_000_000n * 100n, amenities: ['climatisation'],                      locIdx: 4, yield_pct: 8.2, scoreOcc: 'A' },
  { type: 'bureau',        usage: 'location_longue_duree', statut: 'loue', nom: 'Bureau privé Plateau',          surface: 150,              loyer_xof:  85_000_000n * 100n, amenities: ['climatisation','parking','fibre'],    locIdx: 1, yield_pct: 7.0, scoreOcc: 'A' },
  { type: 'villa',         usage: 'location_longue_duree', statut: 'loue', nom: 'Villa 4ch Angré',               surface: 300, chambres: 4, loyer_xof: 150_000_000n * 100n, amenities: ['jardin','parking'],                   locIdx: 6, yield_pct: 8.8, scoreOcc: 'A' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'loue', nom: 'F3 Marcory Zone 4',             surface: 100, chambres: 3, loyer_xof:  35_000_000n * 100n,                                                  locIdx: 2, yield_pct: 7.3, scoreOcc: 'B' },
  { type: 'studio',        usage: 'location_longue_duree', statut: 'loue', nom: 'Studio meublé Cocody',          surface: 25,  chambres: 1, loyer_xof:  15_000_000n * 100n, amenities: ['meuble','climatisation','wifi'],      locIdx: 0, yield_pct: 9.5, scoreOcc: 'A+' },
  { type: 'local_commercial', usage: 'location_longue_duree', statut: 'loue', nom: 'Boutique Marcory',          surface: 60,               loyer_xof:  30_000_000n * 100n,                                                  locIdx: 2, yield_pct: 8.0, scoreOcc: 'A' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'loue', nom: 'F4 Plateau',                    surface: 120, chambres: 4, loyer_xof:  65_000_000n * 100n, amenities: ['climatisation','parking'],            locIdx: 1, yield_pct: 7.8, scoreOcc: 'A' },
  { type: 'villa',         usage: 'location_longue_duree', statut: 'loue', nom: 'Villa Riviera 5ch',             surface: 380, chambres: 5, loyer_xof: 280_000_000n * 100n, amenities: ['piscine','jardin','garage'],          locIdx: 4, yield_pct: 8.2, scoreOcc: 'A' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'loue', nom: 'F2 Yopougon Niangon',           surface: 50,  chambres: 2, loyer_xof:  12_000_000n * 100n,                                                  locIdx: 3, yield_pct: 7.5, scoreOcc: 'B' },
  { type: 'bureau',        usage: 'location_longue_duree', statut: 'loue', nom: 'Open space Cocody',             surface: 220,              loyer_xof: 120_000_000n * 100n, amenities: ['climatisation','fibre','salle_reunion'], locIdx: 0, yield_pct: 7.2, scoreOcc: 'A' },
  { type: 'studio',        usage: 'location_longue_duree', statut: 'loue', nom: 'Studio étudiant Treichville',   surface: 22,  chambres: 1, loyer_xof:   7_500_000n * 100n,                                                  locIdx: 5, yield_pct: 9.0, scoreOcc: 'B' },
  { type: 'appartement',   usage: 'location_longue_duree', statut: 'loue', nom: 'F3 Cocody Angré',               surface: 85,  chambres: 3, loyer_xof:  38_000_000n * 100n, amenities: ['climatisation'],                      locIdx: 6, yield_pct: 7.8, scoreOcc: 'A' },
  { type: 'villa',         usage: 'location_longue_duree', statut: 'loue', nom: 'Villa 3ch Marcory',             surface: 240, chambres: 3, loyer_xof: 110_000_000n * 100n, amenities: ['jardin','parking'],                   locIdx: 2, yield_pct: 7.0, scoreOcc: 'B' },

  // ── 6 saisonnier (15%)
  { type: 'villa',         usage: 'saisonnier', statut: 'saisonnier', nom: 'Villa pieds dans le sable Grand-Bassam', surface: 200, chambres: 4, amenities: ['vue_mer','piscine','meuble','wifi'],   locIdx: 8, yield_pct: 12.0, scoreOcc: 'A+' },
  { type: 'appartement',   usage: 'saisonnier', statut: 'saisonnier', nom: 'F2 meublé Riviera',                       surface: 65,  chambres: 2, amenities: ['meuble','climatisation','wifi'],       locIdx: 4, yield_pct: 11.5, scoreOcc: 'A+' },
  { type: 'studio',        usage: 'saisonnier', statut: 'saisonnier', nom: 'Studio Cocody business',                   surface: 35,  chambres: 1, amenities: ['meuble','climatisation','wifi'],      locIdx: 0, yield_pct: 13.0, scoreOcc: 'A+' },
  { type: 'villa',         usage: 'saisonnier', statut: 'saisonnier', nom: 'Villa Bingerville 3ch',                    surface: 220, chambres: 3, amenities: ['piscine','jardin','meuble'],          locIdx: 7, yield_pct: 10.8, scoreOcc: 'A' },
  { type: 'appartement',   usage: 'saisonnier', statut: 'saisonnier', nom: 'F3 meublé Plateau affaires',               surface: 105, chambres: 3, amenities: ['meuble','climatisation','wifi'],      locIdx: 1, yield_pct: 11.0, scoreOcc: 'A' },
  { type: 'villa',         usage: 'saisonnier', statut: 'saisonnier', nom: 'Maison Grand-Bassam plage',                surface: 180, chambres: 3, amenities: ['vue_mer','meuble'],                   locIdx: 8, yield_pct: 11.5, scoreOcc: 'A' },

  // ── 2 hors circuit (5%)
  { type: 'villa',       usage: 'mixte', statut: 'hors_circuit', nom: 'Villa Yopougon — travaux',        surface: 250, chambres: 4, vente_xof: 130_000_000n * 100n, locIdx: 3, scoreOcc: 'C' },
  { type: 'appartement', usage: 'vente', statut: 'hors_circuit', nom: 'F3 Marcory — rénovation 6 mois',  surface: 95,  chambres: 3, vente_xof:  85_000_000n * 100n, locIdx: 2, scoreOcc: 'C' },
];

async function ensureDemoAgence(): Promise<string> {
  const existing = await prisma.agence.findUnique({ where: { slug: DEMO_AGENCE_SLUG } });
  if (existing) return existing.id;
  const created = await prisma.agence.create({
    data: { nom: 'Agence Dev CIVORA', slug: DEMO_AGENCE_SLUG, devise: 'XOF' },
  });
  return created.id;
}

function reference(i: number): string {
  return `BIE-2026-${String(i + 1).padStart(4, '0')}`;
}

function streetOf(loc: Localite, i: number): string {
  return `${10 + i} rue de ${loc.commune}`;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('🌱  Seed Biens — Lot 1 Module 2');

  const agenceId = await ensureDemoAgence();
  // eslint-disable-next-line no-console
  console.log(`  → Agence cible : ${DEMO_AGENCE_SLUG} (${agenceId})`);

  // Idempotence : nettoie les biens seed précédents (reference BIE-2026-*)
  const deleted = await prisma.bien.deleteMany({
    where: { agence_id: agenceId, reference: { startsWith: 'BIE-2026-' } },
  });
  if (deleted.count > 0) {
    // eslint-disable-next-line no-console
    console.log(`  ✓ Nettoyage : ${deleted.count} biens seed précédents supprimés`);
  }

  let created = 0;
  for (let i = 0; i < F.length; i++) {
    const f = F[i]!;
    const loc = LOCALITES[f.locIdx]!;
    const lat = jitter(loc.lat);
    const lng = jitter(loc.lng);

    await prisma.bien.create({
      data: {
        agence_id: agenceId,
        reference: reference(i),
        nom: f.nom,
        type: f.type,
        usage: f.usage,
        statut: f.statut,
        surface: f.surface ?? null,
        chambres: f.chambres ?? null,
        amenities: f.amenities ?? [],
        adresse_ligne1: streetOf(loc, i),
        ville: loc.ville,
        commune: loc.commune,
        pays: 'CI',
        latitude: lat,
        longitude: lng,
        loyer_mensuel_xof: f.loyer_xof ?? null,
        prix_vente_xof: f.vente_xof ?? null,
        charges_xof: f.charges_xof ?? null,
        yield_brut_pct: f.yield_pct ?? null,
        yield_updated_at: f.yield_pct ? new Date() : null,
        score_ia: f.scoreOcc ? scoreFromOccupation(f.scoreOcc) : null,
        score_occupation: f.scoreOcc ?? null,
        score_updated_at: f.scoreOcc ? new Date() : null,
      },
    });
    created++;
  }

  // eslint-disable-next-line no-console
  console.log(`  ✓ ${created} biens créés`);

  // Récap par statut
  const byStatut = await prisma.bien.groupBy({
    by: ['statut'],
    where: { agence_id: agenceId, reference: { startsWith: 'BIE-2026-' } },
    _count: true,
  });
  // eslint-disable-next-line no-console
  console.log('  → Distribution par statut :');
  for (const s of byStatut) {
    // eslint-disable-next-line no-console
    console.log(`     - ${String(s.statut).padEnd(15)} : ${s._count}`);
  }

  // Récap par commune (via vue agrégée)
  const byCommune = await prisma.$queryRaw<Array<{ commune: string; total: number }>>`
    SELECT commune, total FROM v_biens_par_commune
    WHERE agence_id = ${agenceId}::uuid
    ORDER BY total DESC
  `;
  // eslint-disable-next-line no-console
  console.log('  → Vue v_biens_par_commune :');
  for (const c of byCommune) {
    // eslint-disable-next-line no-console
    console.log(`     - ${c.commune.padEnd(15)} : ${c.total}`);
  }

  // eslint-disable-next-line no-console
  console.log('\n✅  Seed Biens terminé.');
}

function scoreFromOccupation(grade: 'A+' | 'A' | 'B' | 'C'): number {
  return ({ 'A+': 92, A: 80, B: 65, C: 40 })[grade];
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('❌  Seed Biens échoué :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
