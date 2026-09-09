from app.endpoints import admin, attempts, catalog, coach, health

ALL_ROUTERS = (
    health.router,
    attempts.router,
    catalog.router,
    coach.router,
    admin.router,
)
