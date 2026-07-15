from typing import Protocol

from app.models import PoseFrame, VideoMetadata


class PoseBackend(Protocol):
    model_name: str
    model_version: str
    model_sha256: str

    def analyze_video(self, file_path: str, metadata: VideoMetadata) -> list[PoseFrame]: ...
