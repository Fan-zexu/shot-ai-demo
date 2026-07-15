from __future__ import annotations

from statistics import median

import cv2
import numpy as np


def inspect_timestamps(timestamps: list[float]) -> list[str]:
    if len(timestamps) < 2:
        return ["ABNORMAL_VIDEO_TIMING"]
    intervals = [current - previous for previous, current in zip(timestamps, timestamps[1:])]
    if any(interval <= 0 for interval in intervals):
        return ["ABNORMAL_VIDEO_TIMING"]
    typical = median(intervals)
    abnormal = sum(interval > typical * 2.5 for interval in intervals)
    if abnormal / len(intervals) > 0.01:
        return ["ABNORMAL_VIDEO_TIMING"]
    return []


def inspect_repeated_frames(path: str, *, maximum_ratio: float = 0.05) -> list[str]:
    capture = cv2.VideoCapture(path)
    previous = None
    duplicates = 0
    comparisons = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            gray = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (32, 32))
            if previous is not None:
                comparisons += 1
                if float(np.mean(cv2.absdiff(gray, previous))) < 0.05:
                    duplicates += 1
            previous = gray
    finally:
        capture.release()
    if comparisons and duplicates / comparisons > maximum_ratio:
        return ["ABNORMAL_VIDEO_TIMING"]
    return []
