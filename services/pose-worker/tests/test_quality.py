from app.models import VideoMetadata
from app.quality.evaluate import evaluate_quality
from app.quality.thresholds import USER_THRESHOLDS, apply_threshold_overrides
from tests.fixtures import make_frames


def user_metadata() -> VideoMetadata:
    return VideoMetadata(
        duration_ms=5000,
        width=1280,
        height=720,
        rotation_deg=0,
        nominal_fps=30,
        frame_count=150,
        container="mov,mp4,m4a,3gp,3g2,mj2",
        codec="h264",
    )


def test_user_quality_rejects_sustained_body_crop():
    frames = make_frames(count=30, missing_feet_from=20)
    report = evaluate_quality(
        metadata=user_metadata(),
        frames=frames,
        source_type="user",
        normal_speed_confirmed=True,
        timing_rejection_codes=[],
        thresholds=USER_THRESHOLDS,
    )

    assert report.status == "rejected"
    assert "USER_BODY_OUT_OF_FRAME" in report.rejection_codes
    assert "lower_body" in report.rejected_regions


def test_user_quality_rejects_unconfirmed_normal_speed():
    report = evaluate_quality(
        metadata=user_metadata(),
        frames=make_frames(),
        source_type="user",
        normal_speed_confirmed=False,
        timing_rejection_codes=[],
        thresholds=USER_THRESHOLDS,
    )

    assert report.status == "rejected"
    assert "ABNORMAL_VIDEO_TIMING" in report.rejection_codes


def test_user_quality_rejects_an_eleven_frame_landmark_gap_even_when_total_coverage_passes():
    report = evaluate_quality(
        metadata=user_metadata(),
        frames=make_frames(count=150, missing_feet_from=139),
        source_type="user",
        normal_speed_confirmed=True,
        timing_rejection_codes=[],
        thresholds=USER_THRESHOLDS,
    )

    assert "USER_BODY_OUT_OF_FRAME" in report.rejection_codes
    check = next(item for item in report.checks if item.code == "MAX_CONSECUTIVE_MISSING_FRAMES")
    assert check.measured_value == 11


def test_quality_threshold_overrides_are_validated_and_versionable():
    updated = apply_threshold_overrides(
        USER_THRESHOLDS,
        {"minPoseConfidence": 0.72, "maxConsecutiveMissingFrames": 8},
    )

    assert updated.min_pose_confidence == 0.72
    assert updated.max_consecutive_missing_frames == 8
