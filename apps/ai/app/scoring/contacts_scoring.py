"""
Scoring contacts — réimplémentation Python de l'heuristique TS.

Doit rester STRICTEMENT en parité avec scoring-formula.ts (apps/api). Toute
modification doit être synchronisée des deux côtés et couverte par le test de
parité TS ↔ Python (apps/api/src/_core/contacts/scoring/tests/parity.spec.ts).

Une fois assez de données disponibles, l'intérieur sera remplacé par un
modèle ML — le contrat d'entrée/sortie ne change pas.
"""

from __future__ import annotations

from typing import Literal, TypedDict

from pydantic import BaseModel, Field

ScoreCategory = Literal["froid", "tiede", "chaud"]
ScoreConfidence = Literal["low", "medium", "high"]
ContactSourceFeature = Literal[
    "referencement",
    "reseau",
    "site_web",
    "portail",
    "walk_in",
    "import",
    "autre",
]

SOURCE_WEIGHTS: dict[ContactSourceFeature, int] = {
    "referencement": 15,
    "reseau": 12,
    "site_web": 8,
    "portail": 6,
    "walk_in": 5,
    "import": 0,
    "autre": 0,
}

CAP = {
    "completeness": 20,
    "engagement": 30,
    "source": 15,
    "roles": 10,
    "whatsapp": 10,
}

PENALTY = {
    "inactive_180": -5,
    "inactive_365": -10,
}


class ScoringFeatures(BaseModel):
    """Features extraites côté API NestJS, normalisées."""

    has_email: bool
    has_valid_phone: bool
    has_address: bool
    has_tag_or_segment: bool
    interactions_outgoing_90d: int = Field(ge=0)
    interactions_incoming_90d: int = Field(ge=0)
    visits_completed_90d: int = Field(ge=0)
    source: ContactSourceFeature | None = None
    roles_count: int = Field(ge=0)
    whatsapp_opt_in: bool
    days_since_last_interaction: int | None = None
    total_interactions: int = Field(ge=0)


class ScoringFactor(BaseModel):
    code: str
    label: str
    contribution: int
    category: Literal["completeness", "engagement", "source", "roles", "whatsapp", "penalty"]


class ScoringResult(BaseModel):
    score: int
    category: ScoreCategory
    confidence: ScoreConfidence
    factors: list[ScoringFactor]


class ScoreContactRequest(BaseModel):
    """Payload de requête. agence_id et contact_id sont passés mais non utilisés
    par l'heuristique (ils seront utiles pour le ML futur : cohorte, historique)."""

    agence_id: str | None = None
    contact_id: str | None = None
    features: ScoringFeatures


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def _categorize(score: int) -> ScoreCategory:
    if score >= 70:
        return "chaud"
    if score >= 40:
        return "tiede"
    return "froid"


def _confidence(total: int) -> ScoreConfidence:
    if total < 5:
        return "low"
    if total < 20:
        return "medium"
    return "high"


def compute_score(f: ScoringFeatures) -> ScoringResult:
    """Heuristique pure. Doit produire un résultat identique à scoring-formula.ts."""
    factors: list[ScoringFactor] = []

    # 1. Complétude du profil
    completeness = 0
    if f.has_email:
        completeness += 5
        factors.append(
            ScoringFactor(
                code="profile.email",
                label="Email renseigné",
                contribution=5,
                category="completeness",
            )
        )
    if f.has_valid_phone:
        completeness += 5
        factors.append(
            ScoringFactor(
                code="profile.phone",
                label="Téléphone E.164 valide",
                contribution=5,
                category="completeness",
            )
        )
    if f.has_address:
        completeness += 5
        factors.append(
            ScoringFactor(
                code="profile.address",
                label="Ville + commune renseignées",
                contribution=5,
                category="completeness",
            )
        )
    if f.has_tag_or_segment:
        completeness += 5
        factors.append(
            ScoringFactor(
                code="profile.tag",
                label="Au moins un tag ou segment",
                contribution=5,
                category="completeness",
            )
        )
    completeness = min(completeness, CAP["completeness"])

    # 2. Engagement récent (90j)
    outgoing_pts = f.interactions_outgoing_90d * 3
    incoming_pts = f.interactions_incoming_90d * 5
    visits_pts = f.visits_completed_90d * 10
    engagement_raw = outgoing_pts + incoming_pts + visits_pts
    engagement = min(engagement_raw, CAP["engagement"])

    if outgoing_pts > 0:
        factors.append(
            ScoringFactor(
                code="engagement.outgoing_90d",
                label=f"{f.interactions_outgoing_90d} interaction(s) sortante(s) 90j",
                contribution=outgoing_pts,
                category="engagement",
            )
        )
    if incoming_pts > 0:
        factors.append(
            ScoringFactor(
                code="engagement.incoming_90d",
                label=f"{f.interactions_incoming_90d} interaction(s) entrante(s) 90j",
                contribution=incoming_pts,
                category="engagement",
            )
        )
    if visits_pts > 0:
        factors.append(
            ScoringFactor(
                code="engagement.visits_90d",
                label=f"{f.visits_completed_90d} visite(s) réalisée(s) 90j",
                contribution=visits_pts,
                category="engagement",
            )
        )
    if engagement_raw > CAP["engagement"]:
        factors.append(
            ScoringFactor(
                code="engagement.capped",
                label=f"Plafond engagement atteint ({CAP['engagement']})",
                contribution=-(engagement_raw - CAP["engagement"]),
                category="engagement",
            )
        )

    # 3. Source d'acquisition
    source = 0
    if f.source is not None and f.source in SOURCE_WEIGHTS:
        source = SOURCE_WEIGHTS[f.source]
        if source > 0:
            factors.append(
                ScoringFactor(
                    code=f"source.{f.source}",
                    label=f"Source : {f.source}",
                    contribution=source,
                    category="source",
                )
            )

    # 4. Rôles cumulés
    roles = 0
    if f.roles_count > 1:
        roles = min((f.roles_count - 1) * 5, CAP["roles"])
        factors.append(
            ScoringFactor(
                code="roles.cumulated",
                label=f"{f.roles_count} rôles cumulés",
                contribution=roles,
                category="roles",
            )
        )

    # 5. WhatsApp opt-in
    whatsapp = 0
    if f.whatsapp_opt_in:
        whatsapp = CAP["whatsapp"]
        factors.append(
            ScoringFactor(
                code="whatsapp.opt_in",
                label="WhatsApp opt-in confirmé",
                contribution=whatsapp,
                category="whatsapp",
            )
        )

    # 6. Pénalités inactivité
    penalty = 0
    if f.days_since_last_interaction is not None:
        d = f.days_since_last_interaction
        if d > 365:
            penalty = PENALTY["inactive_365"]
            factors.append(
                ScoringFactor(
                    code="penalty.inactive_365",
                    label="Aucune interaction depuis > 365 jours",
                    contribution=penalty,
                    category="penalty",
                )
            )
        elif d > 180:
            penalty = PENALTY["inactive_180"]
            factors.append(
                ScoringFactor(
                    code="penalty.inactive_180",
                    label="Aucune interaction depuis > 180 jours",
                    contribution=penalty,
                    category="penalty",
                )
            )

    raw = completeness + engagement + source + roles + whatsapp + penalty
    score = _clamp(raw, 0, 100)

    return ScoringResult(
        score=score,
        category=_categorize(score),
        confidence=_confidence(f.total_interactions),
        factors=factors,
    )
