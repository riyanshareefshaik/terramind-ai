import asyncio

from fastapi import APIRouter, HTTPException, Query

from app.core.config import get_settings
from app.schemas.air_quality import AirQualityResponse
from app.schemas.alerts import AlertsResponse
from app.schemas.weather import WeatherResponse
from app.services.air_quality import AirQualityProviderError, get_air_quality
from app.services.alerts import air_alerts, sort_alerts, weather_alerts
from app.services.weather import WeatherProviderError, get_weather

router = APIRouter(prefix="/api", tags=["environment"])

Latitude = Query(default=None, ge=-90, le=90)
Longitude = Query(default=None, ge=-180, le=180)


def _location(latitude: float | None, longitude: float | None) -> tuple[float, float]:
    settings = get_settings()
    if latitude is None or longitude is None:
        return settings.default_latitude, settings.default_longitude
    return latitude, longitude


@router.get("/weather", response_model=WeatherResponse)
async def weather(latitude: float | None = Latitude, longitude: float | None = Longitude) -> WeatherResponse:
    """Current conditions and the next 24 hours. Defaults to the configured city."""
    try:
        return await get_weather(*_location(latitude, longitude))
    except WeatherProviderError as exc:
        raise HTTPException(status_code=502, detail="Weather data is temporarily unavailable.") from exc


@router.get("/air-quality", response_model=AirQualityResponse)
async def air_quality(latitude: float | None = Latitude, longitude: float | None = Longitude) -> AirQualityResponse:
    """Modelled pollutant concentrations with India's National AQI."""
    try:
        return await get_air_quality(*_location(latitude, longitude))
    except AirQualityProviderError as exc:
        raise HTTPException(status_code=502, detail="Air-quality data is temporarily unavailable.") from exc


@router.get("/alerts", response_model=AlertsResponse)
async def alerts(latitude: float | None = Latitude, longitude: float | None = Longitude) -> AlertsResponse:
    """Threshold alerts computed from the forecast and air quality at a location."""
    lat, lon = _location(latitude, longitude)
    weather_result, air_result = await asyncio.gather(
        get_weather(lat, lon), get_air_quality(lat, lon), return_exceptions=True
    )
    found = []
    failed = []
    if isinstance(weather_result, Exception):
        failed.append("weather")
    else:
        found += weather_alerts(weather_result)
    if isinstance(air_result, Exception):
        failed.append("air_quality")
    else:
        found += air_alerts(air_result)
    return AlertsResponse(latitude=lat, longitude=lon, alerts=sort_alerts(found), sources_failed=failed)
