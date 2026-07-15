from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from app.models import PoseFrame


def estimate_global_motion(
    path: str | Path,
    pose_frames: list[PoseFrame] | None = None,
    *,
    sample_every: int = 5,
) -> dict[str, float | bool]:
    """Estimate background translation while excluding the tracked athlete."""
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        return {"confident": False, "medianTranslationRatio": 0.0, "maxJumpRatio": 0.0}
    previous = None
    translations: list[float] = []
    short_side = 1.0
    frame_index = 0
    pose_by_index = {frame.frame_index: frame for frame in pose_frames or []}
    previous_mask = None
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % sample_every:
                frame_index += 1
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            short_side = float(min(gray.shape))
            feature_mask = np.full(gray.shape, 255, dtype=np.uint8)
            pose = pose_by_index.get(frame_index)
            if pose and pose.landmarks:
                # Athlete movement is expected, so only background features may
                # contribute to the camera-stability signal.
                visible = [
                    point
                    for point in pose.landmarks
                    if point.visibility >= 0.5 and point.presence >= 0.5
                ]
                if visible:
                    left = max(
                        0,
                        int((min(point.x for point in visible) - 0.05) * gray.shape[1]),
                    )
                    right = min(
                        gray.shape[1],
                        int((max(point.x for point in visible) + 0.05) * gray.shape[1]),
                    )
                    top = max(
                        0,
                        int((min(point.y for point in visible) - 0.05) * gray.shape[0]),
                    )
                    bottom = min(
                        gray.shape[0],
                        int((max(point.y for point in visible) + 0.05) * gray.shape[0]),
                    )
                    feature_mask[top:bottom, left:right] = 0
            if previous is not None:
                points = cv2.goodFeaturesToTrack(previous, 100, 0.01, 8, mask=previous_mask)
                if points is not None and len(points) >= 8:
                    moved, status, _ = cv2.calcOpticalFlowPyrLK(previous, gray, points, None)
                    if moved is not None and status is not None:
                        deltas = moved[status.flatten() == 1] - points[status.flatten() == 1]
                        if len(deltas):
                            translations.append(float(np.median(np.linalg.norm(deltas, axis=2))))
            previous = gray
            previous_mask = feature_mask
            frame_index += 1
    finally:
        capture.release()
    if not translations:
        return {"confident": False, "medianTranslationRatio": 0.0, "maxJumpRatio": 0.0}
    return {
        "confident": True,
        "medianTranslationRatio": float(np.median(translations) / short_side),
        "maxJumpRatio": float(max(translations) / short_side),
    }
