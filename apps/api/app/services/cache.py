import time
from typing import Generic, TypeVar

T = TypeVar("T")


class TTLCache(Generic[T]):
    """Tiny in-memory cache with per-entry expiry and a size cap."""

    def __init__(self, max_entries: int = 512) -> None:
        self._entries: dict[str, tuple[float, T]] = {}
        self._max = max_entries

    def get(self, key: str) -> T | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        expires, value = entry
        if time.monotonic() > expires:
            self._entries.pop(key, None)
            return None
        return value

    def set(self, key: str, value: T, ttl_seconds: float) -> None:
        if len(self._entries) >= self._max:
            self._entries.pop(next(iter(self._entries)))
        self._entries[key] = (time.monotonic() + ttl_seconds, value)
