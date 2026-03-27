"""Calibration module: maps pixel coordinates to SVG radar coordinates."""

import numpy as np


# Known airport positions on the SVG map (percentage * 10.24 and * 7.87)
AIRPORT_SVG_COORDS = {
    "ITKO": (321.5, 158.2),
    "IPPH": (689.1, 180.2),
    "ILKL": (735.2, 207.0),
    "IGRV": (58.4, 320.3),
    "ISAU": (76.8, 688.6),
    "IBTH": (450.6, 340.8),
    "IMLR": (361.5, 428.9),
    "IBLT": (419.8, 487.2),
    "IRFD": (522.2, 521.8),
    "IGAR": (369.7, 556.4),
    "ITRC": (513.0, 621.7),
    "ISCM": (855.0, 339.2),
    "IZOL": (950.3, 436.0),
    "IJAF": (962.6, 361.2),
    "ISKP": (729.1, 447.8),
    "ILAR": (807.0, 646.9),
    "IPAP": (867.3, 683.1),
    "IBAR": (844.8, 709.9),
    "IHEN": (722.9, 722.5),
    "IIAB": (793.6, 733.5),
    "IUFO": (496.6, 328.2),
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


def calibration_wizard(image_shape: tuple[int, int]) -> tuple[list[str], list[tuple[float, float]]] | None:
    """
    Interactive calibration: user clicks 3+ airports on the captured minimap.
    Returns (airport_codes, pixel_positions) or None if cancelled.
    """
    import tkinter as tk
    from tkinter import simpledialog

    airports = list(AIRPORT_SVG_COORDS.keys())

    result = {"codes": [], "pixels": []}
    count = {"n": 0, "target": 3}

    root = tk.Tk()
    root.title("Calibration Radar - Cliquez sur 3 aéroports")
    root.geometry(f"{image_shape[1]}x{image_shape[0] + 60}")

    label = tk.Label(
        root,
        text=f"Cliquez sur un aéroport connu sur la minimap (0/{count['target']})",
        font=("Consolas", 11),
    )
    label.pack(pady=5)

    canvas = tk.Canvas(root, width=image_shape[1], height=image_shape[0])
    canvas.pack()

    def on_click(event):
        code = simpledialog.askstring(
            "Aéroport",
            f"Code OACI de l'aéroport cliqué ?\n\nDisponibles : {', '.join(airports)}",
            parent=root,
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
                root.after(500, root.destroy)

    canvas.bind("<Button-1>", on_click)
    root.bind("<Escape>", lambda e: root.destroy())

    root.mainloop()

    if count["n"] >= count["target"]:
        return result["codes"], result["pixels"]
    return None
