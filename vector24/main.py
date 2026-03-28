"""
Mixou Vector24 - Vector24 + RadarCapture merge.

- Vector drawing overlay workflow (headings)
- Minimap capture, calibration and API push for weblogbook radar
"""

import ctypes
import json
import logging
import math
import os
import sys
import threading
import time
import tkinter as tk
import webbrowser
from tkinter import messagebox

import requests
from PIL import Image, ImageTk

from capture import capture_region, select_region_interactive
from detect import detect_red_clusters
from calibrate import (
    AIRPORT_SVG_COORDS,
    calibration_wizard,
    compute_affine_transform,
    transform_point,
)
from sender import send_positions

try:
    from pypresence import Presence
except Exception:
    Presence = None

try:
    from ocr import extract_player_names
except Exception:
    extract_player_names = None


try:
    import pygame  # type: ignore
except Exception:
    pygame = None


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

if pygame is not None:
    try:
        pygame.mixer.init()
    except Exception:
        pygame = None


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
    if getattr(sys, "frozen", False):
        base_dir = os.getenv("LOCALAPPDATA") or os.path.expanduser("~")
        config_dir = os.path.join(base_dir, "WebLogbook", "MixouVector24")
        os.makedirs(config_dir, exist_ok=True)
        return os.path.join(config_dir, "config.json")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


CONFIG_FILE = get_config_file()


def load_config() -> dict:
    defaults = {
        "first_run": True,
        "discord_rpc_enabled": True,
        "atc_position": "Tower",
        "transparency": 0.92,
        "always_on_top": True,
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
        "ocr_enabled": False,
        "ocr_region": None,
    }
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            defaults.update(data)
    except Exception:
        pass
    return defaults


def save_config(config: dict):
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


def load_positions(file_path: str) -> dict:
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)
            return data.get("airports", {})
    except Exception:
        return {}


