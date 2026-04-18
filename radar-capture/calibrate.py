"""Calibration module: maps pixel coordinates to SVG radar coordinates."""

import numpy as np
from PIL import Image, ImageTk


# Known airport positions on the SVG map (percentage * 10.24 and * 7.87)
# Must stay in sync with src/lib/cartography-data.ts DEFAULT_POSITIONS + toSVG()
AIRPORT_SVG_COORDS = {
    "IBAR": (740.4, 680.0),
    "IBLT": (435.2, 510.0),
    "IBTH": (562.2, 342.3),
    "IGAR": (401.4, 564.3),
    "IKFL": (176.1, 347.1),
    "IHEN": (654.3, 694.1),
    "IIAB": (696.3, 684.7),
    "IJAF": (878.6, 370.7),
    "ILAR": (685.1, 627.2),
    "ILKL": (704.5, 246.3),
    "IMLR": (375.8, 484.8),
    "IPAP": (767.0, 639.0),
    "IPPH": (659.5, 215.6),
    "IRFD": (505.9, 538.3),
    "ISAU": (154.6, 584.0),
    "ISCM": (809.0, 339.2),
    "ISKP": (725.0, 472.2),
    "ITKO": (476.2, 155.0),
    "ITRC": (513.0, 621.7),
    "IUFO": (593.9, 343.1),
    "IZOL": (872.4, 405.3),
}


def compute_affine_transform(
    pixel_points: list[tuple[float, float]],
    svg_points: list[tuple[float, float]],
) -> np.ndarray | None:
    """
    Compute a 2x3 affine transform matrix from pixel coords to SVG coords.
    Needs at least 3 point pairs.
    Returns the transform matrix or None on failure.
    """
    if len(pixel_points) < 3 or len(svg_points) < 3:
        return None

    n = min(len(pixel_points), len(svg_points))
    A = []
    b_x = []
    b_y = []

    for i in range(n):
        px, py = pixel_points[i]
        sx, sy = svg_points[i]
        A.append([px, py, 1, 0, 0, 0])
        A.append([0, 0, 0, px, py, 1])
        b_x.append(sx)
        b_y.append(sy)

    b = []
    for i in range(n):
        b.append(b_x[i])
        b.append(b_y[i])

    A_arr = np.array(A, dtype=float)
    b_arr = np.array(b, dtype=float)

    try:
        result, _, _, _ = np.linalg.lstsq(A_arr, b_arr, rcond=None)
        matrix = np.array([
            [result[0], result[1], result[2]],
            [result[3], result[4], result[5]],
        ])
        return matrix
    except np.linalg.LinAlgError:
        return None


def transform_point(
    matrix: np.ndarray,
    pixel_x: float,
    pixel_y: float,
) -> tuple[float, float]:
    """Apply affine transform to convert pixel coords to SVG coords."""
    point = np.array([pixel_x, pixel_y, 1.0])
    result = matrix @ point
    return float(result[0]), float(result[1])


def calibration_wizard(image: np.ndarray, parent=None) -> tuple[list[str], list[tuple[float, float]]] | None:
    """
    Interactive calibration: user clicks 3+ airports on the captured minimap.
    Returns (airport_codes, pixel_positions) or None if cancelled.
    """
    import tkinter as tk
    from tkinter import simpledialog

    airports = list(AIRPORT_SVG_COORDS.keys())

    result = {"codes": [], "pixels": []}
    count = {"n": 0, "target": 3}
    image_height, image_width = image.shape[:2]
    pil_image = Image.fromarray(image)

    window = tk.Toplevel(parent) if parent is not None else tk.Tk()
    window.title("Calibration Radar - Cliquez sur 3 aéroports")
    window.geometry(f"{image_width}x{image_height + 60}")
    window.focus_force()

    label = tk.Label(
        window,
        text=f"Cliquez sur un aéroport connu sur la minimap (0/{count['target']})",
        font=("Consolas", 11),
    )
    label.pack(pady=5)

    canvas = tk.Canvas(window, width=image_width, height=image_height)
    canvas.pack()
    photo = ImageTk.PhotoImage(pil_image)
    canvas.create_image(0, 0, image=photo, anchor="nw")
    canvas.image = photo

    def on_click(event):
        code = simpledialog.askstring(
            "Aéroport",
            f"Code OACI de l'aéroport cliqué ?\n\nDisponibles : {', '.join(airports)}",
            parent=window,
        )
        if code and code.upper() in AIRPORT_SVG_COORDS:
            code = code.upper()
            result["codes"].append(code)
            result["pixels"].append((float(event.x), float(event.y)))
            count["n"] += 1
            canvas.create_oval(
                event.x - 4, event.y - 4, event.x + 4, event.y + 4,
                fill="lime", outline="white",
            )
            canvas.create_text(
                event.x + 10, event.y, text=code, fill="lime",
                font=("Consolas", 9), anchor="w",
            )
            label.config(text=f"Points de calibration : {count['n']}/{count['target']}")
            if count["n"] >= count["target"]:
                window.after(500, window.destroy)

    canvas.bind("<Button-1>", on_click)
    window.bind("<Escape>", lambda e: window.destroy())

    if parent is not None:
        window.grab_set()
        parent.wait_window(window)
    else:
        window.mainloop()

    if count["n"] >= count["target"]:
        return result["codes"], result["pixels"]
    return None
