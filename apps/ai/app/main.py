from fastapi import FastAPI
from pydantic import BaseModel

from app.scoring.contacts_scoring import (
    ScoreContactRequest,
    ScoringResult,
    compute_score,
)

app = FastAPI(title="Civora AI", version="0.0.1")


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/score/contact", response_model=ScoringResult)
async def score_contact(req: ScoreContactRequest) -> ScoringResult:
    """Score un contact à partir de ses features.

    À ce stade, l'endpoint réutilise l'heuristique TS (parité stricte).
    Lorsqu'un modèle ML sera entraîné, l'intérieur changera sans casser le
    contrat (mêmes features en entrée, même structure ScoringResult en sortie).
    """
    return compute_score(req.features)
