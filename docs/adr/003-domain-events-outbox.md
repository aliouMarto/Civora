# ADR-003 — Bus d'événements de domaine : Outbox Pattern

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA est une plateforme avec de nombreux modules métier (biens, CRM, locations, comptabilité…). Ces modules doivent réagir aux actions des autres sans créer de couplage direct. Par exemple, quand un bail est signé, plusieurs modules doivent être notifiés : comptabilité (créer les écritures), GED (générer le PDF), CRM (mettre à jour le statut du prospect).

Problèmes à résoudre :
1. **Cohérence** : un événement ne doit jamais être émis si la transaction métier a échoué.
2. **Résilience** : un événement émis doit être livré même si Redis/BullMQ est temporairement indisponible.
3. **Idempotence** : un handler ne doit jamais traiter deux fois le même événement.
4. **Découplage** : les modules ne s'appellent pas directement.

---

## Décision

### 1. Pattern Outbox

L'événement est inséré dans la table `domain_events` **dans la même transaction Prisma** que le changement métier. Si la transaction est rollback, l'événement disparaît aussi.

```
Transaction métier
  ├── UPDATE bails SET statut = 'signé' WHERE id = ?
  └── INSERT INTO domain_events (type, payload, ...) VALUES ('bail.signe', ...)
```

Un worker séparé (`OutboxDispatcherService`) poll `domain_events WHERE published_at IS NULL` toutes les 200ms (configurable via `OUTBOX_POLL_INTERVAL_MS`) et publie sur BullMQ.

**Règle non négociable** : `OutboxService.emit()` lève une erreur explicite si appelé sans `TransactionClient`. Il n'y a pas de mode "fire and forget hors transaction".

### 2. BullMQ comme transport

Une queue BullMQ par type d'événement (`events.bail.signe`, `events.paiement.recu`…) :
- Permet la priorisation et le monitoring par type
- BullMQ garantit la livraison au moins une fois
- `jobId = event.id` → idempotence côté BullMQ (pas de doublon si le dispatcher re-publie)

### 3. Idempotence des handlers

Avant d'exécuter un handler, une ligne `EventHandlerOffset(handler_name, event_id)` est insérée. La contrainte `PRIMARY KEY (handler_name, event_id)` garantit qu'en cas de doublon (rejeu BullMQ, re-déploiement), le handler ne s'exécute qu'une fois.

### 4. Propagation du contexte tenant

Le `agence_id` de l'événement est propagé dans le `TenantContextService` du handler. Les handlers s'exécutent avec le bon `app.agence_id`, exactement comme les requêtes HTTP.

### 5. Backoff exponentiel

En cas d'échec de publication BullMQ :
- `attempts` est incrémenté
- `last_error` est mis à jour
- Backoff : `min(1000 * 2^(attempts-1), 60_000)` ms (max 60s)
- Le worker repollera l'événement au prochain cycle

---

## Structure du code

```
src/_core/events/
├── domain-event.ts                 # type DomainEvent<TPayload> + createDomainEvent()
├── event-context.service.ts        # AsyncLocalStorage pour actor_id / correlation_id
├── outbox.service.ts               # INSERT dans domain_events (toujours dans une tx)
├── outbox-dispatcher.service.ts    # Worker poll → BullMQ → published_at
├── event-bus.service.ts            # API pour les modules métier
├── event-handler.decorator.ts      # @OnDomainEvent('bail.signe')
├── event-handler-registry.ts       # Registre des handlers découverts
├── event-handler-discovery.ts      # Scan NestJS au démarrage
├── idempotent-handler.service.ts   # Exécution idempotente via EventHandlerOffset
└── events.module.ts
```

---

## Flux complet

```
Module métier (ex: BailsService)
  └── prisma.$transaction(async tx => {
        await tx.bail.update(...)
        await eventBus.emit(createDomainEvent('bail.signe', ...), tx)
      })
           │
           ▼
    domain_events (published_at = null)
           │
    OutboxDispatcherService (poll 200ms)
           │
           ▼
    BullMQ queue "events.bail.signe" (jobId = event.id)
           │
    Worker BullMQ (Étape 07)
           │
    IdempotentHandlerService
      ├── INSERT event_handler_offsets (PK → idempotence)
      └── TenantContextService.run(agence_id, () => handler.fn(event))
```

---

## Alternatives rejetées

| Alternative | Raison du rejet |
|---|---|
| Émettre vers BullMQ directement (sans outbox) | Perte d'événements si Redis down au moment du commit |
| NestJS EventEmitter (in-process) | Pas de persistance, perte totale si crash/redémarrage |
| Saga pattern distribué | Complexité excessive pour les cas d'usage actuels |
| Kafka | Infrastructure trop lourde pour une agence immobilière |
| `published_at IS NULL` + SKIP LOCKED | Option future si le volume justifie le partitionnement |

---

## Critères d'acceptation

- [x] `emit()` sans `TransactionClient` lève une erreur explicite
- [x] `emit()` dans une tx rollback → événement pas persisté
- [x] Dispatcher publie sur `events.<type>` avec `jobId = event.id`
- [x] Dispatcher marque `published_at` après confirmation BullMQ
- [x] Échec publication → `attempts++`, `last_error` loggé, backoff exponentiel
- [x] Handler appelé 2× avec le même `event_id` → s'exécute 1 seule fois
- [x] `agence_id` propagé dans le TenantContext du handler
- [x] Événement système (`agence_id = null`) → pas de `TenantContext.run()`
