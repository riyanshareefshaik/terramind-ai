import pytest

from app.core.config import get_settings


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    """Point the tile cache at a temp dir so tests never touch datasets/cache."""
    monkeypatch.setenv("TERRAMIND_CACHE_DIR", str(tmp_path))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
