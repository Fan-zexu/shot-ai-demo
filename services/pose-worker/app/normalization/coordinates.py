from __future__ import annotations

from math import acos, degrees, hypot
from statistics import median

from app.models import (
    BODY_REGIONS,
    CanonicalSkeleton,
    MotionFrame,
    NormalizedLandmark2D,
    PoseFrame,
    landmark_map,
)


SEGMENTS = {
    "shoulder_width": ("left_shoulder", "right_shoulder"),
    "hip_width": ("left_hip", "right_hip"),
    "left_upper_arm": ("left_shoulder", "left_elbow"),
    "left_forearm": ("left_elbow", "left_wrist"),
    "right_upper_arm": ("right_shoulder", "right_elbow"),
    "right_forearm": ("right_elbow", "right_wrist"),
    "left_thigh": ("left_hip", "left_knee"),
    "left_shin": ("left_knee", "left_ankle"),
    "right_thigh": ("right_hip", "right_knee"),
    "right_shin": ("right_knee", "right_ankle"),
}


def _distance(a, b) -> float:
    return hypot(a.x - b.x, a.y - b.y)


def _angle(a, b, c) -> float | None:
    ab = (a.x - b.x, a.y - b.y)
    cb = (c.x - b.x, c.y - b.y)
    denominator = hypot(*ab) * hypot(*cb)
    if denominator <= 1e-9:
        return None
    cosine = max(-1.0, min(1.0, (ab[0] * cb[0] + ab[1] * cb[1]) / denominator))
    return degrees(acos(cosine))


def normalize_frames(frames: list[PoseFrame]) -> tuple[list[MotionFrame], CanonicalSkeleton]:
    if not frames:
        raise ValueError("LOW_POSE_CONFIDENCE: no pose frames")

    torso_lengths: list[float] = []
    for frame in frames:
        points = landmark_map(frame)
        hip_x = (points["left_hip"].x + points["right_hip"].x) / 2
        hip_y = (points["left_hip"].y + points["right_hip"].y) / 2
        shoulder_x = (points["left_shoulder"].x + points["right_shoulder"].x) / 2
        shoulder_y = (points["left_shoulder"].y + points["right_shoulder"].y) / 2
        torso_lengths.append(hypot(shoulder_x - hip_x, shoulder_y - hip_y))
    scale = median(torso_lengths)
    if scale <= 1e-9:
        raise ValueError("LOW_POSE_CONFIDENCE: invalid torso scale")

    first = landmark_map(frames[0])
    first_hip_x = (first["left_hip"].x + first["right_hip"].x) / 2
    facing_multiplier = 1 if first["nose"].x >= first_hip_x else -1

    segment_samples: dict[str, list[float]] = {name: [] for name in SEGMENTS}
    normalized_frames: list[MotionFrame] = []
    for frame in frames:
        points = landmark_map(frame)
        root_x = (points["left_hip"].x + points["right_hip"].x) / 2
        root_y = (points["left_hip"].y + points["right_hip"].y) / 2
        normalized = [
            NormalizedLandmark2D(
                name=point.name,
                x=((point.x - root_x) / scale) * facing_multiplier,
                y=(point.y - root_y) / scale,
                confidence=min(point.visibility, point.presence),
            )
            for point in frame.landmarks
        ]
        normalized_map = {point.name: point for point in normalized}
        for segment, (start, end) in SEGMENTS.items():
            if start in normalized_map and end in normalized_map:
                segment_samples[segment].append(_distance(normalized_map[start], normalized_map[end]))

        angles = {
            "left_elbow": _angle(points["left_shoulder"], points["left_elbow"], points["left_wrist"]),
            "right_elbow": _angle(points["right_shoulder"], points["right_elbow"], points["right_wrist"]),
            "left_knee": _angle(points["left_hip"], points["left_knee"], points["left_ankle"]),
            "right_knee": _angle(points["right_hip"], points["right_knee"], points["right_ankle"]),
        }
        normalized_frames.append(
            MotionFrame(
                **frame.model_dump(),
                normalized_landmarks=normalized,
                retargeted_landmarks=[point.model_copy() for point in normalized],
                joint_angles_deg=angles,
                region_confidence={region: frame.pose_confidence for region in BODY_REGIONS},
            )
        )

    segment_lengths = {
        segment: median(values) for segment, values in segment_samples.items() if values
    }
    return normalized_frames, CanonicalSkeleton(segment_lengths=segment_lengths)
