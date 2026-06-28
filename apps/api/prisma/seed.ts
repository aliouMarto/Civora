/**
 * Seed script — rôles système + SuperAdmin dev.
 * Usage: pnpm --filter @civora/api seed
 *
 * En production : NE PAS créer le SuperAdmin via ce script.
 * Utiliser une invitation sécurisée via le back-office.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const SYSTEM_ROLES = [
  {
    slug: 'admin',
    nom: 'Administrateur',
    permissions: ['*:*'],
    systeme: true,
  },
  {
    slug: 'manager',
    nom: 'Manager',
    permissions: [
      'biens:read', 'biens:write',
      'crm:read', 'crm:write',
      'locations:read', 'locations:write',
      'saisonnier:read', 'saisonnier:write',
      'ventes:read', 'ventes:write',
      'compta:read',
      'ged:read', 'ged:write',
      'rapports:read', 'rapports:export',
      'calendrier:read', 'calendrier:write',
      'equipe:read',
    ],
    systeme: true,
  },
  {
    slug: 'agent',
    nom: 'Agent Immobilier',
    permissions: [
      'biens:read', 'biens:write',
      'crm:read', 'crm:write',
      'locations:read', 'locations:write',
      'saisonnier:read', 'saisonnier:write',
      'ventes:read', 'ventes:write',
      'ged:read', 'ged:write',
      'calendrier:read', 'calendrier:write',
    ],
    systeme: true,
  },
  {
    slug: 'comptable',
    nom: 'Comptable',
    permissions: [
      'biens:read',
      'locations:read',
      'ventes:read',
      'compta:read', 'compta:write', 'compta:export',
      'rapports:read', 'rapports:export',
      'ged:read',
    ],
    systeme: true,
  },
  {
    slug: 'marketing',
    nom: 'Marketing',
    permissions: [
      'biens:read',
      'crm:read',
      'rapports:read',
      'portail:read', 'portail:write',
      'ged:read', 'ged:write',
    ],
    systeme: true,
  },
  {
    slug: 'proprietaire-portail',
    nom: 'Propriétaire Portail',
    permissions: [
      'portail:read',
    ],
    systeme: true,
  },
] as const;

async function main(): Promise<void> {
  console.log('🌱  Seeding système roles...');

  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { nom: role.nom, agence_id: null },
    });
    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: { permissions: role.permissions as unknown as string[] },
      });
    } else {
      await prisma.role.create({
        data: {
          nom: role.nom,
          permissions: role.permissions as unknown as string[],
          systeme: role.systeme,
        },
      });
    }
    console.log(`  ✓ Role: ${role.slug} (${role.nom})`);
  }

  // SuperAdmin de développement — uniquement en environnement non-production
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n🔧  Création du SuperAdmin de développement...');

    const devEmail = 'admin@civora.dev';
    const devPassword = process.env.DEV_ADMIN_PASSWORD ?? 'CivoraDev2024!';

    const existing = await prisma.utilisateur.findUnique({ where: { email: devEmail } });
    if (existing) {
      console.log(`  ℹ️  SuperAdmin déjà existant (${devEmail}) — skip`);
    } else {
      // Créer une agence de dev
      const agence = await prisma.agence.upsert({
        where: { slug: 'dev-agence' },
        update: {},
        create: {
          nom: 'Agence Dev CIVORA',
          slug: 'dev-agence',
          devise: 'XOF',
        },
      });

      const passwordHash = await argon2.hash(devPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const adminRole = await prisma.role.findFirst({ where: { nom: 'Administrateur', agence_id: null } });
      if (!adminRole) throw new Error('Role admin introuvable — seed roles en premier');

      const superAdmin = await prisma.utilisateur.create({
        data: {
          email: devEmail,
          password_hash: passwordHash,
          nom: 'Admin',
          prenom: 'Super',
          agence_id: agence.id,
          statut: 'actif',
          roles: {
            create: { role_id: adminRole.id },
          },
        },
      });

      console.log(`  ✓ SuperAdmin créé: ${superAdmin.email} (agence: ${agence.slug})`);
      console.log(`  ⚠️  Mot de passe: ${devPassword}`);
    }
  }

  console.log('\n✅  Seed terminé.');
}

main()
  .catch((e) => {
    console.error('❌  Seed échoué:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
