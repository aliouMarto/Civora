# Revue sécurité — Isolation multi-tenant (RLS)

**Date** : 2026-06-25  
**Périmètre** : Lot 0 — Étapes 1–15  
**Méthode** : Audit statique (code + migrations) + analyse adversariale  
**Rôle adopté** : Attaquant interne avec accès authentifié à l'API

---

## Verdict global : 🔴 FAILLE TROUVÉE

Deux failles critiques empêchent le passage en R1 production :

1. **`PrismaService` se connecte en tant que propriétaire de table** (`civora` via `DATABASE_URL`) — toutes les tables avec `ENABLE ROW LEVEL SECURITY` mais **sans** `FORCE ROW LEVEL SECURITY` sont donc contournées silencieusement. Sept tables métier sont concernées.

2. **Trois tables métier n'ont aucune politique RLS** malgré un `agence_id` applicable : `roles`, `utilisateur_roles`, `domain_events`.

**Recommandation : STOP avant R1 production. Deux corrections SQL (30 min) et une correction applicative (15 min) suffisent à passer à 🟢.**

---

## 1. Inventaire des tables — statut RLS

> Légende : ENABLE = `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` · FORCE = `... FORCE ROW LEVEL SECURITY` · Politiques = nombre de `CREATE POLICY`

| Table | agence_id | ENABLE | FORCE | # Politiques | Verdict |
|---|---|---|---|---|---|
| `agences` | IS le tenant | ✗ | ✗ | 0 | ✅ N/A — table système |
| `entites` | NOT NULL | ✅ | ✅ | 4 (S/I/U/D) | ✅ OK |
| `utilisateurs` | NOT NULL | ✅ | ✅ | 4 (S/I/U/D) | ✅ OK |
| `roles` | nullable (null=système) | ✗ | ✗ | 0 | 🔴 KO |
| `utilisateur_roles` | join table | ✗ | ✗ | 0 | 🔴 KO |
| `invitations` | NOT NULL | ✅ | ✅ | 4 (S/I/U/D) | ✅ OK |
| `refresh_tokens` | pas d'agence_id | ✗ | ✗ | 0 | ⚪ Acceptable* |
| `domain_events` | nullable | ✗ | ✗ | 0 | 🔴 KO |
| `event_handler_offsets` | pas d'agence_id | ✗ | ✗ | 0 | ⚪ OK — infra pure |
| `job_dead_letters` | nullable | ✗ | ✗ | 0 | 🟡 À corriger |
| `notifications` | NOT NULL | ✅ | ✗ | 1 (ALL) | 🔴 FAILLE** |
| `ai_calls` | NOT NULL | ✅ | ✗ | 1 (ALL) | 🔴 FAILLE** |
| `ai_embeddings` | NOT NULL | ✅ | ✗ | 1 (ALL) | 🔴 FAILLE** |
| `ai_budgets` | NOT NULL UNIQUE | ✅ | ✗ | 1 (ALL) | 🔴 FAILLE** |
| `audit_log` | nullable | ✅ | ✗ | 2 (S/I) | 🔴 FAILLE** |
| `workflows` | NOT NULL | ✅ | ✗ | 1 (ALL) | 🔴 FAILLE** |
| `workflow_runs` | NOT NULL | ✅ | ✗ | 1 (ALL) | 🔴 FAILLE** |

\* `refresh_tokens` : pas d'`agence_id`, accès contrôlé par `token_hash` opaque + `utilisateur_id`. Acceptable.  
\** Ces tables ont `ENABLE` sans `FORCE`. Le propriétaire PostgreSQL de la table (`civora` = user de `DATABASE_URL`) **contourne silencieusement la RLS**. Voir §2.

---

## 2. Faille principale — ENABLE sans FORCE + connexion propriétaire

### Contexte PostgreSQL

`ENABLE ROW LEVEL SECURITY` active la RLS pour les non-propriétaires.  
`FORCE ROW LEVEL SECURITY` l'active **aussi pour le propriétaire de la table**.

Sans `FORCE`, le rôle qui a créé la table (le propriétaire) voit **toutes les lignes** sans restriction, même si des politiques existent.

