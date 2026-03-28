"""
Radar Capture Tool — WebLogbook
Captures aircraft positions from the PTFS minimap and sends them to the web radar.
"""

import json
import os
import sys
import time
import logging
import threading
import ctypes
import tkinter as tk
from tkinter import messagebox

import numpy as np
from PIL import Image, ImageTk

from capture import capture_region, select_region_interactive
from detect import detect_red_clusters
from calibrate import (
    AIRPORT_SVG_COORDS,
    compute_affine_transform,
    transform_point,
    calibration_wizard,
)
from sender import send_positions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)


def enable_dpi_awareness():
    """Align tkinter coordinates with screen capture coordinates on Windows."""
    if sys.platform != "win32":
        return

    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except Exception:
        pass

    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def get_config_file() -> str:
    """Store config in a writable user directory when bundled as an exe."""
    if getattr(sys, "frozen", False):
        base_dir = os.getenv("LOCALAPPDATA") or os.path.expanduser("~")
        config_dir = os.path.join(base_dir, "WebLogbook", "RadarCapture")
        os.makedirs(config_dir, exist_ok=True)
        return os.path.join(config_dir, "config.json")

    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


CONFIG_FILE = get_config_file()


def load_config() -> dict:
    try:
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {
            "server_url": "",
            "api_token": "",
            "capture_region": None,
            "calibration_points": [],
            "capture_interval_ms": 2000,
            "red_hue_range": [0, 10, 170, 180],
            "red_saturation_min": 80,
            "red_value_min": 80,
            "min_cluster_pixels": 5,
            "max_cluster_pixels": 500,
        }


def save_config(config: dict):
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


