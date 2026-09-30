from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api import buildings, places, weather
from app.core.config import get_settings
from app.core.http import close_client

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_client()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Urban digital-twin API: OSM buildings and places, weather, air quality and alerts.",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(weather.router)
app.include_router(places.router)
app.include_router(buildings.router)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {"name": settings.app_name, "version": settings.version, "status": "operational"}


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "healthy"}