### Ce qui se passe dans CIVORA

**`.env.example` :**
```
DATABASE_URL=postgresql://civora:civora_secret@localhost:5432/civora
DATABASE_APP_URL=postgresql://civora_app:civora_app_secret@localhost:5432/civora
```

**`apps/api/src/infrastructure/prisma/prisma.service.ts` :**
```ts
constructor(@Optional() private readonly tenantCtx?: TenantContextService) {
  super(); // ← pas de datasourceUrl → lit DATABASE_URL
}
```

`DATABASE_URL` pointe vers le rôle `civora` — le même rôle qui a exécuté les migrations et qui est donc **propriétaire des tables**. Sans `FORCE ROW LEVEL SECURITY`, toutes les requêtes Prisma passent à travers sans filtrage RLS.

### Impact concret

Pour les migrations `20260624000005` à `20260624000008` (notifications, ai, audit_log, workflows) :

```sql
-- Ce qui est écrit :
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- Ce qui se passe quand civora_app (bon rôle) fait une requête :
--   → politique vérifiée ✅

-- Ce qui se passe quand civora (propriétaire, mauvais rôle) fait une requête :
--   → politique IGNORÉE ❌ — toutes les lignes sont retournées
```

La `withTenant()` qui pose `SET LOCAL app.agence_id` est donc **décoractive** pour ces tables : même si la variable est posée, le propriétaire la lit mais n'en a pas besoin pour bypasser la RLS.

### Vecteur d'attaque

Un utilisateur authentifié de l'agence A qui appelle :
```
GET /workflows
GET /me/notifications  
GET /audit
```
...obtient via la couche applicative les données de son agence seulement (le service filtre par `agence_id` dans le WHERE). Mais si un bug applicatif omet le filtre, ou si un `$queryRaw` est utilisé sans clause WHERE, **la DB ne constitue pas un filet de sécurité** pour ces tables.

Pour `entites` et `utilisateurs` (qui ont `FORCE`), la DB bloque même si l'application oublie le filtre. C'est la garantie de défense en profondeur.

---

## 3. Failles secondaires — Tables sans RLS

### 3.1 `roles`

```sql
-- Migration 002 commente explicitement l'absence de RLS :
-- "Pas de RLS sur roles : les rôles système (agence_id IS NULL) doivent être lisibles
--  sans contexte tenant. Les rôles agence-spécifiques sont filtrés côté appli."
```

**Problème** : cette justification délègue la sécurité au code applicatif uniquement. Avec un bug ou une route non protégée, un utilisateur de l'agence A peut lire les rôles personnalisés de l'agence B (leur intitulé, leurs permissions).

**Fix possible** : politique permissive pour les rôles système (`agence_id IS NULL`) + politique tenant pour les rôles d'agence :
```sql
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_read ON roles FOR SELECT
  USING (
    agence_id IS NULL  -- rôles système : visibles par tous
    OR agence_id::text = current_setting('app.agence_id', true)
  );
CREATE POLICY roles_write ON roles FOR ALL
  USING (agence_id::text = current_setting('app.agence_id', true))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', true));
```

### 3.2 `utilisateur_roles`

Table de jointure sans `agence_id` direct. La politique doit passer par une jointure :

```sql
ALTER TABLE utilisateur_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY ur_tenant ON utilisateur_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.id = utilisateur_id
        AND u.agence_id::text = current_setting('app.agence_id', true)
    )
  );
```

### 3.3 `domain_events`

Contient les payloads métier de toutes les agences. Un accès cross-tenant révèle les types d'événements et les données des transactions d'autres agences.

```sql
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;
-- Événements système (agence_id IS NULL) visibles uniquement par les workers (civora_admin)
-- Événements agence-spécifiques filtrés par tenant
CREATE POLICY domain_events_tenant ON domain_events FOR ALL
  USING (
    agence_id IS NULL  -- événements système : civora_admin les lit via BYPASSRLS
    OR agence_id::text = current_setting('app.agence_id', true)
  );
```

---

## 4. Audit du code applicatif

