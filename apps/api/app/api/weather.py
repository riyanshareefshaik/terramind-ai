from fastapi import APIRouter, HTTPException, Query

from app.core.config import get_settings
from app.schemas.weather import WeatherResponse
from app.services.weather import WeatherProviderError, get_current_weather

router = APIRouter(prefix="/api", tags=["weather"])


@router.get("/weather", response_model=WeatherResponse)
async def current_weather(
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
) -> WeatherResponse:
    """Current conditions (LIVE, Open-Meteo). Defaults to the configured city."""
    settings = get_settings()
    use_default = latitude is None or longitude is None
    try:
        return await get_current_weather(
            settings.default_latitude if use_default else latitude,
            settings.default_longitude if use_default else longitude,
            name=settings.default_location_name if use_default else None,
        )
    except WeatherProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Weather data unavailable: {exc}") from exc
