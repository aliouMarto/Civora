# ADR-012 — Scoring contacts : heuristique transparente en cold-start, ML après accumulation

**Statut** : Accepté
**Date** : 2026-06-26
**Auteur** : Civora Core Team
**Lot** : 1 · Module 1 (Contacts) · Étape 3

---

## Contexte

CIVORA livre R1 sans historique transactionnel : les baux, ventes et réservations arrivent en R2/R3/R4. Or, le module Contacts doit fournir dès R1 un **score IA** (`score_ia`, `score_categorie`) et des **segments automatiques** (VIP, lead chaud, à réactiver, etc.) pour que les agences puissent prioriser leur travail commercial.

Deux contraintes :

1. **Cold-start** — on n'a pas encore assez de signaux pour entraîner un modèle ML pertinent (besoin de ≥ quelques milliers de contacts × historique d'au moins 6 mois × labels d'issue type "transformé en bail"/"perdu"). En R1, on partira de zéro.
2. **Transparence non-négociable** — les agences doivent comprendre pourquoi un contact a tel score, et pouvoir contester. C'est une exigence métier (relation client) et réglementaire (RGPD : droit d'opposition à un traitement automatisé qui produit des effets juridiques ou significatifs).

---

## Décision

### 1. Heuristique transparente comme première implémentation

Le scoring R1 repose sur une **formule additive pondérée** documentée publiquement dans `docs/scoring/contacts.md` :

- 6 composantes (complétude, engagement 90j, source, rôles cumulés, WhatsApp opt-in, pénalités d'inactivité)
- Chaque composante a un plafond explicite
- Le score est clampé sur `[0; 100]`
- 3 catégories (`froid` < 40, `tiède` 40–69, `chaud` ≥ 70)
- Niveau de confiance : `low` (< 5 interactions), `medium` (< 20), `high` (≥ 20)

Le code est dupliqué côté TS (`scoring-formula.ts`) et Python (`apps/ai/app/scoring/contacts_scoring.py`). Un **test de parité** assure que les deux implémentations produisent strictement le même score sur le même input.

### 2. Service Python comme point d'entrée unique dès R1

Même si l'heuristique est triviale, on l'expose immédiatement via `POST /score/contact` sur le service FastAPI (`apps/ai`). L'API NestJS appelle ce service avec un timeout 5 s ; **fallback heuristique TS** si le service est indisponible.

Pourquoi cette indirection dès maintenant :

- Le jour où le modèle ML remplace l'heuristique, **aucune modification du module Contacts** n'est nécessaire — le contrat HTTP ne change pas.
- Le service Python est le futur dépôt des modèles ML : versioning, monitoring (latence, drift), retraining batch.
- On découple la complexité ML de la stack métier NestJS.

### 3. Anti-bruit sur les événements de scoring

Un événement `contact.score_changed` n'est émis **que si** :

- `|score_after − score_before| ≥ 5` OU
- `category` a changé

Cela évite de générer 10 events par jour pour un contact dont le score oscille entre 41 et 43 selon les arrondis. Les workflows réactifs (relances automatiques, mise en avant dans la file commerciale) ne sont déclenchés que sur des changements significatifs.

### 4. Bascule vers le ML — critères de transition

Le scoring passera en mode ML quand **les trois critères suivants** sont remplis pour une agence donnée :

| Critère | Seuil minimum |
|---|---|
| Contacts avec ≥ 30 jours d'historique | 1 000 |
| Contacts avec issue connue (transformé / perdu) | 300 |
| Stabilité opérationnelle | 6 mois sans incident majeur sur le module |

Le modèle ML (probablement gradient boosting type LightGBM/XGBoost) sera entraîné par agence ou par cluster d'agences (multi-tenant ML — décision séparée à venir). Le contrat reste le même : on retourne `{ score, category, confidence, factors }`. Les `factors` deviendront alors les contributions SHAP des variables les plus influentes pour le contact considéré.

---

## Alternatives rejetées

| Alternative | Raison du rejet |
|---|---|
| **Pas de scoring tant qu'on n'a pas de ML** | Inacceptable produit : les agences ont besoin de prioriser dès le jour 1. |
| **Score 100% côté NestJS, pas de service Python** | Impose une réécriture du jour où on bascule ML. La séparation immédiate vaut le coût (un appel HTTP). |
| **Score sans confidence affichée** | Risque de surinterprétation par les utilisateurs. La confidence basse est un signal clair. |
| **Score visible mais formule cachée** | Contraire à l'exigence de transparence + risque RGPD sur traitement automatisé. |
| **Modèle ML entraîné avec très peu de données** | Garbage in, garbage out. On préfère une heuristique stable qu'un ML sous-entraîné. |
| **Pas d'événement `contact.score_changed`** | Empêche les workflows réactifs. On le garde mais avec seuil anti-bruit. |

---

## Conséquences

### Positives

- **Onboarding sans données** : une agence qui démarre avec 0 contact peut scorer dès qu'elle en crée.
- **Auditabilité** : chaque score s'explique. Aucune boîte noire en R1.
- **Migration douce vers ML** : aucun couplage entre le module Contacts et l'implémentation du scoring. On peut tester un modèle ML en parallèle (canary) sans modifier le code métier.
- **Parité TS/Python testée** : le test de parité garantit qu'on peut éteindre le service Python en cas d'incident sans dégradation perceptible.

### Négatives ou à surveiller

- **Heuristique grossière** : la formule actuelle ne capture pas la séquence d'événements ni la qualité du contenu des interactions. Elle peut sous-estimer un contact très qualifié (un seul échange mais très engageant). Mitigation : la confidence basse signale cette imprécision.
- **Latence supplémentaire** : un aller-retour HTTP supplémentaire (~10–30 ms en local, jusqu'à 100 ms en prod). Mitigation : le scoring est asynchrone (worker), il n'impacte pas le path critique CRUD.
- **Duplication de code** : la formule existe en TS et en Python. Mitigation : test de parité automatique en CI, et le code est suffisamment court (< 200 lignes) pour que la maintenance reste raisonnable.

---

## Liens

- Documentation publique : [`docs/scoring/contacts.md`](../scoring/contacts.md)
- Code TS : [`apps/api/src/_core/contacts/scoring/scoring-formula.ts`](../../apps/api/src/_core/contacts/scoring/scoring-formula.ts)
- Code Python : [`apps/ai/app/scoring/contacts_scoring.py`](../../apps/ai/app/scoring/contacts_scoring.py)
- Test parité : [`apps/api/src/_core/contacts/scoring/tests/parity.spec.ts`](../../apps/api/src/_core/contacts/scoring/tests/parity.spec.ts)
- ADR-010 (AI Gateway) : prérequis architectural
- ADR-011 (CI/CD & backups) : déploiement séparé du service Python
