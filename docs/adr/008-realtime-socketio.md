# ADR-008 — Temps réel : Socket.IO + adaptateur Redis

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA a besoin d'un canal temps réel pour :
- Le **Command Center** (flux d'activité live : baux signés, paiements reçus, réservations confirmées)
- Les **notifications in-app push** (badge + toast sans polling)
- Les mises à jour de statut en cours de traitement (OCR, génération PDF)

Les contraintes sont : isolation stricte par tenant, authentification JWT, scalabilité multi-instance (Docker/K8s), et aucune logique métier dans la gateway.

---

## Décisions

### 1. Socket.IO sur `/`

Socket.IO est choisi pour sa gestion native de la reconnexion, le fallback polling, et la compatibilité large navigateur. L'adaptateur Redis (`@socket.io/redis-adapter`) permet la diffusion inter-instance via pub/sub.

### 2. Handshake JWT

Le token JWT access est passé dans `socket.handshake.auth.token`. La gateway le vérifie avec `JwtService.verify()` — même secret que les guards HTTP. En cas d'échec : `socket.disconnect(true)` immédiat.

Le payload décodé (`sub`, `agence_id`) est stocké sur le socket pour le lifetime de la connexion.

### 3. Canaux par tenant/utilisateur (côté serveur uniquement)

Au connect, le serveur joint automatiquement le socket aux rooms :
- `tenant.<agence_id>` → activité agence
- `user.<utilisateur_id>` → notifications personnelles

**Le client ne peut jamais choisir ses rooms.** La logique de join est exclusive au serveur. Un utilisateur ne peut pas écouter les événements d'une autre agence.

### 4. `RealtimeService` comme seule API d'émission

Aucun module métier n'importe `socket.io` directement. Tous passent par :
- `realtimeService.emitToTenant(agence_id, event, data)`
- `realtimeService.emitToUser(user_id, event, data)`
- `realtimeService.emitToModule(module, agence_id, event, data)`

### 5. Événements = signaux, pas données complètes

Le payload d'un événement temps réel contient **des IDs et un type**, pas les données complètes. Le client re-requête l'API REST si besoin. Cela évite les fuites de PII dans les sockets (logs réseau, DevTools).

Exemple : `notification.new` → `{ notificationId: 'uuid' }`, pas le contenu.

### 6. LiveFeedProjector

Consomme certains événements de domaine (`bail.signe`, `paiement.recu`, `reservation.confirmee`, `bien.publie`, `contact.cree`) via `@OnDomainEvent` et les projette en temps réel sur `tenant.<agence_id>`.

### 7. Adaptateur Redis

`@socket.io/redis-adapter` utilise deux clients ioredis (pub + sub) créés depuis `REDIS_URL`. L'instance API 1 publie sur Redis → Redis notifie l'instance API 2 → le socket du client connecté à API 2 reçoit l'événement.

En test : `REDIS_URL` absent → adaptateur désactivé (pas de Redis requis pour les tests unitaires).

### 8. Throttling anti-DoS

20 événements/seconde par socket côté serveur. Compteur en mémoire (Map), remise à zéro chaque seconde. Configurable via `MAX_EVENTS_PER_SECOND`.

---

## Architecture

```
Client (navigateur)
  │
  ├── socket.io-client → connexion /socket.io
  │     auth: { token: JWT }
  │
  └── RealtimeGateway.handleConnection()
        ├── JwtService.verify(token) → payload
        ├── socket.join('tenant.<agence_id>')
        ├── socket.join('user.<sub>')
        └── socket.emit('connect.ack', { userId, agenceId, channels })

Module métier
  └── RealtimeService.emitToTenant(agence_id, 'activity.live', { type, aggregate_id })
        └── server.to('tenant.<agence_id>').emit(...)
              └── [Redis adapter] → tous les sockets de l'agence sur toutes les instances

LiveFeedProjector
  └── @OnDomainEvent('bail.signe') → realtimeService.emitToTenant(...)
```

---

## Alternatives rejetées

| Alternative | Raison |
|---|---|
| WebSocket natif (ws) | Pas de rooms, reconnexion manuelle, polling fallback à coder |
| Server-Sent Events (SSE) | Unidirectionnel, pas adapté aux futurs canaux bidirectionnels |
| MQTT | Overhead infra, moins adapté web |
| Polling HTTP | Latence ~1-3s, charge serveur proportionnelle aux clients |

---

## Critères d'acceptation

- [x] Handshake sans token → disconnect(true)
- [x] Handshake token invalide → disconnect(true)
- [x] Handshake valide → join tenant.* + user.*, connect.ack émis
- [x] emitToTenant → room correcte, isolation inter-tenant
- [x] emitToUser → room user.* correcte
- [x] Server absent → pas d'erreur (warn uniquement)
- [x] Adaptateur Redis → test structurel multi-service
- [x] Throttling : >20 events/s → isThrottled() retourne true
- [x] LiveFeedProjector : @OnDomainEvent pour 5 types d'événements
- [x] Hook React `useRealtime` avec cleanup au démontage
- [x] 18 tests : handshake (8) + émission/isolation/canaux (10)