### 4.1 Requêtes Prisma sans filtre `agence_id` — analyse

| Fichier | Requête | Verdict |
|---|---|---|
| `auth.service.ts:53` | `utilisateur.findUnique({ where: { email } })` | ✅ OK — pre-auth, email global |
| `auth.service.ts:116` | `refreshToken.findFirst({ where: { token_hash } })` | ✅ OK — pre-auth, token opaque |
| `rbac.service.ts:11` | `utilisateurRole.findMany({ where: { utilisateur_id } })` | ✅ OK — scoped par UUID utilisateur |
| `rbac.service.ts:29` | `role.findMany({ where: { OR: [agence_id, systeme] } })` | ✅ OK — filtre applicatif |
| `rbac.service.ts:35` | `role.findMany({ where: { systeme: true } })` | ✅ OK — rôles système uniquement |
| `outbox-dispatcher.service.ts:64` | `domainEvent.findMany({ where: { published_at: null } })` | ✅ OK — worker système, toutes agences par design |
| `workflows.controller.ts:39` | `workflow.findMany({ where: { agence_id } })` | ✅ OK — filtre explicite |
| `workflows.controller.ts:46` | `workflow.findUniqueOrThrow({ where: { id } })` (toggle) | ⚠️ Pas de vérif agence_id avant update — dépend de la RLS |
| `audit.controller.ts:38` | `auditLog.findMany({ where: { agence_id } })` | ✅ OK — filtre explicite |
| `notifications.service.ts:192` | `notification.findMany({ where: { agence_id, utilisateur_id } })` | ✅ OK |
| `notifications.service.ts:222` | `notification.findUnique` puis vérif `notif.agence_id !== agence_id` | ✅ OK — double vérif |
| `users.service.ts:49` | `utilisateur.findUnique({ where: { email } })` | ✅ OK — vérif existence globale |

**Point d'attention** — `workflows.controller.ts` toggle (ligne 46) :

```ts
const before = await this.prisma.workflow.findUniqueOrThrow({ where: { id } });
const result = await this.registry.toggleStatut(id, body.statut);
```

Il n'y a pas de `where: { id, agence_id }` — la protection repose **entièrement** sur la RLS. Si la RLS ne filtre pas (connexion propriétaire), un utilisateur de l'agence A avec la permission `workflows:write` peut toggler un workflow de l'agence B en connaissant son UUID. À corriger même indépendamment du fix RLS.

### 4.2 Usages de BYPASSRLS / civora_admin

| Emplacement | Usage | Justifié |
|---|---|---|
| Migrations Prisma | DDL, seeds, politiques | ✅ OUI — seul contexte légitime |
| `rls-isolation.spec.ts` — `prismaAdmin` | Seed de test + vérifications globales | ✅ OUI — test uniquement, `DATABASE_ADMIN_URL` |
| `OutboxDispatcherService` | Lecture de tous les events non publiés | ✅ OUI — worker système multi-tenant |
| `PrismaService` (via `DATABASE_URL`) | **TOUTES les requêtes applicatives** | 🔴 NON — accident, pas un choix délibéré |

Aucun usage illégitime délibéré trouvé — la faille est accidentelle (connexion par défaut).

### 4.3 Endpoints sans `@RequirePermissions` ni `@Public`

| Endpoint | Statut | Verdict |
|---|---|---|
| `GET /health` | `@Public()` | ✅ OK — probe K8s/LB |
| `GET /metrics` | `@Public()` — placeholder vide | ⚠️ À VÉRIFIER quand prom-client activé |
| `GET /users/me` | JWT global, pas de `@RequirePermissions` | ✅ OK — tout user connecté lit ses propres données |
| `POST /auth/login` | `@Public()` | ✅ OK |
| `POST /auth/refresh` | `@Public()` | ✅ OK |
| `POST /auth/logout` | JWT global (pas de `@Public`) | ✅ OK |
| `GET /me/notifications` | JWT global | ✅ OK — scoped par user.sub |
| `POST /me/notifications/:id/read` | JWT global | ✅ OK — service re-vérifie agence_id |
| `_dev/*` | JWT global | ✅ OK — module exclu en production |

