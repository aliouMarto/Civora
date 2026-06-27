# Score IA portefeuille — Module Biens

**Audience :** agences CIVORA, support, devs.
**Version :** 1.0 (Lot 1 · Module 2 · Étape 3, juin 2026).

Ce document décrit **exactement** comment CIVORA calcule le score IA d'un bien et du portefeuille. La formule est **publique** et **déterministe**. Pas de magie : si vous calculez avec les mêmes chiffres, vous obtenez le même résultat.

> **Pourquoi cette transparence ?** Aucun bien n'est désactivé, masqué ou refusé en se basant sur le score seul. Le score **informe** une décision, il ne la **tranche** pas. Vous devez pouvoir comprendre pourquoi votre studio à Cocody est noté `B+` et pas `A`.

---

## 1. Vue d'ensemble

Chaque bien a **5 sous-scores** (0–100) qui mesurent une dimension distincte :

| Sous-score | Ce qu'il mesure | Source des données |
|---|---|---|
| **Occupation** | Taux de remplissage observé sur 12 mois | R2 (Locations) — fallback statut courant |
| **Rentabilité** | Rendement brut annuel (loyer/prix) | Champs `loyer_mensuel_xof` + `prix_vente_xof` |
| **État** | Qualité matérielle du bien | Tags déclarés (`etat_neuf`, `renove`, `a_renover`, `vetuste`) |
| **Demande locale** | Tension du marché dans la commune | Vue `v_biens_par_commune` |
| **Risque** | Concentration + historique impayés | Diversification portefeuille + R2 (impayés) |

Le **score global** est une combinaison pondérée :
```
global = 0.30 × Occupation
       + 0.30 × Rentabilité
       + 0.20 × Demande
       + 0.20 × Risque
```

Notez que `État` n'entre **pas** dans la formule globale : il est exposé séparément à l'utilisateur (sous-score informatif). On évite ainsi la double-pénalisation avec Rentabilité (un bien vétuste a déjà un yield faible).

Le résultat est ensuite traduit en **grade lettre** :

| Score | Grade |
|---|---|
| ≥ 95 | A+ |
| 85–94 | A |
| 75–84 | B+ |
| 65–74 | B |
| 55–64 | C |
| < 55 | D |

---

## 2. Détail de chaque sous-score

### 2.1 Occupation

**Si `occupation_12m` est connu** (R2 livré) :

| % d'occupation sur 12 mois | Sous-score | Confiance |
|---|---|---|
| ≥ 90 % | 100 | high |
| 70 – 89 % | 80 | high |
| 50 – 69 % | 60 | high |
| 30 – 49 % | 40 | high |
| < 30 % | 20 | high |

**Sinon** (avant R2), estimation depuis le statut courant :

| Statut | Sous-score | Confiance |
|---|---|---|
| loué | 80 | low |
| saisonnier | 70 | low |
| disponible | 40 | low |
| hors_circuit | 0 | low |

### 2.2 Rentabilité

Yield brut annuel = `(loyer_mensuel × 12) / prix_vente × 100`.

| Yield brut | Sous-score | Confiance |
|---|---|---|
| ≥ 10 % | 100 | high |
| 8 – 9.9 % | 85 | high |
| 6 – 7.9 % | 70 | high |
| 4 – 5.9 % | 50 | high |
| < 4 % | 30 | high |

Si `prix_vente_xof` ou `loyer_mensuel_xof` est absent : **50, confidence low**.

### 2.3 État

Lecture des tags déclarés par l'agence :

| Tag | Sous-score | Confiance |
|---|---|---|
| `etat_neuf` | 95 | high |
| `renove` | 85 | high |
| `a_renover` | 45 | high |
| `vetuste` | 25 | high |
| (aucun) | 60 | low |

### 2.4 Demande locale

Lecture de la vue `v_biens_par_commune` pour la commune du bien :

```
ratio = biens_loues_commune / biens_total_commune
```

| ratio | Sous-score |
|---|---|
| > 80 % | 100 |
| 60 – 80 % | 80 |
| < 60 % | 60 |

