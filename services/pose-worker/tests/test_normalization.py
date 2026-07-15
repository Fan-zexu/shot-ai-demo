import copy

import pytest

from app.normalization.coordinates import normalize_frames
from tests.fixtures import make_frames


def test_normalization_keeps_raw_landmarks_and_uses_hip_center_origin():
    frames = make_frames(count=3)
    original = copy.deepcopy(frames)
    normalized, skeleton = normalize_frames(frames)

    assert frames == original
    first = {point.name: point for point in normalized[0].normalized_landmarks}
    hip_center_x = (first["left_hip"].x + first["right_hip"].x) / 2
    hip_center_y = (first["left_hip"].y + first["right_hip"].y) / 2
    assert hip_center_x == pytest.approx(0)
    assert hip_center_y == pytest.approx(0)
    assert skeleton.root == "hip_center"
    assert skeleton.scale_basis == "torso_length"
