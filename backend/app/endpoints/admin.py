from fastapi import APIRouter, Header, HTTPException, status

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
    except signal_admin_service.AdminTokenError as error:
        raise HTTPException(status_code=403, detail={"code": "admin_token", "message": str(error)}) from error
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


@router.get("/signals")
async def list_signals():
    return await _signal_call(signal_admin_service.list_signals())


@router.post("/signals", status_code=201)
async def create_signal(body: SignalDefinitionDraft, x_admin_token: str = Header(default="")):
    return await _signal_call(signal_admin_service.create_signal(body, x_admin_token))


@router.put("/signals/directive/mcq")
async def update_directive(body: SignalDirectiveUpdate, x_admin_token: str = Header(default="")):
    return await _signal_call(signal_admin_service.update_directive(body, x_admin_token))


@router.post("/signals/try")
async def try_signal(body: SignalTryRequest, x_admin_token: str = Header(default="")):
    return await _signal_call(
        signal_admin_service.try_signal(body.draft, body.problemId, body.choiceId, x_admin_token)
    )


@router.get("/signals/samples")
async def signal_samples():
    return await _signal_call(signal_admin_service.mcq_samples())


@router.get("/signals/revisions/{subject}")
async def signal_revisions(subject: str):
    return await _signal_call(signal_admin_service.signal_revisions(subject))


@router.put("/signals/{key}")
async def update_signal(key: str, body: SignalDefinitionUpdate, x_admin_token: str = Header(default="")):
    return await _signal_call(signal_admin_service.update_signal(key, body, body.version, x_admin_token))


@router.post("/signals/{key}/archive")
async def archive_signal(key: str, body: SignalStatusChange, x_admin_token: str = Header(default="")):
    return await _signal_call(signal_admin_service.set_signal_status(key, True, body.version, x_admin_token))


@router.post("/signals/{key}/restore")
async def restore_signal(key: str, body: SignalStatusChange, x_admin_token: str = Header(default="")):
    return await _signal_call(signal_admin_service.set_signal_status(key, False, body.version, x_admin_token))
