from fastapi import APIRouter

from app.services import app_settings_service, catalog_service
from app.api_schemas import PlaylistCatalogResponse, PracticeSettings

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/playlists", response_model=PlaylistCatalogResponse)
async def get_playlist_catalog():
    return await catalog_service.get_playlist_catalog()


@router.get("/practice-settings", response_model=PracticeSettings)
async def get_practice_settings():
    """What the practice screen asks for (MCQ set size and order, playlist order), set on /admin."""
    return (await app_settings_service.practice()).model_dump()
