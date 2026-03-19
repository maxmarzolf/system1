from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import connect, disconnect
from app.routers import attempts, coach


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await connect()
    print("PostgreSQL connected successfully")
    yield
    await disconnect()


def create_app() -> FastAPI:
    app = FastAPI(title="System1 API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(attempts.router)
    app.include_router(coach.router)

    @app.get("/api/health", tags=["health"])
    async def health():
        return {"ok": True}

    return app


app = create_app()
