# ADR-004 — Traitement asynchrone : BullMQ + Workers

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

Certaines opérations de CIVORA sont trop longues pour être traitées dans le cycle requête/réponse HTTP (< 100ms) ou dépendent de services externes (Gotenberg PDF, OCR, IA, passerelles de paiement, OTA). Il faut un système de files de jobs fiable, observable et avec retry automatique.

---

## Décisions

### 1. BullMQ sur Redis

BullMQ est la bibliothèque choisie. Elle s'appuie sur `ioredis` (déjà présent) et offre :
- Files persistées dans Redis (survie aux crashs)
- Retry avec backoff configurable par file
- Concurrence configurable
- Monitoring via Bull Board

### 2. Une file par domaine fonctionnel

8 files couvrent tous les cas d'usage :

| File | Concurrence | Attempts | Backoff | Usage |
|------|-------------|----------|---------|-------|
| `pdf` | 4 | 3 | 5s exp | Génération Gotenberg |
| `ocr` | 4 | 5 | 10s exp | Extraction texte documents |
| `ai` | 8 | 3 | 3s exp | Appels LLM Claude |
| `messaging` | 10 | 5 | 5s exp | Email / SMS |
| `payments` | 2 | **10** | 15s exp | Paiements (critique) |
| `ota` | 4 | 5 | 10s exp | Sync Airbnb/Booking |
| `reports` | 2 | 2 | 30s exp | Rapports comptables |
| `scheduled` | 2 | 3 | 60s exp | Tâches cron |

`payments` a 10 attempts car une erreur de paiement peut avoir des conséquences légales/financières. La faible concurrence (2) garantit pas de double débit parallèle.

### 3. BaseWorkerService — contrat de base

Chaque worker étend `BaseWorkerService<TPayload>` et implémente `process(job)`. La classe de base fournit gratuitement :
- Propagation `agence_id` → `TenantContextService` (RLS transparent pour le worker)
- Logging structuré start/success/fail + durée
- Hook `captureException()` pour Sentry (no-op jusqu'à l'étape 12)
- DLQ sur épuisement des attempts
- `idempotencyKey()` surchargeable (défaut : `job.id`)

### 4. Dead Letter Queue (DLQ)

Quand un job dépasse ses `attempts`, l'événement `failed` BullMQ déclenche l'insertion dans `job_dead_letters` (PostgreSQL). Cela permet :
- Audit des échecs sans perte d'information
- Relance manuelle depuis le back-office
- Alerting Sentry (étape 12)

### 5. Bull Board — UI de monitoring

Accessible sous `/admin/queues`, uniquement hors production. Protégé par JwtAuthGuard (JWT valide requis + rôle Admin). Implémenté via `@bull-board/express` monté comme middleware Express.

### 6. Idempotence par jobId

Tous les jobs peuvent passer un `jobId` custom à BullMQ. Si le même `jobId` est soumis deux fois, BullMQ ignore le doublon. Les modules métier doivent utiliser une clé fonctionnelle (ex: `bail.signe:${bailId}`) pour garantir l'idempotence en cas de retry/timeout.

---

## Règle fondamentale

> Jamais de traitement métier dans le cycle requête si la durée estimée > 100ms ou si le traitement dépend d'un service externe.

---

## Alternatives rejetées

| Alternative | Raison |
|---|---|
| NestJS bull (`@nestjs/bull`) | Abstraction sur bull v3, non maintenu pour bullmq v5 |
| Agenda.js | Basé MongoDB, pas Redis ; moins de perf |
| Sidekiq (Ruby) | Stack différente |
| RabbitMQ | Infrastructure supplémentaire, complexité config |
| Traitement synchrone | Non : bloque les requêtes, pas de retry, pas de monitoring |

---

## Critères d'acceptation

- [x] 8 files créées au démarrage, visibles dans Bull Board
- [x] `POST /_dev/jobs/ping` enfile un job `demo.ping` traité par `DemoWorker`
- [x] `BaseWorkerService` propage `agence_id` dans `TenantContextService`
- [x] DLQ : job épuisé → insertion dans `job_dead_letters`
- [x] Pas d'insertion DLQ sur tentative intermédiaire
- [x] `jobId` custom → idempotence BullMQ
- [x] `onModuleDestroy()` ferme proprement toutes les connexions
- [x] Bull Board accessible `/admin/queues` (dev uniquement)
