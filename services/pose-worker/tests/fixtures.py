from __future__ import annotations

import subprocess
from pathlib import Path


REQUIRED_NAMES = (
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
)


def make_landmarks(*, missing: set[str] | None = None, frame_index: int = 0):
    from app.models import Landmark2D

    missing = missing or set()
    points = {
        "nose": (0.51, 0.12),
        "left_shoulder": (0.48, 0.28),
        "right_shoulder": (0.52, 0.29),
        "left_elbow": (0.46, 0.40),
        "right_elbow": (0.55, 0.39 - frame_index * 0.001),
        "left_wrist": (0.45, 0.50),
        "right_wrist": (0.58, max(0.05, 0.48 - frame_index * 0.001)),
        "left_hip": (0.49, 0.53),
        "right_hip": (0.52, 0.53),
        "left_knee": (0.48, 0.70),
        "right_knee": (0.53, 0.70),
        "left_ankle": (0.47, 0.88),
        "right_ankle": (0.54, 0.88),
        "left_heel": (0.46, 0.91),
        "right_heel": (0.53, 0.91),
        "left_foot_index": (0.49, 0.92),
        "right_foot_index": (0.56, 0.92),
    }
    return [
        Landmark2D(name=name, x=x, y=y, z=0, visibility=0.95, presence=0.97)
        for name, (x, y) in points.items()
        if name not in missing
    ]


def make_frames(*, count: int = 30, missing_feet_from: int | None = None):
    from app.models import PoseFrame

    frames = []
    for index in range(count):
        missing = set()
        if missing_feet_from is not None and index >= missing_feet_from:
            missing = {"left_heel", "right_heel", "left_foot_index", "right_foot_index"}
        frames.append(
            PoseFrame(
                frame_index=index,
                timestamp_ms=index * (1000 / 30),
                pose_confidence=0.92,
                landmarks=make_landmarks(missing=missing, frame_index=index),
            )
        )
    return frames


def make_shot_frames(*, count: int = 90):
    from app.models import Landmark2D, PoseFrame

    frames = []
    for index in range(count):
        if index < 15:
            hip_offset = 0.0
        elif index <= 35:
            hip_offset = 0.12 * (index - 15) / 20
        elif index <= 70:
            hip_offset = 0.12 * (1 - (index - 35) / 35)
        else:
            hip_offset = 0.0
        arm_progress = min(1.0, max(0.0, (index - 42) / 28))
        settle = min(1.0, max(0.0, (index - 72) / 10))
        points = {point.name: point.model_copy() for point in make_landmarks(frame_index=0)}
        for name in ("left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"):
            points[name].y += hip_offset
        shoulder_y = points["right_shoulder"].y + hip_offset
        points["right_shoulder"].y = shoulder_y
        points["left_shoulder"].y += hip_offset
        points["right_elbow"].x = 0.55 + 0.10 * arm_progress
        points["right_elbow"].y = shoulder_y + 0.11 - 0.25 * arm_progress
        points["right_wrist"].x = 0.58 + 0.13 * arm_progress
        points["right_wrist"].y = shoulder_y + 0.20 - 0.47 * arm_progress
        if settle:
            points["right_wrist"].y += 0.01 * settle
        frames.append(
            PoseFrame(
                frame_index=index,
                timestamp_ms=index * (1000 / 30),
                pose_confidence=0.92,
                landmarks=list(points.values()),
            )
        )
    return frames


def create_video(path: Path, *, frames: int = 12, fps: int = 30, size: str = "320x240") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=size={size}:rate={fps}",
            "-frames:v",
            str(frames),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(path),
        ],
        check=True,
    )
    return path
