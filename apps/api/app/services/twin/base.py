"""The contract every digital-twin data provider implements.

The API layer only talks to this protocol, so the SIMULATED demo provider can
be swapped for a database-, GIS- or IoT-backed provider without touching the
routes or the frontend.
"""

from typing import Protocol

from app.schemas.common import DataSource
from app.schemas.twin import Alert, AnalyticsResponse, EntityType, TwinEntity, TwinLayer


class TwinDataProvider(Protocol):
    def data_source(self) -> DataSource: ...

    def layers(self) -> list[TwinLayer]: ...

    def entities(
        self,
        layer_id: str | None = None,
        entity_type: EntityType | None = None,
        query: str | None = None,
    ) -> list[TwinEntity]: ...

    def entity(self, entity_id: str) -> TwinEntity | None: ...

    def alerts(self) -> list[Alert]: ...

    def analytics(self) -> AnalyticsResponse: ...
