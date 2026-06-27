"""Tests de l'heuristique Python — doit produire les mêmes valeurs que TS.

La parité TS/Python est validée :
  - localement par ce fichier (cas équivalents au scoring-formula.spec.ts)
  - côté API par tests d'intégration cross-service quand le service Python
    tourne (apps/api/.../parity.spec.ts).
"""
from __future__ import annotations

import pytest

from app.scoring.biens_scoring import (
    BienFeatures,
    BienMarketContext,
    compute_bien_score,
    compute_yield_brut_pct,
)


EMPTY_MARKET: BienMarketContext = {
    "commune_total": 10,
    "commune_loues": 5,
    "is_unique_type_commune": False,
}


def test_yield_faible_3pct_score_30() -> None:
    r = compute_bien_score(BienFeatures(yield_brut_pct=3), EMPTY_MARKET)
    assert r["sub_scores"]["rentabilite"]["value"] == 30


def test_yield_moyen_7pct_score_70() -> None:
    r = compute_bien_score(BienFeatures(yield_brut_pct=7), EMPTY_MARKET)
    assert r["sub_scores"]["rentabilite"]["value"] == 70


def test_yield_fort_11pct_score_100() -> None:
    r = compute_bien_score(BienFeatures(yield_brut_pct=11), EMPTY_MARKET)
    assert r["sub_scores"]["rentabilite"]["value"] == 100


def test_occupation_95pct_score_100() -> None:
    r = compute_bien_score(BienFeatures(occupation_12m=95), EMPTY_MARKET)
    assert r["sub_scores"]["occupation"]["value"] == 100


def test_occupation_25pct_score_20() -> None:
    r = compute_bien_score(BienFeatures(occupation_12m=25), EMPTY_MARKET)
    assert r["sub_scores"]["occupation"]["value"] == 20


def test_fallback_statut_loue_donne_80() -> None:
    r = compute_bien_score(BienFeatures(statut="loue"), EMPTY_MARKET)
    assert r["sub_scores"]["occupation"]["value"] == 80
    assert r["sub_scores"]["occupation"]["confidence"] == "low"


def test_etat_renove_score_85() -> None:
    r = compute_bien_score(BienFeatures(tags=["renove"]), EMPTY_MARKET)
    assert r["sub_scores"]["etat"]["value"] == 85


def test_demande_commune_haute_score_100() -> None:
    market: BienMarketContext = {"commune_total": 10, "commune_loues": 9, "is_unique_type_commune": False}
    r = compute_bien_score(BienFeatures(), market)
    assert r["sub_scores"]["demande"]["value"] == 100


def test_concentration_solo_penalise_risque() -> None:
    solo = compute_bien_score(BienFeatures(), {**EMPTY_MARKET, "is_unique_type_commune": True})
    partage = compute_bien_score(BienFeatures(), {**EMPTY_MARKET, "is_unique_type_commune": False})
    assert solo["sub_scores"]["risque"]["value"] < partage["sub_scores"]["risque"]["value"]


def test_global_combine_les_4_sous_scores() -> None:
    features = BienFeatures(yield_brut_pct=8, occupation_12m=75, tags=["renove"])
    market: BienMarketContext = {"commune_total": 8, "commune_loues": 7, "is_unique_type_commune": False}
    r = compute_bien_score(features, market)
    # 0.3*80 + 0.3*85 + 0.2*100 + 0.2*70 = 83.5 → 84
    assert 80 <= r["global_"]["value"] <= 85


def test_yield_brut_pct_helper() -> None:
    assert compute_yield_brut_pct(100_000 * 100, 60_000_000 * 100) == 2.0
    assert compute_yield_brut_pct(None, 1000) is None
    assert compute_yield_brut_pct(1000, None) is None
    assert compute_yield_brut_pct(1000, 0) is None
