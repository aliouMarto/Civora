# ADR-013 — Scoring portefeuille Biens (cold start)

**Statut** : Accepté
**Date** : 2026-06-27
**Lot/Module** : Lot 1 · Module 2 (Biens) · Étape 3

## Contexte

À la mise en service du module Biens, l'agence n'a **aucun historique transactionnel** :

- pas de baux signés en base (R2 = locations longue durée à venir),
- pas de réservations saisonnières (R4),
- pas de paiements ni d'impayés (R5),
- pas de ventes conclues (R3).

Un modèle de machine learning entraîné sans ces données serait, au mieux, du bruit ; au pire, biaisé par les premières données disponibles (selection bias). Pourtant, nos agences ont **besoin d'une note dès le premier bien** : c'est ce qui donne du sens au catalogue.

## Décision

Construire une **heuristique transparente** (multi-dimensions, déterministe, documentée publiquement) qui produit un score utilisable dès le premier bien créé. Préparer dès maintenant l'infrastructure (service Python isolé, contrat HTTP stable) pour pouvoir basculer vers un modèle ML **sans changer le contrat** côté API ou frontend, le jour où nous aurons les données.

### Détail des choix

1. **5 sous-scores** indépendants (occupation, rentabilité, état, demande, risque) plutôt qu'un seul nombre opaque → l'utilisateur sait **où** son bien faiblit.

2. **`confidence` exposée** (`low`/`medium`/`high`) → le frontend affiche systématiquement « estimation préliminaire » quand on manque de données, plutôt que de masquer cette incertitude.

3. **Service Python séparé** (`apps/ai`) avec endpoint `POST /score/bien`. L'implémentation actuelle réplique exactement la formule TypeScript (testé via `parity.spec.ts`). Quand viendra le ML, on remplacera le contenu **sans toucher au contrat**.

4. **Fallback systématique côté API TS** : si le service Python est down ou en timeout (5s), l'API utilise sa propre implémentation locale. Aucun bien ne se retrouve "sans score" à cause d'une panne IA.

5. **Worker BullMQ dédié** (`biens-scoring`) avec déduplication par `bien_id` → un bien fortement édité ne sature pas la file.

6. **Anti-bruit** : l'événement `bien.score_changed` est émis **uniquement** si le delta dépasse 5 points. Évite de spammer le frontend pour ±1 point de fluctuation.

## Alternatives écartées

| Option | Pourquoi écartée |
|---|---|
| **Pas de score tant que ML non prêt** | Le score est central dans le UI/UX du module — différer 12 mois est inacceptable. |
| **ML pré-entraîné sur données génériques (FR/Europe)** | Marché immobilier abidjanais trop spécifique. Risque de biais aggravé. |
| **Score unique opaque** | Impossible à expliquer à l'agence. Casse la confiance. Conflit avec règle "transparence du scoring". |
| **Formule cachée** | Casse la transparence promise au client. |

## Plan de bascule vers ML (V2)

**Déclencheur :** quand le module **R2 (Locations longue durée)** sera en production sur au moins **6 mois** chez **≥ 5 agences distinctes**, on disposera d'environ 500 → 5 000 lignes de bail avec leurs durées effectives, leurs renouvellements et leurs impayés.

**Plan en 4 étapes :**

1. **Collecte** : pipeline de features dans `apps/ai/data/` qui matérialise par bien : historique loyer, vacance entre baux, taux d'impayé, durée moyenne d'occupation, ratio renouvellement, etc.
2. **Entraînement** : régression (XGBoost ou LightGBM) prédisant le **score d'occupation futur 12 mois**. Validation croisée par agence (éviter le leakage). Métriques cibles : MAE < 10 points sur le score occupation.
3. **A/B** : nouveau score retourné par le service Python en mode "shadow" pendant 4 semaines, comparé à l'heuristique. On exige que les insights générés restent cohérents (>= 80 % d'accord sur les top 10 anomalies).
4. **Bascule** : remplacement de l'intérieur de `compute_bien_score()` côté Python. L'API TS continue d'appeler le même endpoint. Le sous-score `occupation` passe en confidence `high` même sans données R2 (car le modèle est calibré sur l'ensemble du marché).

À chaque bascule de version : entrée dans CHANGELOG public + mention sur la page « Comprendre ce score » du frontend.

## Conséquences

**Positives :**
- Onboarding instantané (premier bien = score immédiat).
- Transparence : l'agence peut contester un score précis, pas une boîte noire.
- Infrastructure prête pour ML sans réécriture API/frontend.
- Tests de parité TS/Python garantissent qu'on ne diverge pas accidentellement entre les deux implémentations.

**Négatives / à surveiller :**
- Les paliers (`yield >= 8 % → 85`) sont arbitraires. À ré-évaluer après 6 mois en production.
- Le `risque` heuristique est faible tant qu'on n'a pas R2 (impayés).
- Le grade `D` peut sembler dur à l'agence sur un bien neuf hors-zone — penser à expliquer dans l'UI.

## Référence

- Formule publique : [`docs/scoring/biens.md`](../scoring/biens.md)
- Source TS : [`apps/api/src/_core/biens/scoring/scoring-formula.ts`](../../apps/api/src/_core/biens/scoring/scoring-formula.ts)
- Source Python : [`apps/ai/app/scoring/biens_scoring.py`](../../apps/ai/app/scoring/biens_scoring.py)
- ADR-012 (Contacts) suit la même logique cold-start.
