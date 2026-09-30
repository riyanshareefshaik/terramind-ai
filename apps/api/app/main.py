from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import insights, twin, weather
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Urban digital-twin API: weather, twin entities, layers, alerts and analytics.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(weather.router)
app.include_router(twin.router)
app.include_router(insights.router)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {"name": settings.app_name, "version": settings.version, "status": "operational"}


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "healthy"}
