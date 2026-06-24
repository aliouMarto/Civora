# ADR-006 — Service de notifications unifié (Email / SMS / WhatsApp / In-App)

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA doit notifier ses utilisateurs et contacts via plusieurs canaux : invitations d'agence, alertes de connexion, rappels de loyer, quittances PDF. Ces canaux ont des contraintes différentes (SMTP, PSP SMS, BSP WhatsApp, WebSocket), mais les modules métiers ne doivent pas dépendre de leur implémentation.

---

## Décisions

### 1. API unique `NotificationsService.send()`

Tous les modules appellent `notifications.send({ to, channel, template, vars })`. Ils ne savent pas si c'est un email, un SMS ou un message WhatsApp. La résolution du canal et la validation sont centralisées.

**Pas de corps libre** : tous les messages passent par un template enregistré dans le catalogue. Cela garantit la cohérence, l'audit, et prépare l'approbation WhatsApp Business.

### 2. Async via BullMQ (file `messaging`)

`send()` crée une ligne `Notification` (status=`queued`) dans la même transaction de base, puis enfile un job BullMQ. Le worker `NotificationsWorker` exécute l'envoi réel, met à jour le statut (`sent` / `failed`).

Ce pattern garantit qu'un envoi d'email ne bloque jamais la requête HTTP et qu'une panne SMTP n'entraîne pas de perte : le job est re-tenté selon la config `messaging` (5 tentatives, backoff exponentiel 5s).

### 3. Implémentations par canal

| Canal | Implémentation | État |
|---|---|---|
| `email` | nodemailer (SMTP) + MailHog en dev | ✅ Fonctionnel |
| `sms` | Stub (log) — PSP en R2 | 🔧 Stub |
| `whatsapp` | Stub (log) — BSP en R2 | 🔧 Stub |
| `in-app` | Persistance DB + événement WS préparé (étape 11) | 🔧 Partiel |

### 4. Templates multi-langue

Chaque template a des variantes `fr` / `en`. La langue est résolue par priorité : préférence utilisateur > langue agence > défaut `fr`. Le moteur `interpolate()` remplace les `{{variable}}` — pas d'`eval`, pas de template dynamique extérieur.

### 5. Repli WhatsApp → SMS

Si `fallbackToSms: true` et que WhatsApp échoue, le service tente SMS automatiquement. Cela prépare la logique d'opt-in WhatsApp Business (R2) sans la bloquer.

### 6. Validation `to`

- `email` → regex RFC-like, sinon 400
- `sms` / `whatsapp` → format E.164 (`+XXXXXXXXXXX`), sinon 400
- `in-app` → `userId` ou `contactId` requis

### 7. Confidentialité des logs

Les vars contenant `email`, `phone`, `tel`, `numero`, `portable` sont hashées (SHA-256, 8 chars) avant d'être loggées. L'adresse de destination est tronquée (`te***@civora.io`, `+225***01`).

---

## Architecture

```
Module métier
  │
  └── NotificationsService.send({ to, channel, template, vars })
        │
        ├── Crée Notification (queued) en DB
        ├── Enfile job BullMQ → file "messaging"
        │
        └── NotificationsWorker.process(job)
              │
              ├── TemplateService.render() → { subject, body, html }
              │
              ├── EmailChannel.send()     → nodemailer → SMTP/MailHog
              ├── SmsChannel.send()       → stub (log)
              ├── WhatsappChannel.send()  → stub (log)
              └── InAppChannel.send()     → WS event (étape 11)
```

---

## MailHog (dev)

MailHog capture tous les emails envoyés en dev sans les transmettre réellement.

- UI : `http://localhost:8025`
- SMTP capturé sur le port `1025`
- Config NestJS : `SMTP_HOST=localhost`, `SMTP_PORT=1025`

---

## Alternatives rejetées

| Alternative | Raison |
|---|---|
| Bibliothèque multi-canal unique (Novu, Knock) | Dépendance externe, SaaS pricing, moins de contrôle sur les templates WhatsApp Business |
| Corps de message libre | Incompatible avec WhatsApp Business (templates pré-approuvés) et l'audit |
| Envoi synchrone dans la requête | Risque timeout/cascade si SMTP lent ; interdit par les règles non-négociables |
| `eta` ou `handlebars` pour les templates | Overhead inutile pour des templates simples ; interpolation naïve `{{var}}` suffit à cette étape |

---

## Critères d'acceptation

- [x] `send()` valide le template, l'adresse et enfile le job
- [x] Worker met à jour le statut (`sent` / `failed`)
- [x] Email fonctionnel via nodemailer + MailHog
- [x] SMS / WhatsApp : stubs qui loguent et passent (`sent`)
- [x] Repli WhatsApp → SMS testé
- [x] Templates multi-langue avec fallback `fr`
- [x] Isolation tenant : `markRead` vérifie `agence_id` + `utilisateur_id`
- [x] PII masquée dans les logs
- [x] `GET /me/notifications` + `POST /me/notifications/:id/read`
- [x] 16 tests : templates (7) + service/canaux/isolation (9)