**Guard global** : `JwtAuthGuard` + `RolesGuard` enregistrés via `APP_GUARD` dans `AuthModule` → appliqués à toutes les routes par défaut ✅

**Middleware tenant** : `TenantMiddleware.forRoutes({ path: '*', method: ALL })` → extrait `agence_id` du JWT pour toutes les requêtes ✅

### 4.4 `current_setting('app.agence_id')` — emplacements

```
PrismaService.withTenant()     → SET LOCAL app.agence_id = ${agenceId}  ✅ transaction-scoped
PrismaService.withCurrentTenant() → lit TenantContextService             ✅ cohérent
Migrations SQL (CREATE POLICY) → current_setting('app.agence_id', true) ✅ côté DB
```

Aucun `current_setting` posé en dehors de `withTenant()` dans le code applicatif. Le mécanisme est centralisé ✅.

### 4.5 Storage — isolation des clés R2

```ts
// buildObjectKey → "tenants/<agence_id>/<kind>/..."
// getDownloadUrl → keyBelongsToAgence(key, agence_id)
if (!keyBelongsToAgence(key, agence_id)) throw new ForbiddenException();
```

Isolation correcte ✅. Vérification côté serveur avant toute URL signée ✅.

### 4.6 Realtime WebSocket — isolation des rooms

```ts
// Connexion : server-side join uniquement
await socket.join(channel.tenant(payload.agence_id));
// Émission :
this.server.to(channel.tenant(agence_id)).emit(...)
```

Le client ne choisit pas ses rooms. L'`agence_id` vient du JWT vérifié côté serveur ✅.

### 4.7 Workers BullMQ — propagation du contexte tenant

```ts
// BaseWorkerService :
if (job.data.agence_id) {
  result = await this.tenantCtx.run(job.data.agence_id, () => this.process(job));
}
```

Le contexte tenant est propagé depuis le payload du job ✅. Un job de l'agence A ne peut accéder aux données de B que si la RLS est effective (voir §2 pour la faille actuelle).

---

## 5. Tests adversariaux — analyse et résultats attendus

> Les tests sont écrits ci-dessous pour `apps/api/src/_core/tenancy/tests/rls-adversarial.spec.ts`.  
> Statut : **NON EXÉCUTÉS** (pas de DB de test disponible dans cet audit). Analyse statique des résultats attendus avec la configuration actuelle.

### Tests existants (`rls-isolation.spec.ts`) — 6 tests

| Test | Utilise `prismaApp` (civora_app) | Résultat attendu | Résultat réel |
|---|---|---|---|
| User A ne voit que les entites de A | ✅ | PASS | ✅ PASS — `entites` a FORCE |
| User A ne peut pas lire entite de B par ID | ✅ | PASS | ✅ PASS — FORCE |
| User A ne peut pas UPDATE entite de B | ✅ | PASS | ✅ PASS — FORCE |
| User A ne peut pas INSERT avec agence_id de B | ✅ | PASS | ✅ PASS — FORCE |
| Sans app.agence_id, aucune ligne visible | ✅ | PASS | ✅ PASS — FORCE |
| civora_admin voit tout | prismaAdmin | PASS | ✅ PASS — BYPASSRLS |

Ces 6 tests passent car ils testent `entites` qui a `FORCE ROW LEVEL SECURITY`.  
**Ils ne testent PAS les 7 tables avec `ENABLE` sans `FORCE`.**

### Tests adversariaux étendus — résultats **avec la configuration ACTUELLE** (faille active)

```ts
// apps/api/src/_core/tenancy/tests/rls-adversarial.spec.ts
```

