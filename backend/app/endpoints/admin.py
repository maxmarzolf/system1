from fastapi import APIRouter, HTTPException, status

from app.models import (
    AdminResetPracticeHistoryRequest,
    AdminResetPracticeHistoryResponse,
    SettingsUpdate,
    SignalDefinitionDraft,
    SignalDefinitionUpdate,
    SignalDirectiveUpdate,
    SignalPreviewRequest,
    SignalStatusChange,
    SignalTryRequest,
)
from app.services import admin_service, app_settings_service, signal_admin_service
from app.services.evaluation.context import SubmissionContextError
from app.api_schemas import (
    AdminSettings,
    AdminSignal,
    CorrectnessDirective,
    SettingsSection,
    SignalAdminCatalog,
    SignalPreview,
    SignalRevision,
    SignalSample,
    SignalTryResult,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/reset-practice-history", response_model=AdminResetPracticeHistoryResponse)
async def reset_practice_history(body: AdminResetPracticeHistoryRequest):
    try:
        return await admin_service.reset_practice_history(body)
    except admin_service.AdminResetPermissionError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error


async def _signal_call(call):
    """Run a signal admin call, mapping its errors to HTTP responses."""
    try:
        return await call
    except signal_admin_service.SignalValidationError as error:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_signal", "message": str(error), "errors": error.errors}
        ) from error
    except SubmissionContextError as error:
        raise HTTPException(status_code=422, detail={"code": error.code, "message": error.message}) from error
    except signal_admin_service.SignalNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": str(error)}) from error
    except signal_admin_service.SignalConflictError as error:
        raise HTTPException(status_code=409, detail={"code": "conflict", "message": str(error)}) from error
    except signal_admin_service.SignalTryError as error:
        raise HTTPException(status_code=502, detail={"code": "jev_unavailable", "message": str(error)}) from error


# ─── Settings ───


@router.get("/settings", response_model=AdminSettings)
async def get_settings():
    return await app_settings_service.all_settings()


@router.put("/settings/{section}", response_model=SettingsSection)
async def update_settings(section: str, body: SettingsUpdate):
    try:
        return await app_settings_service.update_section(section, body.value, body.version)
    except app_settings_service.SettingsValidationError as error:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_settings", "message": str(error), "errors": error.errors}
        ) from error
    except app_settings_service.SettingsConflictError as error:
        raise HTTPException(status_code=409, detail={"code": "conflict", "message": str(error)}) from error


# ─── Signals: the same routes for every modality ───


@router.get("/signals/{modality}", response_model=SignalAdminCatalog)
async def list_signals(modality: str):
    return await _signal_call(signal_admin_service.list_signals(modality))


@router.post("/signals/{modality}", status_code=201, response_model=AdminSignal)
async def create_signal(modality: str, body: SignalDefinitionDraft):
    return await _signal_call(signal_admin_service.create_signal(modality, body))


@router.put("/signals/{modality}/directive", response_model=CorrectnessDirective)
async def update_directive(modality: str, body: SignalDirectiveUpdate):
    return await _signal_call(signal_admin_service.update_directive(modality, body))


@router.post("/signals/{modality}/preview", response_model=SignalPreview)
async def preview_signal(modality: str, body: SignalPreviewRequest):
    return await _signal_call(signal_admin_service.preview_signal(modality, body.draft))


@router.post("/signals/{modality}/try", response_model=SignalTryResult)
async def try_signal(modality: str, body: SignalTryRequest):
    return await _signal_call(
        signal_admin_service.try_signal(modality, body.draft, body.sampleId, body.answer, body.reference)
    )


@router.get("/signals/{modality}/samples", response_model=list[SignalSample])
async def signal_samples(modality: str):
    return await _signal_call(signal_admin_service.samples(modality))


@router.get("/signals/{modality}/revisions/{subject}", response_model=list[SignalRevision])
async def signal_revisions(modality: str, subject: str):
    return await _signal_call(signal_admin_service.signal_revisions(modality, subject))


@router.put("/signals/{modality}/{key}", response_model=AdminSignal)
async def update_signal(modality: str, key: str, body: SignalDefinitionUpdate):
    return await _signal_call(signal_admin_service.update_signal(modality, key, body, body.version))


@router.post("/signals/{modality}/{key}/archive", response_model=AdminSignal)
async def archive_signal(modality: str, key: str, body: SignalStatusChange):
    return await _signal_call(signal_admin_service.set_signal_status(modality, key, True, body.version))


@router.post("/signals/{modality}/{key}/restore", response_model=AdminSignal)
async def restore_signal(modality: str, key: str, body: SignalStatusChange):
    return await _signal_call(signal_admin_service.set_signal_status(modality, key, False, body.version))
