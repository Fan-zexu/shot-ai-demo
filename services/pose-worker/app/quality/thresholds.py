from dataclasses import dataclass, replace


@dataclass(frozen=True)
class QualityThresholds:
    min_duration_ms: int
    max_duration_ms: int
    min_short_side_px: int
    min_fps: float
    required_landmark_coverage: float
    max_consecutive_missing_frames: int
    min_pose_confidence: float
    min_event_confidence: float
    min_comparable_regions: int = 4


USER_THRESHOLDS = QualityThresholds(
    min_duration_ms=3000,
    max_duration_ms=15000,
    min_short_side_px=720,
    min_fps=30,
    required_landmark_coverage=0.90,
    max_consecutive_missing_frames=10,
    min_pose_confidence=0.60,
    min_event_confidence=0.70,
)

TEMPLATE_THRESHOLDS = QualityThresholds(
    min_duration_ms=3000,
    max_duration_ms=15000,
    min_short_side_px=0,
    min_fps=0,
    required_landmark_coverage=0.85,
    max_consecutive_missing_frames=15,
    min_pose_confidence=0.55,
    min_event_confidence=0.60,
)


OVERRIDE_FIELDS = {
    "minDurationMs": "min_duration_ms",
    "maxDurationMs": "max_duration_ms",
    "minShortSidePx": "min_short_side_px",
    "minFps": "min_fps",
    "requiredLandmarkCoverage": "required_landmark_coverage",
    "maxConsecutiveMissingFrames": "max_consecutive_missing_frames",
    "minPoseConfidence": "min_pose_confidence",
    "minEventConfidence": "min_event_confidence",
    "minComparableRegions": "min_comparable_regions",
}


def apply_threshold_overrides(
    defaults: QualityThresholds,
    values: dict[str, float | str | bool],
) -> QualityThresholds:
    overrides = {}
    for external_name, field_name in OVERRIDE_FIELDS.items():
        if external_name not in values:
            continue
        value = values[external_name]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"invalid numeric threshold: {external_name}")
        overrides[field_name] = value
    result = replace(defaults, **overrides)
    if not 0 <= result.required_landmark_coverage <= 1:
        raise ValueError("requiredLandmarkCoverage must be within 0..1")
    if not 0 <= result.min_pose_confidence <= 1 or not 0 <= result.min_event_confidence <= 1:
        raise ValueError("confidence thresholds must be within 0..1")
    if result.min_duration_ms > result.max_duration_ms:
        raise ValueError("minDurationMs cannot exceed maxDurationMs")
    return result
