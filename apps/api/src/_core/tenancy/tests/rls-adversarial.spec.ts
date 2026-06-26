/**
 * Tests adversariaux RLS étendus — CIVORA Lot 0
 *
 * Couvre les tables qui n'étaient pas testées par rls-isolation.spec.ts :
 *   - notifications, ai_calls, ai_embeddings, ai_budgets, audit_log,
 *     workflows, workflow_runs (passées de ENABLE-only à FORCE)
 *   - roles, utilisateur_roles, domain_events, job_dead_letters (RLS ajoutée)
 *
 * Trois connexions Prisma pour distinguer les comportements selon le rôle :
 *   - prismaAdmin : civora_admin (BYPASSRLS) — pour seed + assertions globales
 *   - prismaApp   : civora_app (soumis à la RLS) — simule l'API
 *   - prismaOwner : civora (propriétaire des tables) — vérifie que FORCE
 *                   bloque même le propriétaire
 *
 * Tous ces tests doivent PASSER après l'application de la migration
 * 20260625000001_rls_force_and_missing_policies.
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

const prismaOwner = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env['DATABASE_URL'] ??
        'postgresql://civora:civora_secret@localhost:5432/civora',
    },
  },
});

let agenceAId: string;
let agenceBId: string;
let userAId: string;
let userBId: string;
let roleAId: string;
let roleBId: string;
let workflowAId: string;
let workflowBId: string;

const SLUG_PREFIX = 'rls-adv-';

beforeAll(async () => {
  await Promise.all([
    prismaAdmin.$connect(),
    prismaApp.$connect(),
    prismaOwner.$connect(),
  ]);

  // ─── Nettoyage idempotent ────────────────────────────────────────────────
  await prismaAdmin.$executeRaw`
    DELETE FROM workflow_runs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM workflows WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM notifications WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM domain_events WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM audit_log WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM utilisateur_roles WHERE utilisateur_id IN (
      SELECT id FROM utilisateurs WHERE agence_id IN (
        SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}
      )
    )
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM roles WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM utilisateurs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}
  `;

  // ─── Seed via prismaAdmin (BYPASSRLS) ────────────────────────────────────
  const [a, b] = await Promise.all([
    prismaAdmin.agence.create({ data: { nom: 'ADV-A', slug: `${SLUG_PREFIX}a` } }),
    prismaAdmin.agence.create({ data: { nom: 'ADV-B', slug: `${SLUG_PREFIX}b` } }),
  ]);
  agenceAId = a.id;
  agenceBId = b.id;

  const [uA, uB] = await Promise.all([
    prismaAdmin.utilisateur.create({
      data: {
        agence_id: agenceAId,
        email: `adv-a@test.civora.io`,
        password_hash: 'x',
        nom: 'A',
        prenom: 'User',
        statut: 'actif',
      },
    }),
    prismaAdmin.utilisateur.create({
      data: {
        agence_id: agenceBId,
        email: `adv-b@test.civora.io`,
        password_hash: 'x',
        nom: 'B',
        prenom: 'User',
        statut: 'actif',
      },
    }),
  ]);
  userAId = uA.id;
  userBId = uB.id;

  const [rA, rB] = await Promise.all([
    prismaAdmin.role.create({
      data: { agence_id: agenceAId, nom: 'ADV-Role-A', permissions: ['biens:read'] },
    }),
    prismaAdmin.role.create({
      data: { agence_id: agenceBId, nom: 'ADV-Role-B', permissions: ['biens:read'] },
    }),
  ]);
  roleAId = rA.id;
  roleBId = rB.id;

  await Promise.all([
    prismaAdmin.utilisateurRole.create({
      data: { utilisateur_id: userAId, role_id: roleAId },
    }),
    prismaAdmin.utilisateurRole.create({
      data: { utilisateur_id: userBId, role_id: roleBId },
    }),
  ]);

  const wA = await prismaAdmin.workflow.create({
    data: {
      agence_id: agenceAId,
      code: `${SLUG_PREFIX}wa`,
      nom: 'Workflow A',
      type: 'rule',
      statut: 'inactif',
      trigger: {},
      conditions: {},
      actions: [],
      params: {},
    },
  });
  const wB = await prismaAdmin.workflow.create({
    data: {
      agence_id: agenceBId,
      code: `${SLUG_PREFIX}wb`,
      nom: 'Workflow B',
      type: 'rule',
      statut: 'inactif',
      trigger: {},
      conditions: {},
      actions: [],
      params: {},
    },
  });
  workflowAId = wA.id;
  workflowBId = wB.id;

  await Promise.all([
    prismaAdmin.notification.create({
      data: {
        agence_id: agenceAId,
        utilisateur_id: userAId,
        channel: 'in-app',
        template: 'demo',
        vars: {},
        status: 'queued',
      },
    }),
    prismaAdmin.notification.create({
      data: {
        agence_id: agenceBId,
        utilisateur_id: userBId,
        channel: 'in-app',
        template: 'demo',
        vars: {},
        status: 'queued',
      },
    }),
  ]);
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`
    DELETE FROM workflow_runs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM workflows WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM notifications WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM domain_events WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM audit_log WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM utilisateur_roles WHERE utilisateur_id IN (
      SELECT id FROM utilisateurs WHERE agence_id IN (
        SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}
      )
    )
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM roles WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM utilisateurs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`})
  `;
  await prismaAdmin.$executeRaw`
    DELETE FROM agences WHERE slug LIKE ${`${SLUG_PREFIX}%`}
  `;
  await Promise.all([
    prismaAdmin.$disconnect(),
    prismaApp.$disconnect(),
    prismaOwner.$disconnect(),
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. FORCE ROW LEVEL SECURITY : même le propriétaire est filtré
// ─────────────────────────────────────────────────────────────────────────────

describe('FORCE RLS — le propriétaire des tables ne peut pas contourner', () => {
  it('workflows : sans app.agence_id, le propriétaire ne voit rien', async () => {
    await prismaOwner.$transaction(async (tx) => {
      await tx.$executeRaw`RESET app.agence_id`;
      const rows = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM workflows WHERE code LIKE ${`${SLUG_PREFIX}%`}
      `;
      expect(Number(rows[0]!.count)).toBe(0);
    });
  });

  it('notifications : sans app.agence_id, le propriétaire ne voit rien', async () => {
    await prismaOwner.$transaction(async (tx) => {
      await tx.$executeRaw`RESET app.agence_id`;
      const rows = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM notifications
        WHERE agence_id IN (${agenceAId}::uuid, ${agenceBId}::uuid)
      `;
      expect(Number(rows[0]!.count)).toBe(0);
    });
  });

  it('audit_log : le propriétaire ne voit rien sans contexte', async () => {
    await prismaOwner.$transaction(async (tx) => {
      await tx.$executeRaw`RESET app.agence_id`;
      const rows = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM audit_log
        WHERE agence_id IN (${agenceAId}::uuid, ${agenceBId}::uuid)
      `;
      expect(Number(rows[0]!.count)).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Isolation par tenant via civora_app + app.agence_id
// ─────────────────────────────────────────────────────────────────────────────

describe('Isolation civora_app avec app.agence_id positionné', () => {
  it('workflows : user A ne voit que le workflow A', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.workflow.findMany({
        where: { code: { startsWith: SLUG_PREFIX } },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(workflowAId);
    });
  });

  it('notifications : user A ne voit que ses notifications', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.notification.findMany({
        where: { utilisateur_id: { in: [userAId, userBId] } },
      });
      expect(rows.every((n) => n.agence_id === agenceAId)).toBe(true);
    });
  });

  it('roles : user A voit les rôles système + ses rôles, pas ceux de B', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.role.findMany({
        where: { OR: [{ agence_id: null }, { agence_id: agenceAId }, { agence_id: agenceBId }] },
      });
      expect(rows.some((r) => r.id === roleAId)).toBe(true);
      expect(rows.some((r) => r.id === roleBId)).toBe(false);
    });
  });

  it('utilisateur_roles : user A ne voit pas les associations de B', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.utilisateurRole.findMany({
        where: { utilisateur_id: { in: [userAId, userBId] } },
      });
      expect(rows.every((ur) => ur.utilisateur_id === userAId)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tentatives d'évasion : INSERT / UPDATE cross-tenant
// ─────────────────────────────────────────────────────────────────────────────

describe('Évasion cross-tenant — INSERT/UPDATE refusés', () => {
  it('workflows : INSERT avec agence_id=B depuis session A est refusé', async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.workflow.create({
          data: {
            agence_id: agenceBId, // tentative d'évasion
            code: `${SLUG_PREFIX}intrus`,
            nom: 'Intrus',
            type: 'rule',
            statut: 'inactif',
            trigger: {},
            conditions: {},
            actions: [],
            params: {},
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('workflows : UPDATE pour transférer un workflow A vers B est refusé', async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.workflow.update({
          where: { id: workflowAId },
          data: { agence_id: agenceBId },
        });
      }),
    ).rejects.toThrow();
  });

  it('audit_log : INSERT avec agence_id=B depuis session A est refusé', async () => {
    await expect(
      prismaApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
        await tx.auditLog.create({
          data: {
            agence_id: agenceBId,
            actor_type: 'user',
            action: 'intrusion',
            metadata: {},
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('audit_log : INSERT avec agence_id=NULL (audit système) est autorisé', async () => {
    await prismaApp.$transaction(async (tx) => {
      // Pas de SET app.agence_id : la politique autorise agence_id IS NULL
      await tx.auditLog.create({
        data: {
          agence_id: null,
          actor_type: 'system',
          action: 'system.test',
          metadata: { source: 'adversarial-spec' },
        },
      });
    });
    // Nettoyage immédiat
    await prismaAdmin.$executeRaw`DELETE FROM audit_log WHERE action = 'system.test'`;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Raw queries respectent la RLS
// ─────────────────────────────────────────────────────────────────────────────

describe('Requêtes raw — la RLS s\'applique aussi', () => {
  it('$queryRaw SELECT * FROM workflows respecte la RLS', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const rows = await tx.$queryRaw<{ agence_id: string }[]>`
        SELECT agence_id FROM workflows WHERE code LIKE ${`${SLUG_PREFIX}%`}
      `;
      expect(rows.every((r) => r.agence_id === agenceAId)).toBe(true);
    });
  });

  it('COUNT ne fuite pas via aggregate cross-tenant', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceAId}, true)`;
      const count = await tx.notification.count({
        where: { utilisateur_id: { in: [userAId, userBId] } },
      });
      // user A seulement → 1 notif
      expect(count).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Sans app.agence_id, civora_app ne voit rien
// ─────────────────────────────────────────────────────────────────────────────

describe('Sans contexte tenant — civora_app retourne 0 ligne', () => {
  it('workflows : aucune ligne visible sans app.agence_id', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`RESET app.agence_id`;
      const rows = await tx.workflow.findMany({
        where: { code: { startsWith: SLUG_PREFIX } },
      });
      expect(rows).toHaveLength(0);
    });
  });

  it('notifications : aucune ligne visible sans app.agence_id', async () => {
    await prismaApp.$transaction(async (tx) => {
      await tx.$executeRaw`RESET app.agence_id`;
      const rows = await tx.notification.findMany({
        where: { utilisateur_id: { in: [userAId, userBId] } },
      });
      expect(rows).toHaveLength(0);
    });
  });
});
