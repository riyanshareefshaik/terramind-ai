from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import JSONResponse

from app.services.osm_tiles import TILE_ZOOM, TileUnavailable, get_tile

router = APIRouter(prefix="/api/tiles", tags=["buildings"])


@router.get("/{z}/{x}/{y}")
async def tile(
    z: int = Path(ge=TILE_ZOOM, le=TILE_ZOOM, description=f"Only zoom {TILE_ZOOM} is served."),
    x: int = Path(ge=0),
    y: int = Path(ge=0),
) -> JSONResponse:
    """OpenStreetMap buildings (with heights) and key places for one map tile."""
    if x >= 2**z or y >= 2**z:
        raise HTTPException(status_code=404, detail="Tile out of range")
    try:
        data = await get_tile(z, x, y)
    except TileUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail="Building data is busy; retry shortly.",
            headers={"Retry-After": "20"},
        ) from exc
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=86400"})
