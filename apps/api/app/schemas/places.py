from pydantic import BaseModel


class Place(BaseModel):
    id: str
    name: str
    context: str
    kind: str
    latitude: float
    longitude: float
    # south, west, north, east
    bbox: tuple[float, float, float, float] | None


class PlaceSearchResponse(BaseModel):
    query: str
    places: list[Place]


class AreaName(BaseModel):
    latitude: float
    longitude: float
    name: str | None
    locality: str | None
    city: str | None
    district: str | None
    state: str | None
