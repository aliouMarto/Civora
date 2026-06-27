# Contribuer à CIVORA

Merci d'avoir rejoint le projet. Cette page liste les conventions et le workflow attendu pour toute contribution.

---

## 1. Setup initial

Suivre [`README.md`](./README.md) (section "Installation rapide"). Avant la première PR, vérifier que :

```bash
pnpm install
pnpm lint            # 0 erreur
pnpm typecheck       # 0 erreur
pnpm test            # tous verts
docker compose -f infra/docker/docker-compose.yml up -d
pnpm --filter @civora/api exec prisma migrate deploy
pnpm dev             # API + Web démarrent sans erreur
```

---

## 2. Workflow de contribution

### Branches

- **`main`** : branche principale, protégée. Pas de push direct.
- Chaque feature/fix sur sa propre branche : `feat/<scope>-<verbe>` ou `fix/<scope>-<problème>`.
- Pour suivre l'organisation existante en lots et étapes : `lot<N>/module<N>-<nom>-<étape>-<id>`.

### Commits

Convention `type(scope): message court` :

| Type | Pour |
|---|---|
| `feat` | Nouvelle fonctionnalité utilisateur |
| `fix` | Correction de bug |
| `refactor` | Refactoring sans changement de comportement |
| `docs` | Documentation uniquement |
| `test` | Ajout/correction de tests |
| `chore` | Outillage, deps, config |
| `perf` | Amélioration de performance |
| `security` | Correction de sécurité |

Exemples :

- ✅ `feat(contacts): ajoute le scoring IA et la segmentation auto`
- ✅ `fix(security): force RLS sur les tables workflows`
- ❌ `update stuff`

### Pull Requests

1. PR ciblée : **un sujet par PR**. Si tu mélanges plusieurs étapes, le reviewer demandera de splitter.
2. Description : **quoi**, **pourquoi**, **comment tester**. Le « quoi » se voit dans le diff ; concentre-toi sur le « pourquoi ».
3. Captures d'écran pour les changements UI.
4. Cocher la checklist (cf. template `.github/pull_request_template.md`).
5. Au moins 1 review approuvée avant merge.
6. Squash-merge par défaut sur `main`.

---

## 3. Règles non négociables

Voir [`civora.md`](./civora.md) section 5. Résumé :

- **Multi-tenant** : toute table métier porte `agence_id` + RLS avec `FORCE` + politiques `USING` ET `WITH CHECK`.
- **PrismaService** ne se connecte JAMAIS avec `DATABASE_URL` (rôle propriétaire). Utiliser `DATABASE_APP_URL`. Le rôle `civora_admin` (BYPASSRLS) est réservé à 3 cas : migrations, outbox dispatcher, pré-auth.
- **Money** : toujours `BigInt` en centimes FCFA. Jamais `float`.
- **Idempotence** : webhooks et handlers d'événements doivent supporter le rejeu sans effet de bord.
- **Audit** : toute action sensible va dans `audit_log` via `@Audited()` ou `AuditService.log()`.
- **Async** : tout ce qui dure > 100 ms ou dépend d'un service externe passe par BullMQ.
- **Validation** : `class-validator` + `class-transformer` sur tous les DTOs. Schémas zod partagés dans `packages/shared-types`.

Un PR qui viole une de ces règles sera refusé sans review supplémentaire.

---

## 4. Tests

- Couverture cible : > 80 % côté backend, > 60 % côté frontend.
- Pour toute table soumise à la RLS : un test adversarial (les 6 patterns standards) est obligatoire — exemple dans `apps/api/src/_core/tenancy/tests/rls-isolation.spec.ts`.
- Pour toute mutation API : un test d'intégration `service.spec.ts` au minimum.
- Pour les flows critiques côté frontend : un E2E Playwright dans `apps/web/e2e/`.

Lancer rapidement :

```bash
pnpm test                                      # tout
pnpm --filter @civora/api test -- contacts     # un module
pnpm --filter @civora/web exec playwright test # E2E
```

---

## 5. Quand modifier les conventions

Toute modification de :

- La stack technique (section 2 de `civora.md`),
- Les règles non négociables (section 5),
- Le schéma Prisma de manière structurelle (renommage, suppression de colonne, migration destructive),

…doit être tracée par une **ADR** (Architecture Decision Record) dans `docs/adr/NNN-<sujet>.md`. Modèle :

```markdown
# ADR-NNN — Titre concis

**Statut** : Proposé / Accepté / Remplacé par ADR-MMM
**Date** : YYYY-MM-DD

## Contexte
Pourquoi cette décision est nécessaire.

## Décision
Ce qui a été choisi.

## Alternatives écartées
Ce qui a été considéré + raison du rejet.

## Conséquences
Bénéfices, risques, dette technique introduite.
```

---

## 6. Sécurité — signaler une vulnérabilité

⚠️ **Ne pas ouvrir d'issue publique** pour une vulnérabilité de sécurité. Contacter directement le mainteneur par email.

---

## 7. Aide

- Documentation interne : `docs/`
- Commandes utiles : section 8 de `civora.md`
- Dépannage : section 9 du README

Bonne contribution.
