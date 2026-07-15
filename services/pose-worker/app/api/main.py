from __future__ import annotations

from contextlib import asynccontextmanager
from threading import Lock

from fastapi import FastAPI, HTTPException

from app.api.security import require_data_path
from app.config import Settings
from app.models import (
    AnalyzeMotionRequest,
    AnalyzeMotionResponse,
    HealthResponse,
    PreviewResult,
    RenderAlignedPreviewsRequest,
)
from app.pipeline import analyze_motion
from app.pose.backend import PoseBackend
from app.pose.mediapipe_backend import MediaPipePoseBackend
from app.previews.render import render_aligned_previews


def create_app(
    settings: Settings | None = None,
    backend: PoseBackend | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.defaults()
    resolved_settings.data_root.mkdir(parents=True, exist_ok=True)
    owns_backend = backend is None
    resolved_backend = backend or MediaPipePoseBackend(resolved_settings.model_path)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        if owns_backend and hasattr(resolved_backend, "close"):
            resolved_backend.close()

    app = FastAPI(
        title="Short AI Pose Worker",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.backend = resolved_backend
    app.state.busy = False
    app.state.lock = Lock()

    @app.get("/internal/v1/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            model_loaded=app.state.backend is not None,
            model_sha256=getattr(app.state.backend, "model_sha256", None),
            busy=app.state.busy,
        )

    @app.post(
        "/internal/v1/analyze-motion",
        response_model=AnalyzeMotionResponse,
        response_model_exclude_none=True,
    )
    def analyze(request: AnalyzeMotionRequest):
        with app.state.lock:
            app.state.busy = True
            try:
                file_path = require_data_path(request.file_path, resolved_settings.data_root)
                output_path = require_data_path(request.output_path, resolved_settings.data_root)
                return analyze_motion(
                    request.model_copy(
                        update={"file_path": str(file_path), "output_path": str(output_path)}
                    ),
                    app.state.backend,
                )
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error)) from error
            finally:
                app.state.busy = False

    @app.post("/internal/v1/render-aligned-previews", response_model=PreviewResult)
    def render(request: RenderAlignedPreviewsRequest) -> PreviewResult:
        with app.state.lock:
            app.state.busy = True
            try:
                return render_aligned_previews(
                    template_path=require_data_path(request.template_path, resolved_settings.data_root),
                    user_path=require_data_path(request.user_path, resolved_settings.data_root),
                    timeline=request.timeline,
                    template_output_path=require_data_path(
                        request.template_output_path, resolved_settings.data_root
                    ),
                    user_output_path=require_data_path(
                        request.user_output_path, resolved_settings.data_root
                    ),
                )
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error)) from error
            finally:
                app.state.busy = False

    return app
