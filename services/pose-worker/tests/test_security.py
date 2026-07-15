from pathlib import Path

import pytest

from app.api.security import require_data_path


def test_worker_accepts_only_paths_below_data_root(tmp_path: Path):
    data_root = tmp_path / "data"
    data_root.mkdir()
    inside = data_root / "uploads" / "video"
    inside.parent.mkdir()
    inside.touch()

    assert require_data_path(inside, data_root) == inside.resolve()
    with pytest.raises(ValueError, match="PATH_OUTSIDE_DATA_ROOT"):
        require_data_path(tmp_path / "outside.mp4", data_root)
