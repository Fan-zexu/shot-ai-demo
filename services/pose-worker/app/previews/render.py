from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

import cv2

from app.models import PreviewResult


def _extract_frames(path: Path, indices: list[int]):
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("VIDEO_NOT_DECODABLE")
    frames = []
    try:
        for index in indices:
            capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = capture.read()
            if not ok:
                raise ValueError(f"PREVIEW_GENERATION_FAILED: frame {index}")
            frames.append(frame)
    finally:
        capture.release()
    return frames


def _encode(frames, output_path: Path, fps: int) -> str:
    if not frames:
        raise ValueError("PREVIEW_GENERATION_FAILED: empty timeline")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    partial = output_path.with_name(f"{output_path.name}.partial")
    height, width = frames[0].shape[:2]
    process = subprocess.Popen(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{width}x{height}",
            "-r",
            str(fps),
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
            str(partial),
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdin is not None
    try:
        for frame in frames:
            process.stdin.write(frame.tobytes())
        process.stdin.close()
        stderr = process.stderr.read() if process.stderr else b""
        return_code = process.wait()
    except Exception:
        process.kill()
        partial.unlink(missing_ok=True)
        raise
    if return_code != 0:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f"PREVIEW_GENERATION_FAILED: {stderr.decode('utf8', 'replace')}")
    partial.replace(output_path)
    return hashlib.sha256(output_path.read_bytes()).hexdigest()


def render_aligned_previews(
    *,
    template_path: str | Path,
    user_path: str | Path,
    timeline: list[dict[str, int]],
    template_output_path: str | Path,
    user_output_path: str | Path,
    fps: int = 30,
) -> PreviewResult:
    if fps != 30:
        raise ValueError("PREVIEW_GENERATION_FAILED: output fps must be 30")
    template_frames = _extract_frames(
        Path(template_path), [sample["templateFrameIndex"] for sample in timeline]
    )
    user_frames = _extract_frames(
        Path(user_path), [sample["userFrameIndex"] for sample in timeline]
    )
    template_sha = _encode(template_frames, Path(template_output_path), fps)
    user_sha = _encode(user_frames, Path(user_output_path), fps)
    return PreviewResult(
        frame_count=len(timeline),
        duration_ms=len(timeline) * 1000 / fps,
        template_sha256=template_sha,
        user_sha256=user_sha,
    )
