from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from statistics import median

from app.models import (
    BODY_REGIONS,
    BodyRegion,
    PoseFrame,
    QualityCheck,
    QualityReport,
    ShootingHand,
    SourceType,
    VideoMetadata,
    landmark_map,
)
from app.quality.thresholds import QualityThresholds


REQUIRED_NAMES = {
    "nose",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
}


def region_names(shooting_hand: ShootingHand) -> dict[BodyRegion, set[str]]:
    guide_hand = "left" if shooting_hand == "right" else "right"
    return {
        "lower_body": {
            "left_hip",
            "right_hip",
            "left_knee",
            "right_knee",
            "left_ankle",
            "right_ankle",
            "left_heel",
            "right_heel",
            "left_foot_index",
            "right_foot_index",
        },
        "torso": {"left_shoulder", "right_shoulder", "left_hip", "right_hip"},
        "shooting_arm": {
            f"{shooting_hand}_shoulder",
            f"{shooting_hand}_elbow",
            f"{shooting_hand}_wrist",
        },
        "guide_arm": {
            f"{guide_hand}_shoulder",
            f"{guide_hand}_elbow",
            f"{guide_hand}_wrist",
        },
        "whole_body_timing": REQUIRED_NAMES,
    }


def _point_available(point) -> bool:
    return (
        point.visibility >= 0.5
        and point.presence >= 0.5
        and 0 <= point.x <= 1
        and 0 <= point.y <= 1
    )


def _coverage(frames: list[PoseFrame], names: set[str]) -> tuple[float, list[int]]:
    good = 0
    evidence: list[int] = []
    for frame in frames:
        points = landmark_map(frame)
        if all(name in points and _point_available(points[name]) for name in names):
            good += 1
        else:
            evidence.append(frame.frame_index)
    return (good / len(frames) if frames else 0), evidence


def _longest_consecutive_gap(frames: list[PoseFrame], names: set[str]) -> int:
    longest = 0
    current = 0
    for frame in frames:
        points = landmark_map(frame)
        available = all(name in points and _point_available(points[name]) for name in names)
        current = 0 if available else current + 1
        longest = max(longest, current)
    return longest


