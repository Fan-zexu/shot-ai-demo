from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray


@dataclass(frozen=True)
class MotionSignals:
    hip_y: NDArray[np.float64]
    knee_angle_deg: NDArray[np.float64]
    wrist_above_shoulder: NDArray[np.float64]
    elbow_angle_deg: NDArray[np.float64]
    body_extension: NDArray[np.float64]
    stability: NDArray[np.float64]

    def __post_init__(self):
        lengths = {len(value) for value in self.__dict__.values()}
        if len(lengths) != 1 or next(iter(lengths), 0) < 6:
            raise ValueError("motion signals must share a length of at least six frames")
