"""Runtime configuration, read from environment variables.

Every setting has a sensible local-development default so the API starts
with no configuration at all. See ``apps/api/.env.example``.
"""

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "TerraMind AI"
    version: str = "0.1.0"
    cors_origins: list[str] = field(default_factory=list)
    default_latitude: float = 17.3850
    default_longitude: float = 78.4867
    default_location_name: str = "Hyderabad"
    twin_provider: str = "demo"
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_cache_seconds: int = 300


@lru_cache
def get_settings() -> Settings:
    env = os.environ.get
    return Settings(
        cors_origins=_csv(
            env("TERRAMIND_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        ),
        default_latitude=float(env("TERRAMIND_DEFAULT_LATITUDE", "17.3850")),
        default_longitude=float(env("TERRAMIND_DEFAULT_LONGITUDE", "78.4867")),
        default_location_name=env("TERRAMIND_DEFAULT_LOCATION_NAME", "Hyderabad"),
        twin_provider=env("TERRAMIND_TWIN_PROVIDER", "demo"),
        open_meteo_url=env("TERRAMIND_OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast"),
        weather_cache_seconds=int(env("TERRAMIND_WEATHER_CACHE_SECONDS", "300")),
    )