Confiance : `high` si la commune compte ≥ 5 biens, sinon `medium`. Si la commune est vide → 60, confidence `low`.

### 2.5 Risque

Base : **70**.

Pénalités cumulables :
- **Concentration** : si le bien est l'unique de son type dans sa commune chez cette agence → **−20** (manque de diversification).
- **Impayés** (R2) : `−10` par incident d'impayé sur 12 mois, plafonné à `−40`.

Résultat clampé à `[0, 100]`. Confidence `high` dès qu'on a au moins une donnée R2 ; sinon `low`.

---

## 3. Confiance globale (`confidence`)

La confiance globale est la **pire** des confidences des sous-scores :
- Si l'un est `low` → `low`
- Sinon si l'un est `medium` → `medium`
- Sinon `high`

**Règle frontend :** tant que `confidence == 'low'`, on affiche explicitement « estimation préliminaire » à côté du grade. Pas de claim définitif.

---

## 4. Insights actionnables

Le service `BiensInsightsService` regarde le portefeuille et émet des recommandations dans la table `insights`. Cinq types couverts à ce stade :

1. **anomalie_loyer** / **anomalie_prix** — yield > 25 % ou < 1 % (probable erreur de saisie). Sévérité `critical`.
2. **pricing_sur_marche** — loyer ≥ 115 % de la médiane (commune + type + chambres). Sévérité `warn`.
3. **pricing_sous_marche** — loyer < 80 % de la médiane. Sévérité `info`.
4. **diversification_faible** — > 50 % du parc dans une seule commune. Sévérité `warn`.
5. **demande_forte_zone** — ratio occupation commune > 90 %. Sévérité `info`, opportunité d'acquisition.

Les insights sont **idempotents** : un nouveau calcul remplace les insights actifs identiques (même type + cible). Ceux que vous avez **ignorés** ou **traités** restent en historique.

---

## 5. Pourquoi cette heuristique et pas du ML ?

À ce stade du projet :
- Pas encore de données historiques transactionnelles (R2 = locations à venir, R4 = saisonnier à venir).
- ML mal entraîné = pire que pas de score. On préfère une heuristique **explicable** que personne ne peut accuser de biais opaque.

Quand le module **R2 (Locations)** sera vivant en production sur plusieurs mois, on alimentera le **service Python** (`apps/ai/`) en données réelles et on remplacera l'intérieur de `compute_bien_score()` par un modèle entraîné. **Le contrat HTTP ne changera pas** — c'est tout l'intérêt d'avoir séparé la couche.

Plan de bascule détaillé : voir ADR `docs/adr/013-biens-portfolio-scoring.md`.

---

## 6. Que faire si vous n'êtes pas d'accord avec un score ?

1. Cliquez sur **« Comprendre ce score »** sur la fiche du bien → liste des facteurs.
2. Si une donnée est fausse (loyer mal saisi, mauvais tag d'état) : corrigez-la → le score est recalculé < 5s plus tard (worker `biens-scoring`).
3. Si la formule elle-même vous semble fausse : ouvrir un ticket avec votre exemple. La formule est versionnée et peut évoluer (sera notée v2 ici).

---

## 7. Code source

- Formule TS : [`apps/api/src/_core/biens/scoring/scoring-formula.ts`](../../apps/api/src/_core/biens/scoring/scoring-formula.ts)
- Formule Python (parité) : [`apps/ai/app/scoring/biens_scoring.py`](../../apps/ai/app/scoring/biens_scoring.py)
- Tests de parité TS/Python : [`apps/api/src/_core/biens/scoring/tests/parity.spec.ts`](../../apps/api/src/_core/biens/scoring/tests/parity.spec.ts)
- Worker async : [`apps/api/src/_core/biens/scoring/biens-scoring.worker.ts`](../../apps/api/src/_core/biens/scoring/biens-scoring.worker.ts)
- Service insights : [`apps/api/src/_core/biens/insights/biens-insights.service.ts`](../../apps/api/src/_core/biens/insights/biens-insights.service.ts)
