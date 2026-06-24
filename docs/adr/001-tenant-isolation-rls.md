# ADR-001 : Isolation multi-tenant par PostgreSQL Row-Level Security

**Date :** 2026-06-24  
**Statut :** Accepté  
**Décideurs :** Équipe Civora

---

## Contexte

Civora est un SaaS multi-tenant : plusieurs agences immobilières indépendantes coexistent dans la même base de données. Une fuite de données entre agences serait catastrophique (données clients, loyers, contrats). Nous avons besoin d'une isolation qui soit :

- **Automatique** : pas de risque d'oubli dans chaque requête applicative.
- **Profonde** : même un bug dans l'ORM ou un SQL brut mal écrit ne doit pas contourner l'isolation.
- **Auditée** : testable de façon adversariale (test qui prouve que la fuite est impossible).

---

## Décision

Nous utilisons **PostgreSQL Row-Level Security (RLS)** comme couche d'isolation principale, avec les éléments suivants :

### 1. Architecture des rôles PostgreSQL

| Rôle | Usage | BYPASSRLS |
|------|-------|-----------|
| `civora_app` | API applicative (toutes les requêtes utilisateur) | Non — soumis à la RLS |
| `civora_admin` | Migrations, jobs système, super-admin | Oui — contourne la RLS |

L'API se connecte **uniquement** avec `civora_app`. Le credential `civora_admin` n'est jamais exposé à l'API.

### 2. Politiques RLS

Toute table métier multi-tenant doit :
1. Porter une colonne `agence_id UUID NOT NULL`.
2. Avoir `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.
3. Avoir les 4 politiques : `SELECT`, `INSERT`, `UPDATE`, `DELETE`, toutes conditionnées sur `agence_id::text = current_setting('app.agence_id', true)`.

L'argument `true` (missing_ok) est critique : si `app.agence_id` n'est pas positionné, `current_setting` retourne `NULL`, ce qui ferme l'accès sur toutes les lignes.

### 3. Injection du contexte tenant

Le `PrismaService` enregistre un middleware Prisma qui exécute automatiquement `SET LOCAL app.agence_id = '<uuid>'` avant chaque opération. La valeur est lue depuis `TenantContextService` (AsyncLocalStorage).

`SET LOCAL` (et non `SET`) garantit que la valeur est scoped à la transaction courante et ne "fuite" pas entre requêtes sur une connexion poolée.

### 4. Propagation du contexte (AsyncLocalStorage)

`TenantContextService` utilise `AsyncLocalStorage` (Node.js natif, sans dépendance externe) pour propager le tenant à travers la chaîne async sans passer l'ID en paramètre de chaque fonction.

Le `TenantMiddleware` positionne le contexte en entrée de chaque requête HTTP à partir du JWT (étape 05). À l'étape 04, un header temporaire `x-agence-id` est utilisé — **ce header doit être supprimé avant la mise en production**.

---

## Alternatives considérées

| Alternative | Rejetée parce que |
|-------------|------------------|
| Isolation par base de données séparée | Trop coûteux opérationnellement (N bases × N migrations) |
| Isolation par schéma PostgreSQL | Complexité des migrations, pas natif Prisma |
| Isolation purement applicative (`WHERE agence_id = ?`) | Un oubli de clause WHERE = fuite totale — non défensif |
| Middleware Prisma seul sans RLS | Contournable par `$queryRaw` non filtré |

---

## Conséquences

### Positives
- Isolation garantie au niveau moteur de base de données, indépendante du code applicatif.
- Un bug ORM ne peut pas causer de fuite inter-tenant.
- Testable de façon adversariale (voir `rls-isolation.spec.ts`).

### Négatives / Contraintes
- Toute nouvelle table métier **doit** suivre le process RLS (migration + politiques). Un checklist est maintenu dans `CLAUDE.md`.
- Les opérations admin (migrations Prisma) doivent utiliser un `DATABASE_URL` avec `civora_admin`, pas `civora_app`.
- `$executeRaw` dans le code applicatif doit toujours s'assurer que `app.agence_id` est positionné (garanti par le middleware Prisma).

---

## Tests d'acceptation

Voir `apps/api/src/_core/tenancy/tests/rls-isolation.spec.ts` pour les 6 tests adversariaux qui **doivent passer** à tout moment :

1. User A ne voit que ses entités
2. User A ne peut pas lire une entité de B par ID
3. User A ne peut pas update une entité de B
4. User A ne peut pas insérer dans le tenant de B
5. Sans `app.agence_id`, aucune ligne n'est visible
6. `civora_admin` voit tout (BYPASSRLS)
