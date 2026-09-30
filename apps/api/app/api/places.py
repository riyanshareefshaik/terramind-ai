from fastapi import APIRouter, HTTPException, Query

from app.schemas.places import AreaName, PlaceSearchResponse
from app.services.geocoding import GeocodingError, reverse_geocode, search_places

router = APIRouter(prefix="/api/places", tags=["places"])


@router.get("/search", response_model=PlaceSearchResponse)
async def search(q: str = Query(min_length=2, max_length=120)) -> PlaceSearchResponse:
    """Search cities, localities, streets and landmarks in India."""
    try:
        return await search_places(q)
    except GeocodingError as exc:
        raise HTTPException(status_code=502, detail="Place search is temporarily unavailable.") from exc


@router.get("/reverse", response_model=AreaName)
async def reverse(
    latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180)
) -> AreaName:
    """Name of the locality and city at a point."""
    try:
        return await reverse_geocode(latitude, longitude)
    except GeocodingError as exc:
        raise HTTPException(status_code=502, detail="Area lookup is temporarily unavailable.") from exc
