from fastapi import APIRouter

from app.models import SignalSpecResolveRequest
from app.services import catalog_service, signal_spec_service

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/playlists")
async def get_playlist_catalog():
    return await catalog_service.get_playlist_catalog()


@router.get("/signal-specs")
async def get_signal_specs():
    return await signal_spec_service.list_signal_specs()


@router.post("/signal-specs/resolve")
async def resolve_signal_spec(body: SignalSpecResolveRequest):
    return await signal_spec_service.preview_signal_spec(body)
