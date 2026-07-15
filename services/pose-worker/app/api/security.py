from pathlib import Path


def require_data_path(value: str | Path, data_root: str | Path) -> Path:
    root = Path(data_root).resolve()
    candidate = Path(value).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ValueError(f"PATH_OUTSIDE_DATA_ROOT: {candidate.name}") from error
    return candidate
