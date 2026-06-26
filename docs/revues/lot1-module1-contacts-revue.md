# Revue DoD — Lot 1 · Module 1 (Contacts)

**Date** : 2026-06-26
**Réviseur** : Audit indépendant (analyse statique post-étape 5)
**Branches auditées** :
- `lot1/module1-contacts-1-data` ([fb75313](../../))
- `lot1/module1-contacts-2-backend` ([26f566a](../../))
- `lot1/module1-contacts-3-ai` ([515fdca](../../))
- `lot1/module1-contacts-4-frontend` ([b2f425a](../../))
- `lot1/module1-contacts-5-import-export` ([1b0198c](../../))

---

## Statut global : 🟡 GO avec réserves

Le module Contacts est **fonctionnellement complet** et **sécurisé sur le plan
multi-tenant**. Les 5 étapes sont livrées, l'architecture suit le cahier des
charges (event-driven, validation stricte, FORCE RLS, audit, transparence IA).

Aucune faille de sécurité critique n'est détectée. Les réserves portent sur :
- **Crons de purge non implémentés** (R2 va se remplir sans nettoyage).
- **i18n côté frontend non câblé** (les clés `t()` ne sont pas consommées).
- **Catalogue d'événements `docs/events.md` vide** côté Contacts.
- **3 PII en clair dans les logs `AuthService`** (Lot 0 — pré-existant mais non corrigé).
- **Couverture et performances non mesurées** automatiquement.

→ **Recommandation : on peut attaquer le module Biens**, en parallèle d'une
mini-étape « qualité Lot 1 » qui corrigera les KO secondaires avant la
mise en production.

---

## 1. Modèle de données

| Critère | Statut | Référence |
|---|---|---|
| 4 modèles avec `agence_id` partout pertinent | ✅ OK | [`schema.prisma`](../../apps/api/prisma/schema.prisma) |
| RLS activée sur les 4 tables | ✅ OK | [`20260626000001_contacts/migration.sql`](../../apps/api/prisma/migrations/20260626000001_contacts/migration.sql) — ENABLE + FORCE + 4 politiques USING/WITH CHECK |
| Bloc `DO $$` vérifie FORCE RLS post-migration | ✅ OK | mêmes migrations |
| Indexes GIN sur `roles[]`, `tags[]`, `segments_ia[]` | ✅ OK | `contacts_roles_gin_idx`, `contacts_tags_gin_idx`, `contacts_segments_ia_gin_idx` |
| `pg_trgm` activé + 3 index trigram (nom/prenom/email) | ✅ OK | [`20260626000002_contacts_pgtrgm/migration.sql`](../../apps/api/prisma/migrations/20260626000002_contacts_pgtrgm/migration.sql) |
| Seed dev (25 contacts variés, 6 rôles, 10 villes) | ✅ OK | [`contacts.seed.ts`](../../apps/api/prisma/seeds/contacts.seed.ts) |
| Pas d'UNIQUE DB sur email/téléphone, doc dans migration | ✅ OK | commentaire ligne 14-17 migration 001 |
| `archived_at` (soft delete) + index partiel | ✅ OK | migration 002 + `contacts_agence_archived_idx` |
| Tables `import_jobs` / `export_jobs` réutilisables (champ `module`) | ✅ OK | [`20260626000003_import_export_jobs/migration.sql`](../../apps/api/prisma/migrations/20260626000003_import_export_jobs/migration.sql) |

---

## 2. Backend API

### Endpoints livrés (21 au total)

