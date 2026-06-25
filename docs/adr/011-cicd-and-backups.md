# ADR-011 — CI/CD GitHub Actions & Sauvegardes chiffrées

**Statut**: Accepté  
**Date**: 2026-06-25  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA gère des données financières et des documents sensibles pour des agences immobilières. Le pipeline CI/CD doit garantir qu'aucun code défaillant n'atteint la production, et les sauvegardes PostgreSQL doivent être chiffrées, automatiques, et **testées** — un dump non restauré ne constitue pas une sauvegarde fiable.

---

## Décisions

### 1. GitHub Actions comme orchestrateur CI/CD

Trois workflows distincts à responsabilité unique :

| Workflow | Déclencheur | Responsabilité |
|---|---|---|
| `ci.yml` | Push / PR | Lint, typecheck, tests, build check |
| `build-images.yml` | Push `main` | Build + push Docker → GHCR, déclenche staging |
| `deploy-staging.yml` | Après build | Migrations, déploiement SSH, smoke tests |
| `backup.yml` | Cron quotidien / hebdo | Backup chiffré + restore test |

**Invariant** : pas de déploiement sans tests verts (`needs: [lint-typecheck, test-node, test-python]` bloque le build).

### 2. Docker multistage, user non-root

Chaque Dockerfile utilise 3 stages :
1. **deps** — install avec `pnpm install --frozen-lockfile` + cache mount
2. **builder** — compilation (NestJS / Next.js standalone / uv sync)
3. **runner** — image minimale, `adduser civora`, aucun outil de dev

Aucune image de prod ne contient `devDependencies`, secrets, ou outils de build.

### 3. Registry GHCR

Images taguées `sha-<8chars>` + `latest`. Le tag SHA permet un rollback précis :
```bash
docker pull ghcr.io/owner/civora-api:sha-abc12345
```

### 4. Migrations Prisma séparées du déploiement

Job `migrate` (Prisma `migrate deploy`) s'exécute **avant** le `docker compose up`. Propriétés :
- Idempotent (prisma ne rejoue pas les migrations déjà appliquées).
- Atomic (une migration en échec bloque le déploiement).
- Traçable (chaque migration est un fichier versionné dans git).

**Interdiction** : `prisma migrate dev` et `prisma db push` en production.

### 5. Sauvegardes : dump custom + GPG AES-256 + R2

```
pg_dump --format=custom --compress=9
  → GPG --symmetric --cipher-algo AES256 (passphrase en GitHub Secret)
  → aws s3 cp → R2 (endpoint S3-compatible)
```

Structure R2 :
```
civora-backups/
├── daily/   civora-pg-YYYYMMDDTHHMMSSZ.dump.gpg   (30 jours)
└── monthly/ civora-pg-YYYYMM.dump.gpg              (12 mois)
```

Avantages du format custom (`-Fc`) vs SQL dump :
- Compression intégrée (9× plus petit).
- Restauration sélective par table.
- Restauration parallèle (`pg_restore -j 4`).

### 6. Restore test automatique hebdomadaire

Le script `pg-restore-test.sh` :
1. Télécharge le dernier daily depuis R2.
2. Déchiffre (GPG AES-256).
3. Crée une DB isolée `civora_restore_test`.
4. Restaure avec `pg_restore`.
5. Vérifie `SELECT count(*)` sur 7 tables critiques + extensions.
6. Détruit la DB de test (`DROP DATABASE`).
7. Publie un rapport (`RESTORE_STATUS=SUCCESS|FAILURE`).

En cas d'échec → `exit 1` → l'alerte remonte dans GitHub Actions → notification équipe.

### 7. Rotation des secrets

| Fréquence | Cibles | Procédure |
|---|---|---|
| Tous les 6 mois | `BACKUP_GPG_KEY`, `JWT_*`, `OPENAI_API_KEY`, clés R2 | Décrite dans `infra/backup/README.md` |
| Immédiate | Tout secret suspecté compromis | Rotation + audit des logs d'accès |
| Sur départ d'un employé avec accès | Tout secret qu'il connaissait | Dans les 24h |

