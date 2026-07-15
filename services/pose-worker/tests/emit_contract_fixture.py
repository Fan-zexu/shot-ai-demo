from datetime import UTC, datetime

from app.events.detect import detect_events
from app.events.from_frames import build_motion_signals
from app.models import MotionArtifact
from app.normalization.coordinates import normalize_frames
from tests.fixtures import make_shot_frames


frames, skeleton = normalize_frames(make_shot_frames())
events = detect_events(build_motion_signals(frames, "right"), fps=30)
artifact = MotionArtifact(
    artifact_id="artifact_python_contract",
    source_type="user",
    source_file_id="file_python_contract",
    source_sha256="a" * 64,
    created_at=datetime.now(UTC).isoformat(),
    video={
        "durationMs": 3000,
        "width": 720,
        "height": 720,
        "rotationDeg": 0,
        "nominalFps": 30,
        "frameCount": 90,
        "container": "mp4",
        "codec": "h264",
    },
    capture={
        "shootingHand": "right",
        "detectedView": "shooting_side",
        "facingDirection": "right",
        "normalSpeedConfirmed": True,
    },
    quality={
        "checks": [],
        "overallPoseConfidence": 0.92,
        "comparableRegions": [
            "lower_body",
            "torso",
            "shooting_arm",
            "guide_arm",
            "whole_body_timing",
        ],
        "rejectedRegions": {},
    },
    events=events,
    frames=frames,
    canonical_skeleton=skeleton,
    provenance={
        "modelName": "contract-test",
        "modelVersion": "test",
        "modelSha256": "b" * 64,
        "pipelineVersion": "1.0.0",
        "thresholdSnapshot": {"poseConfidence": 0.6},
        "runtime": "python-test",
        "stageDurationsMs": {"pose": 1},
    },
)
print(artifact.model_dump_json(by_alias=True, exclude_none=True))
