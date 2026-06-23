# Civora

SaaS ERP immobilier multi-tenant pour les agences ouest-africaines.

## Prérequis

- **Node.js** ≥ 20 (voir `.nvmrc`)
- **pnpm** ≥ 9 — `npm install -g pnpm@9`
- **Python** ≥ 3.11
- **uv** (gestionnaire Python) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Docker** (pour la stack locale : PostgreSQL, Redis, etc.)

## Installation

```bash
pnpm install
```

## Commandes principales

```bash
# Démarrer les 3 services en développement (Next.js :3000, NestJS :3001, FastAPI :8000)
pnpm dev

# Vérifier la qualité du code
pnpm lint
pnpm typecheck
pnpm test

# Formater le code
pnpm format
```

## Services en développement

| Service | URL | Description |
|---------|-----|-------------|
| Frontend (Next.js) | http://localhost:3000 | Interface utilisateur |
| API (NestJS) | http://localhost:3001 | Backend principal |
| IA (FastAPI) | http://localhost:8000 | Service IA prédictif |

## Structure du monorepo

```
civora/
├── apps/
│   ├── web/          # Next.js 16+ App Router
│   ├── api/          # NestJS 11+
│   └── ai/           # Python FastAPI
├── packages/
│   ├── shared-types/ # Types TypeScript partagés
│   └── eslint-config/ # Config ESLint commune
├── infra/            # Docker + CI/CD
└── docs/             # Architecture + plan de développement
```

## Stack technique

Voir `civora.md` (CLAUDE.md) pour la stack complète et les règles non négociables.
