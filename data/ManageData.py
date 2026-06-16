from dataclasses import dataclass
from typing import Dict, Tuple


# Surface Tracker uses bottom-left=(0,0), top-right=(1,1).
# This module converts the experiment's canvas pixel bounds into that space.

CANVAS_WIDTH = 1024
CANVAS_HEIGHT = 768


@dataclass(frozen=True)
class AOI:
    x_min: float
    x_max: float
    y_min: float
    y_max: float


def _canvas_origin(screen_width: int, screen_height: int) -> Tuple[float, float]:
    """Canvas is centered inside the tracked screen."""
    canvas_left = (screen_width - CANVAS_WIDTH) / 2.0
    canvas_top = (screen_height - CANVAS_HEIGHT) / 2.0
    return canvas_left, canvas_top


def _canvas_box_to_surface(
    screen_width: int,
    screen_height: int,
    left_px: float,
    top_px: float,
    right_px: float,
    bottom_px: float,
) -> AOI:
    """Convert a canvas box (top-left pixel coords) to Surface Tracker coords."""
    canvas_left, canvas_top = _canvas_origin(screen_width, screen_height)
    abs_left = canvas_left + left_px
    abs_right = canvas_left + right_px
    abs_top = canvas_top + top_px
    abs_bottom = canvas_top + bottom_px

    return AOI(
        x_min=abs_left / screen_width,
        x_max=abs_right / screen_width,
        y_min=(screen_height - abs_bottom) / screen_height,
        y_max=(screen_height - abs_top) / screen_height,
    )


def _choice_boxes() -> Dict[str, Tuple[float, float, float, float]]:
    """Decision-phase option locations from TrialManager.js."""
    size = 128
    half = size / 2
    centers = {
        "up": (512, 150),
        "down": (512, 618),
        "left": (200, 384),
        "right": (824, 384),
    }
    return {
        name: (cx - half, cy - half, cx + half, cy + half)
        for name, (cx, cy) in centers.items()
    }


def build_static_aois(screen_width: int, screen_height: int) -> Dict[str, AOI]:
    """AOIs that do not depend on trial randomization."""
    return {
        "canvas": _canvas_box_to_surface(screen_width, screen_height, 0, 0, 1024, 768),
        "baseline_symbol": _canvas_box_to_surface(screen_width, screen_height, 496, 368, 528, 400),
        "delay_symbol": _canvas_box_to_surface(screen_width, screen_height, 496, 368, 528, 400),
        "sample_chart": _canvas_box_to_surface(screen_width, screen_height, 448, 320, 576, 448),
        "sample_total_text": _canvas_box_to_surface(screen_width, screen_height, 432, 292, 592, 316),
        "legend_block": _canvas_box_to_surface(screen_width, screen_height, 10, 662, 110, 750),
        "legend_different_icon": _canvas_box_to_surface(screen_width, screen_height, 10, 662, 34, 686),
        "legend_different_label": _canvas_box_to_surface(screen_width, screen_height, 42, 662, 110, 686),
        "legend_same_icon": _canvas_box_to_surface(screen_width, screen_height, 10, 694, 34, 718),
        "legend_same_label": _canvas_box_to_surface(screen_width, screen_height, 42, 694, 95, 718),
        "legend_quicker_icon": _canvas_box_to_surface(screen_width, screen_height, 10, 726, 34, 750),
        "legend_quicker_label": _canvas_box_to_surface(screen_width, screen_height, 42, 726, 105, 750),
        "catch_prompt": _canvas_box_to_surface(screen_width, screen_height, 352, 366, 672, 402),
        "feedback_left_image": _canvas_box_to_surface(screen_width, screen_height, 213.33, 136, 469.33, 392),
        "feedback_right_image": _canvas_box_to_surface(screen_width, screen_height, 554.67, 136, 810.67, 392),
        "feedback_left_box": _canvas_box_to_surface(screen_width, screen_height, 201.33, 124, 481.33, 404),
        "feedback_right_box": _canvas_box_to_surface(screen_width, screen_height, 542.67, 124, 822.67, 404),
        "feedback_left_points_text": _canvas_box_to_surface(screen_width, screen_height, 261.33, 446, 421.33, 482),
        "feedback_right_points_text": _canvas_box_to_surface(screen_width, screen_height, 602.67, 446, 762.67, 482),
        "feedback_left_summary_text": _canvas_box_to_surface(screen_width, screen_height, 221.33, 506, 461.33, 542),
        "feedback_right_summary_text": _canvas_box_to_surface(screen_width, screen_height, 532.67, 506, 832.67, 542),
        "feedback_catch_left_summary": _canvas_box_to_surface(screen_width, screen_height, 221.33, 366, 461.33, 402),
        "feedback_catch_right_summary": _canvas_box_to_surface(screen_width, screen_height, 532.67, 366, 832.67, 402),
    }


def build_trial_aois(
    screen_width: int,
    screen_height: int,
    choice1_position: str,
    choice2_position: str,
) -> Dict[str, AOI]:
    """Trial-dependent AOIs for the decision phase."""
    choice_boxes = _choice_boxes()
    return {
        "choice1": _canvas_box_to_surface(screen_width, screen_height, *choice_boxes[choice1_position]),
        "choice2": _canvas_box_to_surface(screen_width, screen_height, *choice_boxes[choice2_position]),
        "up_option": _canvas_box_to_surface(screen_width, screen_height, *choice_boxes["up"]),
        "down_option": _canvas_box_to_surface(screen_width, screen_height, *choice_boxes["down"]),
        "left_option": _canvas_box_to_surface(screen_width, screen_height, *choice_boxes["left"]),
        "right_option": _canvas_box_to_surface(screen_width, screen_height, *choice_boxes["right"]),
    }


def build_all_aois(
    screen_width: int,
    screen_height: int,
    choice1_position: str,
    choice2_position: str,
) -> Dict[str, AOI]:
    """Convenience helper for one trial on one screen."""
    aois = build_static_aois(screen_width, screen_height)
    aois.update(build_trial_aois(screen_width, screen_height, choice1_position, choice2_position))
    return aois


if __name__ == "__main__":
    # Example:
    # 1. Put the tracked screen size here.
    # 2. Put the trial's choice1/choice2 positions here.
    # 3. Run this file to print normalized AOIs for later analysis.
    screen_w = 1920
    screen_h = 1080
    choice1 = "left"
    choice2 = "right"

    aois = build_all_aois(screen_w, screen_h, choice1, choice2)
    for name, aoi in sorted(aois.items()):
        print(
            f"{name}: "
            f"x=[{aoi.x_min:.4f}, {aoi.x_max:.4f}] "
            f"y=[{aoi.y_min:.4f}, {aoi.y_max:.4f}]"
        )
