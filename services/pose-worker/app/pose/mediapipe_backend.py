from __future__ import annotations

import hashlib
from pathlib import Path

import cv2
import mediapipe as mp

from app.models import Landmark2D, PoseFrame, VideoMetadata


LANDMARK_NAMES = (
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
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


def _hip_center(candidate) -> tuple[float, float]:
    left = candidate[23]
    right = candidate[24]
    return ((left.x + right.x) / 2, (left.y + right.y) / 2)


def _select_candidate(candidates, previous: tuple[float, float] | None):
    if not candidates:
        return None
    if previous is None:
        return max(candidates, key=lambda value: value[23].visibility + value[24].visibility)
    ranked = sorted(
        candidates,
        key=lambda value: (_hip_center(value)[0] - previous[0]) ** 2
        + (_hip_center(value)[1] - previous[1]) ** 2,
    )
    if len(ranked) > 1:
        first = _hip_center(ranked[0])
        second = _hip_center(ranked[1])
        first_distance = (first[0] - previous[0]) ** 2 + (first[1] - previous[1]) ** 2
        second_distance = (second[0] - previous[0]) ** 2 + (second[1] - previous[1]) ** 2
        if abs(second_distance - first_distance) < 0.0004:
            raise ValueError("AMBIGUOUS_PERSON_TRACK")
    return ranked[0]


class MediaPipePoseBackend:
    model_name = "MediaPipe Pose Landmarker"
    model_version = "0.10.35/full-float16"

    def __init__(self, model_path: str | Path):
        self.model_path = Path(model_path).resolve()
        if not self.model_path.is_file():
            raise FileNotFoundError(f"pose model not found: {self.model_path}")
        self.model_sha256 = hashlib.sha256(self.model_path.read_bytes()).hexdigest()
        base_options = mp.tasks.BaseOptions(model_asset_path=str(self.model_path))
        self._options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_poses=2,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = self._create_landmarker()
        self._has_analyzed_video = False

    def _create_landmarker(self):
        return mp.tasks.vision.PoseLandmarker.create_from_options(self._options)

    def _landmarker_for_next_video(self):
        if self._has_analyzed_video:
            self._landmarker.close()
            self._landmarker = self._create_landmarker()
        # VIDEO mode retains timestamps and tracking state, so one instance must
        # never be shared by two independent input videos.
        self._has_analyzed_video = True
        return self._landmarker

    def close(self) -> None:
        self._landmarker.close()

    def analyze_video(self, file_path: str, metadata: VideoMetadata) -> list[PoseFrame]:
        capture = cv2.VideoCapture(file_path)
        if not capture.isOpened():
            raise ValueError("VIDEO_NOT_DECODABLE")
        frames: list[PoseFrame] = []
        previous_hip: tuple[float, float] | None = None
        last_timestamp = -1
        frame_index = 0
        try:
            landmarker = self._landmarker_for_next_video()
            while True:
                ok, bgr = capture.read()
                if not ok:
                    break
                source_timestamp = capture.get(cv2.CAP_PROP_POS_MSEC)
                timestamp_ms = int(round(source_timestamp))
                if timestamp_ms <= last_timestamp:
                    timestamp_ms = int(round(frame_index * 1000 / metadata.nominal_fps))
                timestamp_ms = max(timestamp_ms, last_timestamp + 1)
                last_timestamp = timestamp_ms
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = landmarker.detect_for_video(image, timestamp_ms)
                selected = _select_candidate(result.pose_landmarks, previous_hip)
                if selected is not None:
                    previous_hip = _hip_center(selected)
                    landmarks = [
                        Landmark2D(
                            name=name,
                            x=float(point.x),
                            y=float(point.y),
                            z=float(point.z),
                            visibility=float(point.visibility or 0),
                            presence=float(point.presence or 0),
                        )
                        for name, point in zip(LANDMARK_NAMES, selected, strict=True)
                    ]
                    confidence = sum(
                        min(point.visibility, point.presence) for point in landmarks
                    ) / len(landmarks)
                    frames.append(
                        PoseFrame(
                            frame_index=frame_index,
                            timestamp_ms=timestamp_ms,
                            pose_confidence=confidence,
                            landmarks=landmarks,
                        )
                    )
                frame_index += 1
        finally:
            capture.release()
        return frames
