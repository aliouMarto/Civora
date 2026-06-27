# CIVORA — Charte technique & règles non négociables

Ce document fixe les **conventions, règles et invariants** du projet CIVORA. Toute contribution doit s'y conformer ou justifier explicitement l'exception en PR.

---

## 1. Le projet

**CIVORA** : SaaS ERP immobilier multi-tenant pour les agences ouest-africaines (cible Abidjan). 19 modules : CRM, gestion locative, saisonnier, ventes, promotion immobilière (VEFA), comptabilité opérationnelle, GED, workflows, IA & insights, Command Center, paramètres. Devise par défaut : **FCFA (XOF)**, fuseau : **Africa/Abidjan**.

La construction suit un **plan d'action releases R1 → R7**. Avant tout module métier, on construit le **Socle (Lot 0)**.

---

## 2. Stack technique (NON NÉGOCIABLE)

| Couche | Choix |
|---|---|
| Frontend | **Next.js** (App Router) + TypeScript + Tailwind + shadcn/ui, servi en **PWA** |
| Backend cœur | **NestJS** + TypeScript (monolithe modulaire) |
| Service IA prédictive | **Python FastAPI** dédié |
| Base de données | **PostgreSQL** + **PostGIS** + **pgvector** |
| Cache / Files / Temps réel | **Redis** + **BullMQ** + adaptateur Socket.IO |
| Auth | **Passport + JWT dans NestJS** (PAS Auth.js comme source de vérité) |
| Fichiers | **Cloudflare R2** (S3-compatible) |
| PDF | **Gotenberg** (worker isolé) |
| Cartographie | Mapbox |
| IA générative | **Passerelle** abstraite multi-fournisseur (Gemini + OpenAI) |
| OCR | Google Document AI |
| Comm | WhatsApp BSP + SMS + Email transactionnel |
| Paiements | PSP Mobile Money régional (Orange/MTN/Moov/Wave) |
| Signature | Fournisseur e-signature intégré |
| Observabilité | Sentry + logs + APM + **journal d'audit applicatif** |
| Infra | Docker + hébergement Paris + GitHub Actions |

**Tout changement de stack passe par une ADR validée en équipe.**

---

## 3. Structure du monorepo

```
civora/
├── apps/
│   ├── web/                  # Next.js (frontend + PWA)
│   ├── api/                  # NestJS (backend cœur)
│   └── ai/                   # Python FastAPI (service IA prédictive)
├── packages/
│   ├── shared-types/         # Types TypeScript partagés web ↔ api
│   └── eslint-config/        # config lint commune
├── infra/
│   ├── docker/               # Dockerfiles + docker-compose.yml
│   └── github-actions/       # workflows CI/CD
├── docs/                     # docs internes (ADR, architecture, guides utilisateur)
├── package.json              # workspaces pnpm
├── pnpm-workspace.yaml
├── turbo.json                # orchestrateur
└── .env.example
```

**Outils** : `pnpm` (workspaces), `turbo` (orchestrateur monorepo), `tsx` pour scripts TS.

---

## 4. Frontières de domaine (les 6 familles de modules NestJS)

Sous `apps/api/src/`, l'arborescence est :

```
src/
├── _core/              # socle transverse : tenancy, auth, audit, events, jobs, storage, notifications, ai, realtime, biens, contacts...
├── infrastructure/     # config, prisma, redis (drivers techniques)
└── modules/            # à venir : pilotage, crm avancé, gestion, operations, system
```

**Règle inviolable** : un module ne lit JAMAIS directement les tables d'un autre module. Il passe par le service interne exposé OU par un événement de domaine.

---

## 5. Règles non négociables

### 5.1 Sécurité multi-tenant

- **Toute table métier porte `agence_id`** (et `entite_id` quand pertinent : baux, ventes, comptabilité, propriétaires).
- **Row-Level Security PostgreSQL activée sur chaque table métier**, politique : `agence_id::text = current_setting('app.agence_id', true)`.
- Toutes les tables métier doivent avoir **`FORCE ROW LEVEL SECURITY`** activée (ENABLE seul ne protège pas le propriétaire des tables).
- Toutes les politiques RLS ont **`USING` ET `WITH CHECK`** pour bloquer l'évasion par INSERT/UPDATE cross-tenant.
- L'API se connecte avec le rôle `civora_app` (variable `DATABASE_APP_URL`), **jamais** avec le rôle propriétaire `civora`.
- Le rôle `civora_admin` (BYPASSRLS) est réservé : migrations, outbox dispatcher, lookups pré-auth (login/refresh, acceptation d'invitation). Chaque usage doit être justifié en commentaire.
- Un middleware NestJS positionne `app.agence_id` à chaque requête à partir du JWT (`TenantContextService`).
- Tests automatiques inter-agences : un user de l'agence A ne doit JAMAIS lire une ligne de l'agence B. Si tu écris du code touchant à la persistance, tu écris ce test.

### 5.2 Argent

- Tous les montants sont stockés en **entiers, en centimes FCFA**, dans une colonne `bigint`. Jamais de `float`, `double`, `numeric` pour de l'argent.
- Type partagé `Money { amount: bigint, currency: 'XOF' }` dans `packages/shared-types`.
- Toute écriture financière passe le **journal d'audit** (qui, quoi, quand, avant/après).

### 5.3 Idempotence

- Tout **webhook** (Mobile Money, WhatsApp, signature, OTA) doit être **idempotent** : clé d'idempotence persistée, rejouer le webhook = aucun effet en double.
- Toute consommation d'**événement de domaine** doit aussi être idempotente (le bus rejoue en cas d'échec).

