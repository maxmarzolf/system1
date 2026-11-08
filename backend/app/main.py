from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import connect, disconnect
from app.endpoints import ALL_ROUTERS
from app.endpoints.errors import register_error_handlers
from app.services.evaluators.defaults import register_default_evaluators


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await connect()
    print("PostgreSQL connected successfully")
    yield
    await disconnect()


def create_app() -> FastAPI:
    """Composition root: builds the app and wires its pluggable parts."""
    register_default_evaluators()
    app = FastAPI(title="System1 API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)
    for router in ALL_ROUTERS:
        app.include_router(router)

    return app


app = create_app()