Seuls les administrateurs GitHub (rôle `admin` sur le dépôt) peuvent modifier les secrets d'environnement `production`.

---

## Architecture CI/CD complète

```
PR → ci.yml ─────────────────────────────────────────────────────────────────┐
  lint (turbo)                                                                │
  typecheck (turbo)                                                           │
  test-node (vitest)   → build-check (docker build, no push)                 │
  test-python (pytest)                                                         │
                                                                              │
merge main → build-images.yml                                                 │
  build api / web / ai → push ghcr.io (sha + latest)                         │
         │                                                                    │
         └→ deploy-staging.yml                                                │
              migrate (prisma deploy)                                         │
              scp docker-compose.prod.yml                                     │
              ssh: docker compose pull + up -d                                │
              smoke: curl /health ×3                                          │
                                                                              │
cron 02:00 UTC → backup.yml                                                   │
  pg-backup.sh → R2                                                           │
  (lundi) pg-restore-test.sh → isolated DB → validate → drop                 │
```

---

## Secrets GitHub requis

| Secret | Environnement | Description |
|---|---|---|
| `DATABASE_URL` | production, staging | Connection string PostgreSQL |
| `REDIS_URL` | staging | Connection string Redis |
| `JWT_ACCESS_SECRET` | staging | Minimum 32 chars |
| `JWT_REFRESH_SECRET` | staging | Minimum 32 chars |
| `SENTRY_DSN` | staging, production | DSN Sentry (optionnel) |
| `OPENAI_API_KEY` | staging | Clé OpenAI |
| `GEMINI_API_KEY` | staging | Clé Google Gemini |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | staging | SMTP |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | staging, production | Cloudflare R2 |
| `R2_BUCKET` | staging | Bucket objets métier |
| `R2_BACKUP_BUCKET` | production | Bucket sauvegardes |
| `BACKUP_GPG_KEY` | production | Passphrase GPG (min 48 chars) |
| `STAGING_HOST` | production | IP du VPS de staging |
| `STAGING_USER` | production | Utilisateur SSH (non-root) |
| `STAGING_SSH_KEY` | production | Clé privée SSH ED25519 |
| `STAGING_API_URL` | production | URL du health check API staging |
| `STAGING_WEB_URL` | production | URL du health check Web staging |
| `STAGING_AI_URL` | production | URL du health check AI staging |
| `NEXT_PUBLIC_API_URL` | staging | URL publique de l'API |
| `WEB_ORIGINS` | staging | CORS origins autorisées |

---

## Alternatives rejetées

| Alternative | Raison |
|---|---|
| Secrets dans les Dockerfiles (ARG/ENV) | Lisibles dans `docker history`, interdit |
| pg_dump SQL plain | Non compressé, restauration non sélective, 3× plus lent |
| Chiffrement AES CBC manuel (openssl) | GPG est un standard éprouvé, gère les métadonnées |
| Backup sur le même serveur que la DB | Pas off-site — perte serveur = perte données |
| Restore test « manuel quand on y pense » | Non fiable — automatisé chaque lundi uniquement |
| Vault HashiCorp | Overhead infra excessive pour le Lot 0 |

---

## Critères d'acceptation

- [x] `ci.yml` bloque le merge si lint / typecheck / test / build échouent
- [x] `build-images.yml` tague les images avec SHA court + `latest`
- [x] `deploy-staging.yml` joue les migrations avant le `up`
- [x] `deploy-staging.yml` exécute les smoke tests après déploiement
- [x] `pg-backup.sh` : dump → chiffrement GPG → R2, prune configurable
- [x] `pg-restore-test.sh` : télécharge, déchiffre, restaure, valide, drop
- [x] Cron backup quotidien 02:00 UTC
- [x] Cron restore-test lundi 03:00 UTC
- [x] Aucun secret en clair dans workflows ou Dockerfiles
- [x] Dockerfiles : user non-root, multistage, cache pnpm/uv
- [x] `infra/backup/README.md` : procédure restauration manuelle + rotation secrets
