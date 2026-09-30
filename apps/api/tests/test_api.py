from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.services import air_quality, geocoding, osm_tiles, weather
from app.services.alerts import weather_alerts
from tests.fixtures import AIR_QUALITY, NOMINATIM_REVERSE, NOMINATIM_SEARCH, OPEN_METEO, OVERPASS, TILE

client = TestClient(app)
NOW = datetime(2026, 9, 30, 4, 30, tzinfo=timezone.utc)  # 10:00 IST


def test_root_and_health():
    assert client.get("/").json()["status"] == "operational"
    assert client.get("/health").json() == {"status": "healthy"}


# -- buildings ---------------------------------------------------------------


def test_parse_overpass_tile():
    tile = osm_tiles.parse_overpass(OVERPASS, *TILE)
    buildings = {f["id"]: f for f in tile["buildings"]["features"]}
    assert set(buildings) == {"way/1", "way/2", "way/3", "relation/4"}  # way/5 is in the next tile

    towers = buildings["way/1"]["properties"]
    assert (towers["height"], towers["height_source"], towers["levels"]) == (16.0, "levels", 5)
    assert towers["kind"] == "residential" and towers["name"] == "Sample Towers"
    assert buildings["way/2"]["properties"]["height_source"] == "estimated"
    assert buildings["way/3"]["properties"]["height"] == 20.1  # 66 ft
    assert buildings["way/3"]["properties"]["height_source"] == "tagged"

    ring = buildings["relation/4"]["geometry"]["coordinates"][0][0]
    assert ring[0] == ring[-1] and len(ring) == 5  # two outer ways joined into one closed ring

    places = {f["id"]: f["properties"]["category"] for f in tile["places"]["features"]}
    assert places == {"way/3": "health", "node/6": "emergency"}


def test_parse_length():
    assert osm_tiles.parse_length("12") == 12
    assert osm_tiles.parse_length("12.5 m") == 12.5
    assert osm_tiles.parse_length("12;15") == 12
    assert osm_tiles.parse_length("tall") is None


def test_tile_endpoint_fetches_once_then_serves_cache(monkeypatch):
    calls = []

    async def fake_fetch(z, x, y):
        calls.append((z, x, y))
        return osm_tiles.parse_overpass(OVERPASS, z, x, y)

    monkeypatch.setattr(osm_tiles, "_fetch_from_overpass", fake_fetch)
    first = client.get("/api/tiles/15/23724/14860")
    second = client.get("/api/tiles/15/23724/14860")
    assert first.status_code == second.status_code == 200
    assert len(first.json()["buildings"]["features"]) == 4
    assert calls == [TILE]


def test_tile_endpoint_upstream_failure(monkeypatch):
    async def failing(*_):
        raise osm_tiles.TileUnavailable("busy")

    monkeypatch.setattr(osm_tiles, "_fetch_from_overpass", failing)
    response = client.get("/api/tiles/15/1/1")
    assert response.status_code == 503
    assert response.headers["retry-after"] == "20"


def test_tile_endpoint_rejects_other_zooms():
    assert client.get("/api/tiles/12/1/1").status_code == 422


# -- environment -------------------------------------------------------------


def test_parse_weather():
    result = weather.parse_open_meteo(OPEN_METEO)
    assert result.current.condition == "Clear sky"
    assert result.current.observed_at.isoformat() == "2026-09-30T04:15:00+00:00"
    assert len(result.hourly) == 24
    assert result.hourly[0].time.isoformat() == "2026-09-30T03:30:00+00:00"  # 09:00 IST
    assert result.today.temperature_max_c == 36.1


def test_weather_alerts_from_forecast():
    alerts = {a.id: a for a in weather_alerts(weather.parse_open_meteo(OPEN_METEO))}
    assert "thunderstorm" in alerts
    # 70 mm in 24 h crosses IMD's 64.5 mm "heavy rain" line, which supersedes the 1-hour check.
    assert alerts["rain-24h"].severity == "warning" and "rain-intense" not in alerts
    assert all(a.id != "heat" for a in alerts.values())


def test_air_quality_naqi():
    result = air_quality.parse_air_quality(AIR_QUALITY, now=NOW)
    by_id = {p.id: p for p in result.pollutants}
    assert by_id["pm2_5"].sub_index == 75
    assert by_id["pm10"].sub_index == 80
    assert by_id["carbon_monoxide"].average == 0.4
    assert result.aqi == 80 and result.category == "Satisfactory"
    assert result.dominant_pollutant == "PM10"
    assert result.data_source.provenance == "ESTIMATED"


def test_environment_endpoints(monkeypatch):
    async def fake_weather(lat, lon):
        return weather.parse_open_meteo(OPEN_METEO)

    async def fake_air(lat, lon):
        return air_quality.parse_air_quality(AIR_QUALITY, now=NOW)

    monkeypatch.setattr("app.api.weather.get_weather", fake_weather)
    monkeypatch.setattr("app.api.weather.get_air_quality", fake_air)
    assert client.get("/api/weather").json()["current"]["temperature_c"] == 30.5
    assert client.get("/api/air-quality", params={"latitude": 16.5, "longitude": 80.6}).json()["aqi"] == 80
    body = client.get("/api/alerts").json()
    assert body["sources_failed"] == []
    assert {a["category"] for a in body["alerts"]} >= {"storm"}


def test_alerts_report_failed_sources(monkeypatch):
    async def failing(*_):
        raise weather.WeatherProviderError("down")

    monkeypatch.setattr("app.api.weather.get_weather", failing)
    monkeypatch.setattr("app.api.weather.get_air_quality", failing)
    body = client.get("/api/alerts").json()
    assert body["alerts"] == [] and body["sources_failed"] == ["weather", "air_quality"]


def test_weather_failure_is_502_without_leaking_upstream(monkeypatch):
    async def failing(*_):
        raise weather.WeatherProviderError("Open-Meteo 403")

    monkeypatch.setattr("app.api.weather.get_weather", failing)
    response = client.get("/api/weather")
    assert response.status_code == 502
    assert "Open-Meteo" not in response.json()["detail"]


# -- places --------------------------------------------------------------------


def test_places(monkeypatch):
    async def fake_get(path, params):
        return NOMINATIM_SEARCH if path == "/search" else NOMINATIM_REVERSE

    monkeypatch.setattr(geocoding, "_get", fake_get)
    place = client.get("/api/places/search", params={"q": "vijayawada"}).json()["places"][0]
    assert place["name"] == "Vijayawada"
    assert place["context"] == "NTR, Andhra Pradesh"
    assert place["bbox"] == [16.4498, 80.5652, 16.5773, 80.7038]

    area = client.get("/api/places/reverse", params={"latitude": 16.51, "longitude": 80.63}).json()
    assert area["name"] == "Governorpet" and area["city"] == "Vijayawada"
