"""Current conditions and 24-hour forecast via Open-Meteo (free, no API key)."""

from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import get_settings
from app.core.http import get_client
from app.schemas.common import DataSource, Provenance
from app.schemas.weather import (
    CurrentWeather,
    DailySummary,
    HourlyForecast,
    WeatherLocation,
    WeatherResponse,
)
from app.services.cache import TTLCache

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
    "wind_gusts_10m",
    "wind_direction_10m",
    "precipitation",
    "cloud_cover",
    "surface_pressure",
    "uv_index",
    "weather_code",
    "is_day",
)
HOURLY_FIELDS = (
    "temperature_2m",
    "apparent_temperature",
    "precipitation",
    "precipitation_probability",
    "wind_gusts_10m",
    "weather_code",
)
DAILY_FIELDS = ("temperature_2m_max", "temperature_2m_min", "sunrise", "sunset")


class WeatherProviderError(Exception):
    """Raised when the upstream weather provider cannot be reached or parsed."""


_cache: TTLCache[WeatherResponse] = TTLCache()


def describe_weather_code(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return WMO_CONDITIONS.get(code, f"Unknown (WMO {code})")


def local_to_utc(raw: str | None, utc_offset_seconds: int) -> datetime | None:
    """Open-Meteo returns naive local times (timezone=auto) plus the UTC offset."""
    if not raw:
        return None
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone(timedelta(seconds=utc_offset_seconds)))
    return parsed.astimezone(timezone.utc)


def _first(values: list | None):
    return values[0] if values else None


def parse_open_meteo(payload: dict) -> WeatherResponse:
    try:
        offset = int(payload.get("utc_offset_seconds", 0))
        current = payload["current"]
        code = current.get("weather_code")
        is_day = current.get("is_day")
        current_time = local_to_utc(current.get("time"), offset)

        hourly_raw = payload.get("hourly", {})
        hourly: list[HourlyForecast] = []
        for i, raw_time in enumerate(hourly_raw.get("time", [])):
            at = local_to_utc(raw_time, offset)
            # Keep the next 24 hours, starting with the current hour.
            if current_time and at < current_time - timedelta(hours=1):
                continue
            hourly.append(
                HourlyForecast(
                    time=at,
                    temperature_c=hourly_raw["temperature_2m"][i],
                    apparent_temperature_c=hourly_raw["apparent_temperature"][i],
                    precipitation_mm=hourly_raw["precipitation"][i],
                    precipitation_probability_pct=hourly_raw["precipitation_probability"][i],
                    wind_gusts_kmh=hourly_raw["wind_gusts_10m"][i],
                    weather_code=hourly_raw["weather_code"][i],
                )
            )
            if len(hourly) == 24:
                break

        daily = payload.get("daily", {})
        return WeatherResponse(
            location=WeatherLocation(
                latitude=payload["latitude"],
                longitude=payload["longitude"],
                elevation_m=payload.get("elevation"),
                timezone=payload.get("timezone"),
            ),
            current=CurrentWeather(
                observed_at=current_time,
                temperature_c=current.get("temperature_2m"),
                apparent_temperature_c=current.get("apparent_temperature"),
                humidity_pct=current.get("relative_humidity_2m"),
                wind_speed_kmh=current.get("wind_speed_10m"),
                wind_gusts_kmh=current.get("wind_gusts_10m"),
                wind_direction_deg=current.get("wind_direction_10m"),
                precipitation_mm=current.get("precipitation"),
                cloud_cover_pct=current.get("cloud_cover"),
                pressure_hpa=current.get("surface_pressure"),
                uv_index=current.get("uv_index"),
                weather_code=code,
                condition=describe_weather_code(code),
                is_day=None if is_day is None else bool(is_day),
            ),
            today=DailySummary(
                temperature_max_c=_first(daily.get("temperature_2m_max")),
                temperature_min_c=_first(daily.get("temperature_2m_min")),
                sunrise=local_to_utc(_first(daily.get("sunrise")), offset),
                sunset=local_to_utc(_first(daily.get("sunset")), offset),
            ),
            hourly=hourly,
            data_source=DataSource(
                provenance=Provenance.LIVE,
                source="Open-Meteo",
                updated_at=datetime.now(timezone.utc),
            ),
        )
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise WeatherProviderError(f"Unexpected weather response: {exc}") from exc


async def get_weather(latitude: float, longitude: float) -> WeatherResponse:
    settings = get_settings()
    key = f"{latitude:.2f},{longitude:.2f}"
    if (cached := _cache.get(key)) is not None:
        return cached

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(CURRENT_FIELDS),
        "hourly": ",".join(HOURLY_FIELDS),
        "daily": ",".join(DAILY_FIELDS),
        "forecast_days": 2,
        "timezone": "auto",
        "wind_speed_unit": "kmh",
    }
    try:
        response = await get_client().get(settings.open_meteo_url, params=params)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherProviderError(f"Weather request failed: {exc}") from exc

    result = parse_open_meteo(payload)
    _cache.set(key, result, settings.weather_cache_seconds)
    return result
