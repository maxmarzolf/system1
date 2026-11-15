"""Server-side settings, edited on /admin and read by the graders and generators.

Three sections, each one versioned JSON document (``app_setting``):

- ``grading``: which modalities get written feedback, the near-miss threshold that bands a wrong
  answer as "close", the confidence below which Jev's correctness is flagged, and how fast
  Journey competency decays on days without practice.
- ``generation``: the specimen style generated recall cards are written in, and the model each
  provider uses for MCQ generation.
- ``practice``: what the practice screen asks for: MCQ set size and order, playlist order.

A section that was never saved uses its defaults; a saved section is merged over them, so a
setting added later gets its default until it is edited.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.config import settings
from app.core.signals.defaults import MODALITIES
from app.repositories import app_setting_repository
from app.repositories.app_setting_repository import SettingVersionConflict


class GradingSettingsModel(BaseModel):
    feedbackModalities: list[str] = Field(default_factory=lambda: ["total-recall", "microdrill", "ladder"])
    nearMissThreshold: float = Field(default=75.0, ge=0, le=100)
    lowConfidenceThreshold: float = Field(default=0.6, ge=0, le=1)
    # Journey: how much an algorithm's competency fades per day without practice (compounded).
    competencyDecayPerDay: float = Field(default=0.02, ge=0, le=0.5)

    @field_validator("feedbackModalities")
    @classmethod
    def _known_modalities(cls, value: list[str]) -> list[str]:
        unknown = sorted(set(value) - set(MODALITIES))
        if unknown:
            raise ValueError(f"Unknown modalities: {', '.join(unknown)}.")
        return [modality for modality in MODALITIES if modality in value]


class SpecimenSettings(BaseModel):
    typeHints: Literal["omit", "include"] = "omit"
    comments: Literal["omit", "brief"] = "omit"
    variableNames: Literal["readable", "concise", "descriptive"] = "readable"


class McqModels(BaseModel):
    """Empty means the provider's general model."""

    claude: str = Field(default_factory=lambda: settings.coach_mcq_anthropic_model, max_length=80)
    openai: str = Field(default_factory=lambda: settings.coach_mcq_openai_model, max_length=80)
    gemma: str = Field(default_factory=lambda: settings.coach_mcq_gemma_model, max_length=80)


class GenerationSettingsModel(BaseModel):
    specimen: SpecimenSettings = Field(default_factory=SpecimenSettings)
    mcqModels: McqModels = Field(default_factory=McqModels)


class PracticeSettingsModel(BaseModel):
    mcqQuestionCount: int = Field(default=5, ge=1, le=30)
    mcqFlowMode: Literal["random", "progressive"] = "random"
    playlistOrder: Literal["curated", "google-15", "solution-length", "family", "difficulty", "mastery"] = "mastery"


SECTIONS: dict[str, type[BaseModel]] = {
    "grading": GradingSettingsModel,
    "generation": GenerationSettingsModel,
    "practice": PracticeSettingsModel,
}


class SettingsValidationError(ValueError):
    def __init__(self, errors: dict[str, str]):
        super().__init__("Settings are invalid.")
        self.errors = errors


class SettingsConflictError(RuntimeError):
    pass


def _merge(defaults: dict[str, Any], stored: dict[str, Any]) -> dict[str, Any]:
    merged = dict(defaults)
    for key, value in stored.items():
        merged[key] = _merge(defaults[key], value) if isinstance(value, dict) and isinstance(defaults.get(key), dict) else value
    return merged


def _section(model: type[BaseModel], stored: dict[str, Any] | None) -> BaseModel:
    defaults = model().model_dump()
    try:
        return model.model_validate(_merge(defaults, stored or {}))
    except ValidationError:
        return model()  # a stored value that no longer validates falls back to the defaults


async def all_settings() -> dict[str, Any]:
    """Every section with its version (0 when never saved)."""
    stored = await app_setting_repository.fetch_settings()
    return {
        key: {"value": _section(model, stored.get(key, ({}, 0))[0]).model_dump(), "version": stored.get(key, ({}, 0))[1]}
        for key, model in SECTIONS.items()
    }


async def section(key: str) -> BaseModel:
    stored = await app_setting_repository.fetch_settings()
    return _section(SECTIONS[key], stored.get(key, ({}, 0))[0])


async def grading() -> GradingSettingsModel:
    return await section("grading")  # type: ignore[return-value]


async def generation() -> GenerationSettingsModel:
    return await section("generation")  # type: ignore[return-value]


async def practice() -> PracticeSettingsModel:
    return await section("practice")  # type: ignore[return-value]


async def update_section(key: str, value: dict[str, Any], version: int) -> dict[str, Any]:
    model = SECTIONS.get(key)
    if model is None:
        raise SettingsValidationError({"section": f"Unknown settings section {key!r}."})
    try:
        validated = model.model_validate(value)
    except ValidationError as error:
        raise SettingsValidationError(
            {".".join(str(part) for part in issue["loc"]) or key: issue["msg"] for issue in error.errors()}
        ) from error
    try:
        new_version = await app_setting_repository.save_setting(key, validated.model_dump(), version)
    except SettingVersionConflict as error:
        raise SettingsConflictError(str(error)) from error
    return {"value": validated.model_dump(), "version": new_version}