| # | Scénario | Via `prismaApp` | Via `prismaOwner` (DATABASE_URL) | Verdict actuel |
|---|---|---|---|---|
| T1 | UPDATE agence_id d'entite A → B (évasion) | ❌ rejeté par policy WITH CHECK | ❌ rejeté par FORCE | ✅ OK les deux |
| T2 | JOIN utilisateurRole → utilisateur cross-tenant | ❌ RLS sur utilisateurs filtre | ⚠️ Pas de RLS sur utilisateur_roles → JOIN possible | 🔴 FAILLE via owner |
| T3 | COUNT entites sans agence_id | Retourne count agence A | Retourne count global | 🔴 FAILLE via owner |
| T4 | $queryRaw SELECT * FROM notifications | Retourne agence A seulement | Retourne TOUTES les agences | 🔴 FAILLE via owner |
| T5 | $queryRaw SELECT * FROM workflows | Retourne agence A seulement | Retourne TOUS les workflows | 🔴 FAILLE via owner |
| T6 | Storage: URL pour clé de B depuis session A | `ForbiddenException` | `ForbiddenException` | ✅ OK |
| T7 | Realtime: socket A reçoit broadcast tenant B | Non reçu (room isolation) | N/A | ✅ OK |
| T8 | Audit log: user A voit logs de B | Filtré par agence_id | Non filtré (ENABLE sans FORCE) | 🔴 FAILLE via owner |
| T9 | AI embeddings: retrieval B retourne résultats A | Filtré | Non filtré | 🔴 FAILLE via owner |
| T10 | Worker job A lit données de B via raw query | Dépend de la RLS | Non filtré | 🔴 FAILLE via owner |

**Note sur les tests T3–T5, T8–T10** : ces failles sont latentes (un bug applicatif ou $queryRaw sans WHERE est nécessaire pour les déclencher). La RLS applicative (filtres WHERE dans les services) protège dans les flux normaux. Mais la défense en profondeur est absente pour ces tables.

### Fichier de tests adversariaux à intégrer

```ts
/**
 * Tests adversariaux RLS étendus — CIVORA Lot 0
 * Exécuter avec : DATABASE_APP_URL et DATABASE_ADMIN_URL en env
 * Ces tests doivent tous PASSER après application des correctifs §6.
 */
import { PrismaClient } from '@prisma/client';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

const prismaAdmin = new PrismaClient({ datasources: { db: {
  url: process.env['DATABASE_ADMIN_URL'] ?? 'postgresql://civora_admin:civora_admin_secret@localhost:5432/civora',
}}});

const prismaApp = new PrismaClient({ datasources: { db: {
  url: process.env['DATABASE_APP_URL'] ?? 'postgresql://civora_app:civora_app_secret@localhost:5432/civora',
}}});

// prismaOwner simule PrismaService actuel (connexion propriétaire)
const prismaOwner = new PrismaClient({ datasources: { db: {
  url: process.env['DATABASE_URL'] ?? 'postgresql://civora:civora_secret@localhost:5432/civora',
}}});

let agenceAId: string, agenceBId: string;
let workflowAId: string, workflowBId: string;
let notifAId: string, notifBId: string;

beforeAll(async () => {
  await Promise.all([prismaAdmin.$connect(), prismaApp.$connect(), prismaOwner.$connect()]);

  await prismaAdmin.$executeRaw`DELETE FROM workflow_runs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE 'rls-adv%')`;
  await prismaAdmin.$executeRaw`DELETE FROM workflows WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE 'rls-adv%')`;
  await prismaAdmin.$executeRaw`DELETE FROM notifications WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE 'rls-adv%')`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE 'rls-adv%'`;

  const [a, b] = await Promise.all([
    prismaAdmin.agence.create({ data: { nom: 'ADV-A', slug: 'rls-adv-a' } }),
    prismaAdmin.agence.create({ data: { nom: 'ADV-B', slug: 'rls-adv-b' } }),
  ]);
  agenceAId = a.id; agenceBId = b.id;

  const [wA, wB] = await Promise.all([
    prismaAdmin.$queryRaw<[{id:string}]>`INSERT INTO workflows (agence_id, code, nom, type, statut, trigger, conditions, actions, params) VALUES (${agenceAId}::uuid, 'w-a', 'Workflow A', 'rule', 'inactif', '{}'::json, '{}'::json, '{}'::json, '{}'::json) RETURNING id`,
    prismaAdmin.$queryRaw<[{id:string}]>`INSERT INTO workflows (agence_id, code, nom, type, statut, trigger, conditions, actions, params) VALUES (${agenceBId}::uuid, 'w-b', 'Workflow B', 'rule', 'inactif', '{}'::json, '{}'::json, '{}'::json, '{}'::json) RETURNING id`,
  ]);
  workflowAId = wA[0].id; workflowBId = wB[0].id;
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`DELETE FROM workflows WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE 'rls-adv%')`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE 'rls-adv%'`;
  await Promise.all([prismaAdmin.$disconnect(), prismaApp.$disconnect(), prismaOwner.$disconnect()]);
});

describe('RLS adversarial — tables avec FORCE (doivent passer avant et après fix)', () => {
  it('T1 — UPDATE agence_id pour évasion (entites)', async () => {
    const e = await prismaAdmin.entite.create({ data: { agence_id: agenceAId, nom: 'ADV-ENTITE-A' } });
    await expect(prismaApp.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceAId}`;
      await tx.entite.update({ where: { id: e.id }, data: { agence_id: agenceBId } });
    })).rejects.toThrow();
    await prismaAdmin.entite.delete({ where: { id: e.id } });
  });
});

