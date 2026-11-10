"""Standalone API for the isolated MCQ prompt evolution example."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import evolve_service


app = FastAPI(title="System1 Evolve")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


class StartRunRequest(BaseModel):
    prompt: str = Field(min_length=20, max_length=6000)


class AnswerRequest(BaseModel):
    caseIndex: int = Field(ge=0)
    choiceId: str = Field(min_length=1, max_length=20)


@app.get("/api/evolve")
def overview() -> dict:
    return evolve_service.overview()


@app.delete("/api/evolve/runs")
def clear_all_runs() -> dict:
    try:
        return {"deletedRuns": evolve_service.clear_all_runs()}
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/evolve/runs", status_code=201)
def start_run(body: StartRunRequest) -> dict:
    try:
        return evolve_service.start_run(body.prompt)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/evolve/runs/{run_id}")
def run_detail(run_id: str) -> dict:
    try:
        return evolve_service.run_detail(run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/evolve/runs/{run_id}/candidates/{candidate_id}/preview")
def generate_candidate_preview(run_id: str, candidate_id: str) -> dict:
    try:
        return {"previews": evolve_service.generate_candidate_preview(run_id, candidate_id)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="OpenAI could not generate MCQs for this prompt. Try again.") from exc


@app.post("/api/evolve/runs/{run_id}/candidates/{candidate_id}/answer")
def submit_answer(run_id: str, candidate_id: str, body: AnswerRequest) -> dict:
    try:
        return evolve_service.submit_answer(run_id, candidate_id, body.caseIndex, body.choiceId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not save this answer. Try again.") from exc


@app.post("/api/evolve/runs/{run_id}/candidates/{candidate_id}/continue-answer", status_code=201)
def continue_with_answer(run_id: str, candidate_id: str) -> dict:
    try:
        return evolve_service.continue_with_answer(run_id, candidate_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/evolve/runs/{run_id}/retry", status_code=201)
def retry_iteration(run_id: str) -> dict:
    try:
        return evolve_service.retry_iteration(run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
