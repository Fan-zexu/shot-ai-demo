from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_root: Path
    model_path: Path

    @classmethod
    def defaults(cls) -> "Settings":
        repository_root = Path(__file__).resolve().parents[3]
        return cls(
            data_root=(repository_root / "data").resolve(),
            model_path=(repository_root / "models" / "pose_landmarker_full.task").resolve(),
        )
