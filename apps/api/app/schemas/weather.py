from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import DataSource


class WeatherLocation(BaseModel):
    latitude: float
    longitude: float
    name: str | None = None
    elevation_m: float | None = None
    timezone: str | None = None


class CurrentWeather(BaseModel):
    observed_at: datetime | None
    temperature_c: float | None
    apparent_temperature_c: float | None
    humidity_pct: float | None
    wind_speed_kmh: float | None
    wind_direction_deg: float | None
    precipitation_mm: float | None
    cloud_cover_pct: float | None
    weather_code: int | None
    condition: str
    is_day: bool | None


class WeatherResponse(BaseModel):
    location: WeatherLocation
    current: CurrentWeather
    data_source: DataSource