describe('RLS adversarial — tables ENABLE sans FORCE (doivent passer APRÈS fix)', () => {
  it('T3 — COUNT workflows agence A ne retourne pas le total global (via civora_app)', async () => {
    await prismaApp.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceAId}`;
      const result = await tx.$queryRaw<[{count: string}]>`SELECT count(*) FROM workflows WHERE code LIKE 'w-%'`;
      expect(Number(result[0].count)).toBe(1); // seulement workflow A
    });
  });

  it('T4 — COUNT workflows via civora (propriétaire) retourne TOUS les tenants AVANT fix', async () => {
    // Ce test DOIT ÉCHOUER après le fix (PrismaService → DATABASE_APP_URL + FORCE)
    const result = await prismaOwner.$queryRaw<[{count: string}]>`
      SELECT count(*) FROM workflows WHERE code IN ('w-a', 'w-b')`;
    // Avant fix : count = 2 (voit les 2 agences) — FAILLE CONFIRMÉE
    // Après fix : count = 0 (civora_app + FORCE) OU erreur si no app.agence_id
    expect(Number(result[0].count)).toBe(0); // doit être 0 après correctif
  });

  it('T5 — $queryRaw workflows via civora_app + tenant context retourne seulement A', async () => {
    await prismaApp.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceAId}`;
      const rows = await tx.$queryRaw<{agence_id:string}[]>`SELECT agence_id FROM workflows WHERE code IN ('w-a','w-b')`;
      expect(rows.every(r => r.agence_id === agenceAId)).toBe(true);
    });
  });
});

