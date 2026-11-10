from fastapi import APIRouter

from app.services import catalog_service, signal_spec_service
from app.api_schemas import PlaylistCatalogResponse, SignalSpecCatalogResponse

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/playlists", response_model=PlaylistCatalogResponse)
async def get_playlist_catalog():
    return await catalog_service.get_playlist_catalog()


@router.get("/signal-specs", response_model=SignalSpecCatalogResponse)
async def get_signal_specs():
    return await signal_spec_service.list_signal_specs()
