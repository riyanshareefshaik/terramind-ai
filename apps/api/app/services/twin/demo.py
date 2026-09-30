"""SIMULATED demo digital twin.

Generates a synthetic district of buildings, roads, sensors and hazard zones
around a reference point. Nothing here is real-world data: every payload is
labelled ``Provenance.SIMULATED`` and every name is prefixed "Demo" so it
cannot be mistaken for real city telemetry. Output is deterministic (fixed
seed) so the scene is stable across restarts and tests.
"""

import math
import random
from datetime import datetime, timezone

from app.schemas.common import DataSource, GeoPoint, Provenance
from app.schemas.twin import (
    Alert,
    AnalyticsResponse,
    BuildingEntity,
    BuildingRisk,
    Distribution,
    EnergyUse,
    EntityType,
    Kpi,
    RiskLevel,
    RiskZoneEntity,
    RoadEntity,
    SensorEntity,
    SensorReading,
    TwinEntity,
    TwinLayer,
)

SEED = 1024
BLOCK_SPACING_M = 160
GRID_RADIUS = 4  # blocks -4..4 in each direction → a ~1.5 km square district
METERS_PER_DEG_LAT = 111_320.0

SIM = Provenance.SIMULATED
UNAVAILABLE = Provenance.UNAVAILABLE


def risk_level(score: float) -> RiskLevel:
    if score >= 0.75:
        return "critical"
    if score >= 0.5:
        return "high"
    if score >= 0.25:
        return "moderate"
    return "low"


def point_in_polygon(point: GeoPoint, polygon: list[GeoPoint]) -> bool:
    inside = False
    x, y = point.longitude, point.latitude
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a.latitude > y) != (b.latitude > y):
            cross_x = a.longitude + (y - a.latitude) * (b.longitude - a.longitude) / (
                b.latitude - a.latitude
            )
            if x < cross_x:
                inside = not inside
    return inside


