from functools import lru_cache

from app.core.config import get_settings
from app.services.twin.base import TwinDataProvider
from app.services.twin.demo import DemoTwinProvider

__all__ = ["TwinDataProvider", "get_twin_provider"]


@lru_cache
def get_twin_provider() -> TwinDataProvider:
    settings = get_settings()
    if settings.twin_provider == "demo":
        return DemoTwinProvider(settings.default_latitude, settings.default_longitude)
    raise ValueError(f"Unknown TERRAMIND_TWIN_PROVIDER: {settings.twin_provider!r}")
