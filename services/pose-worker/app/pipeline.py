from __future__ import annotations

import gzip
import json
import time
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.events.detect import detect_events, map_events_to_source_frames
from app.events.from_frames import build_motion_signals
from app.models import (
    AnalyzeMotionAccepted,
    AnalyzeMotionRejected,
    AnalyzeMotionRequest,
    AnalyzeMotionResponse,
    MotionArtifact,
    QualityCheck,
)
from app.normalization.coordinates import normalize_frames
from app.pose.backend import PoseBackend
from app.quality.evaluate import evaluate_quality
from app.quality.thresholds import (
    TEMPLATE_THRESHOLDS,
    USER_THRESHOLDS,
    apply_threshold_overrides,
)
from app.quality.view import classify_view
from app.video.camera import estimate_global_motion
from app.video.probe import probe_timestamps, probe_video
from app.video.timing import inspect_repeated_frames, inspect_timestamps


def _reject(report, code: str, check: QualityCheck | None = None):
    checks = [*report.checks]
    if check is not None:
        checks.append(check)
    rejection_codes = list(dict.fromkeys([*report.rejection_codes, code]))
    return report.model_copy(
        update={
            "status": "rejected",
            "checks": checks,
            "rejection_codes": rejection_codes,
        }
    )


def _write_artifact(path: Path, artifact: MotionArtifact) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f"{path.name}.partial")
    payload = json.dumps(
        artifact.model_dump(by_alias=True, mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf8")
    with gzip.open(partial, "wb", compresslevel=6) as handle:
        handle.write(payload)
    partial.replace(path)


def analyze_motion(
    request: AnalyzeMotionRequest,
    backend: PoseBackend,
) -> AnalyzeMotionResponse:
    """Run the deterministic video-to-artifact pipeline for one source file."""
    started = time.perf_counter()
    metadata = probe_video(request.file_path)
    probe_finished = time.perf_counter()
    timing_codes = inspect_timestamps(probe_timestamps(request.file_path))
    if request.source_type == "user":
        timing_codes.extend(inspect_repeated_frames(request.file_path))
    frames = backend.analyze_video(request.file_path, metadata)
    pose_finished = time.perf_counter()
    defaults = USER_THRESHOLDS if request.source_type == "user" else TEMPLATE_THRESHOLDS
    thresholds = apply_threshold_overrides(defaults, request.thresholds)
    report = evaluate_quality(
        metadata=metadata,
        frames=frames,
        source_type=request.source_type,
        shooting_hand=request.shooting_hand,
        normal_speed_confirmed=request.normal_speed_confirmed,
        timing_rejection_codes=timing_codes,
        thresholds=thresholds,
        source_file_id=request.source_file_id,
    )
    detected_view = classify_view(frames, request.shooting_hand)
    if detected_view != "shooting_side":
        view_check = QualityCheck(
            code="SIDE_VIEW",
            status="warning",
            measured_value=detected_view,
            threshold="shooting_side",
            message="拍摄角度不是投篮手侧面",
        )
        report.checks.append(view_check)
    else:
        report.checks.append(
            QualityCheck(
                code="SIDE_VIEW",
                status="pass",
                measured_value=detected_view,
                threshold="shooting_side",
                message="拍摄角度符合投篮手侧面要求",
            )
        )

    camera = estimate_global_motion(request.file_path, frames)
    if bool(camera["confident"]) and (
        float(camera["maxJumpRatio"]) > 0.05
        or float(camera["medianTranslationRatio"]) > 0.02
    ):
        camera_check = QualityCheck(
            code="CAMERA_STABILITY",
            status="warning",
            measured_value=float(camera["maxJumpRatio"]),
            threshold=0.05,
            message="相机存在明显移动、跳变或变焦",
        )
        report.checks.append(camera_check)

    if report.status == "rejected":
        return AnalyzeMotionRejected(
            quality_report=report,
            rejection_codes=report.rejection_codes,
        )

    normalized_frames, skeleton = normalize_frames(frames)
    signals = build_motion_signals(normalized_frames, request.shooting_hand)
    try:
        events = map_events_to_source_frames(
            detect_events(signals, fps=metadata.nominal_fps),
            normalized_frames,
        )
    except ValueError as error:
        code = str(error).split(":", 1)[0]
        if code not in {"MULTIPLE_ACTIONS_DETECTED", "INCOMPLETE_ACTION"}:
            code = "INCOMPLETE_ACTION"
        report = _reject(report, code)
        return AnalyzeMotionRejected(
            quality_report=report,
            rejection_codes=report.rejection_codes,
        )
    minimum_event_confidence = min(event.confidence for event in events.values())
    if minimum_event_confidence < thresholds.min_event_confidence:
        report = _reject(report, "INCOMPLETE_ACTION")
        return AnalyzeMotionRejected(
            quality_report=report,
            rejection_codes=report.rejection_codes,
        )

    now = datetime.now(UTC).isoformat()
    artifact = MotionArtifact(
        artifact_id=f"artifact_{uuid4().hex}",
        source_type=request.source_type,
        source_file_id=request.source_file_id,
        source_sha256=request.source_sha256,
        created_at=now,
        video=metadata,
        capture={
            "shootingHand": request.shooting_hand,
            "detectedView": detected_view,
            "facingDirection": "right",
            "normalSpeedConfirmed": request.normal_speed_confirmed,
        },
        quality={
            "checks": [
                check.model_dump(by_alias=True, mode="json", exclude_none=True)
                for check in report.checks
            ],
            "overallPoseConfidence": report.overall_pose_confidence or 0,
            "comparableRegions": report.comparable_regions,
            "rejectedRegions": report.rejected_regions,
        },
        events=events,
        frames=normalized_frames,
        canonical_skeleton=skeleton,
        provenance={
            "modelName": backend.model_name,
            "modelVersion": backend.model_version,
            "modelSha256": backend.model_sha256,
            "pipelineVersion": "1.0.0",
            "thresholdSnapshot": asdict(thresholds),
            "runtime": "python-3.11",
            "stageDurationsMs": {
                "probe": round((probe_finished - started) * 1000, 3),
                "pose": round((pose_finished - probe_finished) * 1000, 3),
                "total": round((time.perf_counter() - started) * 1000, 3),
            },
        },
    )
    output = Path(request.output_path)
    _write_artifact(output, artifact)
    return AnalyzeMotionAccepted(quality_report=report, motion_artifact_path=str(output))
