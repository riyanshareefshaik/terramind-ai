"""Digital-twin entity, layer, alert and analytics schemas.

These are provider-agnostic: the demo provider fills them with SIMULATED
data today, and database- or feed-backed providers can fill the same shapes
later without any change to the API or the frontend.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.common import DataSource, GeoPoint, Provenance

RiskLevel = Literal["low", "moderate", "high", "critical"]
LayerCategory = Literal["infrastructure", "mobility", "environment", "risk", "utilities"]


class _EntityBase(BaseModel):
    id: str
    name: str
    layer_id: str
    location: GeoPoint = Field(description="Representative point (centroid) for search and fly-to.")
    data_source: DataSource


class EnergyUse(BaseModel):
    current_kw: float
    daily_kwh: float


class BuildingRisk(BaseModel):
    overall: RiskLevel
    flood: float = Field(ge=0, le=1)
    fire: float = Field(ge=0, le=1)
    heat: float = Field(ge=0, le=1)


class BuildingEntity(_EntityBase):
    type: Literal["building"] = "building"
    footprint: list[GeoPoint]
    height_m: float
    floors: int
    use: Literal["residential", "commercial", "mixed", "civic", "industrial"]
    year_built: int | None = None
    temperature_c: float | None = Field(default=None, description="Mean indoor temperature.")
    energy: EnergyUse | None = None
    risk: BuildingRisk | None = None


class RoadEntity(_EntityBase):
    type: Literal["road"] = "road"
    path: list[GeoPoint]
    road_class: Literal["arterial", "collector", "local"]
    lanes: int
    speed_limit_kmh: int
    congestion: float | None = Field(default=None, ge=0, le=1)


class SensorReading(BaseModel):
    metric: str
    label: str
    value: float
    unit: str
    observed_at: datetime


class SensorEntity(_EntityBase):
    type: Literal["sensor"] = "sensor"
    sensor_kind: Literal["air_quality", "weather", "noise", "water_level"]
    status: Literal["online", "degraded", "offline"]
    readings: list[SensorReading]


class RiskZoneEntity(_EntityBase):
    type: Literal["risk_zone"] = "risk_zone"
    hazard: Literal["flood", "heat"]
    severity: RiskLevel
    score: float = Field(ge=0, le=1)
    polygon: list[GeoPoint]


TwinEntity = Annotated[
    BuildingEntity | RoadEntity | SensorEntity | RiskZoneEntity,
    Field(discriminator="type"),
]
EntityType = Literal["building", "road", "sensor", "risk_zone"]


class TwinLayer(BaseModel):
    id: str
    name: str
    category: LayerCategory
    description: str
    entity_type: EntityType | None
    provenance: Provenance
    available: bool
    default_visible: bool
    entity_count: int


class LayersResponse(BaseModel):
    layers: list[TwinLayer]
    data_source: DataSource


class EntitiesResponse(BaseModel):
    count: int
    entities: list[TwinEntity]
    data_source: DataSource


class Alert(BaseModel):
    id: str
    severity: Literal["info", "warning", "critical"]
    category: Literal["environmental", "infrastructure", "traffic", "emergency"]
    title: str
    message: str
    entity_id: str | None = None
    raised_at: datetime
    provenance: Provenance


class AlertsResponse(BaseModel):
    count: int
    alerts: list[Alert]
    data_source: DataSource


class Kpi(BaseModel):
    id: str
    label: str
    value: float | None
    unit: str | None = None
    provenance: Provenance


class Distribution(BaseModel):
    id: str
    label: str
    buckets: dict[str, int]
    provenance: Provenance


class AnalyticsResponse(BaseModel):
    kpis: list[Kpi]
    distributions: list[Distribution]
    data_source: DataSource
