"""Builds the Jev gateway from settings. Evaluators and `/admin` "Try it" both use it,
so neither depends on the other to reach Jev."""

from __future__ import annotations

from app.config import settings
from app.core.jev import HttpJevGateway, JevGateway, JevUnavailableError


def default_jev_gateway() -> JevGateway:
    if not settings.jev_enabled:
        raise JevUnavailableError("jev_disabled", "Jev evaluation is disabled (JEV_ENABLED=false).")
    return HttpJevGateway(
        api_key=settings.typesafe_api_key,
        model=settings.jev_model,
        base_url=settings.typesafe_base_url,
        timeout_seconds=settings.jev_timeout_seconds,
    )
