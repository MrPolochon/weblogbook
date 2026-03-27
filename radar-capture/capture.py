"""Screen capture module using mss."""

import mss
import numpy as np
from PIL import Image


def capture_region(region: dict) -> np.ndarray:
    """Capture a specific screen region and return as numpy array (RGB)."""
    with mss.mss() as sct:
        monitor = {
            "top": region["top"],
            "left": region["left"],
            "width": region["width"],
            "height": region["height"],
        }
        screenshot = sct.grab(monitor)
        img = Image.frombytes("RGB", screenshot.size, screenshot.rgb)
        return np.array(img)


def select_region_interactive() -> dict | None:
    """
    Let the user select a screen region by displaying a fullscreen overlay.
    Returns {"top", "left", "width", "height"} or None if cancelled.
    """
    import tkinter as tk

    result = {"region": None}

    root = tk.Tk()
    root.attributes("-fullscreen", True)
    root.attributes("-alpha", 0.3)
    root.attributes("-topmost", True)
    root.configure(bg="black")

    canvas = tk.Canvas(root, cursor="cross", bg="black", highlightthickness=0)
    canvas.pack(fill=tk.BOTH, expand=True)

    start = {"x": 0, "y": 0}
    rect_id = None

    def on_press(event):
        start["x"] = event.x
        start["y"] = event.y

    def on_drag(event):
        nonlocal rect_id
        if rect_id:
            canvas.delete(rect_id)
        rect_id = canvas.create_rectangle(
            start["x"], start["y"], event.x, event.y,
            outline="lime", width=2,
        )

    def on_release(event):
        x1, y1 = min(start["x"], event.x), min(start["y"], event.y)
        x2, y2 = max(start["x"], event.x), max(start["y"], event.y)
        if (x2 - x1) > 20 and (y2 - y1) > 20:
            result["region"] = {
                "top": y1,
                "left": x1,
                "width": x2 - x1,
                "height": y2 - y1,
            }
        root.destroy()

    def on_escape(event):
        root.destroy()

    canvas.bind("<ButtonPress-1>", on_press)
    canvas.bind("<B1-Motion>", on_drag)
    canvas.bind("<ButtonRelease-1>", on_release)
    root.bind("<Escape>", on_escape)

    label = tk.Label(
        root,
        text="Dessinez un rectangle autour de la minimap PTFS\n(Echap pour annuler)",
        bg="black", fg="lime", font=("Consolas", 14),
    )
    label.place(relx=0.5, rely=0.05, anchor="center")

    root.mainloop()
    return result["region"]
