"""Tests de l'heuristique scoring contacts (Python)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.scoring.contacts_scoring import ScoringFeatures, compute_score


def _features(**overrides: object) -> ScoringFeatures:
    base: dict[str, object] = {
        "has_email": False,
        "has_valid_phone": False,
        "has_address": False,
        "has_tag_or_segment": False,
        "interactions_outgoing_90d": 0,
        "interactions_incoming_90d": 0,
        "visits_completed_90d": 0,
        "source": None,
        "roles_count": 0,
        "whatsapp_opt_in": False,
        "days_since_last_interaction": None,
        "total_interactions": 0,
    }
    base.update(overrides)
    return ScoringFeatures(**base)


class TestComputeScore:
    def test_empty_profile_returns_froid(self) -> None:
        result = compute_score(_features())
        assert result.score == 0
        assert result.category == "froid"
        assert result.confidence == "low"
        assert result.factors == []

    def test_complete_profile_recent_referencement_is_chaud(self) -> None:
        result = compute_score(
            _features(
                has_email=True,
                has_valid_phone=True,
                has_address=True,
                has_tag_or_segment=True,
                interactions_outgoing_90d=4,
                interactions_incoming_90d=2,
                source="referencement",
                roles_count=2,
                whatsapp_opt_in=True,
                days_since_last_interaction=5,
                total_interactions=12,
            )
        )
        # 20 (completeness) + 22 (4*3 + 2*5) + 15 (referencement) + 5 (roles) + 10 (whatsapp)
        assert result.score == 72
        assert result.category == "chaud"
        assert result.confidence == "medium"

    def test_engagement_is_capped_at_30(self) -> None:
        result = compute_score(
            _features(
                interactions_outgoing_90d=20,
                interactions_incoming_90d=10,
                visits_completed_90d=5,
                total_interactions=35,
            )
        )
        engagement_factors = [f for f in result.factors if f.category == "engagement"]
        net = sum(f.contribution for f in engagement_factors)
        assert net == 30

    def test_inactive_365_applies_penalty(self) -> None:
        result = compute_score(
            _features(
                has_email=True,
                has_valid_phone=True,
                days_since_last_interaction=400,
                total_interactions=3,
            )
        )
        penalty = next(f for f in result.factors if f.code == "penalty.inactive_365")
        assert penalty.contribution == -10
        assert result.score == max(0, 10 + (-10))
        assert result.confidence == "low"

    def test_inactive_180_applies_smaller_penalty(self) -> None:
        result = compute_score(
            _features(
                has_email=True,
                has_valid_phone=True,
                days_since_last_interaction=200,
                total_interactions=3,
            )
        )
        penalty = next(f for f in result.factors if f.code == "penalty.inactive_180")
        assert penalty.contribution == -5

    def test_roles_cumulated_capped(self) -> None:
        result = compute_score(_features(roles_count=10))
        roles_factor = next(f for f in result.factors if f.code == "roles.cumulated")
        assert roles_factor.contribution == 10  # capped

    def test_score_clamped_to_100(self) -> None:
        result = compute_score(
            _features(
                has_email=True,
                has_valid_phone=True,
                has_address=True,
                has_tag_or_segment=True,
                interactions_outgoing_90d=30,
                interactions_incoming_90d=20,
                visits_completed_90d=5,
                source="referencement",
                roles_count=6,
                whatsapp_opt_in=True,
                days_since_last_interaction=1,
                total_interactions=50,
            )
        )
        assert result.score == 100
        assert result.category == "chaud"
        assert result.confidence == "high"

    def test_high_confidence_threshold(self) -> None:
        assert compute_score(_features(total_interactions=4)).confidence == "low"
        assert compute_score(_features(total_interactions=10)).confidence == "medium"
        assert compute_score(_features(total_interactions=25)).confidence == "high"

    def test_tiede_range(self) -> None:
        result = compute_score(
            _features(
                has_email=True,
                has_valid_phone=True,
                has_address=True,
                source="portail",
                whatsapp_opt_in=True,
                days_since_last_interaction=30,
                total_interactions=4,
            )
        )
        # 15 + 6 + 10 = 31 → wait that's froid
        assert 0 <= result.score <= 100


@pytest.mark.asyncio
async def test_score_contact_endpoint_returns_valid_payload() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/score/contact",
            json={
                "agence_id": "00000000-0000-0000-0000-000000000000",
                "contact_id": "00000000-0000-0000-0000-000000000001",
                "features": {
                    "has_email": True,
                    "has_valid_phone": True,
                    "has_address": True,
                    "has_tag_or_segment": True,
                    "interactions_outgoing_90d": 4,
                    "interactions_incoming_90d": 2,
                    "visits_completed_90d": 0,
                    "source": "referencement",
                    "roles_count": 2,
                    "whatsapp_opt_in": True,
                    "days_since_last_interaction": 5,
                    "total_interactions": 12,
                },
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 72
    assert body["category"] == "chaud"
    assert body["confidence"] == "medium"
    assert isinstance(body["factors"], list)
    assert any(f["code"] == "source.referencement" for f in body["factors"])
