"""Current-weather lookups via Open-Meteo (https://open-meteo.com, no API key)."""

import time
from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import get_settings
from app.schemas.common import DataSource, Provenance
from app.schemas.weather import CurrentWeather, WeatherLocation, WeatherResponse

# WMO weather interpretation codes, as documented by Open-Meteo.
WMO_CONDITIONS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}

CURRENT_FIELDS = (
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "precipitation",
    "cloud_cover",
    "weather_code",
    "is_day",
)


class WeatherProviderError(Exception):
    """Raised when the upstream weather provider cannot be reached or parsed."""


_cache: dict[tuple[float, float], tuple[float, WeatherResponse]] = {}


def describe_weather_code(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return WMO_CONDITIONS.get(code, f"Unknown (WMO {code})")


def _parse_observed_at(raw: str | None, utc_offset_seconds: int) -> datetime | None:
    if not raw:
        return None
    # With timezone=auto, Open-Meteo returns naive local time plus the UTC offset.
    observed = datetime.fromisoformat(raw)
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=timezone(timedelta(seconds=utc_offset_seconds)))
    return observed.astimezone(timezone.utc)


def parse_open_meteo(payload: dict, name: str | None) -> WeatherResponse:
    try:
        current = payload["current"]
        code = current.get("weather_code")
        is_day = current.get("is_day")
        return WeatherResponse(
            location=WeatherLocation(
                latitude=payload["latitude"],
                longitude=payload["longitude"],
                name=name,
                elevation_m=payload.get("elevation"),
                timezone=payload.get("timezone"),
            ),
            current=CurrentWeather(
                observed_at=_parse_observed_at(
                    current.get("time"), int(payload.get("utc_offset_seconds", 0))
                ),
                temperature_c=current.get("temperature_2m"),
                apparent_temperature_c=current.get("apparent_temperature"),
                humidity_pct=current.get("relative_humidity_2m"),
                wind_speed_kmh=current.get("wind_speed_10m"),
                wind_direction_deg=current.get("wind_direction_10m"),
                precipitation_mm=current.get("precipitation"),
                cloud_cover_pct=current.get("cloud_cover"),
                weather_code=code,
                condition=describe_weather_code(code),
                is_day=None if is_day is None else bool(is_day),
            ),
            data_source=DataSource(
                provenance=Provenance.LIVE,
                source="Open-Meteo",
                description="Modelled current conditions from the Open-Meteo forecast API.",
                updated_at=datetime.now(timezone.utc),
            ),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise WeatherProviderError(f"Unexpected Open-Meteo response: {exc}") from exc


async def get_current_weather(
    latitude: float, longitude: float, name: str | None = None
) -> WeatherResponse:
    settings = get_settings()
    key = (round(latitude, 3), round(longitude, 3))
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < settings.weather_cache_seconds:
        return cached[1]

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(CURRENT_FIELDS),
        "timezone": "auto",
        "wind_speed_unit": "kmh",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(settings.open_meteo_url, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherProviderError(f"Open-Meteo request failed: {exc}") from exc

    result = parse_open_meteo(payload, name)
    _cache[key] = (time.monotonic(), result)
    return result