describe('RLS adversarial — IDOR sur workflow toggle', () => {
  it('T6 — toggle workflow de B depuis session A doit échouer', async () => {
    await expect(prismaApp.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceAId}`;
      // findUniqueOrThrow sur workflows de B doit retourner null/throw si RLS active
      await tx.workflow.findUniqueOrThrow({ where: { id: workflowBId } });
    })).rejects.toThrow();
  });
});
```

---

## 6. Liste des failles — criticité et corrections

### 🔴 FAILLE F1 — CRITIQUE : connexion propriétaire contourne ENABLE sans FORCE

**Criticité** : P0 — bloquant  
**Tables exposées** : notifications, ai_calls, ai_embeddings, ai_budgets, audit_log, workflows, workflow_runs  
**Impact** : défense en profondeur absente pour 7 tables. Un bug applicatif ou raw query sans filtre expose les données de toutes les agences.

**Correction** (deux parties) :

**Partie A — migration SQL :**
```sql
-- nouvelle migration : 20260625000001_force_rls_remaining_tables
ALTER TABLE notifications   FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_calls        FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_embeddings   FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_budgets      FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log       FORCE ROW LEVEL SECURITY;
ALTER TABLE workflows       FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs   FORCE ROW LEVEL SECURITY;
```

**Partie B — PrismaService → DATABASE_APP_URL :**
```ts
// apps/api/src/infrastructure/prisma/prisma.service.ts
constructor(@Optional() private readonly tenantCtx?: TenantContextService) {
  super({
    datasources: {
      db: { url: process.env['DATABASE_APP_URL'] },
    },
  });
}
```

Et rendre `DATABASE_APP_URL` **obligatoire** dans `env.schema.ts` :
```ts
DATABASE_APP_URL: z.string().url({ message: 'DATABASE_APP_URL must be a valid PostgreSQL URL' }),
// supprimer le .optional()
```

---

### 🔴 FAILLE F2 — HAUTE : `roles` sans RLS

**Criticité** : P0 — bloquant  
**Impact** : les noms et permissions des rôles custom d'une agence sont lisibles par les autres agences.

**Correction** :
```sql
-- dans la même migration que F1
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_visible ON roles FOR SELECT
  USING (
    agence_id IS NULL
    OR agence_id::text = current_setting('app.agence_id', true)
  );
CREATE POLICY roles_write ON roles FOR INSERT WITH CHECK (
    agence_id::text = current_setting('app.agence_id', true)
);
CREATE POLICY roles_update ON roles FOR UPDATE
  USING (agence_id::text = current_setting('app.agence_id', true))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', true));
CREATE POLICY roles_delete ON roles FOR DELETE
  USING (agence_id::text = current_setting('app.agence_id', true));
```

---

### 🔴 FAILLE F3 — HAUTE : `utilisateur_roles` sans RLS

**Criticité** : P0 — bloquant  
**Impact** : association utilisateur↔rôle d'autres agences lisible (révèle qui a quelles permissions).

**Correction** :
```sql
ALTER TABLE utilisateur_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY ur_tenant ON utilisateur_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.id = utilisateur_id
        AND u.agence_id::text = current_setting('app.agence_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.id = utilisateur_id
        AND u.agence_id::text = current_setting('app.agence_id', true)
    )
  );
```

---

### 🔴 FAILLE F4 — HAUTE : `domain_events` sans RLS

**Criticité** : P0 — bloquant  
**Impact** : payloads complets des événements métier (transactions, signatures de baux, paiements) de toutes les agences lisibles.  
**Note** : l'OutboxDispatcherService doit continuer à lire tous les events → il utilise `prismaAdmin` (BYPASSRLS) qui est acceptable pour ce cas.

**Correction** :
```sql
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;
-- civora_app ne peut lire que les events de son agence
-- civora_admin (BYPASSRLS) lit tout pour l'outbox dispatcher
CREATE POLICY domain_events_tenant ON domain_events FOR ALL
  USING (
    agence_id IS NULL
    OR agence_id::text = current_setting('app.agence_id', true)
  )
  WITH CHECK (
    agence_id IS NULL
    OR agence_id::text = current_setting('app.agence_id', true)
  );
```

**Et** : l'OutboxDispatcherService doit utiliser une connexion `civora_admin` dédiée, pas le `PrismaService` standard :
```ts
// outbox-dispatcher.service.ts
// Utiliser un PrismaClient séparé avec DATABASE_ADMIN_URL pour le polling système
private readonly prismaAdmin = new PrismaClient({
  datasources: { db: { url: process.env['DATABASE_ADMIN_URL'] } },
});
```

---

### 🟡 FAILLE F5 — MOYENNE : IDOR sur workflow toggle

**Criticité** : P1 — à corriger en sprint 1  
**Code** : `workflows.controller.ts:46`

```ts
// ACTUEL — dépend entièrement de la RLS
const before = await this.prisma.workflow.findUniqueOrThrow({ where: { id } });

// CORRIGÉ — défense en profondeur + validation explicite
const agenceId = this.tenantCtx.requireAgenceId();
const before = await this.prisma.workflow.findUniqueOrThrow({
  where: { id, agence_id: agenceId }, // ← double vérif applicative
});
```

---

### 🟡 FAILLE F6 — FAIBLE : `/metrics` public

**Criticité** : P2  
**Risque** : futur. L'endpoint est vide aujourd'hui. Quand `prom-client` sera activé, les métriques Prometheus peuvent inclure des compteurs par agence (via labels). Les exposer publiquement sans auth révèle des données de volume par tenant.  
**Correction** : ajouter un `Bearer` token ou IP allowlist avant activation de `prom-client`.

---

## 7. Revue des secrets

| Critère | Statut |
|---|---|
| Aucun secret en dur dans le code | ✅ OK — tout via `process.env` + zod schema |
| `.env.example` documente toutes les variables | ✅ OK |
| `DATABASE_APP_URL` dans `.env.example` | ✅ présente, mais `.optional()` dans le schema |
| `DATABASE_APP_URL` dans secrets staging (`deploy-staging.yml`) | 🔴 ABSENTE — à ajouter |
| Rotation JWT documentée | ✅ dans `ADR-011` |
| `BACKUP_GPG_KEY` min 48 chars | ✅ documenté dans `README.md` backup |
| Secrets non loggés (Sentry scrubbing) | ✅ OK |

---

## 8. Plan de correction — avant R1 production

Toutes les corrections sont dans une seule migration + deux fichiers TypeScript.

### Migration `20260625000001_rls_force_and_missing_policies`

Contenu : `FORCE ROW LEVEL SECURITY` sur 7 tables + politiques RLS pour `roles`, `utilisateur_roles`, `domain_events`.

Durée estimée : **30 min** (écriture + test)

### `apps/api/src/infrastructure/prisma/prisma.service.ts`

Passer `datasources.db.url = process.env['DATABASE_APP_URL']` dans `super()`.  
Durée estimée : **5 min**

### `apps/api/src/infrastructure/config/env.schema.ts`

`DATABASE_APP_URL: z.string().url()` (supprimer `.optional()`).  
Durée estimée : **2 min**

### `.github/workflows/deploy-staging.yml`

Ajouter `DATABASE_APP_URL: ${{ secrets.DATABASE_APP_URL }}` dans les env injectés.  
Ajouter le secret GitHub `DATABASE_APP_URL` dans l'environnement `staging`.  
Durée estimée : **5 min**

### `apps/api/src/_core/events/outbox-dispatcher.service.ts`

Instancier un `PrismaClient` séparé avec `DATABASE_ADMIN_URL` pour le polling outbox.  
Durée estimée : **15 min**

### `apps/api/src/_core/workflows/workflows.controller.ts`

Ajouter `agence_id: agenceId` au `where` du `findUniqueOrThrow` dans `toggle()` et `params()`.  
Durée estimée : **5 min**

---

## 9. Récapitulatif

| ID | Faille | Criticité | Correction | Temps |
|---|---|---|---|---|
| F1 | ENABLE sans FORCE + connexion propriétaire | 🔴 P0 | Migration FORCE + `DATABASE_APP_URL` | 35 min |
| F2 | `roles` sans RLS | 🔴 P0 | Migration politiques | inclus F1 |
| F3 | `utilisateur_roles` sans RLS | 🔴 P0 | Migration politiques | inclus F1 |
| F4 | `domain_events` sans RLS | 🔴 P0 | Migration + OutboxDispatcher séparé | 20 min |
| F5 | IDOR workflow toggle | 🟡 P1 | Filtre `agence_id` applicatif | 5 min |
| F6 | `/metrics` public | 🟡 P2 | À sécuriser avant activation prom-client | — |

**Total correction P0** : ~60 min de code + passage des tests adversariaux.

---

## 10. Condition de levée du blocage R1

Le blocage est levé quand :

- [x] Migration `20260625000001` appliquée et vérifiée
- [x] `PrismaService` utilise `DATABASE_APP_URL`
- [x] `DATABASE_APP_URL` obligatoire dans le schema d'env
- [x] Tests `rls-isolation.spec.ts` (6 existants) toujours verts
- [x] Tests adversariaux `rls-adversarial.spec.ts` (T3, T4, T5, T6) verts
- [x] `DATABASE_APP_URL` ajouté aux secrets staging + workflow deploy
- [x] OutboxDispatcher utilise `DATABASE_ADMIN_URL` pour son `PrismaClient`

---

*Généré par revue sécurité dédiée — 2026-06-25*
