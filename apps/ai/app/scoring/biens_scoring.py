"""Scoring portefeuille Biens — réplique exacte de la formule TS.

Référence : apps/api/src/_core/biens/scoring/scoring-formula.ts
Doc public : docs/scoring/biens.md

L'implémentation est volontairement identique à TypeScript pour garantir la
parité (testée via tests/test_biens_scoring.py + cross-test côté API).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, NotRequired, TypedDict

# Poids du score global
W_OCCUPATION = 0.3
W_RENTABILITE = 0.3
W_DIVERSIFICATION = 0.2
W_DEMANDE = 0.2

FORMULA_DOC_URL = "/docs/scoring/biens.md"

Grade = Literal["A+", "A", "B+", "B", "C", "D"]
Confidence = Literal["low", "medium", "high"]
Statut = Literal["disponible", "loue", "saisonnier", "hors_circuit"]


class BienFeatures(TypedDict, total=False):
    yield_brut_pct: float | None
    occupation_12m: float | None
    tags: list[str]
    statut: Statut
    impaye_count_12m: int | None


class BienMarketContext(TypedDict):
    commune_total: int
    commune_loues: int
    is_unique_type_commune: bool


class BienSubScore(TypedDict):
    value: int
    grade: Grade
    confidence: Confidence


class BienScoreFactor(TypedDict):
    code: str
    label: str
    contribution: float
    category: Literal["occupation", "rentabilite", "etat", "demande", "risque"]


class BienScoreGlobal(TypedDict):
    value: int
    grade: Grade
    confidence: Confidence


class BienScoreBreakdown(TypedDict):
    global_: BienScoreGlobal
    sub_scores: dict[str, BienSubScore]
    factors: list[BienScoreFactor]
    computed_at: str
    formula_doc: str


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _clamp(v: float) -> float:
    return max(0.0, min(100.0, v))


def grade_from_value(value: float) -> Grade:
    if value >= 95:
        return "A+"
    if value >= 85:
        return "A"
    if value >= 75:
        return "B+"
    if value >= 65:
        return "B"
    if value >= 55:
        return "C"
    return "D"


def combine_confidence(*c: Confidence) -> Confidence:
    if any(x == "low" for x in c):
        return "low"
    if any(x == "medium" for x in c):
        return "medium"
    return "high"


# ─── Sous-scores ──────────────────────────────────────────────────────────────


def _step_occupation(pct: float) -> int:
    if pct >= 90:
        return 100
    if pct >= 70:
        return 80
    if pct >= 50:
        return 60
    if pct >= 30:
        return 40
    return 20


def _step_yield(pct: float) -> int:
    if pct >= 10:
        return 100
    if pct >= 8:
        return 85
    if pct >= 6:
        return 70
    if pct >= 4:
        return 50
    return 30


def _score_occupation(features: BienFeatures) -> tuple[BienSubScore, list[BienScoreFactor]]:
    occ_12m = features.get("occupation_12m")
    if isinstance(occ_12m, (int, float)):
        v = int(_clamp(_step_occupation(occ_12m)))
        return (
            {"value": v, "grade": grade_from_value(v), "confidence": "high"},
            [
                {
                    "code": "occupation_12m",
                    "label": f"Occupation {occ_12m:.0f}% sur 12 mois",
                    "contribution": v,
                    "category": "occupation",
                }
            ],
        )
    statut = features.get("statut", "disponible")
    fallback_map = {"loue": 80, "saisonnier": 70, "disponible": 40, "hors_circuit": 0}
    v = fallback_map.get(statut, 50)
    return (
        {"value": v, "grade": grade_from_value(v), "confidence": "low"},
        [
            {
                "code": "occupation_estimation_statut",
                "label": f'Estimation (statut "{statut}")',
                "contribution": v,
                "category": "occupation",
            }
        ],
    )


def _score_rentabilite(features: BienFeatures) -> tuple[BienSubScore, list[BienScoreFactor]]:
    y = features.get("yield_brut_pct")
    if isinstance(y, (int, float)):
        v = int(_clamp(_step_yield(y)))
        return (
            {"value": v, "grade": grade_from_value(v), "confidence": "high"},
            [
                {
                    "code": "yield_brut",
                    "label": f"Rendement brut {y:.1f}%",
                    "contribution": v,
                    "category": "rentabilite",
                }
            ],
        )
    return (
        {"value": 50, "grade": grade_from_value(50), "confidence": "low"},
        [
            {
                "code": "yield_unknown",
                "label": "Rendement non calculable (prix/loyer manquants)",
                "contribution": 50,
                "category": "rentabilite",
            }
        ],
    )


def _score_etat(features: BienFeatures) -> tuple[BienSubScore, list[BienScoreFactor]]:
    tags = features.get("tags", [])
    if "etat_neuf" in tags:
        return ({"value": 95, "grade": "A+", "confidence": "high"},
                [{"code": "etat_neuf", "label": "Bien neuf", "contribution": 95, "category": "etat"}])
    if "renove" in tags:
        return ({"value": 85, "grade": "A", "confidence": "high"},
                [{"code": "renove", "label": "Bien rénové", "contribution": 85, "category": "etat"}])
    if "a_renover" in tags:
        return ({"value": 45, "grade": "D", "confidence": "high"},
                [{"code": "a_renover", "label": "À rénover", "contribution": 45, "category": "etat"}])
    if "vetuste" in tags:
        return ({"value": 25, "grade": "D", "confidence": "high"},
                [{"code": "vetuste", "label": "Vétuste", "contribution": 25, "category": "etat"}])
    return (
        {"value": 60, "grade": "B", "confidence": "low"},
        [
            {
                "code": "etat_inconnu",
                "label": "État non renseigné (estimation neutre)",
                "contribution": 60,
                "category": "etat",
            }
        ],
    )


def _score_demande(market: BienMarketContext) -> tuple[BienSubScore, list[BienScoreFactor]]:
    if market["commune_total"] == 0:
        return (
            {"value": 60, "grade": "B", "confidence": "low"},
            [{"code": "pas_de_marche", "label": "Pas de données sur la commune", "contribution": 60, "category": "demande"}],
        )
    ratio = market["commune_loues"] / market["commune_total"]
    if ratio > 0.8:
        v = 100
    elif ratio > 0.6:
        v = 80
    else:
        v = 60
    conf: Confidence = "high" if market["commune_total"] >= 5 else "medium"
    return (
        {"value": v, "grade": grade_from_value(v), "confidence": conf},
        [
            {
                "code": "demande_commune",
                "label": f"Taux d'occupation commune : {int(ratio * 100)}% ({market['commune_total']} biens)",
                "contribution": v,
                "category": "demande",
            }
        ],
    )


def _score_risque(features: BienFeatures, market: BienMarketContext) -> tuple[BienSubScore, list[BienScoreFactor]]:
    v = 70.0
    factors: list[BienScoreFactor] = []
    confidence: Confidence = "low"

    if market["is_unique_type_commune"]:
        v -= 20
        factors.append({
            "code": "concentration_solo",
            "label": "Seul bien de ce type dans cette commune",
            "contribution": -20,
            "category": "risque",
        })
    else:
        factors.append({
            "code": "diversification_ok",
            "label": "Présence d'autres biens similaires (mutualisation risque)",
            "contribution": 0,
            "category": "risque",
        })

    impayes = features.get("impaye_count_12m")
    if isinstance(impayes, int) and impayes > 0:
        penalty = min(40, impayes * 10)
        v -= penalty
        factors.append({
            "code": "impayes",
            "label": f"{impayes} incident(s) d'impayé 12 mois",
            "contribution": -penalty,
            "category": "risque",
        })
        confidence = "high"

    v = _clamp(v)
    return (
        {"value": int(v), "grade": grade_from_value(v), "confidence": confidence},
        factors,
    )


# ─── API publique ─────────────────────────────────────────────────────────────


def compute_bien_score(
    features: BienFeatures,
    market: BienMarketContext,
) -> BienScoreBreakdown:
    occ, occ_f = _score_occupation(features)
    rent, rent_f = _score_rentabilite(features)
    etat, etat_f = _score_etat(features)
    dem, dem_f = _score_demande(market)
    risq, risq_f = _score_risque(features, market)

    global_value = _clamp(
        W_OCCUPATION * occ["value"]
        + W_RENTABILITE * rent["value"]
        + W_DEMANDE * dem["value"]
        + W_DIVERSIFICATION * risq["value"]
    )

    confidence = combine_confidence(
        occ["confidence"], rent["confidence"], dem["confidence"], risq["confidence"]
    )

    return {
        "global_": {
            "value": round(global_value),
            "grade": grade_from_value(global_value),
            "confidence": confidence,
        },
        "sub_scores": {
            "occupation": occ,
            "rentabilite": rent,
            "etat": etat,
            "demande": dem,
            "risque": risq,
        },
        "factors": [*occ_f, *rent_f, *etat_f, *dem_f, *risq_f],
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "formula_doc": FORMULA_DOC_URL,
    }


def compute_yield_brut_pct(
    loyer_mensuel_xof: int | None,
    prix_vente_xof: int | None,
) -> float | None:
    if not loyer_mensuel_xof or not prix_vente_xof:
        return None
    loyer_annuel = loyer_mensuel_xof * 12
    return round((loyer_annuel / prix_vente_xof) * 100, 2)
