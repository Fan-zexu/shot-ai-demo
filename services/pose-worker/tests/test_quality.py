from app.models import VideoMetadata
from app.quality.evaluate import evaluate_quality
from app.quality.thresholds import (
    TEMPLATE_THRESHOLDS,
    USER_THRESHOLDS,
    apply_threshold_overrides,
)
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


def test_user_body_crop_is_advisory_during_mvp_testing():
    frames = make_frames(count=30, missing_feet_from=20)
    report = evaluate_quality(
        metadata=user_metadata(),
        frames=frames,
        source_type="user",
        shooting_hand="right",
        normal_speed_confirmed=True,
        timing_rejection_codes=[],
        thresholds=USER_THRESHOLDS,
    )

    assert report.status == "accepted"
    assert report.rejection_codes == []
    assert "lower_body" in report.rejected_regions
    assert any(check.status == "warning" for check in report.checks)


def test_user_unconfirmed_normal_speed_is_advisory_inside_the_worker():
    report = evaluate_quality(
        metadata=user_metadata(),
        frames=make_frames(),
        source_type="user",
        shooting_hand="right",
        normal_speed_confirmed=False,
        timing_rejection_codes=[],
        thresholds=USER_THRESHOLDS,
    )

    speed_check = next(item for item in report.checks if item.code == "NORMAL_SPEED_CONFIRMED")
    assert report.status == "accepted"
    assert report.rejection_codes == []
    assert speed_check.status == "warning"


def test_template_quality_allows_unconfirmed_playback_speed_with_a_warning():
    report = evaluate_quality(
        metadata=user_metadata(),
        frames=make_frames(),
        source_type="template",
        shooting_hand="right",
        normal_speed_confirmed=False,
        timing_rejection_codes=[],
        thresholds=TEMPLATE_THRESHOLDS,
    )

    speed_check = next(item for item in report.checks if item.code == "NORMAL_SPEED_CONFIRMED")
    assert report.status == "accepted"
    assert speed_check.status == "warning"
    assert "ABNORMAL_VIDEO_TIMING" not in report.rejection_codes


def test_complete_two_second_shots_are_not_rejected_by_duration_alone():
    metadata = user_metadata().model_copy(update={"duration_ms": 2000, "frame_count": 60})
    for source_type, thresholds, speed_confirmed in (
        ("user", USER_THRESHOLDS, True),
        ("template", TEMPLATE_THRESHOLDS, False),
    ):
        report = evaluate_quality(
            metadata=metadata,
            frames=make_frames(count=60),
            source_type=source_type,
            shooting_hand="right",
            normal_speed_confirmed=speed_confirmed,
            timing_rejection_codes=[],
            thresholds=thresholds,
        )

        duration = next(item for item in report.checks if item.code == "VIDEO_DURATION")
        assert duration.status == "pass"
        assert "ABNORMAL_VIDEO_TIMING" not in report.rejection_codes


def test_template_allows_natural_far_side_occlusion_in_a_side_view():
    frames = make_frames(count=60)
    far_side_names = {
        "left_elbow",
        "left_wrist",
        "left_knee",
        "left_ankle",
        "left_heel",
        "left_foot_index",
    }
    frames = [
        frame.model_copy(
            update={
                "landmarks": [
                    point.model_copy(update={"visibility": 0.2})
                    if point.name in far_side_names
                    else point
                    for point in frame.landmarks
                ]
            }
        )
        for frame in frames
    ]

    report = evaluate_quality(
        metadata=user_metadata(),
        frames=frames,
        source_type="template",
        shooting_hand="right",
        normal_speed_confirmed=False,
        timing_rejection_codes=[],
        thresholds=TEMPLATE_THRESHOLDS,
    )

    assert report.status == "accepted"
    assert "guide_arm" in report.rejected_regions
    assert {"lower_body", "torso", "shooting_arm", "whole_body_timing"}.issubset(
        report.comparable_regions
    )


def test_quality_failures_are_advisory_for_all_inputs_during_mvp_testing():
    for source_type, thresholds, speed_confirmed in (
        ("user", USER_THRESHOLDS, True),
        ("template", TEMPLATE_THRESHOLDS, False),
    ):
        report = evaluate_quality(
            metadata=user_metadata().model_copy(update={"duration_ms": 500}),
            frames=make_frames(count=30, missing_feet_from=0),
            source_type=source_type,
            shooting_hand="right",
            normal_speed_confirmed=speed_confirmed,
            timing_rejection_codes=["ABNORMAL_VIDEO_TIMING"],
            thresholds=thresholds,
        )

        assert report.status == "accepted"
        assert report.rejection_codes == []
        assert any(check.status == "warning" for check in report.checks)


def test_user_landmark_gap_is_recorded_as_an_advisory_warning():
    report = evaluate_quality(
        metadata=user_metadata(),
        frames=make_frames(count=150, missing_feet_from=139),
        source_type="user",
        shooting_hand="right",
        normal_speed_confirmed=True,
        timing_rejection_codes=[],
        thresholds=USER_THRESHOLDS,
    )

    assert report.status == "accepted"
    assert report.rejection_codes == []
    check = next(item for item in report.checks if item.code == "MAX_CONSECUTIVE_MISSING_FRAMES")
    assert check.measured_value == 11
    assert check.status == "warning"


def test_quality_threshold_overrides_are_validated_and_versionable():
    updated = apply_threshold_overrides(
        USER_THRESHOLDS,
        {"minPoseConfidence": 0.72, "maxConsecutiveMissingFrames": 8},
    )

    assert updated.min_pose_confidence == 0.72
    assert updated.max_consecutive_missing_frames == 8


def test_left_hand_region_mapping_does_not_relabel_the_right_arm_as_shooting_arm():
    from app.quality.evaluate import region_names

    names = region_names("left")

    assert names["shooting_arm"] == {"left_shoulder", "left_elbow", "left_wrist"}
    assert names["guide_arm"] == {"right_shoulder", "right_elbow", "right_wrist"}
