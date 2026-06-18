"""FastAPI application entry point."""
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dupe_platform.adapters.inbound.api.routers import (
    projects, clients, payment_plans, dashboard, reconciliation, notifications
)
from dupe_platform.infrastructure.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dupe.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Starting %s [%s]", settings.app_name, settings.app_env)

    # Create tables + seed synthetic data on startup
    from dupe_platform.adapters.outbound.persistence.database import get_engine
    from dupe_platform.adapters.outbound.persistence.models import Base
    from dupe_platform.infrastructure.seed import seed_synthetic_data
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy import text

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if settings.load_synthetic_data:
        from dupe_platform.adapters.outbound.persistence.database import get_session_factory
        async with get_session_factory()() as session:
            await seed_synthetic_data(session)

    yield
    logger.info("Shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="DUPE Agentic Business Platform — HCLTech AI Labs",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(projects.router,       prefix="/api/v1/projects",       tags=["Projects"])
    app.include_router(clients.router,        prefix="/api/v1/clients",        tags=["Clients"])
    app.include_router(payment_plans.router,  prefix="/api/v1/payment-plans",  tags=["Collections"])
    app.include_router(dashboard.router,      prefix="/api/v1/dashboard",      tags=["Dashboard"])
    app.include_router(reconciliation.router, prefix="/api/v1/reconciliation", tags=["Finance"])
    app.include_router(notifications.router,  prefix="/api/v1/notifications",  tags=["Notifications"])

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": settings.app_name}

    return app


app = create_app()
