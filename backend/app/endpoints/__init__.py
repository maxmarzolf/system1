from app.endpoints import admin, attempts, coach, health

ALL_ROUTERS = (
    health.router,
    attempts.router,
    coach.router,
    admin.router,
)
