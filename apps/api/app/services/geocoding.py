"""Place search and reverse geocoding via Nominatim (OpenStreetMap).

Nominatim's usage policy allows at most one request per second and requires
an identifying User-Agent; both are enforced here, and results are cached.
"""

import asyncio
import time

import httpx

from app.core.config import get_settings
from app.core.http import get_client
from app.schemas.places import AreaName, Place, PlaceSearchResponse
from app.services.cache import TTLCache


class GeocodingError(Exception):
    pass


_search_cache: TTLCache[PlaceSearchResponse] = TTLCache(1024)
_reverse_cache: TTLCache[AreaName] = TTLCache(1024)
_lock = asyncio.Lock()
_last_request = 0.0
CACHE_SECONDS = 24 * 3600


async def _get(path: str, params: dict) -> object:
    global _last_request
    async with _lock:
        wait = 1.0 - (time.monotonic() - _last_request)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            response = await get_client().get(
                f"{get_settings().nominatim_url}{path}",
                params={**params, "format": "jsonv2", "accept-language": "en"},
            )
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise GeocodingError(f"Place lookup failed: {exc}") from exc
        finally:
            _last_request = time.monotonic()


def _context(address: dict, name: str) -> str:
    parts = []
    for key in ("suburb", "city_district", "city", "town", "village", "county", "state_district", "state"):
        value = address.get(key)
        if value and value != name and value not in parts:
            parts.append(value)
    return ", ".join(parts[:3])


def parse_search(query: str, payload: list[dict]) -> PlaceSearchResponse:
    places = []
    for item in payload:
        address = item.get("address", {})
        name = item.get("name") or item.get("display_name", "").split(",")[0]
        bbox = item.get("boundingbox")
        places.append(
            Place(
                id=f"{item.get('osm_type', 'x')}/{item.get('osm_id', item.get('place_id'))}",
                name=name,
                context=_context(address, name),
                kind=(item.get("addresstype") or item.get("type") or "place").replace("_", " "),
                latitude=float(item["lat"]),
                longitude=float(item["lon"]),
                bbox=(float(bbox[0]), float(bbox[2]), float(bbox[1]), float(bbox[3])) if bbox else None,
            )
        )
    return PlaceSearchResponse(query=query, places=places)


def parse_reverse(latitude: float, longitude: float, payload: dict) -> AreaName:
    address = payload.get("address", {}) if isinstance(payload, dict) else {}
    locality = address.get("suburb") or address.get("neighbourhood") or address.get("village")
    city = address.get("city") or address.get("town") or address.get("county")
    return AreaName(
        latitude=latitude,
        longitude=longitude,
        name=locality or city or address.get("state_district") or address.get("state"),
        locality=locality,
        city=city,
        district=address.get("state_district"),
        state=address.get("state"),
    )


async def search_places(query: str) -> PlaceSearchResponse:
    key = query.strip().lower()
    if (cached := _search_cache.get(key)) is not None:
        return cached
    payload = await _get(
        "/search", {"q": query, "countrycodes": "in", "limit": 8, "addressdetails": 1}
    )
    result = parse_search(query, payload if isinstance(payload, list) else [])
    _search_cache.set(key, result, CACHE_SECONDS)
    return result


async def reverse_geocode(latitude: float, longitude: float) -> AreaName:
    key = f"{latitude:.3f},{longitude:.3f}"
    if (cached := _reverse_cache.get(key)) is not None:
        return cached
    payload = await _get(
        "/reverse", {"lat": latitude, "lon": longitude, "zoom": 14, "addressdetails": 1}
    )
    result = parse_reverse(latitude, longitude, payload)
    _reverse_cache.set(key, result, CACHE_SECONDS)
    return result
