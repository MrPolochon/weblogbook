"""Red pixel detection and clustering for aircraft positions."""

import numpy as np
from PIL import Image


def detect_red_clusters(
    image: np.ndarray,
    hue_ranges: list[tuple[int, int]] = [(0, 10), (170, 180)],
    sat_min: int = 80,
    val_min: int = 80,
    min_pixels: int = 5,
    max_pixels: int = 500,
) -> list[dict]:
    """
    Detect clusters of red pixels in an RGB image.
    Returns list of {"x": center_x, "y": center_y, "pixel_count": n}.
    """
    pil_img = Image.fromarray(image)
    hsv_img = pil_img.convert("HSV")
    hsv_array = np.array(hsv_img)

    h, s, v = hsv_array[:, :, 0], hsv_array[:, :, 1], hsv_array[:, :, 2]

    red_mask = np.zeros(h.shape, dtype=bool)
    for low, high in hue_ranges:
        red_mask |= (h >= low) & (h <= high)

    red_mask &= (s >= sat_min) & (v >= val_min)

    if not np.any(red_mask):
        return []

    return _cluster_mask(red_mask, min_pixels, max_pixels)


def _cluster_mask(
    mask: np.ndarray,
    min_pixels: int,
    max_pixels: int,
) -> list[dict]:
    """Simple connected-component clustering using flood fill."""
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    clusters = []

    for y in range(h):
        for x in range(w):
            if mask[y, x] and not visited[y, x]:
                pixels = []
                stack = [(x, y)]
                while stack:
                    cx, cy = stack.pop()
                    if cx < 0 or cx >= w or cy < 0 or cy >= h:
                        continue
                    if visited[cy, cx] or not mask[cy, cx]:
                        continue
                    visited[cy, cx] = True
                    pixels.append((cx, cy))
                    if len(pixels) > max_pixels:
                        break
                    stack.extend([
                        (cx + 1, cy), (cx - 1, cy),
                        (cx, cy + 1), (cx, cy - 1),
                    ])

                count = len(pixels)
                if min_pixels <= count <= max_pixels:
                    xs = [p[0] for p in pixels]
                    ys = [p[1] for p in pixels]
                    clusters.append({
                        "x": sum(xs) / count,
                        "y": sum(ys) / count,
                        "pixel_count": count,
                    })

    return clusters
