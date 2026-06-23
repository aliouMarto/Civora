from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Civora AI", version="0.0.1")


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
