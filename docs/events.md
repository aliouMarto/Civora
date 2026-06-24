# Catalogue des événements de domaine CIVORA

> Ce fichier est la référence des événements émis par les modules métier.
> Chaque événement a un type, un aggregate, un payload minimal et des exemples de consommateurs.

---

## Convention de nommage

```
<module>.<action_passé>
```
Exemples : `bail.signe`, `paiement.recu`, `bien.publié`, `utilisateur.invité`

## Structure d'un événement

```ts
interface DomainEvent<TPayload> {
  id: string;             // UUID — identifiant unique de l'événement
  agence_id: string|null; // null si événement système
  type: string;           // ex: "bail.signe"
  version: number;        // versionnement du schéma de payload (commence à 1)
  aggregate_type: string; // ex: "Bail"
  aggregate_id: string;   // UUID de l'agrégat concerné
  payload: TPayload;      // données minimales — PAS l'agrégat complet
  metadata: {
    actor_id: string|null;     // utilisateur initiateur
    correlation_id: string;    // propagé via X-Correlation-Id HTTP
    causation_id: string|null; // event_id de l'événement parent
    ip: string|null;
    user_agent: string|null;
  };
  occurred_at: Date;
}
```

---

## Événements par module

> Les événements concrets seront ajoutés ici au fur et à mesure de l'implémentation des modules métier (Lot 1+).

### Module : Demo (dev uniquement)

| Type | Aggregate | Payload | Consommateurs |
|------|-----------|---------|---------------|
| `demo.test_event` | `Demo` | `{ message, triggered_by }` | aucun (test) |

---

## Règles

1. **Le payload contient l'ID + les champs nécessaires à l'événement** — jamais l'agrégat complet. Les consommateurs rechargent l'agrégat s'ils en ont besoin.
2. **Chaque type d'événement a son fichier TypeScript** dans `src/_core/events/domain-events/<module>/<type>.event.ts`.
3. **Toute modification du payload d'un événement existant** → incrémenter `version` et documenter la migration.
4. **`actor_id` est obligatoire** sauf pour les événements système (`agence_id = null`).
