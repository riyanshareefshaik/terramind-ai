"""Alerts derived from the real 24-hour forecast and air quality.

Thresholds follow India Meteorological Department (IMD) rainfall categories
and CPCB National AQI bands. These are TerraMind's own threshold checks on
forecast data, not official IMD warnings.
"""

from app.schemas.air_quality import AirQualityResponse
from app.schemas.alerts import Alert
from app.schemas.weather import WeatherResponse

HEAVY_RAIN_24H_MM = 64.5  # IMD "heavy rain"
VERY_HEAVY_RAIN_24H_MM = 115.6  # IMD "very heavy rain"
INTENSE_RAIN_1H_MM = 15.0
HEAT_WARNING_C = 40.0
HEAT_SEVERE_C = 45.0
FEELS_LIKE_WARNING_C = 42.0
GUST_WARNING_KMH = 50.0
GUST_SEVERE_KMH = 75.0
THUNDERSTORM_CODES = {95, 96, 99}


def weather_alerts(weather: WeatherResponse) -> list[Alert]:
    hours = weather.hourly
    alerts: list[Alert] = []
    if not hours:
        return alerts

    def first(predicate):
        return next((h for h in hours if predicate(h)), None)

    rain_total = sum(h.precipitation_mm or 0 for h in hours)
    if rain_total >= HEAVY_RAIN_24H_MM:
        severe = rain_total >= VERY_HEAVY_RAIN_24H_MM
        alerts.append(
            Alert(
                id="rain-24h",
                severity="severe" if severe else "warning",
                category="rain",
                title="Very heavy rain expected" if severe else "Heavy rain expected",
                message=f"{rain_total:.0f} mm forecast over the next 24 hours. Watch for waterlogging in low-lying areas.",
                starts_at=first(lambda h: (h.precipitation_mm or 0) > 0).time,
            )
        )
    elif (burst := first(lambda h: (h.precipitation_mm or 0) >= INTENSE_RAIN_1H_MM)) is not None:
        alerts.append(
            Alert(
                id="rain-intense",
                severity="advisory",
                category="rain",
                title="Intense rain spell",
                message=f"Up to {burst.precipitation_mm:.0f} mm in one hour forecast.",
                starts_at=burst.time,
            )
        )

    if (storm := first(lambda h: h.weather_code in THUNDERSTORM_CODES)) is not None:
        alerts.append(
            Alert(
                id="thunderstorm",
                severity="warning",
                category="storm",
                title="Thunderstorm forecast",
                message="Thunderstorm conditions forecast. Avoid open areas and tall isolated structures.",
                starts_at=storm.time,
            )
        )

    peak = max(hours, key=lambda h: h.temperature_c if h.temperature_c is not None else -99)
    peak_feel = max(hours, key=lambda h: h.apparent_temperature_c if h.apparent_temperature_c is not None else -99)
    if peak.temperature_c is not None and peak.temperature_c >= HEAT_WARNING_C:
        severe = peak.temperature_c >= HEAT_SEVERE_C
        alerts.append(
            Alert(
                id="heat",
                severity="severe" if severe else "warning",
                category="heat",
                title="Extreme heat" if severe else "High temperature",
                message=f"Temperature forecast to reach {peak.temperature_c:.0f} °C.",
                starts_at=peak.time,
            )
        )
    elif peak_feel.apparent_temperature_c is not None and peak_feel.apparent_temperature_c >= FEELS_LIKE_WARNING_C:
        alerts.append(
            Alert(
                id="heat-stress",
                severity="advisory",
                category="heat",
                title="High heat stress",
                message=f"Feels-like temperature forecast to reach {peak_feel.apparent_temperature_c:.0f} °C.",
                starts_at=peak_feel.time,
            )
        )

    gust = max(hours, key=lambda h: h.wind_gusts_kmh or 0)
    if (gust.wind_gusts_kmh or 0) >= GUST_WARNING_KMH:
        alerts.append(
            Alert(
                id="wind",
                severity="severe" if gust.wind_gusts_kmh >= GUST_SEVERE_KMH else "warning",
                category="wind",
                title="Strong wind gusts",
                message=f"Gusts up to {gust.wind_gusts_kmh:.0f} km/h forecast.",
                starts_at=gust.time,
            )
        )
    return alerts


def air_alerts(air: AirQualityResponse) -> list[Alert]:
    if air.aqi is None or air.aqi <= 200:
        return []
    severity = "severe" if air.aqi > 300 else "warning"
    return [
        Alert(
            id="air",
            severity=severity,
            category="air",
            title=f"{air.category} air quality",
            message=f"AQI {air.aqi}, mainly {air.dominant_pollutant}. Limit prolonged outdoor exertion.",
            starts_at=air.observed_at,
        )
    ]


SEVERITY_ORDER = {"severe": 0, "warning": 1, "advisory": 2}


def sort_alerts(alerts: list[Alert]) -> list[Alert]:
    return sorted(alerts, key=lambda a: SEVERITY_ORDER[a.severity])
