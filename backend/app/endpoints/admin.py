from fastapi import APIRouter, HTTPException, status

from app.models import (
    AdminResetPracticeHistoryRequest,
    AdminResetPracticeHistoryResponse,
    SignalDefinitionDraft,
    SignalDefinitionUpdate,
    SignalDirectiveUpdate,
    SignalStatusChange,
    SignalTryRequest,
)
from app.services import admin_service, signal_admin_service
from app.services.submission_context_service import SubmissionContextError
from app.api_schemas import (
    AdminSignal,
    CorrectnessDirective,
    McqSample,
    SignalAdminCatalog,
    SignalRevision,
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


@router.get("/signals", response_model=SignalAdminCatalog)
async def list_signals():
    return await _signal_call(signal_admin_service.list_signals())


@router.post("/signals", status_code=201, response_model=AdminSignal)
async def create_signal(body: SignalDefinitionDraft):
    return await _signal_call(signal_admin_service.create_signal(body))


@router.put("/signals/directive/mcq", response_model=CorrectnessDirective)
async def update_directive(body: SignalDirectiveUpdate):
    return await _signal_call(signal_admin_service.update_directive(body))


@router.post("/signals/try", response_model=SignalTryResult)
async def try_signal(body: SignalTryRequest):
    return await _signal_call(
        signal_admin_service.try_signal(body.draft, body.problemId, body.choiceId)
    )


@router.get("/signals/samples", response_model=list[McqSample])
async def signal_samples():
    return await _signal_call(signal_admin_service.mcq_samples())


@router.get("/signals/revisions/{subject}", response_model=list[SignalRevision])
async def signal_revisions(subject: str):
    return await _signal_call(signal_admin_service.signal_revisions(subject))


@router.put("/signals/{key}", response_model=AdminSignal)
async def update_signal(key: str, body: SignalDefinitionUpdate):
    return await _signal_call(signal_admin_service.update_signal(key, body, body.version))


@router.post("/signals/{key}/archive", response_model=AdminSignal)
async def archive_signal(key: str, body: SignalStatusChange):
    return await _signal_call(signal_admin_service.set_signal_status(key, True, body.version))


@router.post("/signals/{key}/restore", response_model=AdminSignal)
async def restore_signal(key: str, body: SignalStatusChange):
    return await _signal_call(signal_admin_service.set_signal_status(key, False, body.version))
