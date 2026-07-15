from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


SourceType = Literal["template", "user"]
ShootingHand = Literal["left", "right"]
ViewType = Literal[
    "shooting_side",
    "opposite_side",
    "front",
    "back",
    "oblique",
    "unknown",
]
BodyRegion = Literal[
    "lower_body",
    "torso",
    "shooting_arm",
    "guide_arm",
    "whole_body_timing",
]
MotionEventName = Literal[
    "prep_start",
    "body_lowest",
    "lower_body_extension_start",
    "shooting_arm_lift",
    "release_pose_proxy",
    "follow_through_end",
]

BODY_REGIONS: tuple[BodyRegion, ...] = (
    "lower_body",
    "torso",
    "shooting_arm",
    "guide_arm",
    "whole_body_timing",
)
MOTION_EVENT_NAMES: tuple[MotionEventName, ...] = (
    "prep_start",
    "body_lowest",
    "lower_body_extension_start",
    "shooting_arm_lift",
    "release_pose_proxy",
    "follow_through_end",
)


class VideoMetadata(ContractModel):
    duration_ms: float = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    rotation_deg: float = 0
    nominal_fps: float = Field(gt=0)
    frame_count: int = Field(gt=0)
    container: str = Field(min_length=1)
    codec: str = Field(min_length=1)


class Landmark2D(ContractModel):
    name: str = Field(min_length=1)
    x: float
    y: float
    z: float | None = None
    visibility: float = Field(ge=0, le=1)
    presence: float = Field(ge=0, le=1)


class NormalizedLandmark2D(ContractModel):
    name: str = Field(min_length=1)
    x: float
    y: float
    confidence: float = Field(ge=0, le=1)


class PoseFrame(ContractModel):
    frame_index: int = Field(ge=0)
    timestamp_ms: float = Field(ge=0)
    pose_confidence: float = Field(ge=0, le=1)
    landmarks: list[Landmark2D]


class MotionFrame(PoseFrame):
    normalized_landmarks: list[NormalizedLandmark2D]
    retargeted_landmarks: list[NormalizedLandmark2D]
    joint_angles_deg: dict[str, float | None]
    region_confidence: dict[BodyRegion, float]


class CanonicalSkeleton(ContractModel):
    segment_lengths: dict[str, float]
    root: Literal["hip_center"] = "hip_center"
    scale_basis: Literal["torso_length"] = "torso_length"
    facing_direction: Literal["right"] = "right"


class QualityCheck(ContractModel):
    code: str = Field(min_length=1)
    status: Literal["pass", "fail", "warning", "not_applicable"]
    measured_value: float | str | bool | None = None
    threshold: float | str | bool | None = None
    evidence_frame_indices: list[int] | None = None
    message: str = Field(min_length=1)


class QualityReport(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    source_file_id: str = "pending"
    source_type: SourceType
    status: Literal["accepted", "rejected"]
    checks: list[QualityCheck]
    overall_pose_confidence: float | None = Field(default=None, ge=0, le=1)
    comparable_regions: list[BodyRegion]
    rejected_regions: dict[BodyRegion, str]
    rejection_codes: list[str]
    created_at: str


class MotionEvent(ContractModel):
    name: MotionEventName
    frame_index: int = Field(ge=0)
    timestamp_ms: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    evidence: dict[str, float]
    is_proxy: bool


class MotionArtifact(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    artifact_id: str
    source_type: SourceType
    source_file_id: str
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    created_at: str
    video: VideoMetadata
    capture: dict[str, str | bool]
    quality: dict[str, object]
    events: dict[MotionEventName, MotionEvent]
    frames: list[MotionFrame]
    canonical_skeleton: CanonicalSkeleton
    provenance: dict[str, object]


class AnalyzeMotionRequest(ContractModel):
    request_id: str
    source_type: SourceType
    file_path: str
    source_file_id: str
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    shooting_hand: ShootingHand
    normal_speed_confirmed: bool
    thresholds: dict[str, float | str | bool] = Field(default_factory=dict)
    output_path: str


class AnalyzeMotionAccepted(ContractModel):
    status: Literal["accepted"] = "accepted"
    quality_report: QualityReport
    motion_artifact_path: str


class AnalyzeMotionRejected(ContractModel):
    status: Literal["rejected"] = "rejected"
    quality_report: QualityReport
    rejection_codes: list[str]


AnalyzeMotionResponse = Annotated[
    AnalyzeMotionAccepted | AnalyzeMotionRejected,
    Field(discriminator="status"),
]


class PreviewResult(ContractModel):
    frame_count: int = Field(gt=0)
    duration_ms: float = Field(gt=0)
    fps: Literal[30] = 30
    template_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    user_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class RenderAlignedPreviewsRequest(ContractModel):
    template_path: str
    user_path: str
    timeline: list[dict[str, int]]
    template_output_path: str
    user_output_path: str


class HealthResponse(ContractModel):
    status: Literal["ready"] = "ready"
    model_loaded: bool
    model_sha256: str | None
    busy: bool


def landmark_map(frame: PoseFrame | MotionFrame) -> Mapping[str, Landmark2D]:
    return {landmark.name: landmark for landmark in frame.landmarks}
