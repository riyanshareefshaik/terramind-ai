"""OpenStreetMap buildings and places, served as web-mercator tiles.

The frontend streams tiles around the camera, so any area in India (or
anywhere else OSM has buildings) can be explored without preloading. Each tile
is fetched once from the Overpass API and cached on disk.

Buildings are assigned to the tile containing their centroid so a building
that straddles a tile edge is returned exactly once.
"""

import asyncio
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.core.http import get_client

TILE_ZOOM = 15
COORD_DIGITS = 6

PLACE_AMENITIES = {
    "hospital": "health",
    "clinic": "health",
    "doctors": "health",
    "pharmacy": "health",
    "school": "education",
    "college": "education",
    "university": "education",
    "kindergarten": "education",
    "police": "emergency",
    "fire_station": "emergency",
    "bus_station": "transport",
    "townhall": "government",
    "courthouse": "government",
    "post_office": "government",
    "marketplace": "commerce",
    "bank": "commerce",
    "place_of_worship": "worship",
}
PLACE_OTHER = {
    ("railway", "station"): "transport",
    ("aeroway", "aerodrome"): "transport",
    ("tourism", "attraction"): "landmark",
    ("historic", "monument"): "landmark",
    ("leisure", "stadium"): "landmark",
}

# Typical heights (m) when OSM records neither height nor levels. These are
# shown to the user as estimates.
DEFAULT_HEIGHTS = {
    "apartments": 15.0,
    "hotel": 15.0,
    "office": 12.0,
    "commercial": 10.0,
    "retail": 8.0,
    "hospital": 12.0,
    "school": 10.0,
    "college": 12.0,
    "university": 12.0,
    "public": 10.0,
    "government": 10.0,
    "civic": 10.0,
    "industrial": 9.0,
    "warehouse": 9.0,
    "temple": 12.0,
    "mosque": 12.0,
    "church": 12.0,
    "train_station": 10.0,
    "stadium": 15.0,
    "garage": 3.0,
    "garages": 3.0,
    "shed": 3.0,
    "roof": 4.0,
    "carport": 3.0,
    "kiosk": 3.0,
    "hut": 3.0,
    "construction": 5.0,
}
DEFAULT_HEIGHT = 6.5  # typical ground-plus-one house
METRES_PER_LEVEL = 3.2

KIND_BY_BUILDING = {
    **dict.fromkeys(
        ["house", "residential", "apartments", "detached", "semidetached_house", "terrace", "hut", "dormitory", "bungalow"],
        "residential",
    ),
    **dict.fromkeys(["commercial", "retail", "office", "hotel", "supermarket", "kiosk"], "commercial"),
    **dict.fromkeys(["industrial", "warehouse", "factory", "manufacture", "storage_tank"], "industrial"),
    **dict.fromkeys(
        ["school", "college", "university", "hospital", "public", "government", "civic", "train_station", "fire_station", "police", "stadium"],
        "public",
    ),
    **dict.fromkeys(["temple", "mosque", "church", "religious", "shrine", "cathedral", "chapel"], "religious"),
}
KIND_BY_AMENITY = {
    "school": "public", "college": "public", "university": "public", "hospital": "public",
    "clinic": "public", "police": "public", "fire_station": "public", "townhall": "public",
    "place_of_worship": "religious",
}


class TileUnavailable(Exception):
    """Overpass could not serve the tile right now (rate limit, timeout, outage)."""


# -- tile maths -------------------------------------------------------------


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """(south, west, north, east) in degrees for a slippy-map tile."""
    n = 2**z

    def lat(ty: int) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * ty / n))))

    return lat(y + 1), x / n * 360 - 180, lat(y), (x + 1) / n * 360 - 180


def contains(bounds: tuple[float, float, float, float], lat: float, lon: float) -> bool:
    south, west, north, east = bounds
    return south <= lat < north and west <= lon < east


# -- tag interpretation ------------------------------------------------------

_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")


def parse_length(value: str | None) -> float | None:
    """Parse OSM length values like '12', '12 m', '12.5m', "40'" or '12;15'."""
    if not value:
        return None
    first = value.split(";")[0].strip().lower()
    match = _NUMBER.search(first)
    if not match:
        return None
    number = float(match.group())
    if "'" in first or "ft" in first:
        number *= 0.3048
    return number if 0 < number < 1000 else None


