# ADR-010 — Moteur de workflows générique

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA packagéra 6 automatisations clés (relance impayés, qualification leads, pricing nuit, classification docs, anomalies comptables, résumé hebdo) livrées dans R6. Ces automatisations doivent s'exécuter sur une infrastructure commune, configurable par agence, toggleable sans redéploiement, et traçable. Sans moteur générique, chaque automatisation deviendrait du code ad hoc dispersé dans les modules métiers.

---

## Décisions

### 1. Modèle déclaratif : Trigger → Conditions → Actions

Un workflow est entièrement défini en JSON dans la table `workflows` :

```json
{
  "trigger": { "kind": "event", "event_type": "bail.signe" },
  "conditions": [{ "field": "payload.montant", "op": ">", "value": 100000 }],
  "actions": [{ "kind": "send-notification", "channel": "email", "template": "relance.locataire", "to_field": "payload.email" }]
}
```

Pas de code par workflow. Tout est configuré en base, interprété par le moteur.

### 2. Triggers supportés

| Kind | Implémentation |
|---|---|
| `event` | `@OnDomainEvent('*')` — écoute tous les événements, filtre par type |
| `cron` | BullMQ delayed jobs via la file `scheduled` |
| `manual` | `POST /workflows/:id/test` ou déclenchement programmatique |

### 3. DSL de conditions — évaluateur minimal sans `eval`

10 opérateurs : `=`, `!=`, `>`, `<`, `>=`, `<=`, `in`, `not_in`, `contains`, et combinaisons `and`/`or`. Résolution de champs par chemin pointé (`payload.montant`). Aucune bibliothèque externe — implémentation naïve de ~60 lignes.

### 4. Actions whitelistées

3 actions de base au Lot 0 :
- `send-notification` → `NotificationsService.send()`
- `emit-event` → `EventBusService.emit()` dans une transaction
- `call-ai` → `AiGatewayService.chat()`

**Pas d'action arbitraire.** La liste est close ; les modules métiers ajouteront des actions via PR, pas via configuration.

### 5. Résolution de templates `{{field}}`

Les vars des actions sont des templates `{{path.to.value}}` résolus dans le contexte d'exécution. Même syntaxe que les notifications. Pas d'`eval`.

### 6. Versionnement

Chaque toggle ou mise à jour des params incrémente `version`. Les `WorkflowRun` enregistrent `workflow_version` pour la traçabilité historique.

### 7. Dry-run

`POST /workflows/:id/test` exécute le workflow avec `dryRun=true`. Les actions retournent `status: 'skipped'` avec le payload `{ dry_run: true }` sans effets de bord. Le run est persisté en base avec `dry_run=true`.

### 8. Idempotence via EventHandlerOffset

Le bus d'événements utilise `EventHandlerOffset(handler_name, event_id)` (PK unique) — un événement rejoué ne déclenche pas 2× le même workflow.

---

## Architecture

```
DomainEvent (bus)
  │
  └── WorkflowEngineService.onDomainEvent()
        │
        ├── WorkflowRegistryService.findByEventTrigger(agence_id, event_type)
        │     └── WHERE statut='actif' AND trigger.event_type = event_type
        │
        └── Pour chaque workflow actif :
              ├── evaluateConditions(workflow.conditions, context)
              │     └── DSL JSON → true/false (sans eval)
              │
              ├── [si passed] ExecuteAction(config, context, dryRun)
              │     ├── send-notification → NotificationsService.send()
              │     ├── emit-event → EventBusService.emit()
              │     └── call-ai → AiGatewayService.chat()
              │
              └── WorkflowRun.create({ status, conditions_result, actions_log })
```

---

## Les 6 workflows packagés (à venir R2–R6)

Ces workflows seront seed-injectés par release, pas codés en dur :

| Code | Trigger | Release |
|---|---|---|
| `relance.impayes` | cron mensuel | R2 |
| `qualification.leads` | event: contact.cree | R2 |
| `pricing.nuit` | cron quotidien | R3 |
| `classification.documents` | event: document.uploade | R3 |
| `anomalies.comptables` | cron hebdo | R5 |
| `resume.hebdo` | cron lundi 9h | R6 |

---

## Alternatives rejetées

| Alternative | Raison |
|---|---|
| n8n / Zapier embarqué | Overhead infra, vendor lock-in, pas de multi-tenant natif |
| Code statique par automatisation | Non configurable par agence, redéploiement nécessaire |
| JsonLogic (bibliothèque) | Dépendance pour 10 opérateurs — surcoût injustifié |
| Temporal / Cadence | Complexité infra excessive pour le Lot 0 |

---

## Critères d'acceptation

- [x] `evaluateConditions` : AND/OR, 6 opérateurs testés
- [x] `WorkflowEngineService.executeWorkflow()` : conditions passées → actions exécutées
- [x] Conditions non passées → status `skipped`, actions non appelées
- [x] Dry-run : actions `skipped`, run persisté avec `dry_run=true`
- [x] Workflow inactif → `registry` ne le retourne pas → aucun effet
- [x] `actions_log` contient les résultats de chaque action
- [x] `WorkflowRegistryService.toggleStatut()` → version incrémentée
- [x] `findCronWorkflows()` filtre par trigger kind=cron
- [x] RLS sur `workflows` et `workflow_runs`
- [x] `GET /workflows`, `PATCH :id/toggle`, `GET :id/runs`, `POST :id/test`
- [x] Audit sur toggle et update-params
- [x] 17 tests : conditions (7) + engine (5) + registry (5)
