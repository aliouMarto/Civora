from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.scoring.contacts_scoring import (
    ScoreContactRequest,
    ScoringResult,
    compute_score,
)
from app.scoring.biens_scoring import (
    BienFeatures,
    BienMarketContext,
    BienScoreBreakdown,
    compute_bien_score,
)

app = FastAPI(title="Civora AI", version="0.0.1")


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


# ─── Contacts ────────────────────────────────────────────────────────────────


@app.post("/score/contact", response_model=ScoringResult)
async def score_contact(req: ScoreContactRequest) -> ScoringResult:
    """Score un contact à partir de ses features (parité TS)."""
    return compute_score(req.features)


# ─── Biens (Lot 1 · Module 2 · Étape 3) ──────────────────────────────────────


class ScoreBienRequest(BaseModel):
    agence_id: str
    bien_id: str
    features: BienFeatures = Field(default_factory=lambda: BienFeatures())  # type: ignore[arg-type]
    market_context: BienMarketContext


@app.post("/score/bien")
async def score_bien(req: ScoreBienRequest) -> BienScoreBreakdown:
    """Score multi-dimensionnel d'un bien (parité TS stricte).

    L'API TypeScript appelle cet endpoint avec timeout 5s ; en cas d'échec
    elle bascule sur sa propre implémentation locale (apps/api/src/_core/biens/
    scoring/scoring-formula.ts). Garder ce contrat stable.
    """
    return compute_bien_score(req.features, req.market_context)


class PortfolioInsightsRequest(BaseModel):
    agence_id: str
    biens_summary: list[dict] = Field(default_factory=list)
    market: dict = Field(default_factory=dict)


class PortfolioInsight(BaseModel):
    type: str
    severity: str
    titre: str
    message: str
    data: dict


@app.post("/insights/portfolio")
async def insights_portfolio(req: PortfolioInsightsRequest) -> dict:
    """Stub Python — les insights sont actuellement générés côté NestJS.

    Cet endpoint existe pour stabiliser le contrat HTTP. Quand on entraînera
    un modèle ML pour détecter des patterns plus sophistiqués (anomalies
    saisonnières, corrélations cross-modules), l'implémentation arrivera ici.
    """
    return {"insights": [], "engine": "stub-v1", "agence_id": req.agence_id}