def building_height(tags: dict[str, str]) -> tuple[float, str, int | None]:
    """Returns (height_m, source, levels) where source is tagged|levels|estimated."""
    levels_raw = parse_length(tags.get("building:levels"))
    levels = int(round(levels_raw)) if levels_raw else None
    if (height := parse_length(tags.get("height"))) is not None:
        return round(height, 1), "tagged", levels
    if levels:
        roof = parse_length(tags.get("roof:levels")) or 0
        return round((levels + roof * 0.5) * METRES_PER_LEVEL, 1), "levels", levels
    kind = tags.get("building", "yes")
    return DEFAULT_HEIGHTS.get(kind, DEFAULT_HEIGHT), "estimated", None


def building_kind(tags: dict[str, str]) -> str:
    return (
        KIND_BY_BUILDING.get(tags.get("building", ""))
        or KIND_BY_AMENITY.get(tags.get("amenity", ""))
        or ("commercial" if "shop" in tags or "office" in tags else None)
        or "other"
    )


def place_category(tags: dict[str, str]) -> str | None:
    if (category := PLACE_AMENITIES.get(tags.get("amenity", ""))) is not None:
        return category
    for (key, value), category in PLACE_OTHER.items():
        if tags.get(key) == value:
            return category
    return None


# -- geometry ----------------------------------------------------------------

Ring = list[tuple[float, float]]  # (lon, lat)


def _ring(points: list[dict]) -> Ring:
    return [(round(p["lon"], COORD_DIGITS), round(p["lat"], COORD_DIGITS)) for p in points]


def _close(ring: Ring) -> Ring | None:
    if len(ring) < 3:
        return None
    if ring[0] != ring[-1]:
        ring = [*ring, ring[0]]
    return ring if len(ring) >= 4 else None


def assemble_rings(segments: list[Ring]) -> list[Ring]:
    """Join multipolygon member ways that share endpoints into closed rings."""
    pending = [s for s in segments if len(s) >= 2]
    rings: list[Ring] = []
    while pending:
        current = pending.pop(0)
        changed = True
        while current[0] != current[-1] and changed:
            changed = False
            for i, seg in enumerate(pending):
                if seg[0] == current[-1]:
                    current = current + seg[1:]
                elif seg[-1] == current[-1]:
                    current = current + seg[::-1][1:]
                elif seg[-1] == current[0]:
                    current = seg + current[1:]
                elif seg[0] == current[0]:
                    current = seg[::-1] + current[1:]
                else:
                    continue
                pending.pop(i)
                changed = True
                break
        if (closed := _close(current)) is not None:
            rings.append(closed)
    return rings


def ring_centroid(ring: Ring) -> tuple[float, float]:
    """Area-weighted centroid (lon, lat); falls back to the vertex mean."""
    area = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(area) < 1e-14:
        xs, ys = zip(*ring)
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx / (3 * area), cy / (3 * area)


def ring_area_m2(ring: Ring) -> float:
    lat0 = math.radians(ring[0][1])
    kx = 111_320 * math.cos(lat0)
    ky = 110_574
    area = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        area += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky)
    return abs(area) / 2


# -- Overpass ------------------------------------------------------------------


def overpass_query(bounds: tuple[float, float, float, float]) -> str:
    s, w, n, e = (f"{v:.6f}" for v in bounds)
    bbox = f"({s},{w},{n},{e})"
    amenities = "|".join(PLACE_AMENITIES)
    return (
        "[out:json][timeout:60];("
        f'way["building"]{bbox};'
        f'relation["building"]["type"="multipolygon"]{bbox};'
        f'nwr["amenity"~"^({amenities})$"]{bbox};'
        f'nwr["railway"="station"]{bbox};'
        f'nwr["aeroway"="aerodrome"]{bbox};'
        f'nwr["tourism"="attraction"]{bbox};'
        f'nwr["historic"="monument"]{bbox};'
        f'nwr["leisure"="stadium"]{bbox};'
        ");out geom;"
    )


