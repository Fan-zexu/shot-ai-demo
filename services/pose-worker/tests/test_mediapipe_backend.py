from pathlib import Path

import pytest

from app.pose.mediapipe_backend import MediaPipePoseBackend


MODEL_PATH = Path(__file__).resolve().parents[3] / "models" / "pose_landmarker_full.task"


@pytest.mark.skipif(not MODEL_PATH.is_file(), reason="run pnpm model:download")
def test_mediapipe_backend_loads_the_pinned_model():
    backend = MediaPipePoseBackend(MODEL_PATH)
    try:
        assert backend.model_name == "MediaPipe Pose Landmarker"
        assert backend.model_version == "0.10.35/full-float16"
        assert len(backend.model_sha256) == 64
    finally:
        backend.close()
