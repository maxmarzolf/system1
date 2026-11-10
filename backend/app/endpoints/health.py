from fastapi import APIRouter
from app.api_schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/api/health", response_model=HealthResponse)
async def health():
    return {"ok": True}
