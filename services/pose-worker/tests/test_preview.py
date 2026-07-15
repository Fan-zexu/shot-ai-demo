from pathlib import Path

from app.previews.render import render_aligned_previews
from app.video.probe import probe_video
from tests.fixtures import create_video


def test_preview_has_one_frame_per_timeline_sample(tmp_path: Path):
    template = create_video(tmp_path / "template.mp4", frames=12)
    user = create_video(tmp_path / "user.mp4", frames=12)
    output_template = tmp_path / "template-aligned.mp4"
    output_user = tmp_path / "user-aligned.mp4"
    timeline = [
        {"templateFrameIndex": index, "userFrameIndex": 11 - index}
        for index in range(6)
    ]

    result = render_aligned_previews(
        template_path=template,
        user_path=user,
        timeline=timeline,
        template_output_path=output_template,
        user_output_path=output_user,
        fps=30,
    )

    assert result.frame_count == 6
    assert result.duration_ms == 200
    assert probe_video(output_template).frame_count == 6
    assert probe_video(output_user).frame_count == 6
