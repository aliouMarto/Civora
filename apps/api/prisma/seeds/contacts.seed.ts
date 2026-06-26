/**
 * Seed dev — Module Contacts.
 *
 * Crée 25 contacts variés rattachés à l'agence de démo (slug "dev-agence").
 * Diversité : 6 rôles différents, plusieurs villes ivoiriennes, sources variées.
 *
 * Garde-fou :  NE RIEN FAIRE en production.
 *
 * Utilise le rôle civora_admin (BYPASSRLS) car le seed traverse la frontière
 * tenant volontairement pour préparer une agence de démo.
 *
 * Usage :
 *   pnpm --filter @civora/api seed:contacts
 */
import { PrismaClient } from '@prisma/client';

if (process.env['NODE_ENV'] === 'production') {
  // eslint-disable-next-line no-console
  console.error('contacts.seed.ts : refus d\'exécution en production.');
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

// ─── Référentiels de génération ─────────────────────────────────────────────

const NOMS = [
  'Kouassi', 'Yao', 'Koné', 'Bamba', 'Ouattara', 'Diallo', 'Touré',
  'Traoré', 'Cissé', 'Sangaré', 'Coulibaly', 'Konan', 'Aka', 'Adingra',
  'N\'Guessan', 'Diaby', 'Doumbia', 'Soro', 'Goré', 'Beugré',
  'Bakayoko', 'Kéita', 'Yapo', 'Fofana', 'Tanoh',
];

const PRENOMS_M = ['Sory', 'Issouf', 'Mamadou', 'Ibrahim', 'Sékou', 'Karim', 'Yacouba', 'Bakary', 'Adama', 'Moussa', 'Aboubacar', 'Lassana'];
const PRENOMS_F = ['Aminata', 'Fatoumata', 'Mariam', 'Kadidja', 'Awa', 'Aïcha', 'Mariama', 'Salimata', 'Korotoumou', 'Djeneba', 'Rokia', 'Hawa'];

const VILLES_COMMUNES: Array<{ ville: string; commune: string }> = [
  { ville: 'Abidjan', commune: 'Cocody' },
  { ville: 'Abidjan', commune: 'Plateau' },
  { ville: 'Abidjan', commune: 'Marcory' },
  { ville: 'Abidjan', commune: 'Yopougon' },
  { ville: 'Abidjan', commune: 'Treichville' },
  { ville: 'Abidjan', commune: 'Riviera' },
  { ville: 'Yamoussoukro', commune: 'Centre' },
  { ville: 'Bouaké', commune: 'Air-France' },
  { ville: 'Korhogo', commune: 'Centre' },
  { ville: 'San-Pédro', commune: 'Centre' },
];

const SOURCES = ['portail', 'reseau', 'walk_in', 'referencement', 'site_web', 'import', 'autre'] as const;

const ROLES_POOL = ['prospect', 'locataire', 'proprietaire', 'acheteur', 'voyageur', 'partenaire'] as const;

const TAGS_POOL = ['vip', 'budget_eleve', 'expatrie', 'famille', 'entreprise', 'investisseur', 'meuble_recherche', 'longue_duree'];

// Distribution voulue (au moins 1 contact par rôle) :
//   prospect: 8, locataire: 7, proprietaire: 5, acheteur: 4, voyageur: 3, partenaire: 2
// Plusieurs contacts ont 2 rôles (ex: locataire + acheteur).
const FIXTURES: Array<{
  prenom: string;
  nom: string;
  genre: 'M' | 'F';
  email: string | null;
  telephone: string | null;
  whatsapp: string | null;
  whatsapp_opt_in: boolean;
  cityIdx: number;
  source: typeof SOURCES[number];
  roles: Array<typeof ROLES_POOL[number]>;
  tags: string[];
  score_ia: number | null;
  score_categorie: 'froid' | 'tiede' | 'chaud' | null;
}> = [
  // ── Prospects (8)
  { prenom: 'Sory',       nom: 'Kouassi',   genre: 'M', email: 'sory.kouassi@example.ci',     telephone: '+2250707010001', whatsapp: '+2250707010001', whatsapp_opt_in: true,  cityIdx: 0, source: 'portail',       roles: ['prospect'],                tags: ['budget_eleve'],         score_ia: 72, score_categorie: 'chaud' },
  { prenom: 'Aminata',    nom: 'Yao',       genre: 'F', email: 'aminata.yao@example.ci',      telephone: '+2250707010002', whatsapp: null,             whatsapp_opt_in: false, cityIdx: 1, source: 'site_web',      roles: ['prospect'],                tags: ['famille'],              score_ia: 45, score_categorie: 'tiede' },
  { prenom: 'Karim',      nom: 'Bamba',     genre: 'M', email: 'karim.bamba@example.ci',      telephone: '+2250707010003', whatsapp: '+2250707010003', whatsapp_opt_in: true,  cityIdx: 5, source: 'reseau',        roles: ['prospect'],                tags: ['expatrie', 'vip'],      score_ia: 88, score_categorie: 'chaud' },
  { prenom: 'Mariam',     nom: 'Touré',     genre: 'F', email: null,                          telephone: '+2250707010004', whatsapp: '+2250707010004', whatsapp_opt_in: true,  cityIdx: 3, source: 'walk_in',       roles: ['prospect'],                tags: ['budget_eleve'],         score_ia: 30, score_categorie: 'froid' },
  { prenom: 'Adama',      nom: 'Cissé',     genre: 'M', email: 'adama.cisse@example.ci',      telephone: null,             whatsapp: null,             whatsapp_opt_in: false, cityIdx: 6, source: 'referencement', roles: ['prospect'],                tags: [],                       score_ia: null, score_categorie: null },
  { prenom: 'Hawa',       nom: 'Konan',     genre: 'F', email: 'hawa.konan@example.ci',      telephone: '+2250707010006', whatsapp: null,             whatsapp_opt_in: false, cityIdx: 2, source: 'portail',       roles: ['prospect'],                tags: ['meuble_recherche'],     score_ia: 60, score_categorie: 'tiede' },
  { prenom: 'Yacouba',    nom: 'Diaby',     genre: 'M', email: 'yacouba.diaby@example.ci',   telephone: '+2250707010007', whatsapp: '+2250707010007', whatsapp_opt_in: true,  cityIdx: 0, source: 'site_web',      roles: ['prospect', 'acheteur'],    tags: ['investisseur'],         score_ia: 80, score_categorie: 'chaud' },
  { prenom: 'Kadidja',    nom: 'Soro',      genre: 'F', email: 'kadidja.soro@example.ci',    telephone: '+2250707010008', whatsapp: null,             whatsapp_opt_in: false, cityIdx: 4, source: 'reseau',        roles: ['prospect'],                tags: ['famille'],              score_ia: 50, score_categorie: 'tiede' },

  // ── Locataires (7)
  { prenom: 'Mamadou',    nom: 'Coulibaly', genre: 'M', email: 'mamadou.coulibaly@example.ci', telephone: '+2250707020001', whatsapp: '+2250707020001', whatsapp_opt_in: true,  cityIdx: 1, source: 'portail',       roles: ['locataire'],               tags: ['longue_duree'],         score_ia: 70, score_categorie: 'chaud' },
  { prenom: 'Fatoumata',  nom: 'Aka',       genre: 'F', email: 'fatoumata.aka@example.ci',    telephone: '+2250707020002', whatsapp: null,             whatsapp_opt_in: false, cityIdx: 3, source: 'portail',       roles: ['locataire'],               tags: ['famille'],              score_ia: 55, score_categorie: 'tiede' },
  { prenom: 'Issouf',     nom: 'Adingra',   genre: 'M', email: 'issouf.adingra@example.ci',   telephone: '+2250707020003', whatsapp: '+2250707020003', whatsapp_opt_in: true,  cityIdx: 0, source: 'site_web',      roles: ['locataire', 'voyageur'],   tags: ['vip'],                  score_ia: 85, score_categorie: 'chaud' },
  { prenom: 'Awa',        nom: 'N\'Guessan', genre: 'F', email: 'awa.nguessan@example.ci',    telephone: '+2250707020004', whatsapp: '+2250707020004', whatsapp_opt_in: true,  cityIdx: 4, source: 'walk_in',       roles: ['locataire'],               tags: [],                       score_ia: 40, score_categorie: 'froid' },
  { prenom: 'Sékou',      nom: 'Bakayoko',  genre: 'M', email: null,                          telephone: '+2250707020005', whatsapp: '+2250707020005', whatsapp_opt_in: true,  cityIdx: 7, source: 'reseau',        roles: ['locataire', 'acheteur'],   tags: ['investisseur'],         score_ia: 78, score_categorie: 'chaud' },
  { prenom: 'Salimata',   nom: 'Kéita',     genre: 'F', email: 'salimata.keita@example.ci',  telephone: '+2250707020006', whatsapp: null,             whatsapp_opt_in: false, cityIdx: 0, source: 'import',        roles: ['locataire'],               tags: ['longue_duree'],         score_ia: 65, score_categorie: 'tiede' },
  { prenom: 'Bakary',     nom: 'Yapo',      genre: 'M', email: 'bakary.yapo@example.ci',     telephone: '+2250707020007', whatsapp: '+2250707020007', whatsapp_opt_in: true,  cityIdx: 5, source: 'site_web',      roles: ['locataire'],               tags: ['budget_eleve'],         score_ia: 73, score_categorie: 'chaud' },

  // ── Propriétaires (5)
  { prenom: 'Ibrahim',    nom: 'Diallo',    genre: 'M', email: 'ibrahim.diallo@example.ci',   telephone: '+2250707030001', whatsapp: '+2250707030001', whatsapp_opt_in: true,  cityIdx: 5, source: 'reseau',        roles: ['proprietaire'],            tags: ['vip', 'investisseur'],  score_ia: 90, score_categorie: 'chaud' },
  { prenom: 'Mariama',    nom: 'Sangaré',   genre: 'F', email: 'mariama.sangare@example.ci', telephone: '+2250707030002', whatsapp: null,             whatsapp_opt_in: false, cityIdx: 1, source: 'walk_in',       roles: ['proprietaire', 'partenaire'], tags: ['vip'],                score_ia: 95, score_categorie: 'chaud' },
  { prenom: 'Moussa',     nom: 'Doumbia',   genre: 'M', email: 'moussa.doumbia@example.ci',  telephone: '+2250707030003', whatsapp: '+2250707030003', whatsapp_opt_in: true,  cityIdx: 9, source: 'referencement', roles: ['proprietaire'],            tags: ['investisseur'],         score_ia: 80, score_categorie: 'chaud' },
  { prenom: 'Aïcha',      nom: 'Goré',      genre: 'F', email: 'aicha.gore@example.ci',      telephone: '+2250707030004', whatsapp: null,             whatsapp_opt_in: false, cityIdx: 0, source: 'reseau',        roles: ['proprietaire'],            tags: [],                       score_ia: 60, score_categorie: 'tiede' },
  { prenom: 'Lassana',    nom: 'Beugré',    genre: 'M', email: 'lassana.beugre@example.ci',  telephone: '+2250707030005', whatsapp: '+2250707030005', whatsapp_opt_in: true,  cityIdx: 2, source: 'import',        roles: ['proprietaire', 'acheteur'], tags: ['investisseur'],        score_ia: 82, score_categorie: 'chaud' },

  // ── Acheteurs purs (2 — d'autres acheteurs sont déjà couplés)
  { prenom: 'Korotoumou', nom: 'Fofana',    genre: 'F', email: 'korotoumou.fofana@example.ci', telephone: '+2250707040001', whatsapp: '+2250707040001', whatsapp_opt_in: true,  cityIdx: 1, source: 'portail',       roles: ['acheteur'],                tags: ['vip', 'budget_eleve'],  score_ia: 92, score_categorie: 'chaud' },
  { prenom: 'Aboubacar',  nom: 'Traoré',    genre: 'M', email: 'aboubacar.traore@example.ci', telephone: '+2250707040002', whatsapp: null,             whatsapp_opt_in: false, cityIdx: 6, source: 'site_web',      roles: ['acheteur'],                tags: ['investisseur'],         score_ia: 75, score_categorie: 'chaud' },

  // ── Voyageurs (2 — Issouf en plus, donc total 3)
  { prenom: 'Djeneba',    nom: 'Konan',     genre: 'F', email: 'djeneba.konan@example.ci',   telephone: '+2250707050001', whatsapp: '+2250707050001', whatsapp_opt_in: true,  cityIdx: 2, source: 'portail',       roles: ['voyageur'],                tags: ['meuble_recherche'],     score_ia: 68, score_categorie: 'tiede' },
  { prenom: 'Rokia',      nom: 'Tanoh',     genre: 'F', email: 'rokia.tanoh@example.ci',     telephone: '+2250707050002', whatsapp: '+2250707050002', whatsapp_opt_in: true,  cityIdx: 9, source: 'site_web',      roles: ['voyageur'],                tags: ['expatrie'],             score_ia: 70, score_categorie: 'chaud' },

  // ── Partenaires (1 — Mariama en plus, donc total 2)
  { prenom: 'Sékou',      nom: 'Kéita',     genre: 'M', email: 'sekou.keita.pro@example.ci', telephone: '+2250707060001', whatsapp: '+2250707060001', whatsapp_opt_in: true,  cityIdx: 1, source: 'reseau',        roles: ['partenaire'],              tags: ['entreprise'],           score_ia: 85, score_categorie: 'chaud' },
];

async function ensureDemoAgence(): Promise<string> {
  const existing = await prisma.agence.findUnique({ where: { slug: DEMO_AGENCE_SLUG } });
  if (existing) return existing.id;

  const created = await prisma.agence.create({
    data: {
      nom: 'Agence Dev CIVORA',
      slug: DEMO_AGENCE_SLUG,
      devise: 'XOF',
    },
  });
  return created.id;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('🌱  Seed Contacts — Lot 1 Module 1');

  const agenceId = await ensureDemoAgence();
  // eslint-disable-next-line no-console
  console.log(`  → Agence cible : ${DEMO_AGENCE_SLUG} (${agenceId})`);

  // Idempotence : on nettoie les contacts seedés précédemment de cette agence
  // (identifiés par leur email *.example.ci ou téléphone +2250707...)
  const deleted = await prisma.contact.deleteMany({
    where: {
      agence_id: agenceId,
      OR: [
        { email: { endsWith: '@example.ci' } },
        { telephone: { startsWith: '+22507070' } },
      ],
    },
  });
  if (deleted.count > 0) {
    // eslint-disable-next-line no-console
    console.log(`  ✓ Nettoyage : ${deleted.count} contacts de seed précédent supprimés`);
  }

  let created = 0;
  for (const f of FIXTURES) {
    const place = VILLES_COMMUNES[f.cityIdx]!;
    await prisma.contact.create({
      data: {
        agence_id: agenceId,
        nom: f.nom,
        prenom: f.prenom,
        genre: f.genre,
        langue: 'fr',
        email: f.email,
        telephone: f.telephone,
        whatsapp: f.whatsapp,
        whatsapp_opt_in: f.whatsapp_opt_in,
        ville: place.ville,
        commune: place.commune,
        pays: 'CI',
        roles: f.roles as string[],
        source: f.source,
        tags: f.tags,
        score_ia: f.score_ia,
        score_categorie: f.score_categorie,
        score_updated_at: f.score_ia !== null ? new Date() : null,
      },
    });
    created++;
  }

  // eslint-disable-next-line no-console
  console.log(`  ✓ ${created} contacts créés`);

  // Récap diversité
  const byRole = await Promise.all(
    ROLES_POOL.map(async (role) => {
      const count = await prisma.contact.count({
        where: {
          agence_id: agenceId,
          roles: { has: role },
        },
      });
      return { role, count };
    }),
  );
  // eslint-disable-next-line no-console
  console.log('  → Distribution des rôles :');
  for (const r of byRole) {
    // eslint-disable-next-line no-console
    console.log(`     - ${r.role.padEnd(14)} : ${r.count}`);
  }

  // eslint-disable-next-line no-console
  console.log('\n✅  Seed Contacts terminé.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('❌  Seed Contacts échoué :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
