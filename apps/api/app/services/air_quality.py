"""Air quality via the Open-Meteo air-quality API (CAMS model, free, no key).

Values are model estimates, not station measurements, so they carry
``Provenance.ESTIMATED``. The index is India's National AQI (CPCB), computed
from the same averaging windows the CPCB uses (24 h, or 8 h for O3 and CO).
"""

from datetime import datetime, timezone

import httpx

from app.core.config import get_settings
from app.core.http import get_client
from app.schemas.air_quality import AirQualityResponse, Pollutant
from app.schemas.common import DataSource, Provenance
from app.services.cache import TTLCache
from app.services.weather import local_to_utc

# CPCB National AQI breakpoints: (concentration upper bound, AQI upper bound).
# Concentrations in µg/m³, except CO in mg/m³.
_AQI_BANDS = (50, 100, 200, 300, 400, 500)
BREAKPOINTS: dict[str, tuple[float, ...]] = {
    "pm2_5": (30, 60, 90, 120, 250, 380),
    "pm10": (50, 100, 250, 350, 430, 510),
    "nitrogen_dioxide": (40, 80, 180, 280, 400, 520),
    "ozone": (50, 100, 168, 208, 748, 1000),
    "sulphur_dioxide": (40, 80, 380, 800, 1600, 2100),
    "carbon_monoxide": (1.0, 2.0, 10, 17, 34, 46),
}

POLLUTANTS: tuple[tuple[str, str, str, int], ...] = (
    # (Open-Meteo field, label, display unit, averaging hours)
    ("pm2_5", "PM2.5", "µg/m³", 24),
    ("pm10", "PM10", "µg/m³", 24),
    ("nitrogen_dioxide", "NO₂", "µg/m³", 24),
    ("ozone", "O₃", "µg/m³", 8),
    ("sulphur_dioxide", "SO₂", "µg/m³", 24),
    ("carbon_monoxide", "CO", "mg/m³", 8),
)

CATEGORIES = ("Good", "Satisfactory", "Moderately polluted", "Poor", "Very poor", "Severe")


class AirQualityProviderError(Exception):
    pass


_cache: TTLCache[AirQualityResponse] = TTLCache()


def sub_index(pollutant: str, concentration: float) -> int:
    """Linear interpolation within the CPCB breakpoint band."""
    bounds = BREAKPOINTS[pollutant]
    low_c, low_i = 0.0, 0
    for high_c, high_i in zip(bounds, _AQI_BANDS):
        if concentration <= high_c:
            return round(low_i + (concentration - low_c) * (high_i - low_i) / (high_c - low_c))
        low_c, low_i = high_c, high_i
    return 500


def category(aqi: int) -> str:
    for upper, name in zip(_AQI_BANDS, CATEGORIES):
        if aqi <= upper:
            return name
    return CATEGORIES[-1]


def parse_air_quality(payload: dict, now: datetime | None = None) -> AirQualityResponse:
    try:
        offset = int(payload.get("utc_offset_seconds", 0))
        hourly = payload["hourly"]
        times = [local_to_utc(t, offset) for t in hourly["time"]]
        now = now or datetime.now(timezone.utc)
        # The latest hour that has already happened.
        past = [i for i, t in enumerate(times) if t <= now]
        if not past:
            raise ValueError("no past hours in response")
        latest = past[-1]

        pollutants: list[Pollutant] = []
        for field, label, unit, hours in POLLUTANTS:
            scale = 0.001 if field == "carbon_monoxide" else 1.0  # µg/m³ → mg/m³
            series = hourly.get(field) or []
            window = [
                series[i] * scale
                for i in range(max(0, latest - hours + 1), latest + 1)
                if i < len(series) and series[i] is not None
            ]
            current = series[latest] * scale if latest < len(series) and series[latest] is not None else None
            # Require most of the window, as the CPCB does, before computing an index.
            average = sum(window) / len(window) if len(window) >= hours * 0.75 else None
            pollutants.append(
                Pollutant(
                    id=field,
                    label=label,
                    unit=unit,
                    current=None if current is None else round(current, 2 if scale != 1 else 1),
                    average=None if average is None else round(average, 2 if scale != 1 else 1),
                    averaging_hours=hours,
                    sub_index=None if average is None else sub_index(field, average),
                )
            )

        indexed = [p for p in pollutants if p.sub_index is not None]
        has_pm = any(p.id in ("pm2_5", "pm10") for p in indexed)
        aqi = max((p.sub_index for p in indexed), default=None) if has_pm and len(indexed) >= 3 else None
        dominant = max(indexed, key=lambda p: p.sub_index).label if aqi is not None else None

        return AirQualityResponse(
            latitude=payload["latitude"],
            longitude=payload["longitude"],
            observed_at=times[latest],
            aqi=aqi,
            category=category(aqi) if aqi is not None else None,
            dominant_pollutant=dominant,
            pollutants=pollutants,
            data_source=DataSource(
                provenance=Provenance.ESTIMATED,
                source="Open-Meteo (CAMS)",
                description="Modelled concentrations; India National AQI computed by TerraMind.",
                updated_at=datetime.now(timezone.utc),
            ),
        )
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AirQualityProviderError(f"Unexpected air-quality response: {exc}") from exc


async def get_air_quality(latitude: float, longitude: float) -> AirQualityResponse:
    settings = get_settings()
    key = f"{latitude:.2f},{longitude:.2f}"
    if (cached := _cache.get(key)) is not None:
        return cached
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(field for field, *_ in POLLUTANTS),
        "past_days": 1,
        "forecast_days": 1,
        "timezone": "auto",
    }
    try:
        response = await get_client().get(settings.air_quality_url, params=params)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise AirQualityProviderError(f"Air-quality request failed: {exc}") from exc
    result = parse_air_quality(payload)
    _cache.set(key, result, settings.weather_cache_seconds)
    return result


