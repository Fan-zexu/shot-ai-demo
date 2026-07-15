import numpy as np
import pytest

from app.events.detect import detect_events, map_events_to_source_frames
from app.events.signals import MotionSignals
from app.models import MOTION_EVENT_NAMES, MotionEvent
from app.normalization.coordinates import normalize_frames
from tests.fixtures import make_frames


def test_detects_six_strictly_ordered_pose_events():
    hip_y = np.array(
        [0.50] * 5
        + [0.53, 0.57, 0.61, 0.65, 0.68, 0.70]
        + [0.69, 0.66, 0.62, 0.58, 0.54, 0.50, 0.47, 0.45, 0.43]
        + [0.42] * 10,
    )
    knee_angle = np.array(
        [150] * 5
        + [145, 135, 125, 110, 98, 92]
        + [96, 108, 122, 138, 152, 163, 170, 174, 176]
        + [176] * 10,
    )
    wrist_above_shoulder = np.array([0.0] * 12 + list(np.linspace(0.02, 0.45, 12)) + [0.45] * 6)
    elbow_angle = np.array([90] * 14 + list(np.linspace(95, 174, 11)) + [174] * 5)
    body_extension = np.array([0.1] * 16 + list(np.linspace(0.2, 1.0, 9)) + [0.8, 0.5, 0.2, 0.08, 0.03])
    stability = np.array([0.9] * 5 + [0.2] * 20 + [0.3, 0.55, 0.75, 0.9, 0.95])

    events = detect_events(
        MotionSignals(
            hip_y=hip_y,
            knee_angle_deg=knee_angle,
            wrist_above_shoulder=wrist_above_shoulder,
            elbow_angle_deg=elbow_angle,
            body_extension=body_extension,
            stability=stability,
        ),
        fps=30,
    )

    frames = [events[name].frame_index for name in MOTION_EVENT_NAMES]
    assert frames == sorted(frames)
    assert len(set(frames)) == 6
    assert events["release_pose_proxy"].is_proxy is True
    assert all(event.confidence >= 0.6 for event in events.values())


def test_multiple_shot_cycles_are_rejected_instead_of_silently_selecting_one():
    cycle = np.array([0.5, 0.52, 0.58, 0.66, 0.7, 0.64, 0.56, 0.5, 0.48, 0.47])
    hip_y = np.concatenate([cycle, cycle])
    length = len(hip_y)
    signals = MotionSignals(
        hip_y=hip_y,
        knee_angle_deg=np.linspace(100, 170, length),
        wrist_above_shoulder=np.linspace(0, 0.4, length),
        elbow_angle_deg=np.linspace(90, 170, length),
        body_extension=np.linspace(0, 1, length),
        stability=np.full(length, 0.9),
    )

    with pytest.raises(ValueError, match="MULTIPLE_ACTIONS_DETECTED"):
        detect_events(signals, fps=10)


def test_event_offsets_are_mapped_back_to_original_video_frames():
    motion_frames, _ = normalize_frames(make_frames(count=6))
    source_frames = [
        frame.model_copy(
            update={"frame_index": index * 2, "timestamp_ms": index * (2000 / 30)}
        )
        for index, frame in enumerate(motion_frames)
    ]
    events = {
        name: MotionEvent(
            name=name,
            frame_index=index,
            timestamp_ms=index * (1000 / 30),
            confidence=0.9,
            evidence={"ordered": 1},
            is_proxy=name == "release_pose_proxy",
        )
        for index, name in enumerate(MOTION_EVENT_NAMES)
    }

    mapped = map_events_to_source_frames(events, source_frames)

    assert [mapped[name].frame_index for name in MOTION_EVENT_NAMES] == [0, 2, 4, 6, 8, 10]
    assert mapped["follow_through_end"].timestamp_ms == pytest.approx(10000 / 30)
