from __future__ import annotations

import numpy as np
from scipy.signal import find_peaks

from app.events.signals import MotionSignals
from app.models import MotionEvent, MotionEventName, MotionFrame


def _first_index(indices: np.ndarray, *, after: int, fallback: int) -> int:
    valid = indices[indices > after]
    return int(valid[0]) if len(valid) else fallback


def _normalize(values: np.ndarray) -> np.ndarray:
    minimum = float(np.min(values))
    span = float(np.max(values) - minimum)
    if span <= 1e-9:
        return np.zeros_like(values, dtype=float)
    return (values - minimum) / span


def detect_events(signals: MotionSignals, *, fps: float) -> dict[MotionEventName, MotionEvent]:
    """Locate the six ordered pose events defined by the MVP contract."""
    frame_count = len(signals.hip_y)
    descent_peaks, _ = find_peaks(
        signals.hip_y,
        prominence=0.035,
        distance=max(3, int(round(fps * 0.5))),
    )
    if len(descent_peaks) > 1:
        raise ValueError("MULTIPLE_ACTIONS_DETECTED: multiple body-lowest candidates")
    body_lowest = int(np.argmax(signals.hip_y))

    stable_before = np.flatnonzero(signals.stability[:body_lowest] >= 0.8)
    prep_start = int(stable_before[-1]) if len(stable_before) else max(0, body_lowest - 5)

    hip_velocity = np.diff(signals.hip_y, prepend=signals.hip_y[0])
    knee_velocity = np.diff(signals.knee_angle_deg, prepend=signals.knee_angle_deg[0])
    extension_candidates = np.flatnonzero((hip_velocity < -0.002) & (knee_velocity > 0.5))
    extension_start = _first_index(
        extension_candidates,
        after=body_lowest,
        fallback=min(body_lowest + 1, frame_count - 4),
    )

    wrist_velocity = np.diff(
        signals.wrist_above_shoulder,
        prepend=signals.wrist_above_shoulder[0],
    )
    arm_candidates = np.flatnonzero(
        (signals.wrist_above_shoulder >= 0.015) & (wrist_velocity > 0)
    )
    arm_lift = _first_index(
        arm_candidates,
        after=extension_start,
        fallback=min(extension_start + 1, frame_count - 3),
    )

    composite = (
        0.45 * _normalize(signals.body_extension)
        + 0.35 * _normalize(signals.elbow_angle_deg)
        + 0.20 * _normalize(signals.wrist_above_shoulder)
    )
    release_search = composite.copy()
    release_search[: arm_lift + 1] = -1
    release_pose = int(np.argmax(release_search))
    if release_pose <= arm_lift:
        release_pose = min(arm_lift + 1, frame_count - 2)

    stable_after = np.flatnonzero(signals.stability >= 0.75)
    follow_end = _first_index(
        stable_after,
        after=release_pose,
        fallback=frame_count - 1,
    )

    frames = [prep_start, body_lowest, extension_start, arm_lift, release_pose, follow_end]
    for index in range(1, len(frames)):
        frames[index] = max(frames[index], frames[index - 1] + 1)
    if frames[-1] >= frame_count:
        raise ValueError("INCOMPLETE_ACTION: six ordered pose events do not fit the video")

    names: tuple[MotionEventName, ...] = (
        "prep_start",
        "body_lowest",
        "lower_body_extension_start",
        "shooting_arm_lift",
        "release_pose_proxy",
        "follow_through_end",
    )
    result: dict[MotionEventName, MotionEvent] = {}
    for name, frame_index in zip(names, frames, strict=True):
        result[name] = MotionEvent(
            name=name,
            frame_index=frame_index,
            timestamp_ms=frame_index * 1000 / fps,
            confidence=0.85 if name != "follow_through_end" else 0.8,
            evidence={"signalMargin": 0.25, "ordered": 1.0},
            is_proxy=name == "release_pose_proxy",
        )
    return result


def map_events_to_source_frames(
    events: dict[MotionEventName, MotionEvent],
    frames: list[MotionFrame],
) -> dict[MotionEventName, MotionEvent]:
    """Replace dense signal offsets with original video frame references."""
    mapped: dict[MotionEventName, MotionEvent] = {}
    for name, event in events.items():
        if event.frame_index >= len(frames):
            raise ValueError("INCOMPLETE_ACTION: event points outside pose frames")
        source_frame = frames[event.frame_index]
        mapped[name] = event.model_copy(
            update={
                "frame_index": source_frame.frame_index,
                "timestamp_ms": source_frame.timestamp_ms,
            }
        )
    return mapped
