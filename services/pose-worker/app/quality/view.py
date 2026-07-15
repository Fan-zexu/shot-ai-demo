from __future__ import annotations

from math import hypot
from statistics import median

from app.models import PoseFrame, ShootingHand, ViewType, landmark_map


def classify_view(frames: list[PoseFrame], shooting_hand: ShootingHand) -> ViewType:
    ratios: list[float] = []
    side_visibility: list[float] = []
    opposite_visibility: list[float] = []
    opposite = "left" if shooting_hand == "right" else "right"
    for frame in frames:
        points = landmark_map(frame)
        required = {"left_shoulder", "right_shoulder", "left_hip", "right_hip"}
        if not required.issubset(points):
            continue
        shoulder_width = hypot(
            points["left_shoulder"].x - points["right_shoulder"].x,
            points["left_shoulder"].y - points["right_shoulder"].y,
        )
        shoulder_center = (
            (points["left_shoulder"].x + points["right_shoulder"].x) / 2,
            (points["left_shoulder"].y + points["right_shoulder"].y) / 2,
        )
        hip_center = (
            (points["left_hip"].x + points["right_hip"].x) / 2,
            (points["left_hip"].y + points["right_hip"].y) / 2,
        )
        torso = hypot(shoulder_center[0] - hip_center[0], shoulder_center[1] - hip_center[1])
        if torso > 1e-9:
            ratios.append(shoulder_width / torso)
        shooting_points = [points.get(f"{shooting_hand}_{joint}") for joint in ("shoulder", "elbow", "wrist")]
        opposite_points = [points.get(f"{opposite}_{joint}") for joint in ("shoulder", "elbow", "wrist")]
        if all(shooting_points):
            side_visibility.append(median(point.visibility for point in shooting_points if point))
        if all(opposite_points):
            opposite_visibility.append(median(point.visibility for point in opposite_points if point))

    if not ratios:
        return "unknown"
    ratio = median(ratios)
    if ratio >= 0.72:
        return "front"
    if ratio > 0.50:
        return "oblique"
    if not side_visibility:
        return "unknown"
    if opposite_visibility and median(side_visibility) + 0.15 < median(opposite_visibility):
        return "opposite_side"
    return "shooting_side"
