from pathlib import Path
from types import SimpleNamespace

import pytest

from app.pose.mediapipe_backend import MediaPipePoseBackend
from app.video.probe import probe_video
from tests.fixtures import create_video


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


def test_mediapipe_backend_resets_tracking_state_between_videos(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    instances = []

    class FakeLandmarker:
        def __init__(self):
            self.closed = False
            self.last_timestamp = -1
            self.timestamps: list[int] = []

        def detect_for_video(self, _image, timestamp_ms: int):
            if timestamp_ms <= self.last_timestamp:
                raise ValueError("Input timestamp must be monotonically increasing.")
            self.last_timestamp = timestamp_ms
            self.timestamps.append(timestamp_ms)
            return SimpleNamespace(pose_landmarks=[])

        def close(self):
            self.closed = True

    def create_landmarker(_backend):
        landmarker = FakeLandmarker()
        instances.append(landmarker)
        return landmarker

    monkeypatch.setattr(MediaPipePoseBackend, "_create_landmarker", create_landmarker)
    model_path = tmp_path / "model.task"
    model_path.write_bytes(b"test-model")
    video_path = create_video(tmp_path / "video.mp4", frames=6, fps=120)
    metadata = probe_video(video_path)
    backend = MediaPipePoseBackend(model_path)

    try:
        assert backend.analyze_video(str(video_path), metadata) == []
        assert backend.analyze_video(str(video_path), metadata) == []
        assert len(instances) == 2
        assert instances[0].closed is True
        assert instances[0].timestamps[0] == 0
        assert instances[1].timestamps[0] == 0
    finally:
        backend.close()
