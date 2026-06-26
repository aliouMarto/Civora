# Scoring Contacts — Documentation publique

**Version** : 1 · **Mise à jour** : 2026-06-26

Ce document décrit en clair la formule de calcul du **score IA** affiché sur la fiche d'un contact. Il est destiné aux agences immobilières qui utilisent CIVORA et qui veulent comprendre comment ce score est calculé. Le code source de référence se trouve dans [`apps/api/src/_core/contacts/scoring/scoring-formula.ts`](../../apps/api/src/_core/contacts/scoring/scoring-formula.ts).

---

## Pourquoi un scoring transparent ?

Tant que CIVORA n'a pas accumulé assez de données transactionnelles (baux, ventes, réservations), le score est calculé par une **heuristique déterministe**. La formule est entièrement documentée ici parce que :

1. Vous devez pouvoir comprendre pourquoi un contact a tel score.
2. Vous devez pouvoir contester un score qui vous semble incohérent.
3. Quand nous remplacerons cette heuristique par un modèle d'apprentissage automatique (R2+), nous le ferons en gardant la même interface : **vous saurez toujours quels facteurs contribuent au score**.

---

## Score de 0 à 100, classé en 3 catégories

| Score | Catégorie | Lecture |
|---|---|---|
| `0–39` | **froid** | Pas encore d'intérêt avéré |
| `40–69` | **tiède** | Engagement modéré, à entretenir |
| `70–100` | **chaud** | Forte probabilité d'aboutir à une opération |

Le score affiché s'accompagne d'un **niveau de confiance** :

- **low** — moins de 5 interactions enregistrées (estimation préliminaire)
- **medium** — entre 5 et 19 interactions
- **high** — 20 interactions et plus

> Tant que la confiance est *low*, le frontend affiche explicitement « estimation préliminaire ».

---

## Composantes du score

Le score final est la somme **plafonnée à [0; 100]** des composantes suivantes.

### 1. Complétude du profil (max **+20**)

| Critère | Points |
|---|---|
| Email renseigné | +5 |
| Téléphone au format E.164 valide | +5 |
| Ville **ET** commune renseignées | +5 |
| Au moins un tag ou segment IA | +5 |

### 2. Engagement récent — 90 derniers jours (max **+30**)

| Critère | Points |
|---|---|
| Par interaction sortante (email, WhatsApp, SMS, appel) | +3 |
| Par interaction entrante (le contact contacte l'agence) | +5 |
| Par visite réalisée *(disponible en R3 — Calendrier)* | +10 |

Plafond global de cette composante : **30 points**.

### 3. Source d'acquisition (max **+15**)

| Source | Points | Interprétation |
|---|---|---|
| `referencement` | +15 | Référé par un client → confiance maximale |
| `reseau` | +12 | Issu du réseau personnel/pro de l'agence |
| `site_web` | +8 | Visiteur engagé sur le site officiel |
| `portail` | +6 | Annonce sur un portail tiers |
| `walk_in` | +5 | Walk-in non préqualifié |
| `import` | 0 | Importé en masse, qualité incertaine |
| `autre` | 0 | Source non identifiée |

### 4. Rôles cumulés (max **+10**)

`+5` points par rôle au-delà du premier, **plafond +10**. Un contact qui est à la fois *propriétaire* ET *acheteur* a plus de valeur qu'un simple prospect.

### 5. WhatsApp opt-in (max **+10**)

`+10` si le contact a explicitement consenti à recevoir des WhatsApp (cohérent RGPD/ARTCI). Ce canal a un taux d'ouverture supérieur à 90 % en Côte d'Ivoire.

### 6. Pénalités d'inactivité (max **−15**)

| Critère | Points |
|---|---|
| Aucune interaction depuis > 180 jours | −5 |
| Aucune interaction depuis > 365 jours | −10 |

---

## Exemples concrets

### Exemple 1 — Contact froid

> Walk-in importé d'un Excel, email seul, jamais relancé depuis 2 mois.

| Composante | Détail | Points |
|---|---|---|
| Complétude | email seulement | +5 |
| Source | `import` | 0 |
| **Total** | | **5 → froid (low)** |

### Exemple 2 — Contact tiède

> Locataire référé par un client existant, profil complet, 2 interactions sortantes sur 90j, WhatsApp opt-in.

| Composante | Détail | Points |
|---|---|---|
| Complétude | profil complet + 1 tag | +20 |
| Engagement 90j | 2 × 3 (sortantes) | +6 |
| Source | `referencement` | +15 |
| WhatsApp opt-in | | +10 |
| **Total** | | **51 → tiède (low)** |

### Exemple 3 — Contact chaud

> Propriétaire ET acheteur (2 rôles), 6 interactions sortantes + 2 entrantes sur 90j, profil complet, WhatsApp opt-in, source réseau.

| Composante | Détail | Points |
|---|---|---|
| Complétude | profil complet + tag | +20 |
| Engagement 90j | 6×3 + 2×5 = 28 | +28 |
| Source | `reseau` | +12 |
| Rôles cumulés | 2 rôles | +5 |
| WhatsApp opt-in | | +10 |
| **Total brut** | 75 (plafonné 100) | **75 → chaud** |

---

## Comment voir le détail d'un score ?

Chaque fiche contact propose une vue « Pourquoi ce score ? » qui détaille chaque facteur appliqué, son label et sa contribution. L'API correspondante est :

```
GET /contacts/:id/score-explanation
```

Cette transparence est garantie tant que le scoring repose sur cette heuristique. Lorsque le modèle ML prendra le relais, les **facteurs SHAP** (contribution de chaque variable) seront affichés à la place — l'interface restera la même.

---

## Quand un score change-t-il ?

Le score est recalculé automatiquement :

- À la **création** d'un contact (`contact.created`)
- À toute **modification** d'un contact (`contact.updated`)
- À chaque **nouvelle interaction** enregistrée (`contact.interaction_recorded`)
- Toutes les nuits à 02h00 UTC pour les contacts non touchés depuis 7 jours

Un événement `contact.score_changed` est émis **uniquement si** :

- Le score varie de **≥ 5 points**, OU
- La catégorie change (froid → tiède, par exemple)

Cette règle anti-bruit empêche le système de générer trop de notifications inutiles.

---

## Limites assumées

- **Pas de décision automatique** sur la base du score seul (pas de blacklist, pas de désactivation). Le score informe, il ne tranche pas.
- **Cold start** : un nouveau contact démarre à un score bas même s'il est en réalité prometteur. C'est volontaire — la confiance basse signale l'incertitude.
- **Pas de prédiction** : ce n'est pas un score de probabilité de conversion. C'est une note de **qualité d'engagement actuelle**.

La bascule vers un modèle ML est décrite dans [`docs/adr/012-contacts-scoring-cold-start.md`](../adr/012-contacts-scoring-cold-start.md).
