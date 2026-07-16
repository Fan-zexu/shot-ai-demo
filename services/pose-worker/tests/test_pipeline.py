import gzip
import json
from pathlib import Path

import pytest

from app.models import AnalyzeMotionRequest
from app.pipeline import analyze_motion
from tests.fixtures import create_video, make_shot_frames


class FakePoseBackend:
    model_name = "Fake deterministic pose"
    model_version = "test-1"
    model_sha256 = "f" * 64

    def analyze_video(self, _file_path, metadata):
        assert metadata.frame_count == 90
        return make_shot_frames(count=90)


def test_pipeline_writes_an_accepted_traceable_artifact(tmp_path: Path):
    video = create_video(tmp_path / "data" / "uploads" / "valid.mp4", frames=90, size="720x720")
    output = tmp_path / "data" / "artifacts" / "motion.json.gz"
    response = analyze_motion(
        AnalyzeMotionRequest(
            request_id="job_test",
            source_type="user",
            file_path=str(video),
            source_file_id="file_test",
            source_sha256="a" * 64,
            shooting_hand="right",
            normal_speed_confirmed=True,
            output_path=str(output),
        ),
        FakePoseBackend(),
    )

    assert response.status == "accepted", response.model_dump()
    assert output.is_file()
    with gzip.open(output, "rt", encoding="utf8") as handle:
        artifact = json.load(handle)
    assert artifact["events"]["release_pose_proxy"]["isProxy"] is True
    assert len(artifact["frames"]) == 90
    assert artifact["provenance"]["modelSha256"] == "f" * 64


def test_pipeline_does_not_reject_repeated_frames_for_an_altered_speed_template(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    video = create_video(tmp_path / "data" / "uploads" / "template.mp4", frames=90, size="720x720")
    output = tmp_path / "data" / "artifacts" / "template-motion.json.gz"

    def reject_if_called(_path: str):
        raise AssertionError("altered-speed templates must not run the repeated-frame gate")

    monkeypatch.setattr("app.pipeline.inspect_repeated_frames", reject_if_called)
    response = analyze_motion(
        AnalyzeMotionRequest(
            request_id="job_template",
            source_type="template",
            file_path=str(video),
            source_file_id="file_template",
            source_sha256="b" * 64,
            shooting_hand="right",
            normal_speed_confirmed=False,
            output_path=str(output),
        ),
        FakePoseBackend(),
    )

    assert response.status == "accepted", response.model_dump()
    with gzip.open(output, "rt", encoding="utf8") as handle:
        artifact = json.load(handle)
    assert artifact["capture"]["normalSpeedConfirmed"] is False
    speed_check = next(
        check for check in artifact["quality"]["checks"] if check["code"] == "NORMAL_SPEED_CONFIRMED"
    )
    assert speed_check["status"] == "warning"


def test_template_view_and_camera_checks_are_advisory_in_mvp_mode(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    video = create_video(tmp_path / "data" / "uploads" / "template.mp4", frames=90, size="720x720")
    output = tmp_path / "data" / "artifacts" / "template-motion.json.gz"
    monkeypatch.setattr("app.pipeline.classify_view", lambda _frames, _hand: "oblique")
    monkeypatch.setattr(
        "app.pipeline.estimate_global_motion",
        lambda _path, _frames: {
            "confident": True,
            "medianTranslationRatio": 0.03,
            "maxJumpRatio": 0.06,
        },
    )

    response = analyze_motion(
        AnalyzeMotionRequest(
            request_id="job_template_advisory",
            source_type="template",
            file_path=str(video),
            source_file_id="file_template_advisory",
            source_sha256="c" * 64,
            shooting_hand="right",
            normal_speed_confirmed=False,
            output_path=str(output),
        ),
        FakePoseBackend(),
    )

    assert response.status == "accepted", response.model_dump()
    checks = {check.code: check.status for check in response.quality_report.checks}
    assert checks["SIDE_VIEW"] == "warning"
    assert checks["CAMERA_STABILITY"] == "warning"
