from fastapi import APIRouter

from app.services import catalog_service

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/playlists")
async def get_playlist_catalog():
    return await catalog_service.get_playlist_catalog()