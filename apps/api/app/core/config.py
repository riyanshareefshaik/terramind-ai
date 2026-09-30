"""Runtime configuration, read from environment variables.

Every setting has a working default so the API starts with no configuration.
See ``apps/api/.env.example``.
"""

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "TerraMind AI"
    version: str = "0.2.0"
    cors_origins: list[str] = field(default_factory=list)
    default_latitude: float = 16.5062
    default_longitude: float = 80.6480
    default_location_name: str = "Vijayawada"
    user_agent: str = "TerraMindAI/0.2 (+https://github.com/riyanshareefshaik/terramind-ai)"
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    air_quality_url: str = "https://air-quality-api.open-meteo.com/v1/air-quality"
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    overpass_urls: list[str] = field(default_factory=list)
    cache_dir: Path = REPO_ROOT / "datasets" / "cache"
    weather_cache_seconds: int = 600
    tile_cache_days: int = 14


@lru_cache
def get_settings() -> Settings:
    env = os.environ.get
    return Settings(
        cors_origins=_csv(
            env("TERRAMIND_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        ),
        default_latitude=float(env("TERRAMIND_DEFAULT_LATITUDE", "16.5062")),
        default_longitude=float(env("TERRAMIND_DEFAULT_LONGITUDE", "80.6480")),
        default_location_name=env("TERRAMIND_DEFAULT_LOCATION_NAME", "Vijayawada"),
        open_meteo_url=env("TERRAMIND_OPEN_METEO_URL", Settings.open_meteo_url),
        air_quality_url=env("TERRAMIND_AIR_QUALITY_URL", Settings.air_quality_url),
        nominatim_url=env("TERRAMIND_NOMINATIM_URL", Settings.nominatim_url).rstrip("/"),
        overpass_urls=_csv(
            env(
                "TERRAMIND_OVERPASS_URLS",
                "https://overpass-api.de/api/interpreter,"
                "https://overpass.private.coffee/api/interpreter,"
                "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
            )
        ),
        cache_dir=Path(env("TERRAMIND_CACHE_DIR", str(Settings.cache_dir))),
        weather_cache_seconds=int(env("TERRAMIND_WEATHER_CACHE_SECONDS", "600")),
        tile_cache_days=int(env("TERRAMIND_TILE_CACHE_DAYS", "14")),
    )
