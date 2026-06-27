# CIVORA

SaaS ERP immobilier multi-tenant pour les agences ouest-africaines (cible Abidjan, devise FCFA, fuseau Africa/Abidjan).

19 modules : CRM, gestion locative, saisonnier, ventes, promotion VEFA, comptabilité, GED, workflows, IA & insights, Command Center, paramètres.

---

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Installation rapide (5 min)](#2-installation-rapide-5-min)
3. [Lancer la stack de dev](#3-lancer-la-stack-de-dev)
4. [Architecture du monorepo](#4-architecture-du-monorepo)
5. [Stack technique](#5-stack-technique)
6. [Conventions](#6-conventions)
7. [Tests](#7-tests)
8. [Documentation interne](#8-documentation-interne)
9. [Dépannage](#9-dépannage)

---

## 1. Prérequis

| Outil | Version | Pourquoi |
|---|---|---|
| **Node.js** | ≥ 20 | Backend NestJS + Frontend Next.js |
| **pnpm** | ≥ 9 | Gestion de workspaces monorepo |
| **Python** | ≥ 3.11 | Service IA FastAPI |
| **uv** | dernière | Gestionnaire de dépendances Python (`curl -LsSf https://astral.sh/uv/install.sh \| sh`) |
| **Docker Desktop** | ≥ 24 | Stack locale (PostgreSQL + Redis + MinIO + Mailhog + Gotenberg) |

### Installation des outils (macOS)

```bash
# Node 20 (via NVM)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20 && nvm use 20

# pnpm via Corepack (inclus avec Node 20+)
corepack enable
corepack prepare pnpm@9.15.9 --activate

# Python + uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Docker Desktop
# → télécharger sur https://www.docker.com/products/docker-desktop/
```

---

## 2. Installation rapide (5 min)

```bash
# 1. Cloner et configurer
git clone https://github.com/aliouMarto/Civora.git civora
cd civora
cp .env.example .env

# 2. Démarrer Docker Desktop, puis :
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Installer toutes les dépendances JS
pnpm install

# 4. Installer les dépendances Python (service IA)
cd apps/ai && uv sync && cd ../..

# 5. Préparer la base de données
pnpm --filter @civora/api exec prisma migrate deploy
pnpm --filter @civora/api exec prisma generate

# 6. Seeds de démo
pnpm --filter @civora/api seed              # rôles + admin@civora.dev
pnpm --filter @civora/api seed:contacts     # 25 contacts
pnpm --filter @civora/api seed:biens        # 40 biens géolocalisés
```

> ⚠️ **Note** : le `.env` à la racine est utilisé par Docker compose et le service Python. Pour Prisma CLI, un symlink `apps/api/.env → ../../.env` existe déjà dans le repo. Si vous voyez `Environment variable not found: DATABASE_URL`, vérifiez ce symlink avec `ls -la apps/api/.env`.

---

## 3. Lancer la stack de dev

**Terminal A — API + Web :**

```bash
pnpm dev
```

**Terminal B — Service IA Python (optionnel, requis pour Ask KURA et scoring async) :**

```bash
cd apps/ai && ./run_dev.sh
```

### URLs

| Service | URL | Description |
|---|---|---|
| Frontend Next.js | http://localhost:3000 | Interface utilisateur (PWA) |
| API NestJS | http://localhost:3001 | Backend principal |
| Service IA FastAPI | http://localhost:8000 | Scoring + Ask KURA |
| Bull Board | http://localhost:3001/admin/queues | Monitoring des jobs BullMQ (dev only) |
| MinIO Console | http://localhost:9001 | Console R2 locale (S3-compatible) |
| Mailhog | http://localhost:8025 | Boîte mail dev (SMTP local) |

### Identifiants par défaut (env dev)

- email : `admin@civora.dev`
- password : `CivoraDev2024!`

---

## 4. Architecture du monorepo

```
civora/
├── apps/
│   ├── web/                              # Next.js 16 App Router + PWA
│   │   └── src/app/(app)/
│   │       ├── contacts/                 # Module CRM Contacts
│   │       └── biens/                    # Module Catalogue Biens
│   ├── api/                              # NestJS 11
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seeds/
│   │   └── src/
│   │       ├── _core/                    # Modules transverses
│   │       │   ├── auth/                 # JWT + RBAC
│   │       │   ├── tenancy/              # Multi-tenant + RLS
│   │       │   ├── audit/                # Journal immuable
│   │       │   ├── events/               # Bus Outbox
│   │       │   ├── jobs/                 # BullMQ
│   │       │   ├── storage/              # R2/MinIO
│   │       │   ├── notifications/        # Email/SMS/WhatsApp/In-app
│   │       │   ├── ai/                   # Gateway IA + RAG
│   │       │   ├── realtime/             # WebSocket Socket.IO
│   │       │   ├── workflows/            # Moteur de règles
│   │       │   ├── contacts/             # Module CRM Contacts
│   │       │   └── biens/                # Module Catalogue Biens
│   │       ├── infrastructure/
│   │       │   ├── prisma/               # PrismaService (RLS) + PrismaAdminService (BYPASSRLS)
│   │       │   ├── redis/
│   │       │   └── config/
│   │       └── main.ts
│   └── ai/                               # Python FastAPI
│       └── app/
│           ├── main.py
│           └── scoring/                  # Heuristiques Contacts + Biens
├── packages/
│   ├── shared-types/                     # Types + schémas zod partagés web/api
│   │   └── src/
│   │       ├── contacts.ts
│   │       ├── biens.ts
│   │       ├── biens-scoring.ts
│   │       └── insights.ts
│   └── eslint-config/
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml            # Stack dev (Postgres + Redis + MinIO + Mailhog + Gotenberg)
│   │   ├── docker-compose.prod.yml
│   │   ├── postgres/Dockerfile           # Image custom PostGIS + pgvector
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.web
│   │   └── Dockerfile.ai
│   └── backup/                           # Scripts backup PostgreSQL (GPG + R2)
├── docs/
│   ├── adr/                              # Architecture Decision Records
│   ├── scoring/                          # Formules transparentes (Contacts, Biens)
│   ├── user-guides/                      # Guides utilisateur
│   └── revues/                           # Revues DoD par lot
├── .github/workflows/                    # CI/CD
├── civora.md                             # Charte technique & règles non négociables
└── README.md
```

---

## 5. Stack technique

| Couche | Choix |
|---|---|
| Frontend | **Next.js 16** (App Router) + TypeScript + Tailwind 4 + shadcn-style UI + PWA |
| Backend cœur | **NestJS 11** + TypeScript (monolithe modulaire) |
| Service IA prédictive | **Python FastAPI** (`apps/ai/`) |
| Base de données | **PostgreSQL 16** + **PostGIS 3.4** + **pgvector** |
| Cache / Files / Temps réel | **Redis 7** + **BullMQ 5** + Socket.IO 4 |
| Auth | **Passport + JWT** dans NestJS |
| Fichiers | **Cloudflare R2** (prod) / **MinIO** (dev) — S3-compatible |
| PDF | **Gotenberg** (worker isolé) |
| Cartographie | **Mapbox GL JS v3** + Mapbox Geocoding |
| IA générative | Passerelle abstraite (Gemini + OpenAI + provider "fake" pour tests) |
| Email | SMTP via Mailhog (dev) / SMTP prod |
| Infra | Docker + GitHub Actions |

Détails complets et règles non négociables : voir [`civora.md`](./civora.md).

---

## 6. Conventions

### Branches & commits

- Convention : `type(scope): message` — exemples : `feat(contacts): ajoute le scoring IA`, `fix(security): force RLS sur table workflows`.
- Une branche par étape : `lot0/01-bootstrap`, `lot1/module1-contacts-1-data`, etc.
- Pas de merge sans PR. Pas de force-push sur `main`.

### Code

- TypeScript `strict: true` partout. `any` justifié en commentaire ou refusé en review.
- ESLint + Prettier configurés à la racine.
- Pas de `console.log` en code de prod (l'auto-removal Next.js élimine les `log` en build, mais évite-les quand même).
- DTOs validés par `class-validator` + `class-transformer`. Aucun endpoint sans validation.
- Tous les montants en **`BigInt` centimes FCFA**. Jamais de `float` pour de l'argent.
- Tests **Vitest** côté Node, **Playwright** pour l'E2E web.

### Sécurité — règles inviolables

- Toute table métier porte **`agence_id`** + **RLS PostgreSQL avec FORCE**.
- Toute politique RLS a **`USING` ET `WITH CHECK`**.
- `PrismaService` se connecte avec `DATABASE_APP_URL` (rôle `civora_app`, soumis RLS).
- `PrismaAdminService` (rôle `civora_admin`, BYPASSRLS) **uniquement** pour : migrations, outbox dispatcher, pré-auth (login/refresh, acceptation d'invitation).
- Aucun secret en clair dans le code. Variables d'env validées par schéma zod (`apps/api/src/infrastructure/config/env.schema.ts`).
- Toute action sensible tracée dans `audit_log` (immuable via trigger DB).

---

## 7. Tests

```bash
# Tous les tests
pnpm test

# Par app
pnpm --filter @civora/api test
pnpm --filter @civora/web test
pnpm --filter @civora/ai test

# Tests adversariaux RLS (Postgres requis)
pnpm --filter @civora/api test -- rls-isolation
pnpm --filter @civora/api test -- rls-adversarial

# E2E Playwright (Next.js + API démarrés)
pnpm --filter @civora/web exec playwright test
```

---

## 8. Documentation interne

| Fichier | Contenu |
|---|---|
| [`civora.md`](./civora.md) | Charte technique, règles non négociables, conventions |
| [`docs/adr/`](./docs/adr/) | Architecture Decision Records (RLS, BullMQ, IA gateway, scoring, CI/CD, etc.) |
| [`docs/scoring/contacts.md`](./docs/scoring/contacts.md) | Formule publique de scoring Contacts |
| [`docs/scoring/biens.md`](./docs/scoring/biens.md) | Formule publique de scoring Biens |
| [`docs/user-guides/contacts-import.md`](./docs/user-guides/contacts-import.md) | Guide utilisateur — import CSV/Excel |
| [`docs/revues/`](./docs/revues/) | Revues Definition-of-Done par lot |

---

## 9. Dépannage

### `pnpm --filter @civora/api exec prisma migrate deploy` → `Environment variable not found: DATABASE_URL`

Le `.env` n'est pas trouvé par Prisma (qui le cherche à côté de `schema.prisma`). Solution :

```bash
ln -sf ../../.env apps/api/.env
```

### `docker compose up` → `extension "vector" is not available`

L'image PostGIS par défaut n'inclut pas pgvector. CIVORA fournit un Dockerfile custom (`infra/docker/postgres/Dockerfile`). Si l'image n'a pas été buildée :

```bash
docker compose -f infra/docker/docker-compose.yml down -v
docker compose -f infra/docker/docker-compose.yml build postgres
docker compose -f infra/docker/docker-compose.yml up -d
```

### Pull Docker interrompu (`input/output error`)

Souvent : disque Docker plein.

```bash
docker system prune -a -f
# Docker Desktop > Settings > Resources > Disk image size → augmenter à 100 Go
```

### `pnpm install` échoue sur `argon2`

Manque les outils de compilation natifs :

```bash
xcode-select --install   # macOS
sudo apt install build-essential python3   # Linux
```

### Authentification Web ne fonctionne pas

Vérifier les secrets JWT (≥ 32 caractères) dans `.env` :

```bash
grep JWT_ .env
```

---

## Licence

Tous droits réservés — Civora ©.
