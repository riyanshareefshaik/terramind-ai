import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import weather as weather_service

client = TestClient(app)

OPEN_METEO_SAMPLE = {
    "latitude": 17.375,
    "longitude": 78.5,
    "elevation": 505.0,
    "timezone": "Asia/Kolkata",
    "utc_offset_seconds": 19800,
    "current": {
        "time": "2026-09-30T09:15",
        "temperature_2m": 27.4,
        "apparent_temperature": 30.1,
        "relative_humidity_2m": 71,
        "wind_speed_10m": 9.7,
        "wind_direction_10m": 250,
        "precipitation": 0.0,
        "cloud_cover": 64,
        "weather_code": 2,
        "is_day": 1,
    },
}


def test_root_and_health():
    assert client.get("/").json() == {"name": "TerraMind AI", "version": "0.1.0", "status": "operational"}
    assert client.get("/health").json() == {"status": "healthy"}


def test_parse_open_meteo_is_live_and_converts_time_to_utc():
    result = weather_service.parse_open_meteo(OPEN_METEO_SAMPLE, "Hyderabad")
    assert result.data_source.provenance == "LIVE"
    assert result.current.condition == "Partly cloudy"
    assert result.current.is_day is True
    assert result.current.observed_at.isoformat() == "2026-09-30T03:45:00+00:00"


@pytest.fixture
def fake_weather(monkeypatch):
    async def fake(latitude, longitude, name=None):
        return weather_service.parse_open_meteo(OPEN_METEO_SAMPLE, name)

    monkeypatch.setattr("app.api.weather.get_current_weather", fake)


def test_weather_endpoint(fake_weather):
    body = client.get("/api/weather").json()
    assert body["location"]["name"] == "Hyderabad"
    assert body["current"]["temperature_c"] == 27.4
    assert body["data_source"]["provenance"] == "LIVE"


def test_weather_upstream_failure_returns_502(monkeypatch):
    async def failing(*args, **kwargs):
        raise weather_service.WeatherProviderError("boom")

    monkeypatch.setattr("app.api.weather.get_current_weather", failing)
    response = client.get("/api/weather")
    assert response.status_code == 502
    assert "unavailable" in response.json()["detail"].lower()


def test_layers_label_provenance():
    layers = client.get("/api/twin/layers").json()["layers"]
    by_id = {layer["id"]: layer for layer in layers}
    assert by_id["demo-buildings"]["provenance"] == "SIMULATED"
    assert by_id["traffic"]["provenance"] == "UNAVAILABLE"
    assert by_id["traffic"]["available"] is False


def test_entities_are_simulated_and_filterable():
    body = client.get("/api/twin/entities").json()
    assert body["count"] == len(body["entities"]) > 0
    assert {e["data_source"]["provenance"] for e in body["entities"]} == {"SIMULATED"}
    assert all(e["name"].startswith("Demo") for e in body["entities"])

    buildings = client.get("/api/twin/entities", params={"type": "building"}).json()["entities"]
    assert buildings and all(e["type"] == "building" for e in buildings)
    first = buildings[0]
    assert {"height_m", "floors", "energy", "risk", "footprint"} <= first.keys()

    sensors = client.get("/api/twin/entities", params={"layer": "demo-sensors"}).json()["entities"]
    assert sensors and all(e["type"] == "sensor" for e in sensors)


def test_entity_lookup():
    assert client.get("/api/twin/entities/building-1001").json()["id"] == "building-1001"
    assert client.get("/api/twin/entities/does-not-exist").status_code == 404


def test_alerts_and_analytics():
    alerts = client.get("/api/alerts").json()
    assert alerts["count"] == len(alerts["alerts"])
    assert all(a["provenance"] == "SIMULATED" for a in alerts["alerts"])

    analytics = client.get("/api/analytics").json()
    assert {k["id"] for k in analytics["kpis"]} >= {"buildings", "load", "pm25"}
    assert analytics["data_source"]["provenance"] == "SIMULATED"
