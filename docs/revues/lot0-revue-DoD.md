# Revue DoD — Lot 0 (Étapes 1–15)

**Date** : 2026-06-25  
**Réviseur** : Civora Core Team  
**Branche auditée** : `main` (commits `lot0/01` → `lot0/15`)

---

## Statut global : 🟡 GO avec réserves

Le Lot 0 est fonctionnel et structurellement solide. Un défaut critique est identifié (RLS non enforced à l'exécution) qui **doit être corrigé avant la mise en production**, mais qui n'empêche pas le développement de R1 en parallèle. Deux points KO secondaires et plusieurs points à vérifier complètent le tableau.

**Recommandation : démarrer R1 en parallèle immédiatement, avec correction RLS en priorité P0.**

---

## 1. Fondations (Étapes 1–4)

### 1.1 Monorepo Turborepo
| Critère | Statut | Fichier |
|---|---|---|
| Structure `apps/api`, `apps/web`, `apps/ai`, `packages/` | ✅ OK | [`turbo.json`](../../turbo.json) |
| `pnpm-workspace.yaml` correctement configuré | ✅ OK | [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) |
| Pipeline `build → test → lint` dans turbo | ✅ OK | [`turbo.json`](../../turbo.json) |
| Pas de secrets en dur dans les fichiers de config | ✅ OK | tout passe par `.env` |

### 1.2 Base de données PostgreSQL + Prisma
| Critère | Statut | Fichier |
|---|---|---|
| pgvector installé | ✅ OK | migrations Prisma |
| Multi-tenant : `agence_id` sur toutes les tables métier | ✅ OK (vérification ci-dessous) | |
| Montants en `BigInt` centimes FCFA, jamais float | ✅ OK | schema Prisma |
| RLS activé (migrations) | ✅ OK | migrations `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` |
| **RLS enforced à l'exécution (PrismaService)** | 🔴 **KO BLOQUANT** | [`prisma.service.ts`](../../apps/api/src/infrastructure/prisma/prisma.service.ts) |

> **KO BLOQUANT — PrismaService utilise `DATABASE_URL` (superuser BYPASSRLS)**  
> `PrismaService` appelle `super()` sans datasource explicite → lit `DATABASE_URL` = `civora` (superuser avec `BYPASSRLS`), **non** `DATABASE_APP_URL` = `civora_app` (rôle soumis à la RLS).  
> Conséquence : toutes les requêtes Prisma ignorent les politiques RLS en production malgré leur présence dans les migrations. **La RLS est un mirage actuellement.**  
> Fix : [`prisma.service.ts`](../../apps/api/src/infrastructure/prisma/prisma.service.ts) → passer `datasourceUrl: process.env['DATABASE_APP_URL']` dans le constructeur `super()`, ET définir `DATABASE_APP_URL` dans tous les environnements.

### 1.3 Tables sans RLS (agence_id présent mais politiques manquantes)
| Table | agence_id | RLS trouvé | Statut |
|---|---|---|---|
| `roles` | nullable | ❌ | 🟡 KO — à corriger |
| `utilisateur_roles` | join table | ❌ | 🟡 KO — à corriger |
| `domain_events` | nullable | ❌ | 🟡 KO — à corriger |
| `event_handler_offsets` | non | ❌ | ⚪ Acceptable (pas de données métier) |
| `job_dead_letters` | non | ❌ | ⚪ Acceptable (infra BullMQ) |
| `refresh_tokens` | non (user-scoped) | ❌ | ⚪ Acceptable (politique par utilisateur_id suffit) |
| `agences` | IS le tenant | N/A | ✅ N/A |

---

## 2. Sécurité — Auth & Tokens (Étapes 5–7)

| Critère | Statut | Fichier |
|---|---|---|
| Argon2id pour les mots de passe (jamais bcrypt/MD5) | ✅ OK | `apps/api/src/modules/auth/` |
| Refresh tokens opaques (jamais JWT), stockés hashés | ✅ OK | `refresh_tokens` table, hash en DB |
| Rotation systématique au refresh | ✅ OK | `AuthService.refresh()` |
| Détection de rejeu (double refresh → révocation chaîne) | ✅ OK | logique `used = true` + révocation famille |
| Cookie httpOnly, secure, SameSite=strict | ✅ OK | [`apps/web/src/app/actions/auth.ts`](../../apps/web/src/app/actions/auth.ts) |
| Access token en mémoire uniquement (jamais localStorage) | ✅ OK | [`auth.store.ts`](../../apps/web/src/lib/store/auth.store.ts) |
| CSRF : SameSite=strict documenté | ✅ OK | [`apps/web/src/middleware.ts`](../../apps/web/src/middleware.ts) |
| CORS NestJS limité à `WEB_ORIGINS` | ✅ OK | `main.ts` / `app.module.ts` |
| Scrubbing PII Sentry (password, token, authorization) | ✅ OK | `sentry.config.ts` |
| JWT_ACCESS_SECRET / JWT_REFRESH_SECRET min 32 chars | ✅ OK | `env.schema.ts` (zod `.min(32)`) |

---

## 3. Isolation multi-tenant (Étapes 5–8)

| Critère | Statut | Détail |
|---|---|---|
| `agence_id` sur toutes les tables métier | ✅ OK | 10 tables confirmées |
| Clés R2 préfixées par `agence_id` | ✅ OK | `storage.service.ts` |
| URLs signées courte durée, pas d'URL publique persistante | ✅ OK | `generatePresignedUrl()` |
| Validation des permissions avant URL signée | ✅ OK | guards NestJS |
| Tenancy Zustand côté web | ✅ OK | `useCurrentAgence()` via auth store |

---

## 4. Architecture événementielle & queues (Étapes 9–10)

| Critère | Statut | Fichier |
|---|---|---|
| Outbox dans la même transaction Prisma (pas d'emit hors transaction) | ✅ OK | `OutboxService` + `prisma.$transaction()` |
| BullMQ pour tout traitement > 100ms ou dépendance externe | ✅ OK | 8 queues déclarées |
| Pas d'appel direct inter-modules (tout par événement) | ✅ OK | architecture vérifiée |
| `actor_id` + `correlation_id` dans métadonnées événements | ✅ OK | `DomainEvent.metadata` |
| `audit_log` immuable par contrainte DB | ✅ OK | trigger `deny_audit_log_mutation` |

---

## 5. Module IA (Étape 11)

| Critère | Statut | Fichier |
|---|---|---|
| Encapsulation : 0 appel OpenAI/Gemini hors module AI | ✅ OK | `apps/ai/` isolé |
| Budget par agence/mois enforced avant appel | ✅ OK | `AiBudgetService` |
| Coûts en centimes `BigInt` (jamais float) | ✅ OK | `ai_calls` + `ai_budgets` |
| `ai_embeddings` avec pgvector | ✅ OK | migrations |

---

## 6. Workflows & Realtime (Étapes 12–13)

| Critère | Statut | Fichier |
|---|---|---|
| Actions whitelist fermée (pas d'eval) | ✅ OK | `WorkflowActionRegistry` |
| DSL JSON conditions (pas d'expression dynamique évaluée) | ✅ OK | parser conditions |
| JWT WebSocket (validation handshake) | ✅ OK | `WsJwtGuard` |
| Realtime : namespaces par `agence_id` (pas de cross-tenant) | ✅ OK | `RealtimeGateway` |

---

## 7. Web Shell (Étape 14)

| Critère | Statut | Fichier |
|---|---|---|
| Next.js 16 App Router, route groups `(auth)` / `(app)` | ✅ OK | [`apps/web/src/app/`](../../apps/web/src/app/) |
| Middleware protège toutes les routes `/` (sauf `/login`) | ✅ OK | [`middleware.ts`](../../apps/web/src/middleware.ts) |
| Server Action login → cookie httpOnly → Zustand | ✅ OK | [`auth.ts`](../../apps/web/src/app/actions/auth.ts) |
| `apiFetch()` : retry 401 + clearSession + redirect | ✅ OK | [`api-client.ts`](../../apps/web/src/lib/auth/api-client.ts) |
| Route Handler `/api/auth/refresh` (lit cookie httpOnly) | ✅ OK | [`refresh/route.ts`](../../apps/web/src/app/api/auth/refresh/route.ts) |
| `useSearchParams()` dans Suspense boundary | ✅ OK | [`login/page.tsx`](../../apps/web/src/app/(auth)/login/page.tsx) |
| PWA : manifest.json + sw.js + offline shell | ✅ OK | [`public/manifest.json`](../../apps/web/public/manifest.json) |
| `removeConsole` en production | ✅ OK | [`next.config.ts`](../../apps/web/next.config.ts) |
| 16 tests vitest (auth-store, api-client, kpi-card) | ✅ OK | `apps/web/src/tests/` |
| i18n fr/en préparé | ✅ OK | structure `locales/` |

---

## 8. CI/CD & Sauvegardes (Étape 15)

| Critère | Statut | Fichier |
|---|---|---|
| `ci.yml` bloque merge si lint/typecheck/test/build KO | ✅ OK | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| `build-images.yml` : sha-tag + latest, GHCR | ✅ OK | [`.github/workflows/build-images.yml`](../../.github/workflows/build-images.yml) |
| `deploy-staging.yml` : migrate avant up | ✅ OK | [`.github/workflows/deploy-staging.yml`](../../.github/workflows/deploy-staging.yml) |
| Smoke tests post-déploiement (curl /health ×3) | ✅ OK | job `smoke-test` |
| Dockerfiles multistage, user non-root `civora` | ✅ OK | [`infra/docker/`](../../infra/docker/) |
| Pas de secrets dans Dockerfiles (ARG/ENV buildtime) | ✅ OK | secrets injectés au runtime |
| `pg-backup.sh` : dump custom → GPG AES-256 → R2 | ✅ OK | [`pg-backup.sh`](../../infra/backup/pg-backup.sh) |
| Rétention : 30j daily / 12m monthly | ✅ OK | pruning automatique |
| `pg-restore-test.sh` : isolé, 7 tables + pgvector + RLS | ✅ OK | [`pg-restore-test.sh`](../../infra/backup/pg-restore-test.sh) |
| Restore test hebdomadaire automatique (lundi 03:00 UTC) | ✅ OK | [`backup.yml`](../../.github/workflows/backup.yml) |
| ADR-011 avec table des 21 secrets | ✅ OK | [`docs/adr/011-cicd-and-backups.md`](../adr/011-cicd-and-backups.md) |
| `infra/backup/README.md` (restauration manuelle + rotation) | ✅ OK | [`README.md`](../../infra/backup/README.md) |

---

## 9. Récapitulatif des KO

### 🔴 KO BLOQUANT (à corriger avant mise en production)

| # | Problème | Criticité | Fichier cible | Fix |
|---|---|---|---|---|
| KO-1 | `PrismaService` utilise `DATABASE_URL` (BYPASSRLS) au lieu de `DATABASE_APP_URL` (RLS enforced) | **P0 — sécurité critique** | [`prisma.service.ts`](../../apps/api/src/infrastructure/prisma/prisma.service.ts) | `new PrismaClient({ datasources: { db: { url: process.env['DATABASE_APP_URL'] } } })` dans `super()` |

> **Impact KO-1** : Toutes les requêtes Prisma tournent avec le rôle `civora` qui a `BYPASSRLS`. Un bug applicatif ou une injection SQL peut lire ou modifier des données d'autres agences. La RLS définie dans les migrations n'est jamais vérifiée à l'exécution.

### 🟡 KO SECONDAIRE (à corriger dans le sprint R1)

| # | Problème | Criticité | Fix |
|---|---|---|---|
| KO-2 | Tables `roles` et `utilisateur_roles` manquent de politiques RLS (ont `agence_id` nullable) | P1 | Ajouter `ENABLE ROW LEVEL SECURITY` + politiques dans une nouvelle migration |
| KO-3 | Table `domain_events` manque de politiques RLS (a `agence_id` nullable) | P1 | Même migration que KO-2 |

---

## 10. À VÉRIFIER

| # | Point | Raison |
|---|---|---|
| AV-1 | Couverture `@Audited` hors auth | Seuls `login/refresh/logout` sont audités. Les actions de gestion des utilisateurs, invitations, changements de rôle, déclenchements de workflow, et opérations financières ne semblent pas couverts — contraire à l'invariant "aucune action financière ou de sécurité sans audit" |
| AV-2 | `DATABASE_APP_URL` dans `.env.example` et secrets staging | `env.schema.ts` déclare `DATABASE_APP_URL` comme `.optional()` — elle doit devenir **obligatoire** une fois KO-1 corrigé |
| AV-3 | Valeur de `DATABASE_APP_URL` dans `deploy-staging.yml` | Le secret `DATABASE_URL` est injecté mais `DATABASE_APP_URL` (civora_app) n'apparaît pas dans la liste des secrets du workflow |
| AV-4 | Couverture tests API (NestJS) | Les 16 tests couvrent le front — vérifier qu'il existe des tests d'intégration pour les modules critiques (auth, tenancy, outbox) côté API |
| AV-5 | Politiques RLS de `refresh_tokens` | Pas d'`agence_id` mais doit être isolé par `utilisateur_id` — vérifier qu'une politique existe bien pour éviter la lecture cross-user |

---

## 11. Recommandation

**🟡 GO avec réserves — R1 peut démarrer.**

L'architecture est correcte et les patterns de sécurité sont globalement bien appliqués. La correction KO-1 est **la seule chose bloquante pour la production** ; elle n'empêche pas le développement fonctionnel de R1 car les données de développement ne sont pas sensibles.

Plan d'action recommandé :

| Priorité | Action | Quand |
|---|---|---|
| P0 | Corriger KO-1 (`PrismaService` → `DATABASE_APP_URL`) + rendre `DATABASE_APP_URL` obligatoire dans `env.schema.ts` | Avant toute démo avec données réelles |
| P1 | Ajouter RLS sur `roles`, `utilisateur_roles`, `domain_events` (KO-2, KO-3) | Sprint 1 de R1 |
| P1 | Ajouter `DATABASE_APP_URL` dans les secrets staging et `deploy-staging.yml` (AV-3) | Avec P0 |
| P2 | Audit `@Audited` coverage (AV-1) | Sprint 2 de R1 |
| P3 | Tests intégration API NestJS (AV-4) | Avant release R1 |

---

*Généré par revue DoD automatisée — 2026-06-25*
