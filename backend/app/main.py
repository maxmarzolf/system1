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

    # Pydantic leaves some free-form dict schemas as bare objects. Make their
    # permissive values explicit so the generated TypeScript accepts map data.
    base_openapi = app.openapi

    def openapi_with_maps() -> dict:
        schema = base_openapi()

        def mark_freeform_maps(node: object) -> None:
            if isinstance(node, dict):
                if node.get("type") == "object" and "properties" not in node and "additionalProperties" not in node:
                    node["additionalProperties"] = True
                for value in node.values():
                    mark_freeform_maps(value)
            elif isinstance(node, list):
                for value in node:
                    mark_freeform_maps(value)

        mark_freeform_maps(schema)
        return schema

    app.openapi = openapi_with_maps
    return app


app = create_app()