class DemoTwinProvider:
    def __init__(self, latitude: float, longitude: float) -> None:
        self._lat0 = latitude
        self._lon0 = longitude
        self._rng = random.Random(SEED)
        self._generated_at = datetime.now(timezone.utc)
        self._source = DataSource(
            provenance=SIM,
            source="TerraMind demo provider",
            description=(
                "Synthetic district generated for development. Buildings, roads, sensor "
                "readings and risk scores are simulated and do not describe the real city."
            ),
            updated_at=self._generated_at,
        )

        self._zones = self._build_risk_zones()
        self._buildings = self._build_buildings()
        self._roads = self._build_roads()
        self._sensors = self._build_sensors()
        self._entities: list[TwinEntity] = [
            *self._zones,
            *self._roads,
            *self._buildings,
            *self._sensors,
        ]
        self._by_id = {entity.id: entity for entity in self._entities}

    # -- geometry helpers -------------------------------------------------

    def _at(self, east_m: float, north_m: float) -> GeoPoint:
        meters_per_deg_lon = METERS_PER_DEG_LAT * math.cos(math.radians(self._lat0))
        return GeoPoint(
            latitude=round(self._lat0 + north_m / METERS_PER_DEG_LAT, 7),
            longitude=round(self._lon0 + east_m / meters_per_deg_lon, 7),
        )

    def _ring(self, east_m: float, north_m: float, radius_m: float, jitter: float) -> list[GeoPoint]:
        points = []
        for k in range(12):
            angle = 2 * math.pi * k / 12
            r = radius_m * (1 + self._rng.uniform(-jitter, jitter))
            points.append(self._at(east_m + r * math.cos(angle), north_m + r * math.sin(angle)))
        return points

    # -- generators --------------------------------------------------------

    def _build_risk_zones(self) -> list[RiskZoneEntity]:
        specs = [
            ("zone-flood-1", "Demo flood-prone basin", "flood", "flood-risk", 360, -420, 280, 0.82),
            ("zone-flood-2", "Demo drainage channel overflow", "flood", "flood-risk", -520, 300, 170, 0.55),
            ("zone-heat-1", "Demo urban heat island core", "heat", "heat-risk", 0, 0, 360, 0.71),
        ]
        zones = []
        for zone_id, name, hazard, layer, east, north, radius, score in specs:
            polygon = self._ring(east, north, radius, jitter=0.18)
            zones.append(
                RiskZoneEntity(
                    id=zone_id,
                    name=name,
                    layer_id=layer,
                    location=self._at(east, north),
                    data_source=self._source,
                    hazard=hazard,
                    severity=risk_level(score),
                    score=score,
                    polygon=polygon,
                )
            )
        return zones

    def _zone_exposure(self, point: GeoPoint, hazard: str) -> float:
        exposure = 0.0
        for zone in self._zones:
            if zone.hazard == hazard and point_in_polygon(point, zone.polygon):
                exposure = max(exposure, zone.score)
        return exposure

    def _build_buildings(self) -> list[BuildingEntity]:
        rng = self._rng
        uses = ["residential", "residential", "commercial", "mixed", "civic", "industrial"]
        buildings = []
        for i in range(-GRID_RADIUS, GRID_RADIUS + 1):
            for j in range(-GRID_RADIUS, GRID_RADIUS + 1):
                if rng.random() < 0.12:
                    continue  # leave some blocks open as parks / plazas
                per_block = 2 if rng.random() < 0.45 else 1
                for n in range(per_block):
                    cx = i * BLOCK_SPACING_M + rng.uniform(-30, 30) + (n * 55 - 27 if per_block == 2 else 0)
                    cy = j * BLOCK_SPACING_M + rng.uniform(-30, 30)
                    half_w = rng.uniform(12, 26) if per_block == 2 else rng.uniform(18, 40)
                    half_d = rng.uniform(12, 32)
                    footprint = [
                        self._at(cx - half_w, cy - half_d),
                        self._at(cx + half_w, cy - half_d),
                        self._at(cx + half_w, cy + half_d),
                        self._at(cx - half_w, cy + half_d),
                    ]
                    centre = self._at(cx, cy)
                    distance = math.hypot(cx, cy)
                    height = 10 + 120 * math.exp(-((distance / 480) ** 2)) * rng.uniform(0.5, 1.2)
                    height += rng.uniform(0, 14)
                    floors = max(1, int(height / 3.4))
                    use = rng.choice(uses)
                    area_m2 = 4 * half_w * half_d * floors
                    current_kw = area_m2 * rng.uniform(0.012, 0.035)
                    year_built = rng.randint(1975, 2024)

                    flood = min(1.0, self._zone_exposure(centre, "flood") * rng.uniform(0.6, 1.0) + rng.uniform(0, 0.1))
                    heat = min(1.0, self._zone_exposure(centre, "heat") * rng.uniform(0.5, 0.95) + rng.uniform(0, 0.12))
                    fire = min(1.0, rng.uniform(0.04, 0.3) + (2024 - year_built) / 250)
                    idx = len(buildings) + 1
                    buildings.append(
                        BuildingEntity(
                            id=f"building-{1000 + idx}",
                            name=f"Demo Block {chr(ord('A') + i + GRID_RADIUS)}{j + GRID_RADIUS + 1}"
                            + (f"-{n + 1}" if per_block == 2 else ""),
                            layer_id="demo-buildings",
                            location=centre,
                            data_source=self._source,
                            footprint=footprint,
                            height_m=round(height, 1),
                            floors=floors,
                            use=use,
                            year_built=year_built,
                            temperature_c=round(rng.uniform(23.5, 29.5) + heat * 2.5, 1),
                            energy=EnergyUse(
                                current_kw=round(current_kw, 1),
                                daily_kwh=round(current_kw * rng.uniform(14, 20), 0),
                            ),
                            risk=BuildingRisk(
                                overall=risk_level(max(flood, heat, fire)),
                                flood=round(flood, 2),
                                fire=round(fire, 2),
                                heat=round(heat, 2),
                            ),
                        )
                    )
        return buildings

    def _build_roads(self) -> list[RoadEntity]:
        rng = self._rng
        extent = (GRID_RADIUS + 0.5) * BLOCK_SPACING_M
        roads = []
        for axis in ("ns", "ew"):
            for k in range(-GRID_RADIUS - 1, GRID_RADIUS + 1):
                offset = (k + 0.5) * BLOCK_SPACING_M
                if axis == "ns":
                    start, end = (offset, -extent), (offset, extent)
                else:
                    start, end = (-extent, offset), (extent, offset)
                road_class = "arterial" if k % 3 == 0 else ("collector" if k % 2 == 0 else "local")
                centrality = math.exp(-((offset / 500) ** 2))
                congestion = min(1.0, rng.uniform(0.1, 0.45) + centrality * (0.45 if road_class == "arterial" else 0.25))
                label = f"{'N–S' if axis == 'ns' else 'E–W'} {k + GRID_RADIUS + 2}"
                roads.append(self._road(f"road-{axis}-{k + GRID_RADIUS + 1}", f"Demo {road_class.title()} {label}", [start, end], road_class, congestion))
        roads.append(
            self._road(
                "road-diagonal-1",
                "Demo Diagonal Arterial",
                [(-extent, -extent), (-200, -120), (220, 180), (extent, extent)],
                "arterial",
                0.86,
            )
        )
        return roads

    def _road(self, road_id: str, name: str, coords: list[tuple[float, float]], road_class: str, congestion: float) -> RoadEntity:
        path = [self._at(e, n) for e, n in coords]
        mid_e = sum(e for e, _ in coords) / len(coords)
        mid_n = sum(n for _, n in coords) / len(coords)
        lanes = {"arterial": 6, "collector": 4, "local": 2}[road_class]
        speed = {"arterial": 60, "collector": 40, "local": 30}[road_class]
        return RoadEntity(
            id=road_id,
            name=name,
            layer_id="demo-roads",
            location=self._at(mid_e, mid_n),
            data_source=self._source,
            path=path,
            road_class=road_class,
            lanes=lanes,
            speed_limit_kmh=speed,
            congestion=round(congestion, 2),
        )

    def _build_sensors(self) -> list[SensorEntity]:
        rng = self._rng
        kinds = ["air_quality", "weather", "noise", "air_quality", "water_level"]
        statuses = ["online"] * 12 + ["degraded", "offline"]
        rng.shuffle(statuses)
        sensors = []
        for idx, status in enumerate(statuses):
            gi = rng.randint(-GRID_RADIUS - 1, GRID_RADIUS)
            gj = rng.randint(-GRID_RADIUS - 1, GRID_RADIUS)
            east = (gi + 0.5) * BLOCK_SPACING_M
            north = (gj + 0.5) * BLOCK_SPACING_M
            kind = kinds[idx % len(kinds)]
            location = self._at(east, north)
            readings = [] if status == "offline" else self._readings(kind, location)
            sensors.append(
                SensorEntity(
                    id=f"sensor-{kind.replace('_', '')}-{idx + 1:02d}",
                    name=f"Demo {kind.replace('_', ' ').title()} Sensor {idx + 1:02d}",
                    layer_id="demo-sensors",
                    location=location,
                    data_source=self._source,
                    sensor_kind=kind,
                    status=status,
                    readings=readings,
                )
            )
        return sensors

    def _readings(self, kind: str, location: GeoPoint) -> list[SensorReading]:
        rng = self._rng
        at = self._generated_at
        heat = self._zone_exposure(location, "heat")
        flood = self._zone_exposure(location, "flood")

        def reading(metric: str, label: str, value: float, unit: str) -> SensorReading:
            return SensorReading(metric=metric, label=label, value=round(value, 1), unit=unit, observed_at=at)

        if kind == "air_quality":
            pm25 = rng.uniform(18, 70) + heat * 20
            return [
                reading("pm2_5", "PM2.5", pm25, "µg/m³"),
                reading("pm10", "PM10", pm25 * rng.uniform(1.5, 2.1), "µg/m³"),
                reading("no2", "NO₂", rng.uniform(10, 60), "µg/m³"),
            ]
        if kind == "weather":
            return [
                reading("temperature", "Air temperature", rng.uniform(26, 31) + heat * 3, "°C"),
                reading("humidity", "Relative humidity", rng.uniform(40, 75), "%"),
            ]
        if kind == "noise":
            return [reading("noise", "Sound level", rng.uniform(52, 78), "dB(A)")]
        return [reading("water_level", "Drain water level", rng.uniform(5, 25) + flood * 45, "cm")]

    # -- TwinDataProvider --------------------------------------------------

    def data_source(self) -> DataSource:
        return self._source

    def layers(self) -> list[TwinLayer]:
        def count(layer_id: str) -> int:
            return sum(1 for e in self._entities if e.layer_id == layer_id)

        not_connected = "No data provider is connected for this layer yet."
        return [
            TwinLayer(id="demo-buildings", name="Buildings (demo)", category="infrastructure", entity_type="building",
                      description="Synthetic extruded buildings with simulated energy and risk attributes.",
                      provenance=SIM, available=True, default_visible=True, entity_count=count("demo-buildings")),
            TwinLayer(id="demo-roads", name="Roads (demo)", category="mobility", entity_type="road",
                      description="Synthetic road grid coloured by simulated congestion.",
                      provenance=SIM, available=True, default_visible=True, entity_count=count("demo-roads")),
            TwinLayer(id="demo-sensors", name="Sensors (demo)", category="environment", entity_type="sensor",
                      description="Simulated IoT sensors: air quality, weather, noise and drain levels.",
                      provenance=SIM, available=True, default_visible=True, entity_count=count("demo-sensors")),
            TwinLayer(id="flood-risk", name="Flood risk", category="risk", entity_type="risk_zone",
                      description="Simulated flood-prone zones. Not derived from hydrological data.",
                      provenance=SIM, available=True, default_visible=True, entity_count=count("flood-risk")),
            TwinLayer(id="heat-risk", name="Heat risk", category="risk", entity_type="risk_zone",
                      description="Simulated urban heat-island zone. Not derived from thermal imagery.",
                      provenance=SIM, available=True, default_visible=False, entity_count=count("heat-risk")),
            TwinLayer(id="traffic", name="Live traffic", category="mobility", entity_type=None,
                      description=not_connected, provenance=UNAVAILABLE, available=False,
                      default_visible=False, entity_count=0),
            TwinLayer(id="air-quality", name="Air quality (official)", category="environment", entity_type=None,
                      description=not_connected, provenance=UNAVAILABLE, available=False,
                      default_visible=False, entity_count=0),
            TwinLayer(id="utilities", name="Utilities network", category="utilities", entity_type=None,
                      description=not_connected, provenance=UNAVAILABLE, available=False,
                      default_visible=False, entity_count=0),
        ]

    def entities(
        self,
        layer_id: str | None = None,
        entity_type: EntityType | None = None,
        query: str | None = None,
    ) -> list[TwinEntity]:
        needle = query.strip().lower() if query else None
        return [
            e
            for e in self._entities
            if (layer_id is None or e.layer_id == layer_id)
            and (entity_type is None or e.type == entity_type)
            and (needle is None or needle in e.name.lower() or needle in e.id.lower())
        ]

    def entity(self, entity_id: str) -> TwinEntity | None:
        return self._by_id.get(entity_id)

    def alerts(self) -> list[Alert]:
        alerts: list[Alert] = []

        def add(severity, category, title, message, entity_id):
            alerts.append(
                Alert(
                    id=f"alert-{len(alerts) + 1:03d}",
                    severity=severity,
                    category=category,
                    title=title,
                    message=message,
                    entity_id=entity_id,
                    raised_at=self._generated_at,
                    provenance=SIM,
                )
            )

        for sensor in self._sensors:
            if sensor.status == "offline":
                add("warning", "infrastructure", "Sensor offline", f"{sensor.name} is not reporting.", sensor.id)
            elif sensor.status == "degraded":
                add("info", "infrastructure", "Sensor degraded", f"{sensor.name} reports intermittently.", sensor.id)
            for r in sensor.readings:
                if r.metric == "pm2_5" and r.value > 60:
                    add("warning", "environmental", "High PM2.5", f"{sensor.name}: {r.value} {r.unit} (threshold 60).", sensor.id)
                if r.metric == "water_level" and r.value > 40:
                    add("critical", "environmental", "Drain level high", f"{sensor.name}: {r.value} {r.unit} (threshold 40).", sensor.id)
        for building in self._buildings:
            if building.risk and building.risk.overall == "critical":
                add("critical", "emergency", "Critical building risk",
                    f"{building.name}: flood {building.risk.flood:.2f}, heat {building.risk.heat:.2f}, fire {building.risk.fire:.2f}.",
                    building.id)
        for road in self._roads:
            if road.congestion is not None and road.congestion >= 0.8:
                add("warning", "traffic", "Heavy congestion", f"{road.name}: {road.congestion:.0%} of capacity.", road.id)

        order = {"critical": 0, "warning": 1, "info": 2}
        return sorted(alerts, key=lambda a: order[a.severity])

    def analytics(self) -> AnalyticsResponse:
        online = [s for s in self._sensors if s.status != "offline"]
        pm25 = [r.value for s in online for r in s.readings if r.metric == "pm2_5"]
        congestion = [r.congestion for r in self._roads if r.congestion is not None]
        at_risk = [b for b in self._buildings if b.risk and b.risk.overall in ("high", "critical")]

        def buckets(values: list[str], keys: list[str]) -> dict[str, int]:
            return {k: values.count(k) for k in keys}

        return AnalyticsResponse(
            kpis=[
                Kpi(id="buildings", label="Buildings modelled", value=len(self._buildings), provenance=SIM),
                Kpi(id="load", label="Current electrical load",
                    value=round(sum(b.energy.current_kw for b in self._buildings if b.energy) / 1000, 2),
                    unit="MW", provenance=SIM),
                Kpi(id="pm25", label="Mean PM2.5",
                    value=round(sum(pm25) / len(pm25), 1) if pm25 else None, unit="µg/m³", provenance=SIM),
                Kpi(id="sensors-online", label="Sensors reporting",
                    value=round(100 * len(online) / len(self._sensors), 0), unit="%", provenance=SIM),
                Kpi(id="congestion", label="Mean congestion",
                    value=round(100 * sum(congestion) / len(congestion), 0) if congestion else None,
                    unit="%", provenance=SIM),
                Kpi(id="at-risk", label="Buildings at high risk", value=len(at_risk), provenance=SIM),
            ],
            distributions=[
                Distribution(id="building-risk", label="Building risk", provenance=SIM,
                             buckets=buckets([b.risk.overall for b in self._buildings if b.risk],
                                             ["low", "moderate", "high", "critical"])),
                Distribution(id="building-use", label="Building use", provenance=SIM,
                             buckets=buckets([b.use for b in self._buildings],
                                             ["residential", "commercial", "mixed", "civic", "industrial"])),
                Distribution(id="sensor-status", label="Sensor status", provenance=SIM,
                             buckets=buckets([s.status for s in self._sensors], ["online", "degraded", "offline"])),
            ],
            data_source=self._source,
        )