### 5.4 Audit

- Toute action sensible (modification d'argent, changement de droits, suppression, virement, activation/désactivation de workflow, action admin) est tracée dans `audit_log` : `actor_id`, `action`, `entity`, `entity_id`, `before`, `after`, `timestamp`, `ip`, `user_agent`. Immuable (insert-only via trigger).

### 5.5 Asynchrone

- Tout ce qui est lent ou externe (PDF, OCR, appel IA, envoi WhatsApp/SMS/Email, réconciliation paiement, sync OTA, exports lourds) passe par **BullMQ**. Jamais dans le cycle requête/réponse.

### 5.6 Configuration

- Aucune valeur sensible en dur dans le code. Tout passe par variables d'environnement, lues via un service de config typé (`@nestjs/config` + schéma `zod`).
- Le fichier `.env.example` est tenu à jour à chaque variable ajoutée.

---

## 6. Conventions de code

### TypeScript (web + api)

- **`strict: true`** partout. Pas de `any` implicite. Si tu utilises `any`, justifie-le en commentaire.
- ESLint + Prettier configurés à la racine. Le code doit lint sans erreur ni warning avant chaque commit.
- Tests **Vitest** (préféré à Jest pour la vélocité) côté Node ; Playwright pour l'E2E côté web.
- Imports : pas de `import * as`, pas d'alias non documentés. Alias `@/` pointe vers `src/` dans chaque app.

### NestJS

- Un dossier par module sous `_core/<module>/` : `controller`, `service`, `repository`, `dto`, `events`, `tests`.
- **DTOs validés avec `class-validator` + `class-transformer`**. Aucun endpoint n'accepte un input non validé.
- ORM : **Prisma**. Schéma central à `apps/api/prisma/schema.prisma`. Migrations versionnées.
- Erreurs : format unique `{ code, message, details }`. Codes documentés.
- Tous les accès Prisma sur tables RLS passent par `PrismaService` (rôle `civora_app`). L'auto-extension transparent garantit `SET LOCAL app.agence_id` à chaque opération de modèle. Pour les requêtes raw, wrapper explicitement avec `withTenant()`.

### Python (service IA)

- Python 3.11+, `uv` pour la gestion de dépendances, `ruff` + `mypy --strict` pour la qualité.
- Endpoints FastAPI typés avec `pydantic v2`.
- Tests `pytest`.

### Git

- Convention de commits : `type(scope): message` (ex. `feat(socle): add RLS middleware`).
- Une branche par étape : `lot0/01-bootstrap`, `lot1/module1-contacts-1-data`, etc.
- PRs petites, focalisées. Ne pas mélanger plusieurs étapes dans la même branche.

---

## 7. Mode de travail attendu

1. **Avant de démarrer une étape**, relire ce fichier et le spec de l'étape.
2. **Au début**, annoncer le plan en 3-5 puces.
3. **Tests écrits en parallèle du code**, pas après.
4. **Lancer les commandes de validation** listées en fin de chaque spec. Si elles échouent, corriger avant de continuer.
5. **À la fin de chaque étape**, récap court : ce qui est fait, fichiers touchés, comment vérifier.
6. **Commit à chaque étape terminée** avec un message clair, sur la branche dédiée.
7. **Pas de nouvelle dépendance** sans justification dans la PR.

### Quand s'arrêter et demander

- Une règle non négociable (section 5) est en tension avec une étape.
- Changement de stack ou d'architecture envisagé.
- Critère d'acceptation non clair.
- Une commande de validation échoue de façon non triviale.
- Doute sur une décision touchant l'**argent** ou la **sécurité**.

**Mieux vaut s'arrêter 30 secondes que livrer une fuite de données inter-tenant ou un calcul de loyer faux.**

---

## 8. Commandes utiles

```bash
# Installation
pnpm install

# Développement (tout)
pnpm dev

# Développement par app
pnpm --filter @civora/api dev
pnpm --filter @civora/web dev

# Qualité
pnpm lint
pnpm typecheck
pnpm test

# Base de données
pnpm --filter @civora/api exec prisma migrate dev
pnpm --filter @civora/api exec prisma studio

# Docker (stack locale : Postgres + Redis + MinIO + Mailhog + Gotenberg)
docker compose -f infra/docker/docker-compose.yml up -d
```

---

## 9. Quand on produit du code

- **Pas d'invention de bibliothèques.** Si tu n'es pas sûr qu'un paquet existe ou de sa signature, vérifie (registry npm/pypi, doc officielle).
- **Lire le code existant** avant d'éditer un fichier (frontières, conventions, imports).
- **Ne pas réécrire** un fichier de plus de 100 lignes sans signaler la portée du changement.
- **Ne pas supprimer** de tests existants. Si un test est obsolète, le marquer `it.skip` avec un commentaire.
- **Commenter le pourquoi**, pas le quoi. Le quoi se lit dans le code.

---

## 10. Référence du plan

Le plan d'action complet (modules, releases, Definition of Done de chaque module) est à venir dans `docs/CIVORA_Plan_Developpement.md`.

Le document d'architecture détaillé (RLS, événements, fiches modules) est dans `docs/adr/` (Architectural Decision Records).

---

**Résumé en une ligne.** CIVORA se construit pas à pas, dans la stack imposée, avec RLS multi-tenant, argent en centimes, idempotence, audit, tests systématiques.
