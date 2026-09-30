from fastapi import APIRouter, HTTPException, Query

from app.schemas.twin import EntitiesResponse, EntityType, LayersResponse, TwinEntity
from app.services.twin import get_twin_provider

router = APIRouter(prefix="/api/twin", tags=["digital twin"])


@router.get("/layers", response_model=LayersResponse)
def list_layers() -> LayersResponse:
    provider = get_twin_provider()
    return LayersResponse(layers=provider.layers(), data_source=provider.data_source())


@router.get("/entities", response_model=EntitiesResponse)
def list_entities(
    layer: str | None = Query(default=None, description="Filter by layer id."),
    type: EntityType | None = Query(default=None, description="Filter by entity type."),
    q: str | None = Query(default=None, max_length=100, description="Search name or id."),
) -> EntitiesResponse:
    provider = get_twin_provider()
    entities = provider.entities(layer_id=layer, entity_type=type, query=q)
    return EntitiesResponse(count=len(entities), entities=entities, data_source=provider.data_source())


@router.get("/entities/{entity_id}", response_model=TwinEntity)
def get_entity(entity_id: str) -> TwinEntity:
    entity = get_twin_provider().entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id!r} not found")
    return entity