def parse_overpass(payload: dict, z: int, x: int, y: int) -> dict:
    bounds = tile_bounds(z, x, y)
    buildings: list[dict] = []
    places: list[dict] = []
    seen_places: set[str] = set()

    for element in payload.get("elements", []):
        tags: dict[str, str] = element.get("tags") or {}
        kind = element.get("type")
        feature_id = f"{kind}/{element.get('id')}"

        rings: list[Ring] = []
        if kind == "way" and element.get("geometry"):
            if (ring := _close(_ring(element["geometry"]))) is not None:
                rings = [ring]
        elif kind == "relation":
            outer = [
                _ring(m["geometry"])
                for m in element.get("members", [])
                if m.get("role") == "outer" and m.get("geometry")
            ]
            rings = assemble_rings(outer)

        if kind == "node":
            point = (element.get("lon"), element.get("lat"))
        elif rings:
            largest = max(rings, key=ring_area_m2)
            point = ring_centroid(largest)
        elif element.get("center"):
            point = (element["center"]["lon"], element["center"]["lat"])
        else:
            continue
        if point[0] is None or not contains(bounds, point[1], point[0]):
            continue

        if rings and tags.get("building", "no") != "no":
            height, source, levels = building_height(tags)
            buildings.append(
                {
                    "type": "Feature",
                    "id": feature_id,
                    "geometry": {
                        "type": "MultiPolygon",
                        "coordinates": [[[list(p) for p in ring]] for ring in rings],
                    },
                    "properties": {
                        "name": tags.get("name:en") or tags.get("name"),
                        "kind": building_kind(tags),
                        "height": height,
                        "height_source": source,
                        "levels": levels,
                        "area_m2": round(sum(ring_area_m2(r) for r in rings)),
                        "tags": tags,
                    },
                }
            )

        category = place_category(tags)
        if category and feature_id not in seen_places:
            seen_places.add(feature_id)
            places.append(
                {
                    "type": "Feature",
                    "id": feature_id,
                    "geometry": {
                        "type": "Point",
                        "coordinates": [round(point[0], COORD_DIGITS), round(point[1], COORD_DIGITS)],
                    },
                    "properties": {
                        "name": tags.get("name:en") or tags.get("name"),
                        "category": category,
                        "tags": tags,
                    },
                }
            )

    south, west, north, east = bounds
    return {
        "z": z,
        "x": x,
        "y": y,
        "bbox": [west, south, east, north],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "buildings": {"type": "FeatureCollection", "features": buildings},
        "places": {"type": "FeatureCollection", "features": places},
    }


_semaphore = asyncio.Semaphore(2)  # Overpass allows only a couple of slots per client
_in_flight: dict[tuple[int, int, int], asyncio.Task] = {}


def _cache_path(z: int, x: int, y: int) -> Path:
    return get_settings().cache_dir / "osm" / str(z) / str(x) / f"{y}.json"


async def _fetch_from_overpass(z: int, x: int, y: int) -> dict:
    query = overpass_query(tile_bounds(z, x, y))
    errors: list[str] = []
    async with _semaphore:
        for url in get_settings().overpass_urls:
            try:
                response = await get_client().post(url, data={"data": query}, timeout=90.0)
                if response.status_code in (429, 502, 503, 504):
                    errors.append(f"{url}: HTTP {response.status_code}")
                    continue
                response.raise_for_status()
                payload = response.json()
                if "remark" in payload and "runtime error" in payload["remark"]:
                    errors.append(f"{url}: {payload['remark'][:120]}")
                    continue
                return parse_overpass(payload, z, x, y)
            except (httpx.HTTPError, ValueError) as exc:
                errors.append(f"{url}: {exc.__class__.__name__}")
    raise TileUnavailable("; ".join(errors) or "no Overpass endpoints configured")


async def get_tile(z: int, x: int, y: int) -> dict:
    """Returns the tile from the disk cache, refreshing it when stale."""
    path = _cache_path(z, x, y)
    max_age = get_settings().tile_cache_days * 86_400
    stale: dict | None = None
    if path.exists():
        try:
            cached = json.loads(path.read_text())
            if time.time() - path.stat().st_mtime < max_age:
                return cached
            stale = cached
        except (OSError, ValueError):
            pass

    key = (z, x, y)
    task = _in_flight.get(key)
    if task is None:
        task = asyncio.ensure_future(_fetch_from_overpass(z, x, y))
        _in_flight[key] = task
        task.add_done_callback(lambda _: _in_flight.pop(key, None))
    try:
        tile = await asyncio.shield(task)
    except TileUnavailable:
        if stale is not None:
            return stale  # an old copy beats an empty map
        raise

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(tile, separators=(",", ":"), ensure_ascii=False))
        tmp.replace(path)
    except OSError:
        pass  # caching is best-effort
    return tile
