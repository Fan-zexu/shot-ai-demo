from pathlib import Path

from app.video.probe import probe_video
from tests.fixtures import create_video


def test_ffprobe_reports_real_video_metadata(tmp_path: Path):
    path = create_video(tmp_path / "probe.mp4", frames=12, fps=30)
    metadata = probe_video(path)

    assert metadata.width == 320
    assert metadata.height == 240
    assert metadata.nominal_fps == 30
    assert metadata.frame_count == 12
    assert metadata.codec == "h264"
    assert metadata.duration_ms == 400
