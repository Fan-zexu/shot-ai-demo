from __future__ import annotations

import json
import subprocess
from fractions import Fraction
from pathlib import Path

from app.models import VideoMetadata


def _fraction(value: str | None) -> float:
    if not value or value in {"0/0", "N/A"}:
        return 0
    return float(Fraction(value))


def probe_video(path: str | Path) -> VideoMetadata:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-print_format",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise ValueError("VIDEO_NOT_DECODABLE: ffprobe could not read the video") from error
    try:
        stream = next(
            (item for item in payload.get("streams", []) if item.get("codec_type") == "video"),
            None,
        )
        if stream is None:
            raise ValueError("VIDEO_NOT_DECODABLE: no video stream")

        fps = _fraction(stream.get("avg_frame_rate")) or _fraction(
            stream.get("r_frame_rate")
        )
        duration = float(
            stream.get("duration") or payload.get("format", {}).get("duration") or 0
        )
        frame_count = int(stream.get("nb_frames") or round(duration * fps))
        rotation = float(stream.get("tags", {}).get("rotate", 0))
        for item in stream.get("side_data_list", []):
            if "rotation" in item:
                rotation = float(item["rotation"])

        return VideoMetadata(
            duration_ms=round(duration * 1000, 3),
            width=int(stream["width"]),
            height=int(stream["height"]),
            rotation_deg=rotation,
            nominal_fps=round(fps, 6),
            frame_count=frame_count,
            container=payload.get("format", {}).get("format_name", "unknown"),
            codec=stream.get("codec_name", "unknown"),
        )
    except (KeyError, TypeError, ZeroDivisionError, ValueError) as error:
        if str(error).startswith("VIDEO_NOT_DECODABLE"):
            raise
        raise ValueError("VIDEO_NOT_DECODABLE: invalid video metadata") from error


def probe_timestamps(path: str | Path) -> list[float]:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "frame=best_effort_timestamp_time",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise ValueError("VIDEO_NOT_DECODABLE: ffprobe could not read frame timestamps") from error
    try:
        return [
            float(frame["best_effort_timestamp_time"])
            for frame in payload.get("frames", [])
            if frame.get("best_effort_timestamp_time") not in {None, "N/A"}
        ]
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("VIDEO_NOT_DECODABLE: invalid frame timestamps") from error
