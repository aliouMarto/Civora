# ADR-002 — Authentification JWT + RBAC basé sur les permissions

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA est un SaaS multi-tenant pour agences immobilières. Chaque agence a ses propres utilisateurs avec des rôles différents (Admin, Manager, Agent, Comptable, etc.). Il faut :

1. Authentifier les utilisateurs sans état côté serveur (scalable horizontalement).
2. Contrôler l'accès aux ressources par permission granulaire.
3. Garantir qu'un token compromis ou rejoué invalide la session entière.
4. Propager automatiquement le contexte tenant (agence_id) sans l'exposer dans les URL.

---

## Décisions

### 1. JWT Access Token (15 min) + Opaque Refresh Token (14 jours)

**Pourquoi pas JWT longue durée ?**  
Un JWT signé ne peut pas être révoqué avant expiration. En cas de compromission, l'attaquant garde l'accès jusqu'à l'expiration. Avec 15 min, la fenêtre d'attaque est minimale.

**Pourquoi un refresh token opaque (UUID → SHA-256) ?**  
Les JWTs refresh tokens contiennent des données et ne peuvent pas être révoqués sans liste noire. Un UUID opaque stocké haché en base permet la révocation immédiate et la détection de rejeu.

### 2. Argon2id pour les mots de passe

Paramètres OWASP 2023 :
- `memoryCost`: 65 536 KiB (64 MiB)
- `timeCost`: 3 itérations
- `parallelism`: 4 threads

bcrypt rejeté : limite à 72 caractères, SHA-1 sous-jacent.  
MD5/SHA sans sel rejeté : trivial à craquer par tables arc-en-ciel.

### 3. Rotation systématique + détection de rejeu par famille

Chaque refresh token appartient à une `famille` (UUID). À chaque rotation :
- L'ancien token est révoqué (`revoque_at = now()`).
- Un nouveau token est émis dans la **même famille**.

Si un token déjà révoqué est utilisé → **toute la famille est révoquée** immédiatement. Cela détecte le vol de token (un attaquant rejoue un token déjà utilisé par la victime) et déconnecte toutes les sessions actives de l'utilisateur, forçant une ré-authentification.

### 4. RBAC basé sur les permissions (pas les rôles)

Les endpoints déclarent des permissions concrètes via `@RequirePermissions('biens:read')`, pas des rôles. Les rôles sont des groupes de permissions en base de données, flexibles sans déploiement.

```
Permission = `${Module}:${Action}` | '*:*'
```

`*:*` est réservé au rôle Admin qui a accès total. Pas de wildcard partiel (`biens:*`) pour minimiser la surface d'attaque.

### 5. agence_id extrait du JWT, pas d'en-tête HTTP

Le `TenantMiddleware` extrait l'`agence_id` du payload JWT (vérification de signature), pas d'un header `x-agence-id` contrôlable par le client. Cela empêche un utilisateur de s'auto-assigner un tenant arbitraire.

---

## Flux d'authentification

```
POST /auth/login
  → Argon2id verify(password_hash, input)
  → JWT access token (15m) + UUID refresh token (haché SHA-256)
  → { access_token, refresh_token, user }

POST /auth/refresh
  → SHA-256(input) → lookup refresh_tokens
  → Si revoque_at != null → révoquer toute la famille → 401
  → Si expire_at < now → 401
  → Révoquer l'ancien → créer nouveau dans même famille
  → { access_token, refresh_token }

POST /auth/logout
  → Révoquer le refresh token présenté
```

---

## Alternatives rejetées

| Alternative | Raison du rejet |
|---|---|
| Sessions Redis | Couplage fort au Redis, migration difficile |
| JWT refresh longue durée | Pas révocable sans liste noire complète |
| Rôles sur les endpoints | Rigide, nécessite déploiement pour chaque changement de règle |
| Header `x-agence-id` | Contrôlable par le client, vecteur d'escalade de privilèges |
| bcrypt | Limite 72 chars, SHA-1 sous-jacent obsolète |

---

## Critères d'acceptation

- [x] Login avec mauvais mot de passe renvoie 401 (timing-safe)
- [x] Compte désactivé renvoie 401 même avec le bon mot de passe
- [x] Refresh token rejoué → 401 + révocation en cascade de toute la famille
- [x] Endpoint protégé par `@RequirePermissions` → 403 si permission absente
- [x] `*:*` (Admin) donne accès à toutes les permissions
- [x] agence_id extrait du JWT, non injectable via header HTTP
- [x] Mots de passe hachés en Argon2id (préfixe `$argon2id$`)
- [x] Refresh tokens stockés en SHA-256 (jamais en clair)
