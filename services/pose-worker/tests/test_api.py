import asyncio
from pathlib import Path

import httpx

from app.api.main import create_app
from app.config import Settings


class EmptyBackend:
    model_name = "empty"
    model_version = "test"
    model_sha256 = "e" * 64

    def analyze_video(self, _file_path, _metadata):
        return []


async def request(app, method: str, path: str, **kwargs):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://worker.test") as client:
        return await client.request(method, path, **kwargs)


def test_health_reports_real_model_state(tmp_path: Path):
    app = create_app(
        Settings(data_root=tmp_path / "data", model_path=tmp_path / "model.task"),
        EmptyBackend(),
    )
    response = asyncio.run(request(app, "GET", "/internal/v1/health"))

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "modelLoaded": True,
        "modelSha256": "e" * 64,
        "busy": False,
    }


def test_analyze_endpoint_rejects_paths_outside_data_root(tmp_path: Path):
    app = create_app(
        Settings(data_root=tmp_path / "data", model_path=tmp_path / "model.task"),
        EmptyBackend(),
    )
    response = asyncio.run(
        request(
            app,
            "POST",
            "/internal/v1/analyze-motion",
            json={
                "requestId": "job_test",
                "sourceType": "user",
                "filePath": "/etc/passwd",
                "sourceFileId": "file_test",
                "sourceSha256": "a" * 64,
                "shootingHand": "right",
                "normalSpeedConfirmed": True,
                "thresholds": {},
                "outputPath": str(tmp_path / "data" / "artifact.json.gz"),
            },
        )
    )

    assert response.status_code == 400
    assert "PATH_OUTSIDE_DATA_ROOT" in response.json()["detail"]
