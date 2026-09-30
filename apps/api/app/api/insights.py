from fastapi import APIRouter

from app.schemas.twin import AlertsResponse, AnalyticsResponse
from app.services.twin import get_twin_provider

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/alerts", response_model=AlertsResponse)
def list_alerts() -> AlertsResponse:
    provider = get_twin_provider()
    alerts = provider.alerts()
    return AlertsResponse(count=len(alerts), alerts=alerts, data_source=provider.data_source())


@router.get("/analytics", response_model=AnalyticsResponse)
def analytics() -> AnalyticsResponse:
    return get_twin_provider().analytics()
