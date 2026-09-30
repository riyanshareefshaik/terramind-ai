from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import DataSource

AqiCategory = Literal[
    "Good", "Satisfactory", "Moderately polluted", "Poor", "Very poor", "Severe"
]


class Pollutant(BaseModel):
    id: str
    label: str
    unit: str
    current: float | None
    average: float | None
    averaging_hours: int
    sub_index: int | None


class AirQualityResponse(BaseModel):
    latitude: float
    longitude: float
    observed_at: datetime | None
    aqi: int | None
    category: AqiCategory | None
    dominant_pollutant: str | None
    pollutants: list[Pollutant]
    data_source: DataSource
