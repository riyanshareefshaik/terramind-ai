"""Shared schema primitives: provenance labels and geographic types."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class Provenance(str, Enum):
    """Where a value comes from. Every payload the API returns carries one.

    The frontend renders this label next to the data so simulated values are
    never mistaken for real measurements.
    """

    LIVE = "LIVE"
    SIMULATED = "SIMULATED"
    ESTIMATED = "ESTIMATED"
    HISTORICAL = "HISTORICAL"
    UNAVAILABLE = "UNAVAILABLE"


class DataSource(BaseModel):
    provenance: Provenance
    source: str = Field(description="Human-readable name of the provider, e.g. 'Open-Meteo'.")
    description: str | None = None
    updated_at: datetime | None = Field(
        default=None, description="When the provider produced this data (UTC)."
    )


class GeoPoint(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
