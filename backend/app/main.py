from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .ai_service import AnalyticsAssistant
from .config import settings
from .schemas import ActionUpdateRequest, ChatRequest, PredictionRequest
from .services import ModelRuntime, action_store, get_runtime

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Real-data HR attrition analytics and prediction API for LaidbackHR.AI.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": settings.app_name, "docs": "/docs", "health": f"{settings.api_prefix}/health"}


@app.get(f"{settings.api_prefix}/health")
def health(runtime: ModelRuntime = Depends(get_runtime)) -> dict[str, object]:
    return {
        "status": "ok",
        "model": runtime.metadata["model_name"],
        "modelVersion": runtime.metadata["model_version"],
        "rows": len(runtime.data),
    }


@app.get(f"{settings.api_prefix}/dashboard")
def dashboard(runtime: ModelRuntime = Depends(get_runtime)) -> dict[str, object]:
    return runtime.dashboard()


@app.get(f"{settings.api_prefix}/model")
def model_info(runtime: ModelRuntime = Depends(get_runtime)) -> dict[str, object]:
    return runtime.metadata


@app.get(f"{settings.api_prefix}/schema")
def prediction_schema(runtime: ModelRuntime = Depends(get_runtime)) -> dict[str, object]:
    return {
        "numericRanges": runtime.metadata["numeric_ranges"],
        "categoricalOptions": runtime.metadata["categorical_options"],
        "excludedFromModel": runtime.metadata["dataset"]["excluded_from_model"],
        "threshold": runtime.threshold,
    }


@app.post(f"{settings.api_prefix}/predict")
def predict(payload: PredictionRequest, runtime: ModelRuntime = Depends(get_runtime)) -> dict[str, object]:
    try:
        return runtime.predict(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get(f"{settings.api_prefix}/employees")
def employees(
    risk: str = Query("all", pattern="^(all|high|medium|low)$"),
    search: str = Query("", max_length=100),
    limit: int = Query(2000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    runtime: ModelRuntime = Depends(get_runtime),
) -> dict[str, object]:
    rows = runtime.employees()
    if risk != "all":
        rows = [row for row in rows if row["riskLevel"] == risk]
    if search.strip():
        needle = search.strip().lower()
        rows = [
            row
            for row in rows
            if needle in f"{row['id']} {row['name']} {row['department']} {row['role']}".lower()
        ]
    return {"total": len(rows), "items": rows[offset : offset + limit]}


@app.get(f"{settings.api_prefix}/actions")
def actions(runtime: ModelRuntime = Depends(get_runtime)) -> dict[str, object]:
    items = runtime.actions()
    return {
        "items": items,
        "stats": {
            "actions": len(items),
            "awaitingApproval": sum(item["status"] == "needs_approval" for item in items),
            "completed": sum(item["status"] == "completed" for item in items),
        },
    }


@app.post(f"{settings.api_prefix}/actions/{{action_id}}")
def update_action(
    action_id: str,
    payload: ActionUpdateRequest,
    runtime: ModelRuntime = Depends(get_runtime),
) -> dict[str, object]:
    valid_ids = {item["id"] for item in runtime.actions()} | {"A-01", "A-02", "A-03", "A-04"}
    if action_id not in valid_ids:
        raise HTTPException(status_code=404, detail="Action not found")
    action_store.set(action_id, payload.status)
    return {"id": action_id, "status": payload.status}


@app.post(f"{settings.api_prefix}/chat")
async def chat(payload: ChatRequest, runtime: ModelRuntime = Depends(get_runtime)) -> dict[str, object]:
    return await AnalyticsAssistant(runtime).answer(payload.message)


@app.get(f"{settings.api_prefix}/data-dictionary")
def data_dictionary(runtime: ModelRuntime = Depends(get_runtime)) -> dict[str, object]:
    return runtime.data_dictionary()
