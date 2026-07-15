from app.quality.view import classify_view
from tests.fixtures import make_frames


def test_side_view_rule_accepts_overlapping_shoulders():
    assert classify_view(make_frames(), "right") == "shooting_side"


def test_side_view_rule_rejects_wide_frontal_shoulders():
    frames = make_frames()
    for frame in frames:
        points = {point.name: point for point in frame.landmarks}
        points["left_shoulder"].x = 0.38
        points["right_shoulder"].x = 0.62
    assert classify_view(frames, "right") == "front"