| Domaine | Endpoints | Permission |
|---|---|---|
| Contacts CRUD | `GET /contacts`, `GET /contacts/:id`, `POST /contacts`, `PATCH /contacts/:id`, `DELETE /contacts/:id` | `contacts:read` / `:write` / `:delete` |
| Dédoublonnage | `POST /contacts/check-duplicates`, `POST /contacts/merge` | `:read` / `:write` |
| Interactions | `POST /contacts/:id/interactions`, `GET /contacts/:id/interactions` | `:write` / `:read` |
| Segments | `GET /segments`, `POST /segments`, `GET /segments/:id/membres`, `DELETE /segments/:id` | `:read` / `:write` / `:delete` |
| Scoring | `GET /contacts/:id/score-explanation` | `:read` |
| Ask KURA | `POST /contacts/ask` | `:read` |
| Import | `POST /contacts/import/{upload,preview,execute}`, `GET /contacts/import/:id`, `GET /contacts/import/:id/errors` | `:write` / `:read` |
| Export | `POST /contacts/export`, `GET /contacts/export/:id` | `:export` / `:read` |

| Critère | Statut | Référence |
|---|---|---|
| Tous les endpoints protégés par `@RequirePermissions` | ✅ OK | grep confirme — 21/21 |
| Validation `class-validator` stricte (rejet 400) | ✅ OK | DTOs dans `dto/` + `import-export/dto.ts` |
| Téléphone normalisé E.164 systématiquement | ✅ OK | [`phone.normalizer.ts`](../../apps/api/src/_core/contacts/normalizers/phone.normalizer.ts) — utilisé dans `service`, `dedup`, `import.worker` |
| Pagination curseur (pas d'offset) | ✅ OK | [`contacts.repository.ts:96-100`](../../apps/api/src/_core/contacts/contacts.repository.ts) `take`+`cursor`+`skip:1` |
| Anti-doublon : 409 sur création + `check-duplicates` + merge | ✅ OK | [`contacts.service.ts:122`](../../apps/api/src/_core/contacts/contacts.service.ts) `ConflictException` |
| Soft-delete `archived_at` + `include_archived` opt-in | ✅ OK | repository ligne 236 `if (!filters.include_archived) where.archived_at = null` |
| Tous événements de domaine émis | ✅ OK | `created`, `updated`, `archived`, `merged`, `score_changed`, `interaction_recorded` |
| `@Audited` sur tous les writes | ✅ OK | create/update/archive/merge/interaction/segments + import.execute/export.start |

---

## 3. Sécurité 🚨

| Critère | Statut | Référence |
|---|---|---|
| 6 patterns RLS sur Contact testés | ✅ OK | [`contacts-data.spec.ts`](../../apps/api/src/_core/contacts/tests/contacts-data.spec.ts) — findMany, findUnique direct, UPDATE/INSERT/DELETE cross-tenant, RESET app.agence_id, BYPASSRLS admin |
| Ask KURA filtre par `agence_id` | ✅ OK | [`ask-kura.service.ts:79`](../../apps/api/src/_core/contacts/ask-kura/ask-kura.service.ts) `where: { id: { in: contactIds }, agence_id, archived_at: null }` |
| Retrieval pgvector → RLS sur `ai_embeddings` | ✅ OK | passe par `RetrievalService` (Lot 0 corrigé : `withTenant` + filtre `agence_id = $2`) |
| Import : `withTenant` + FORCE RLS empêche évasion | ✅ OK | [`import-rls.spec.ts`](../../apps/api/src/_core/contacts/import-export/tests/import-rls.spec.ts) — 3 cas couverts |
| Embeddings non-PII (pas d'email/téléphone) | ✅ OK | [`contacts-indexer.service.ts:20-89`](../../apps/api/src/_core/contacts/indexing/contacts-indexer.service.ts) commentaire explicite + `buildSummary` exclut canaux |
| Aucune PII en clair dans les logs du module Contacts | ✅ OK | grep `logger\.(log\|info\|debug).*\${.*email\|phone}` retourne 0 |
| 🔴 PII en clair dans `AuthService` (Lot 0, pré-existant) | 🔴 KO | [`auth.service.ts:71`](../../apps/api/src/_core/auth/auth.service.ts) `logger.warn('Login failed for email: ${dto.email}')` + ligne 99 |
| Permissions UI : `canExport`/`canWrite` vérifiées sur la page | ✅ OK | [`page.tsx:31-34`](../../apps/web/src/app/(app)/contacts/page.tsx) |

> **Note** : la faille `AuthService` PII n'est pas dans le module Contacts mais
> elle apparaît dans la checklist sécurité globale. Elle date du Lot 0 et a été
> survolée par les revues précédentes — à inscrire dans la dette technique.

---

## 4. IA & scoring

| Critère | Statut | Référence |
|---|---|---|
| Heuristique TS | ✅ OK | [`scoring-formula.ts`](../../apps/api/src/_core/contacts/scoring/scoring-formula.ts) |
| Heuristique Python | ✅ OK | [`apps/ai/app/scoring/contacts_scoring.py`](../../apps/ai/app/scoring/contacts_scoring.py) |
| Test de parité TS ↔ Python | ⚠️ Écrit mais skip si `AI_SERVICE_URL` absent | [`parity.spec.ts`](../../apps/api/src/_core/contacts/scoring/tests/parity.spec.ts) |
| `confidence: low` tant que < 5 interactions | ✅ OK | spec `scoring-formula.spec.ts` |
| `GET /contacts/:id/score-explanation` retourne les facteurs | ✅ OK | [`scoring.controller.ts`](../../apps/api/src/_core/contacts/scoring/scoring.controller.ts) |
| Segments IA auto-mis à jour après scoring | ✅ OK | [`segmentation.service.ts`](../../apps/api/src/_core/contacts/scoring/segmentation.service.ts) + worker |
| Anti-bruit : event si `delta ≥ 5` OU catégorie change | ✅ OK | [`scoring.worker.ts:108`](../../apps/api/src/_core/contacts/scoring/scoring.worker.ts) + [`scoring-anti-noise.spec.ts`](../../apps/api/src/_core/contacts/scoring/tests/scoring-anti-noise.spec.ts) |
| Budget IA enforced (via `AiGatewayService.chat`) | ✅ OK (indirect) | `BudgetService` du Lot 0 étape 10 — invoqué par `aiGateway.chat()` |
| Document `docs/scoring/contacts.md` | ✅ OK | 164 lignes, à jour |
| Template `contacts.ask_kura` versionné, `anonymize: true` | ✅ OK | [`contacts-ask-kura.template.ts`](../../apps/api/src/_core/ai/prompt-templates/catalog/contacts-ask-kura.template.ts) `sensitive: false, anonymize: true` |
| ADR `012-contacts-scoring-cold-start.md` | ✅ OK | [`docs/adr/012-contacts-scoring-cold-start.md`](../adr/012-contacts-scoring-cold-start.md) |

---

## 5. Frontend

| Critère | Statut | Référence |
|---|---|---|
| Vue liste : filtres + sauvegarde segment | ✅ OK | [`contacts-filters.tsx`](../../apps/web/src/app/(app)/contacts/_components/contacts-filters.tsx) |
| Fiche 360° : 4 onglets opérationnels | ✅ OK | `tab-profile`, `tab-relations`, `tab-interactions`, `tab-scoring` |
| Drawer "Comprendre ce score" | ✅ OK | [`[id]/page.tsx`](../../apps/web/src/app/(app)/contacts/[id]/page.tsx) — `setScoreDrawerOpen` + `Sheet` |
| Formulaire création/édition + RHF + zodResolver | ✅ OK | [`contact-form.tsx`](../../apps/web/src/app/(app)/contacts/_components/contact-form.tsx) |
| Dialogue doublons sur création | ✅ OK | [`dedup-dialog.tsx`](../../apps/web/src/app/(app)/contacts/_components/dedup-dialog.tsx) |
| Ask KURA accessible | ✅ OK | [`ask-kura-contacts.tsx`](../../apps/web/src/app/(app)/contacts/_components/ask-kura-contacts.tsx) |
| Real-time score_changed sans rechargement | ✅ OK | `useRealtime('contact.score_changed', ...)` dans [`page.tsx`](../../apps/web/src/app/(app)/contacts/page.tsx) |
| 🟡 Mobile / PWA : table → carte simplifiée < 768px | 🟡 KO partiel | `contacts-table.tsx` n'a aucune classe `md:hidden`/`md:flex` — seul `overflow-x-auto` est posé. La table reste scrollable horizontalement mais aucune **vue carte mobile** n'a été codée. |
| Accessibilité (`aria-label`, labels, contraste) | ✅ OK | `ScoreBadge` a `role="status"` + `aria-label`, inputs ont des `Label` |
| 🟡 i18n via `next-intl` (libellés via `t()`) | 🟡 KO | Les clés `contacts.*` sont définies dans `fr.json` et `en.json` mais **aucun composant ne consomme `t('contacts.…')`**. Tous les libellés sont en français codé en dur. Fonctionnel sur Lot 1 (FR-only) mais la bascule EN ne marchera pas. |
| Permissions UI respectées (Marketing ≠ delete) | ✅ OK | `canDelete = perms.includes('contacts:delete')` — bouton conditionnel dans `[id]/page.tsx` |

---

## 6. Import / Export

| Critère | Statut | Référence |
|---|---|---|
| Wizard 5 étapes (Upload → Mapping → Preview → Execute → Report) | ✅ OK | [`import-wizard/`](../../apps/web/src/app/(app)/contacts/_components/import-wizard/) |
| Mapping auto suggéré (dictionnaire synonymes FR/EN + fallback heuristique) | ✅ OK | [`column-mapping.ts`](../../apps/api/src/_core/contacts/import-export/column-mapping.ts) + 11 tests |
| Anti-doublon 3 modes (skip/update/error) | ✅ OK | [`import.worker.ts:190-211`](../../apps/api/src/_core/contacts/import-export/workers/import.worker.ts) |
| Progression temps réel via WebSocket | ✅ OK | `realtime.emitToUser(userId, 'contacts.import.progress', {...})` |
| Rapport d'erreurs téléchargeable (CSV signé R2) | ✅ OK | `errors_file_key` + `GET /contacts/import/:id/errors` |
| Export sync (< 1000) ou async (≥ 1000) | ✅ OK | [`contacts-export.service.ts:73-87`](../../apps/api/src/_core/contacts/import-export/contacts-export.service.ts) |
| Export filtré respecte les filtres de la liste | ✅ OK | `buildFilters` partagé |
| Limite 50 Mo respectée | ✅ OK | [`contacts-import.service.ts:33`](../../apps/api/src/_core/contacts/import-export/contacts-import.service.ts) `if (sizeBytes > MAX_FILE_BYTES) throw` |
| 🔴 Fichiers d'export auto-purgés après 24h | 🔴 KO | Le champ `expires_at` existe et est **vérifié à la lecture** (refuse 403), mais **aucun cron** ne supprime les rows périmées ni les fichiers R2. À l'échelle, le bucket se remplit sans limite. |
| 🔴 Fichiers source d'import purgés après 7j | 🔴 KO | Aucune trace de cron de purge. Les fichiers CSV source restent indéfiniment dans `tenants/<agence>/temp/`. |

---

## 7. Tests

### 13 spec files backend

| Fichier | Couverture |
|---|---|
| `tests/contacts-data.spec.ts` | RLS isolation (6 patterns), GIN index, cascade, seed |
| `tests/contacts.service.spec.ts` | Création OK, doublon 409, update email, archive idempotent, merge complet, audit before/after |
| `tests/dedup.spec.ts` | Hard conflict, fuzzy nom, archived inclus |
| `tests/phone.normalizer.spec.ts` | E.164 normalisation |
| `tests/contacts.e2e.spec.ts` | E2E HTTP parcours complet + RLS 2 agences + permissions |
| `import-export/tests/column-mapping.spec.ts` | 11 cas (FR/EN, fallback, normalisation) |
| `import-export/tests/import-rls.spec.ts` | Isolation tenant dans le worker |
| `import-export/tests/import-validation.spec.ts` | 7 cas de validation |
| `scoring/tests/scoring-formula.spec.ts` | 10 cas heuristique |
| `scoring/tests/scoring-anti-noise.spec.ts` | Anti-bruit ≥ 5 / changement catégorie |
| `scoring/tests/segmentation.spec.ts` | Règles auto VIP/Investisseur/Lead chaud |
| `scoring/tests/parity.spec.ts` | TS ↔ Python (skip si pas de service) |
| `ask-kura/tests/ask-kura.spec.ts` | Tenant isolation + budget |

### Frontend tests
- `score-badge.spec.tsx` — 8 cas seuils
- `contacts-api.spec.tsx` — hooks TanStack, invalidation cache

### E2E Playwright
- `apps/web/e2e/contacts.spec.ts` (7 cas de base)
- `apps/web/e2e/contacts-full-journey.spec.ts` (17 étapes, dont login agence B sans fuite)

| Critère | Statut |
|---|---|
| Couverture backend `contacts/` > 80 % | ⚠️ Non mesurée (pas de rapport coverage généré) |
| E2E `contacts-full-journey.spec.ts` passe | ⚠️ Squelette écrit, **pas exécuté** (config Playwright pas committée) |
| Tests RLS Contact passent | ⚠️ Specs écrites, **pas exécutés dans le contexte de l'audit** (sandbox sans DB) |
| Test parité TS/Python | ⚠️ SKIP si `AI_SERVICE_URL` absent — donc jamais exécuté en CI à ce stade |

---

## 8. Performance

| Critère | Statut |
|---|---|
| Liste 1 000 contacts < 1 s | ⚠️ Non mesurée |
| Recherche pg_trgm < 200 ms sur 10 k contacts | ⚠️ Non mesurée |
| Pas de N+1 (Prisma `include` raisonné) | ✅ OK (inspection : `getFiche360` utilise `take: 50` sur interactions, `getMembres` n'embarque que des champs ciblés) |

→ **Demande à mesurer** dans un environnement avec dataset volumineux avant
mise en production. Les index GIN et trigram sont en place ; reste à valider
les plans d'exécution réels via `EXPLAIN ANALYZE`.

---

## 9. Documentation

| Critère | Statut | Référence |
|---|---|---|
| ADR `012-contacts-scoring-cold-start.md` | ✅ OK | [`docs/adr/012-…`](../adr/012-contacts-scoring-cold-start.md) |
| `docs/user-guides/contacts-import.md` | ✅ OK | 164 lignes, captures à produire |
| 🔴 `docs/events.md` enrichi avec `contact.*` | 🔴 KO | Le fichier existe mais **aucune mention** de `contact.created`, `contact.merged`, `contact.score_changed`, etc. |
| `docs/scoring/contacts.md` | ✅ OK | Document de transparence public |

---

## 10. Récapitulatif des KO

### 🔴 KO BLOQUANTS pour la mise en production (mais pas pour démarrer Biens)

| ID | Problème | Criticité | Effort fix | Localisation |
|---|---|---|---|---|
| KO-1 | Cron de purge **exports R2 + rows `export_jobs` après 24h** absent | P1 | ~30 min | Nouveau worker `scheduled/purge-exports.worker.ts` |
| KO-2 | Cron de purge **fichiers source d'import après 7j** absent | P1 | ~30 min | Idem, étendre à `import_jobs.fichier_key` |
| KO-3 | `docs/events.md` ne liste pas les événements `contact.*` | P2 | ~15 min | Documentation pure |
| KO-4 | `AuthService` log `email` en clair (Lot 0, pré-existant) | P1 | 5 min | [`auth.service.ts:71,99`](../../apps/api/src/_core/auth/auth.service.ts) — masquer ou hasher |

### 🟡 KO secondaires (à corriger en sprint qualité Lot 1)

| ID | Problème | Criticité | Effort fix |
|---|---|---|---|
| KO-5 | i18n : clés `contacts.*` définies dans `fr.json`/`en.json` mais **aucun composant n'appelle `t('contacts.…')`** | P2 | ~2 h — refactor systématique des composants |
| KO-6 | Vue mobile < 768px : pas de **vue carte simplifiée** ; la table reste scrollable horizontalement | P2 | ~1-2 h — ajouter un breakpoint qui swap table/cards |

---

## 11. À VÉRIFIER (non tranché par analyse statique)

| AV | Vérification | Comment vérifier |
|---|---|---|
| AV-1 | Couverture vitest > 80 % sur `contacts/` | `pnpm --filter @civora/api test -- --coverage` puis lire le rapport |
| AV-2 | Liste 1 000 contacts < 1 s en local | Charger un seed 1 000 lignes + DevTools Network |
| AV-3 | `pg_trgm` sur 10 k contacts < 200 ms | `EXPLAIN ANALYZE` avec dataset gonflé |
| AV-4 | Import 1 000 contacts < 60 s | Bench manuel avec une fixture 1 000 lignes |
| AV-5 | Test de parité TS/Python passe vraiment | Démarrer `apps/ai`, exporter `AI_SERVICE_URL=http://localhost:8000`, relancer `parity.spec.ts` |
| AV-6 | E2E Playwright vert | Installer `@playwright/test`, ajouter `playwright.config.ts`, exécuter le full-journey |
| AV-7 | Budget IA bloque Ask KURA à quota atteint | Forcer `ai_budgets.used_cents = monthly_limit_cents` + appel `/contacts/ask` → vérifier 402/403 |
| AV-8 | Role "Marketing" du seed permet bien `contacts:read` mais pas `delete` | Tester avec un user Marketing en DB (le seed actuel ne lui donne ni l'un ni l'autre — vérification requise) |
| AV-9 | Cascade Postgres delete Contact → Interactions + SegmentMembres | Couvert dans `contacts-data.spec.ts` mais à confirmer avec dataset volumineux |

---

## 12. Recommandation

**🟡 GO avec réserves — on peut démarrer le module Biens.**

Le module Contacts est livré conforme aux étapes 1 → 5. La sécurité multi-tenant
est solide (FORCE RLS, tests adversariaux, audit, anonymisation Ask KURA). Les
KO identifiés sont :
- **2 cron de purge** (KO-1, KO-2) : pas bloquant en dev/staging, mais à fixer
  avant prod pour ne pas saturer R2.
- **1 log PII Lot 0** (KO-4) : pré-existant, doit être inscrit en dette
  technique critique.
- **i18n et vue mobile** (KO-5, KO-6) : finition qualité.

Plan d'action recommandé :

1. **Sprint 1 Biens** (peut démarrer immédiatement) — pas d'attente.
2. **Mini-étape « qualité Lot 1 »** (1 jour) en parallèle :
   - Implémenter `purge-exports.worker.ts` + `purge-imports.worker.ts` (KO-1, KO-2)
   - Patcher `AuthService` (KO-4) : log `[email_redacted]` ou hash SHA-256
   - Compléter `docs/events.md` (KO-3)
3. **Avant déploiement R1 staging** :
   - Lancer la suite complète vitest + Playwright (AV-1, AV-6)
   - Mesurer perf (AV-2, AV-3, AV-4)
   - Configurer `AI_SERVICE_URL` en CI pour activer le test de parité (AV-5)

---

*Audit produit sans modification du code. Toute correction sera tracée dans une PR dédiée.*
