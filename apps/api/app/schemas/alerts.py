from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class Alert(BaseModel):
    id: str
    severity: Literal["advisory", "warning", "severe"]
    category: Literal["heat", "rain", "storm", "wind", "air"]
    title: str
    message: str
    starts_at: datetime | None


class AlertsResponse(BaseModel):
    latitude: float
    longitude: float
    alerts: list[Alert]
    sources_failed: list[str]