class RadarCaptureApp:
    def __init__(self):
        self.config = load_config()
        self.running = False
        self.capture_thread = None
        self.transform_matrix = None
        self.cluster_counter = 0

        self._build_transform()
        self._build_ui()

    def _build_transform(self):
        """Reconstruct affine transform from saved calibration."""
        cal = self.config.get("calibration_points", [])
        if len(cal) >= 3:
            pixel_pts = [(p["px"], p["py"]) for p in cal]
            svg_pts = [AIRPORT_SVG_COORDS[p["code"]] for p in cal if p["code"] in AIRPORT_SVG_COORDS]
            if len(svg_pts) >= 3:
                self.transform_matrix = compute_affine_transform(pixel_pts, svg_pts)

    def _build_ui(self):
        self.root = tk.Tk()
        self.root.title("Radar Capture — WebLogbook")
        self.root.geometry("420x520")
        self.root.configure(bg="#0a0a0a")
        self.root.resizable(False, False)

        title = tk.Label(
            self.root, text="📡 Radar Capture",
            bg="#0a0a0a", fg="#00ff41",
            font=("Consolas", 16, "bold"),
        )
        title.pack(pady=(15, 5))

        subtitle = tk.Label(
            self.root, text="Outil de capture minimap PTFS",
            bg="#0a0a0a", fg="#666666",
            font=("Consolas", 9),
        )
        subtitle.pack()

        frame = tk.Frame(self.root, bg="#0a0a0a")
        frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        # Server URL
        tk.Label(frame, text="URL du serveur :", bg="#0a0a0a", fg="#00cc44", font=("Consolas", 9), anchor="w").pack(fill=tk.X, pady=(5, 0))
        self.url_entry = tk.Entry(frame, bg="#111", fg="#00ff41", insertbackground="#00ff41", font=("Consolas", 9))
        self.url_entry.insert(0, self.config.get("server_url", ""))
        self.url_entry.pack(fill=tk.X, pady=(2, 5))

        # API Token
        tk.Label(frame, text="Token API :", bg="#0a0a0a", fg="#00cc44", font=("Consolas", 9), anchor="w").pack(fill=tk.X, pady=(5, 0))
        self.token_entry = tk.Entry(frame, bg="#111", fg="#00ff41", insertbackground="#00ff41", font=("Consolas", 9), show="*")
        self.token_entry.insert(0, self.config.get("api_token", ""))
        self.token_entry.pack(fill=tk.X, pady=(2, 10))

        # Status
        self.status_label = tk.Label(
            frame, text="⬤ Arrêté", bg="#0a0a0a", fg="#ff4444",
            font=("Consolas", 11, "bold"),
        )
        self.status_label.pack(pady=5)

        self.info_label = tk.Label(
            frame, text="", bg="#0a0a0a", fg="#666",
            font=("Consolas", 8), wraplength=380,
        )
        self.info_label.pack(pady=2)

        # Calibration status
        cal_count = len(self.config.get("calibration_points", []))
        cal_text = f"Calibration : {cal_count} points" if cal_count > 0 else "Non calibré"
        self.cal_label = tk.Label(
            frame, text=cal_text, bg="#0a0a0a",
            fg="#00ff41" if cal_count >= 3 else "#ff9900",
            font=("Consolas", 9),
        )
        self.cal_label.pack(pady=2)

        region = self.config.get("capture_region")
        region_text = self._format_region_text(region)
        self.region_label = tk.Label(
            frame, text=region_text, bg="#0a0a0a",
            fg="#00ff41" if region else "#ff9900",
            font=("Consolas", 9),
        )
        self.region_label.pack(pady=2)

        # Buttons
        btn_frame = tk.Frame(frame, bg="#0a0a0a")
        btn_frame.pack(fill=tk.X, pady=10)

        btn_style = {"bg": "#0d3320", "fg": "#00ff41", "activebackground": "#1a4a30", "activeforeground": "#00ff41", "font": ("Consolas", 9, "bold"), "relief": "flat", "cursor": "hand2"}

        tk.Button(btn_frame, text="Sélectionner zone", command=self.select_region, **btn_style).pack(fill=tk.X, pady=2)
        tk.Button(btn_frame, text="Auto minimap (bas droite)", command=self.auto_select_minimap, **btn_style).pack(fill=tk.X, pady=2)
        tk.Button(btn_frame, text="Prévisualiser zone", command=self.preview_region, **btn_style).pack(fill=tk.X, pady=2)
        tk.Button(btn_frame, text="Calibrer (3 aéroports)", command=self.calibrate, **btn_style).pack(fill=tk.X, pady=2)

        self.start_btn = tk.Button(btn_frame, text="▶ Démarrer la capture", command=self.toggle_capture, bg="#006622", fg="#00ff41", activebackground="#008833", activeforeground="#00ff41", font=("Consolas", 10, "bold"), relief="flat", cursor="hand2")
        self.start_btn.pack(fill=tk.X, pady=(10, 2))

        tk.Button(btn_frame, text="Sauvegarder config", command=self.save_all, **btn_style).pack(fill=tk.X, pady=2)

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _format_region_text(self, region: dict | None) -> str:
        if not region:
            return "Aucune zone sélectionnée"
        return (
            f"Zone : {region['width']}x{region['height']} "
            f"({region['left']},{region['top']})"
        )

    def _apply_region(self, region: dict):
        self.config["capture_region"] = region
        save_config(self.config)
        self.region_label.config(text=self._format_region_text(region), fg="#00ff41")
        logger.info("Zone sélectionnée : %s", region)

    def select_region(self):
        self.root.withdraw()
        self.root.update_idletasks()
        time.sleep(0.2)

        try:
            region = select_region_interactive(parent=self.root)
        finally:
            self.root.deiconify()
            self.root.lift()
            self.root.focus_force()

        if region:
            self._apply_region(region)
        else:
            messagebox.showwarning("Annulé", "Sélection de zone annulée.")

    def auto_select_minimap(self):
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()

        size = max(300, min(430, int(screen_h * 0.46)))
        right_margin = 18
        bottom_margin = 85

        region = {
            "left": max(0, screen_w - size - right_margin),
            "top": max(0, screen_h - size - bottom_margin),
            "width": size,
            "height": size,
        }
        self._apply_region(region)
        messagebox.showinfo(
            "Zone auto",
            "Une zone minimap par défaut a été appliquée.\n"
            "Cliquez sur « Prévisualiser zone » pour vérifier avant de calibrer.",
        )

    def preview_region(self):
        region = self.config.get("capture_region")
        if not region:
            messagebox.showerror("Erreur", "Sélectionnez d'abord une zone de capture.")
            return

        try:
            img = capture_region(region)
        except Exception as e:
            messagebox.showerror("Erreur", f"Aperçu impossible : {e}")
            return

        preview = tk.Toplevel(self.root)
        preview.title("Aperçu de la zone")
        preview.configure(bg="#0a0a0a")
        preview.resizable(False, False)

        max_width = 360
        image = Image.fromarray(img)
        if image.width > max_width:
            ratio = max_width / image.width
            image = image.resize((int(image.width * ratio), int(image.height * ratio)))

        photo = ImageTk.PhotoImage(image)
        label = tk.Label(preview, image=photo, bg="#0a0a0a")
        label.image = photo
        label.pack(padx=10, pady=(10, 6))

        info = tk.Label(
            preview,
            text=self._format_region_text(region),
            bg="#0a0a0a",
            fg="#00ff41",
            font=("Consolas", 9),
        )
        info.pack(padx=10, pady=(0, 10))

    def calibrate(self):
        region = self.config.get("capture_region")
        if not region:
            messagebox.showerror("Erreur", "Sélectionnez d'abord une zone de capture.")
            return

        self.root.withdraw()
        self.root.update_idletasks()
        time.sleep(0.2)

        try:
            img = capture_region(region)
        except Exception as e:
            self.root.deiconify()
            messagebox.showerror("Erreur", f"Capture échouée : {e}")
            return

        try:
            result = calibration_wizard(img, parent=self.root)
        finally:
            self.root.deiconify()
            self.root.lift()
            self.root.focus_force()

        if result is None:
            messagebox.showwarning("Annulé", "Calibration annulée.")
            return

        codes, pixels = result
        cal_points = []
        pixel_pts = []
        svg_pts = []

        for code, (px, py) in zip(codes, pixels):
            if code in AIRPORT_SVG_COORDS:
                cal_points.append({"code": code, "px": px, "py": py})
                pixel_pts.append((px, py))
                svg_pts.append(AIRPORT_SVG_COORDS[code])

        if len(pixel_pts) >= 3:
            matrix = compute_affine_transform(pixel_pts, svg_pts)
            if matrix is not None:
                self.transform_matrix = matrix
                self.config["calibration_points"] = cal_points
                save_config(self.config)
                self.cal_label.config(text=f"Calibration : {len(cal_points)} points ✓", fg="#00ff41")
                messagebox.showinfo("Calibration", "Calibration réussie !")
                return

        messagebox.showerror("Erreur", "Calibration échouée. Réessayez avec 3 aéroports différents.")

    def toggle_capture(self):
        if self.running:
            self.running = False
            self.start_btn.config(text="▶ Démarrer la capture", bg="#006622")
            self.status_label.config(text="⬤ Arrêté", fg="#ff4444")
        else:
            if not self.config.get("capture_region"):
                messagebox.showerror("Erreur", "Sélectionnez une zone de capture.")
                return
            if self.transform_matrix is None:
                messagebox.showerror("Erreur", "Effectuez la calibration d'abord.")
                return
            if not self.url_entry.get().strip() or not self.token_entry.get().strip():
                messagebox.showerror("Erreur", "Renseignez l'URL du serveur et le token API.")
                return

            self.config["server_url"] = self.url_entry.get().strip()
            self.config["api_token"] = self.token_entry.get().strip()
            save_config(self.config)

            self.running = True
            self.start_btn.config(text="⏹ Arrêter la capture", bg="#660000")
            self.status_label.config(text="⬤ Capture en cours", fg="#00ff41")
            self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
            self.capture_thread.start()

    def _capture_loop(self):
        interval = self.config.get("capture_interval_ms", 2000) / 1000.0
        hue_range = self.config.get("red_hue_range", [0, 10, 170, 180])
        hue_pairs = [(hue_range[i], hue_range[i + 1]) for i in range(0, len(hue_range), 2)]

        while self.running:
            try:
                region = self.config["capture_region"]
                img = capture_region(region)

                clusters = detect_red_clusters(
                    img,
                    hue_ranges=hue_pairs,
                    sat_min=self.config.get("red_saturation_min", 80),
                    val_min=self.config.get("red_value_min", 80),
                    min_pixels=self.config.get("min_cluster_pixels", 5),
                    max_pixels=self.config.get("max_cluster_pixels", 500),
                )

                if clusters and self.transform_matrix is not None:
                    positions = []
                    for i, c in enumerate(clusters):
                        svg_x, svg_y = transform_point(
                            self.transform_matrix, c["x"], c["y"],
                        )
                        self.cluster_counter += 1
                        positions.append({
                            "x": svg_x,
                            "y": svg_y,
                            "cluster_id": self.cluster_counter,
                        })

                    result = send_positions(
                        self.config["server_url"],
                        self.config["api_token"],
                        positions,
                    )

                    if result:
                        info = f"Détecté: {len(clusters)} | Envoyé: {result.get('ingested', 0)} | Matché: {result.get('matched', 0)}"
                    else:
                        info = f"Détecté: {len(clusters)} | Erreur d'envoi"
                else:
                    info = f"Détecté: {len(clusters) if clusters else 0} avions"

                self.root.after(0, lambda t=info: self.info_label.config(text=t))

            except Exception as e:
                logger.error("Erreur capture: %s", e)
                self.root.after(0, lambda: self.info_label.config(text=f"Erreur: {str(e)[:50]}"))

            time.sleep(interval)

    def save_all(self):
        self.config["server_url"] = self.url_entry.get().strip()
        self.config["api_token"] = self.token_entry.get().strip()
        save_config(self.config)
        messagebox.showinfo("Sauvegardé", "Configuration sauvegardée.")

    def on_close(self):
        self.running = False
        self.config["server_url"] = self.url_entry.get().strip()
        self.config["api_token"] = self.token_entry.get().strip()
        save_config(self.config)
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    enable_dpi_awareness()
    app = RadarCaptureApp()
    app.run()
