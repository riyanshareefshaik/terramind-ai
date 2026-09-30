from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import DataSource


class WeatherLocation(BaseModel):
    latitude: float
    longitude: float
    elevation_m: float | None = None
    timezone: str | None = None


class CurrentWeather(BaseModel):
    observed_at: datetime | None
    temperature_c: float | None
    apparent_temperature_c: float | None
    humidity_pct: float | None
    wind_speed_kmh: float | None
    wind_gusts_kmh: float | None
    wind_direction_deg: float | None
    precipitation_mm: float | None
    cloud_cover_pct: float | None
    pressure_hpa: float | None
    uv_index: float | None
    weather_code: int | None
    condition: str
    is_day: bool | None


class HourlyForecast(BaseModel):
    time: datetime
    temperature_c: float | None
    apparent_temperature_c: float | None
    precipitation_mm: float | None
    precipitation_probability_pct: float | None
    wind_gusts_kmh: float | None
    weather_code: int | None


class DailySummary(BaseModel):
    temperature_max_c: float | None
    temperature_min_c: float | None
    sunrise: datetime | None
    sunset: datetime | None


class WeatherResponse(BaseModel):
    location: WeatherLocation
    current: CurrentWeather
    today: DailySummary
    hourly: list[HourlyForecast]
    data_source: DataSource