class MixouVector24App:
    def __init__(self):
        self.config = load_config()
        self.running = False
        self.capture_thread: threading.Thread | None = None
        self.transform_matrix = None
        self.cluster_counter = 0

        self.atc_position = self.config.get("atc_position", "Tower")
        self.discord_rpc_enabled = tk.BooleanVar(value=bool(self.config.get("discord_rpc_enabled", True)))
        self.rpc_connected = False
        self.rpc = None
        self.client_id = "1292041649945444402"

        self.start_x = 200
        self.start_y = 150
        self.is_mouse_pressed = False
        self.current_line = None
        self.preview_line = None

        self._build_transform()
        self._build_ui()
        self._init_discord()

    def _build_transform(self):
        cal = self.config.get("calibration_points", [])
        if len(cal) >= 3:
            pixel_pts = [(p["px"], p["py"]) for p in cal]
            svg_pts = [AIRPORT_SVG_COORDS[p["code"]] for p in cal if p["code"] in AIRPORT_SVG_COORDS]
            if len(svg_pts) >= 3:
                self.transform_matrix = compute_affine_transform(pixel_pts, svg_pts)

    def _build_ui(self):
        self.root = tk.Tk()
        self.root.title("Mixou Vector24")
        self.root.geometry("980x760")
        self.root.configure(bg="#0a0a0a")
        self.root.attributes("-alpha", float(self.config.get("transparency", 0.92)))
        self.root.attributes("-topmost", bool(self.config.get("always_on_top", True)))

        title = tk.Label(
            self.root,
            text="Mixou Vector24 - Vecteurs + Radar Capture",
            bg="#0a0a0a",
            fg="#00ff41",
            font=("Consolas", 13, "bold"),
        )
        title.pack(pady=(8, 5))

        main = tk.Frame(self.root, bg="#0a0a0a")
        main.pack(fill=tk.BOTH, expand=True, padx=10, pady=6)

        # Left side: Vector drawing
        left = tk.Frame(main, bg="#0a0a0a")
        left.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.heading_label = tk.Label(
            left,
            text="Heading: 000",
            bg="#111111",
            fg="#00ff41",
            font=("Consolas", 12, "bold"),
            padx=8,
            pady=5,
        )
        self.heading_label.pack(fill=tk.X, pady=(0, 6))

        self.canvas = tk.Canvas(left, width=560, height=620, bg="white", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.canvas.bind("<ButtonPress-1>", self._start_left_draw)
        self.canvas.bind("<B1-Motion>", self._drag_left_draw)
        self.canvas.bind("<ButtonRelease-1>", self._release_left_draw)
        self.canvas.bind("<ButtonPress-3>", self._start_right_draw)
        self.canvas.bind("<B3-Motion>", self._drag_right_draw)
        self.canvas.bind("<ButtonRelease-3>", self._release_right_draw)
        self.canvas.bind("<Double-Button-3>", self._clear_all_lines)

        guide = tk.Label(
            left,
            text="Gauche: heading temporaire | Droite: ligne permanente | Double clic droit: clear",
            bg="#0a0a0a",
            fg="#666666",
            font=("Consolas", 9),
        )
        guide.pack(anchor="w", pady=(6, 0))

        # Right side: Radar capture controls
        right = tk.Frame(main, bg="#0f0f0f", bd=1, relief=tk.SOLID)
        right.pack(side=tk.RIGHT, fill=tk.Y, padx=(10, 0))
        right.configure(width=360)
        right.pack_propagate(False)

        tk.Label(right, text="Capture Radar", bg="#0f0f0f", fg="#00ff41", font=("Consolas", 12, "bold")).pack(pady=(10, 6))

        form = tk.Frame(right, bg="#0f0f0f")
        form.pack(fill=tk.BOTH, expand=True, padx=12, pady=5)

        tk.Label(form, text="URL du serveur:", bg="#0f0f0f", fg="#00cc44", anchor="w", font=("Consolas", 9)).pack(fill=tk.X, pady=(3, 0))
        self.url_entry = tk.Entry(form, bg="#111", fg="#00ff41", insertbackground="#00ff41", font=("Consolas", 9))
        self.url_entry.insert(0, self.config.get("server_url", ""))
        self.url_entry.pack(fill=tk.X, pady=(2, 5))

        tk.Label(form, text="Token API:", bg="#0f0f0f", fg="#00cc44", anchor="w", font=("Consolas", 9)).pack(fill=tk.X, pady=(3, 0))
        self.token_entry = tk.Entry(form, bg="#111", fg="#00ff41", insertbackground="#00ff41", font=("Consolas", 9), show="*")
        self.token_entry.insert(0, self.config.get("api_token", ""))
        self.token_entry.pack(fill=tk.X, pady=(2, 7))

        self.status_label = tk.Label(form, text="⬤ Arrêté", bg="#0f0f0f", fg="#ff4444", font=("Consolas", 11, "bold"))
        self.status_label.pack(pady=(3, 1))
        self.info_label = tk.Label(form, text="", bg="#0f0f0f", fg="#888", font=("Consolas", 8), wraplength=320)
        self.info_label.pack(pady=(0, 4))

        cal_count = len(self.config.get("calibration_points", []))
        self.cal_label = tk.Label(
            form,
            text=f"Calibration: {cal_count} points" if cal_count else "Non calibré",
            bg="#0f0f0f",
            fg="#00ff41" if cal_count >= 3 else "#ff9900",
            font=("Consolas", 9),
        )
        self.cal_label.pack()

        self.region_label = tk.Label(
            form,
            text=self._format_region_text(self.config.get("capture_region")),
            bg="#0f0f0f",
            fg="#00ff41" if self.config.get("capture_region") else "#ff9900",
            font=("Consolas", 9),
        )
        self.region_label.pack(pady=(2, 4))

        self.ocr_enabled_var = tk.BooleanVar(value=bool(self.config.get("ocr_enabled", False)))
        tk.Checkbutton(
            form,
            text="OCR noms joueurs (beta)",
            variable=self.ocr_enabled_var,
            bg="#0f0f0f",
            fg="#00cc44",
            activebackground="#0f0f0f",
            activeforeground="#00ff41",
            selectcolor="#111111",
            command=self._toggle_ocr,
            font=("Consolas", 9),
        ).pack(anchor="w", pady=(4, 6))

        btn_style = {
            "bg": "#0d3320",
            "fg": "#00ff41",
            "activebackground": "#1a4a30",
            "activeforeground": "#00ff41",
            "font": ("Consolas", 9, "bold"),
            "relief": "flat",
            "cursor": "hand2",
        }
        tk.Button(form, text="Sélectionner zone", command=self.select_region, **btn_style).pack(fill=tk.X, pady=2)
        tk.Button(form, text="Auto minimap (bas droite)", command=self.auto_select_minimap, **btn_style).pack(fill=tk.X, pady=2)
        tk.Button(form, text="Prévisualiser zone", command=self.preview_region, **btn_style).pack(fill=tk.X, pady=2)
        tk.Button(form, text="Calibrer (3 aéroports)", command=self.calibrate, **btn_style).pack(fill=tk.X, pady=2)
        tk.Button(form, text="Sélectionner zone OCR", command=self.select_ocr_region, **btn_style).pack(fill=tk.X, pady=2)

        self.start_btn = tk.Button(
            form,
            text="▶ Démarrer la capture",
            command=self.toggle_capture,
            bg="#006622",
            fg="#00ff41",
            activebackground="#008833",
            activeforeground="#00ff41",
            font=("Consolas", 10, "bold"),
            relief="flat",
            cursor="hand2",
        )
        self.start_btn.pack(fill=tk.X, pady=(10, 2))

        tk.Button(form, text="Sauvegarder config", command=self.save_all, **btn_style).pack(fill=tk.X, pady=2)

        self._build_menu()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _build_menu(self):
        menu_bar = tk.Menu(self.root)
        self.root.config(menu=menu_bar)

        options_menu = tk.Menu(menu_bar, tearoff=0)
        menu_bar.add_cascade(label="Options", menu=options_menu)
        options_menu.add_checkbutton(
            label="Discord RPC",
            onvalue=True,
            offvalue=False,
            variable=self.discord_rpc_enabled,
            command=self._toggle_rpc,
        )
        options_menu.add_command(label="Transparence", command=self._open_transparency_window)
        options_menu.add_command(label="Check updates", command=self._check_for_updates)

        atc_menu = tk.Menu(menu_bar, tearoff=0)
        menu_bar.add_cascade(label="Position", menu=atc_menu)
        positions = load_positions(os.path.join(os.path.dirname(__file__), "positions.json"))
        for region, airports in positions.items():
            region_menu = tk.Menu(atc_menu, tearoff=0)
            for airport_name, pos_dict in airports.items():
                airport_menu = tk.Menu(region_menu, tearoff=0)
                for label, atc_code in pos_dict.items():
                    airport_menu.add_command(
                        label=f"{label} ({atc_code})",
                        command=lambda p=atc_code: self._select_atc_position(p),
                    )
                region_menu.add_cascade(label=airport_name, menu=airport_menu)
            atc_menu.add_cascade(label=region, menu=region_menu)

    # Vector drawing logic
    def _compute_heading(self, x2: float, y2: float) -> int:
        dx = x2 - self.start_x
        dy = self.start_y - y2
        angle = math.atan2(dy, dx)
        heading = (math.degrees(angle) + 360) % 360
        heading = (90 - heading) % 360
        rounded_heading = round(heading / 5) * 5
        return 360 if rounded_heading == 0 else int(rounded_heading)

    def _start_left_draw(self, event):
        self.start_x, self.start_y = event.x, event.y
        self.is_mouse_pressed = True
        self.current_line = self.canvas.create_line(self.start_x, self.start_y, self.start_x, self.start_y, fill="black", width=2)

    def _drag_left_draw(self, event):
        if not self.is_mouse_pressed or not self.current_line:
            return
        self.canvas.coords(self.current_line, self.start_x, self.start_y, event.x, event.y)
        heading = self._compute_heading(event.x, event.y)
        self.heading_label.config(text=f"Heading: {heading:03d}")
        self._update_discord_presence(heading)

    def _release_left_draw(self, event):
        self.is_mouse_pressed = False
        if self.current_line:
            self.canvas.delete(self.current_line)
            self.current_line = None

    def _start_right_draw(self, event):
        self.start_x, self.start_y = event.x, event.y
        self.is_mouse_pressed = True
        self.preview_line = self.canvas.create_line(self.start_x, self.start_y, self.start_x, self.start_y, fill="blue", dash=(4, 2), width=2)

    def _drag_right_draw(self, event):
        if not self.is_mouse_pressed or not self.preview_line:
            return
        self.canvas.coords(self.preview_line, self.start_x, self.start_y, event.x, event.y)
        heading = self._compute_heading(event.x, event.y)
        self.heading_label.config(text=f"Heading: {heading:03d}")

    def _release_right_draw(self, event):
        if not self.is_mouse_pressed:
            return
        self.is_mouse_pressed = False
        if self.preview_line:
            self.canvas.delete(self.preview_line)
            self.preview_line = None
        self.canvas.create_line(self.start_x, self.start_y, event.x, event.y, fill="red", width=2)
        heading = self._compute_heading(event.x, event.y)
        self.heading_label.config(text=f"Heading: {heading:03d}")
        self._update_discord_presence(heading)

    def _clear_all_lines(self, _event=None):
        self.canvas.delete("all")
        self.heading_label.config(text="Heading: 000")

    # Radar capture UI logic
    def _format_region_text(self, region: dict | None) -> str:
        if not region:
            return "Aucune zone sélectionnée"
        return f"Zone: {region['width']}x{region['height']} ({region['left']},{region['top']})"

    def _apply_region(self, region: dict):
        self.config["capture_region"] = region
        save_config(self.config)
        self.region_label.config(text=self._format_region_text(region), fg="#00ff41")

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

    def select_ocr_region(self):
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
            self.config["ocr_region"] = region
            save_config(self.config)
            messagebox.showinfo("OCR", "Zone OCR enregistrée.")

    def auto_select_minimap(self):
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        size = max(300, min(430, int(screen_h * 0.46)))
        region = {
            "left": max(0, screen_w - size - 18),
            "top": max(0, screen_h - size - 85),
            "width": size,
            "height": size,
        }
        self._apply_region(region)
        messagebox.showinfo("Zone auto", "Zone minimap auto appliquée. Vérifiez avec Prévisualiser zone.")

    def preview_region(self):
        region = self.config.get("capture_region")
        if not region:
            messagebox.showerror("Erreur", "Sélectionnez une zone de capture.")
            return
        try:
            img = capture_region(region)
        except Exception as e:
            messagebox.showerror("Erreur", f"Aperçu impossible: {e}")
            return
        preview = tk.Toplevel(self.root)
        preview.title("Aperçu zone")
        preview.configure(bg="#0a0a0a")
        image = Image.fromarray(img)
        if image.width > 400:
            ratio = 400 / image.width
            image = image.resize((int(image.width * ratio), int(image.height * ratio)))
        photo = ImageTk.PhotoImage(image)
        label = tk.Label(preview, image=photo, bg="#0a0a0a")
        label.image = photo
        label.pack(padx=10, pady=10)

    def calibrate(self):
        region = self.config.get("capture_region")
        if not region:
            messagebox.showerror("Erreur", "Sélectionnez une zone de capture.")
            return
        self.root.withdraw()
        self.root.update_idletasks()
        time.sleep(0.2)
        try:
            img = capture_region(region)
            result = calibration_wizard(img, parent=self.root)
        finally:
            self.root.deiconify()
            self.root.lift()
            self.root.focus_force()
        if result is None:
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
                self.cal_label.config(text=f"Calibration: {len(cal_points)} points ✓", fg="#00ff41")
                messagebox.showinfo("Calibration", "Calibration réussie.")
                return
        messagebox.showerror("Erreur", "Calibration échouée.")

    def _toggle_ocr(self):
        self.config["ocr_enabled"] = bool(self.ocr_enabled_var.get())
        save_config(self.config)

    def toggle_capture(self):
        if self.running:
            self.running = False
            self.start_btn.config(text="▶ Démarrer la capture", bg="#006622")
            self.status_label.config(text="⬤ Arrêté", fg="#ff4444")
            return

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
        self.config["ocr_enabled"] = bool(self.ocr_enabled_var.get())
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

                ocr_names = []
                if self.config.get("ocr_enabled") and extract_player_names and self.config.get("ocr_region"):
                    try:
                        ocr_img = capture_region(self.config["ocr_region"])
                        ocr_names = extract_player_names(ocr_img)
                    except Exception:
                        ocr_names = []

                if clusters and self.transform_matrix is not None:
                    positions = []
                    for c in clusters:
                        svg_x, svg_y = transform_point(self.transform_matrix, c["x"], c["y"])
                        self.cluster_counter += 1
                        payload = {
                            "x": svg_x,
                            "y": svg_y,
                            "cluster_id": self.cluster_counter,
                        }
                        if ocr_names:
                            payload["roblox_username"] = ocr_names[0]
                        positions.append(payload)

                    result = send_positions(
                        self.config["server_url"],
                        self.config["api_token"],
                        positions,
                    )
                    if result.get("ok"):
                        info = f"Détecté: {len(clusters)} | Envoyé: {result.get('ingested', 0)} | Matché: {result.get('matched', 0)}"
                    else:
                        err = result.get("error", "inconnu")
                        info = f"Détecté: {len(clusters)} | Erreur: {err[:60]}"
                else:
                    info = f"Détecté: {len(clusters) if clusters else 0} avions"

                self.root.after(0, lambda t=info: self.info_label.config(text=t))
            except Exception as e:
                logger.error("Erreur capture: %s", e)
                self.root.after(0, lambda: self.info_label.config(text=f"Erreur: {str(e)[:60]}"))
            time.sleep(interval)

    # Discord RPC and options
    def _init_discord(self):
        if not Presence:
            return
        self.rpc = Presence(self.client_id)
        if self.discord_rpc_enabled.get():
            self._connect_rpc()
            self.root.after(15000, self._presence_loop)

    def _connect_rpc(self):
        if not self.rpc:
            return
        try:
            self.rpc.connect()
            self.rpc_connected = True
        except Exception:
            self.rpc_connected = False

    def _update_discord_presence(self, heading: int):
        if not self.rpc or not self.rpc_connected or not self.discord_rpc_enabled.get():
            return
        try:
            self.rpc.update(
                state=f"Directing heading {heading}°",
                details=f"ATC position: {self.atc_position}",
                large_image="logo",
                large_text="Mixou Vector24",
                start=time.time(),
            )
        except Exception:
            pass

    def _presence_loop(self):
        if self.rpc and self.rpc_connected and self.discord_rpc_enabled.get():
            try:
                self.rpc.update(
                    state="Idle",
                    details=f"ATC at {self.atc_position}",
                    large_image="logo",
                    large_text="Mixou Vector24",
                )
            except Exception:
                pass
        self.root.after(15000, self._presence_loop)

    def _toggle_rpc(self):
        self.config["discord_rpc_enabled"] = bool(self.discord_rpc_enabled.get())
        save_config(self.config)
        if self.discord_rpc_enabled.get() and not self.rpc_connected:
            self._connect_rpc()
        if not self.discord_rpc_enabled.get() and self.rpc and self.rpc_connected:
            try:
                self.rpc.close()
            except Exception:
                pass
            self.rpc_connected = False

    def _open_transparency_window(self):
        window = tk.Toplevel(self.root)
        window.title("Transparence")
        window.geometry("300x100")

        def on_slide(value):
            val = float(value)
            self.root.attributes("-alpha", val)
            self.config["transparency"] = val
            save_config(self.config)

        scale = tk.Scale(window, from_=0.2, to=1.0, resolution=0.05, orient=tk.HORIZONTAL, command=on_slide)
        scale.set(float(self.config.get("transparency", 0.92)))
        scale.pack(fill="x", padx=15, pady=10)

    def _check_for_updates(self):
        url = "https://api.github.com/repos/ptfstools/Vector24/releases/latest"
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                latest = response.json().get("tag_name", "unknown")
                if messagebox.askyesno("Update", f"Dernière version: {latest}\nOuvrir la page release ?"):
                    webbrowser.open("https://github.com/ptfstools/Vector24/releases/latest")
            else:
                messagebox.showinfo("Update", "Impossible de vérifier les mises à jour.")
        except Exception:
            messagebox.showinfo("Update", "Impossible de vérifier les mises à jour.")

    def _select_atc_position(self, position: str):
        self.atc_position = position
        self.config["atc_position"] = position
        save_config(self.config)

    def save_all(self):
        self.config["server_url"] = self.url_entry.get().strip()
        self.config["api_token"] = self.token_entry.get().strip()
        self.config["discord_rpc_enabled"] = bool(self.discord_rpc_enabled.get())
        save_config(self.config)
        messagebox.showinfo("Sauvegardé", "Configuration sauvegardée.")

    def on_close(self):
        self.running = False
        self.save_all()
        if self.rpc and self.rpc_connected:
            try:
                self.rpc.close()
            except Exception:
                pass
        self.root.destroy()

    def run(self):
        self.root.mainloop()


def play_startup_sound():
    if pygame is None:
        return
    try:
        sound_file = os.path.join(os.path.dirname(__file__), "startup.mp3")
        if os.path.exists(sound_file):
            pygame.mixer.music.load(sound_file)
            pygame.mixer.music.set_volume(1.0)
            pygame.mixer.music.play()
    except Exception:
        pass


if __name__ == "__main__":
    enable_dpi_awareness()
    play_startup_sound()
    app = MixouVector24App()
    app.run()