def evaluate_quality(
    *,
    metadata: VideoMetadata,
    frames: list[PoseFrame],
    source_type: SourceType,
    shooting_hand: ShootingHand,
    normal_speed_confirmed: bool,
    timing_rejection_codes: Iterable[str],
    thresholds: QualityThresholds,
    source_file_id: str = "pending",
) -> QualityReport:
    checks: list[QualityCheck] = []
    rejection_codes = list(dict.fromkeys(timing_rejection_codes))

    duration_ok = thresholds.min_duration_ms <= metadata.duration_ms <= thresholds.max_duration_ms
    checks.append(
        QualityCheck(
            code="VIDEO_DURATION",
            status="pass" if duration_ok else "fail",
            measured_value=metadata.duration_ms,
            threshold=f"{thresholds.min_duration_ms}..{thresholds.max_duration_ms}",
            message="视频时长符合要求" if duration_ok else "视频时长不在 3–15 秒范围内",
        )
    )
    if not duration_ok:
        rejection_codes.append("ABNORMAL_VIDEO_TIMING")

    resolution_ok = min(metadata.width, metadata.height) >= thresholds.min_short_side_px
    checks.append(
        QualityCheck(
            code="VIDEO_RESOLUTION",
            status="pass" if resolution_ok else "fail",
            measured_value=min(metadata.width, metadata.height),
            threshold=thresholds.min_short_side_px,
            message="视频分辨率符合要求" if resolution_ok else "视频短边分辨率不足",
        )
    )
    if not resolution_ok:
        rejection_codes.append("LOW_POSE_CONFIDENCE")

    fps_ok = metadata.nominal_fps >= thresholds.min_fps
    checks.append(
        QualityCheck(
            code="VIDEO_FRAME_RATE",
            status="pass" if fps_ok else "fail",
            measured_value=metadata.nominal_fps,
            threshold=thresholds.min_fps,
            message="视频帧率符合要求" if fps_ok else "视频帧率不足",
        )
    )
    if not fps_ok:
        rejection_codes.append("ABNORMAL_VIDEO_TIMING")

    speed_required = source_type == "user"
    checks.append(
        QualityCheck(
            code="NORMAL_SPEED_CONFIRMED",
            status=(
                "pass"
                if normal_speed_confirmed
                else "fail"
                if speed_required
                else "warning"
            ),
            measured_value=normal_speed_confirmed,
            threshold=True if speed_required else "not_required_for_template",
            message=(
                "已确认正常速度"
                if normal_speed_confirmed
                else "用户视频未确认为正常速度"
                if speed_required
                else "参考模板允许慢放或剪辑变速，真实速度与节奏不参与比较"
            ),
        )
    )
    if speed_required and not normal_speed_confirmed:
        rejection_codes.append("ABNORMAL_VIDEO_TIMING")

    required_coverage, required_evidence = _coverage(frames, REQUIRED_NAMES)
    coverage_ok = required_coverage >= thresholds.required_landmark_coverage
    checks.append(
        QualityCheck(
            code="REQUIRED_LANDMARK_COVERAGE",
            status="pass" if coverage_ok else "fail",
            measured_value=round(required_coverage, 4),
            threshold=thresholds.required_landmark_coverage,
            evidence_frame_indices=required_evidence[:30] or None,
            message="全身关键点覆盖稳定" if coverage_ok else "人物没有保持全身入镜",
        )
    )
    if not coverage_ok:
        rejection_codes.append("USER_BODY_OUT_OF_FRAME" if source_type == "user" else "LOW_POSE_CONFIDENCE")

    longest_gap = _longest_consecutive_gap(frames, REQUIRED_NAMES)
    gap_ok = longest_gap <= thresholds.max_consecutive_missing_frames
    checks.append(
        QualityCheck(
            code="MAX_CONSECUTIVE_MISSING_FRAMES",
            status="pass" if gap_ok else "fail",
            measured_value=longest_gap,
            threshold=thresholds.max_consecutive_missing_frames,
            message="关键点缺失没有形成长空白" if gap_ok else "关键身体部位连续缺失时间过长",
        )
    )
    if not gap_ok:
        rejection_codes.append("USER_BODY_OUT_OF_FRAME" if source_type == "user" else "LOW_POSE_CONFIDENCE")

    pose_confidence = median(frame.pose_confidence for frame in frames) if frames else 0
    confidence_ok = pose_confidence >= thresholds.min_pose_confidence
    checks.append(
        QualityCheck(
            code="POSE_CONFIDENCE",
            status="pass" if confidence_ok else "fail",
            measured_value=round(pose_confidence, 4),
            threshold=thresholds.min_pose_confidence,
            message="人体姿态识别稳定" if confidence_ok else "关键身体部位识别不稳定",
        )
    )
    if not confidence_ok:
        rejection_codes.append("LOW_POSE_CONFIDENCE")

    comparable_regions: list[BodyRegion] = []
    rejected_regions: dict[BodyRegion, str] = {}
    names_by_region = region_names(shooting_hand)
    for region in BODY_REGIONS:
        coverage, _ = _coverage(frames, names_by_region[region])
        if coverage >= thresholds.required_landmark_coverage:
            comparable_regions.append(region)
        else:
            rejected_regions[region] = f"landmark_coverage_{coverage:.3f}"

    mandatory = {"lower_body", "shooting_arm", "whole_body_timing"}
    regions_ok = (
        len(comparable_regions) >= thresholds.min_comparable_regions
        and mandatory.issubset(comparable_regions)
    )
    if not regions_ok:
        rejection_codes.append("INSUFFICIENT_COMPARABLE_REGIONS")

    rejection_codes = list(dict.fromkeys(rejection_codes))
    return QualityReport(
        source_file_id=source_file_id,
        source_type=source_type,
        status="rejected" if rejection_codes else "accepted",
        checks=checks,
        overall_pose_confidence=pose_confidence,
        comparable_regions=comparable_regions,
        rejected_regions=rejected_regions,
        rejection_codes=rejection_codes,
        created_at=datetime.now(UTC).isoformat(),
    )
