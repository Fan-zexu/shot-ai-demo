from pathlib import Path
import subprocess

from app.video.probe import probe_timestamps
from app.video.timing import inspect_repeated_frames, inspect_timestamps
from tests.fixtures import create_video


def test_monotonic_normal_video_passes_timing_checks(tmp_path: Path):
    video = create_video(tmp_path / "normal.mp4", frames=30)
    assert inspect_timestamps(probe_timestamps(video)) == []
    assert inspect_repeated_frames(str(video)) == []


def test_near_identical_frame_sequence_is_rejected(tmp_path: Path):
    video = tmp_path / "duplicates.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:size=320x240:rate=30",
            "-frames:v",
            "30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(video),
        ],
        check=True,
    )
    assert inspect_repeated_frames(str(video)) == ["ABNORMAL_VIDEO_TIMING"]
