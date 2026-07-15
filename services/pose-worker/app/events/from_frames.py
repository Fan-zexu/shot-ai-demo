from __future__ import annotations

from math import acos, degrees, hypot

import numpy as np
from scipy.signal import medfilt, savgol_filter

from app.events.signals import MotionSignals
from app.models import MotionFrame, ShootingHand, landmark_map


def _angle(a, b, c) -> float:
    first = (a.x - b.x, a.y - b.y)
    second = (c.x - b.x, c.y - b.y)
    denominator = hypot(*first) * hypot(*second)
    if denominator <= 1e-9:
        return 0
    cosine = max(-1.0, min(1.0, (first[0] * second[0] + first[1] * second[1]) / denominator))
    return degrees(acos(cosine))


def _smooth(values: np.ndarray) -> np.ndarray:
    if len(values) < 3:
        return values.copy()
    median_filtered = medfilt(values, kernel_size=3)
    window = min(7, len(values) if len(values) % 2 else len(values) - 1)
    if window < 3:
        return median_filtered
    return savgol_filter(median_filtered, window_length=window, polyorder=min(2, window - 1))


def build_motion_signals(frames: list[MotionFrame], shooting_hand: ShootingHand) -> MotionSignals:
    opposite = "left" if shooting_hand == "right" else "right"
    hip_y: list[float] = []
    knee: list[float] = []
    wrist_height: list[float] = []
    elbow: list[float] = []
    extension: list[float] = []

    for frame in frames:
        points = landmark_map(frame)
        hip_y.append((points["left_hip"].y + points["right_hip"].y) / 2)
        left_knee = _angle(points["left_hip"], points["left_knee"], points["left_ankle"])
        right_knee = _angle(points["right_hip"], points["right_knee"], points["right_ankle"])
        knee.append((left_knee + right_knee) / 2)
        shoulder = points[f"{shooting_hand}_shoulder"]
        wrist = points[f"{shooting_hand}_wrist"]
        wrist_height.append(shoulder.y - wrist.y)
        elbow_angle = _angle(shoulder, points[f"{shooting_hand}_elbow"], wrist)
        elbow.append(elbow_angle)
        guide_extension = _angle(
            points[f"{opposite}_shoulder"],
            points[f"{opposite}_elbow"],
            points[f"{opposite}_wrist"],
        )
        extension.append((elbow_angle + guide_extension + left_knee + right_knee) / 4)

    smoothed_hip = _smooth(np.asarray(hip_y, dtype=float))
    smoothed_knee = _smooth(np.asarray(knee, dtype=float))
    smoothed_wrist = _smooth(np.asarray(wrist_height, dtype=float))
    smoothed_elbow = _smooth(np.asarray(elbow, dtype=float))
    smoothed_extension = _smooth(np.asarray(extension, dtype=float))
    combined_speed = (
        np.abs(np.gradient(smoothed_hip))
        + np.abs(np.gradient(smoothed_wrist))
        + np.abs(np.gradient(smoothed_elbow)) / 180
    )
    stability = 1 / (1 + combined_speed * 30)
    return MotionSignals(
        hip_y=smoothed_hip,
        knee_angle_deg=smoothed_knee,
        wrist_above_shoulder=smoothed_wrist,
        elbow_angle_deg=smoothed_elbow,
        body_extension=smoothed_extension,
        stability=stability,
    )
