# ADR-009 — Journal d'audit immuable & observabilité

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA manipule de l'argent (loyers, quittances, Mobile Money) et des données personnelles (pièces d'identité, contrats). Il est obligatoire de savoir **qui a fait quoi, quand, sur quelle entité**, avec une traçabilité infalsifiable. En parallèle, le debugging en production nécessite des logs structurés, un identifiant de corrélation bout en bout, et la capture des erreurs non gérées.

---

## Décisions

### 1. Table `audit_log` immuable

Toute action sensible est enregistrée dans `audit_log`. La table est **insert-only** par contrainte PostgreSQL :

```sql
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

La fonction `audit_log_immutable()` vérifie `current_user`. Seul le rôle `civora_admin` peut effectuer des suppressions RGPD documentées — le rôle applicatif `civora_app` est toujours bloqué.

### 2. `AuditService.log()` — API unique d'audit

Tous les modules utilisent `auditService.log({ action, entityType, entityId, before, after, metadata })`. L'insertion est **non-bloquante** : un échec d'audit est loggué en ERROR mais ne fait jamais échouer la requête principale.

Structure d'une entrée :
- `action` : `module:verb` (ex: `auth:login`, `biens:update`, `bail:sign`)
- `actor_type` : `user | system | job`
- `before`/`after` : snapshots JSON (optionnels, pour les updates)
- `metadata` : `{ ip, userAgent, correlationId }`

### 3. Décorateur `@Audited('action')`

Permet d'auditer un endpoint sans code dans le handler :

```typescript
@Audited('biens:update')
@Patch(':id')
update(@Param('id') id: string, @Body() dto: UpdateBienDto) { ... }
```

`AuditInterceptor` intercepte la réponse réussie et appelle `auditService.log()` automatiquement.

### 4. Actions auditées au Lot 0

| Module | Actions |
|---|---|
| Auth | `auth:login`, `auth:refresh`, `auth:logout` |
| Storage | `storage:upload-url-generated`, `storage:download-url-generated`, `storage:object-deleted`, `storage:download-url-refused` (déjà loggés structurellement) |
| IA | Tracé via `ai_calls` (table dédiée, étape 10) |
| Notifications | `notification:sent` (implicite via statut) |

### 5. Logs structurés JSON via `pino`

Sortie JSON en production, pino-pretty en dev. Chaque log contient :
```json
{
  "level": "info",
  "service": "civora-api",
  "context": "AuthService",
  "correlation_id": "uuid",
  "msg": "Login successful"
}
```

`nestjs-pino` remplace le Logger NestJS par défaut.

### 6. X-Correlation-Id

`CorrelationIdMiddleware` s'applique à toutes les routes :
- Si le header `X-Correlation-Id` est présent et valide (UUID v4) → conservé
- Sinon → généré (`randomUUID()`)
- Retourné dans la réponse

Le correlation_id est propagé dans : logs, metadata d'audit, jobs BullMQ, événements de domaine, appels IA.

### 7. Sentry — capture et scrubbing PII

`@sentry/node` capture les exceptions non gérées. `beforeSend` scrube systématiquement :
- Champs : `password`, `token`, `refresh_token`, `authorization`, `secret`
- Emails/téléphones dans les strings

Désactivé si `SENTRY_DSN` est vide (dev local). `tracesSampleRate` = 0.1 en prod, 1.0 en dev.

---

## Architecture

```
Requête HTTP
  │
  ├── CorrelationIdMiddleware  → header X-Correlation-Id
  │
  ├── JwtAuthGuard + RolesGuard
  │
  ├── AuditInterceptor (si @Audited présent)
  │     └── audit.log() après réponse réussie
  │
  └── Handler métier
        └── auditService.log() pour les actions complexes (before/after)
```

---

## Alternatives rejetées

| Alternative | Raison |
|---|---|
| Audit en mémoire / fichier | Pas de garantie d'immuabilité, perte au redémarrage |
| Confiance dans le code applicatif pour l'immuabilité | Insuffisant — le trigger DB est la seule garantie réelle |
| Winston | Plus lent que pino, pas de JSON natif sans config |
| Datadog / New Relic | Coût, vendor lock-in ; on reste sur pino + Sentry pour le Lot 0 |

---

## Critères d'acceptation

- [x] `audit.log()` insère les bons champs (agence_id, actor, action, before/after)
- [x] Dégradation silencieuse si Prisma échoue (pas de 500 pour un audit raté)
- [x] `@Audited` + `AuditInterceptor` → log automatique après appel réussi
- [x] `AuditInterceptor` neutre sur les endpoints sans `@Audited`
- [x] `correlationId` dans les metadata d'audit
- [x] Trigger SQL d'immuabilité en place (migration)
- [x] Sentry scrubObject : password/token → [SCRUBBED], email → [email]
- [x] Scrubbing récursif dans les objets imbriqués
- [x] CorrelationId : génération, préservation d'UUID valide, remplacement d'invalide
- [x] `GET /admin/audit` avec filtres (action, entity_type, actor_id)
- [x] `@Global() AuditModule` — disponible partout sans import
- [x] `SENTRY_DSN` optionnel (vide = désactivé en dev)
- [x] 16 tests : AuditService (4) + AuditInterceptor (3) + @Audited (1) + Sentry scrub (5) + CorrelationId (3)
