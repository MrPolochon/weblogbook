"""Best-effort OCR extraction of Roblox usernames from a frame."""

from __future__ import annotations

import re
from functools import lru_cache

import numpy as np

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")


@lru_cache(maxsize=1)
def _reader():
    try:
        import easyocr  # type: ignore
        return easyocr.Reader(["en"], gpu=False, verbose=False)
    except Exception:
        return None


def _normalize_candidates(texts: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen = set()
    for raw in texts:
        token = raw.strip().replace(" ", "")
        token = re.sub(r"[^A-Za-z0-9_]", "", token)
        if not token:
            continue
        if not USERNAME_RE.match(token):
            continue
        if token.lower() in {"alt", "spd", "fl", "hdg", "ias", "kts"}:
            continue
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(token)
    return cleaned


def extract_player_names(image: np.ndarray) -> list[str]:
    """
    Try to detect Roblox-like usernames in a screenshot area.
    Returns a de-duplicated list sorted by OCR confidence order.
    """
    reader = _reader()
    if reader is None:
        return []
    try:
        results = reader.readtext(image, detail=1, paragraph=False)
    except Exception:
        return []
    texts: list[str] = []
    for item in results:
        # easyocr output: [bbox, text, confidence]
        if len(item) >= 2:
            text = str(item[1])
            texts.append(text)
    return _normalize_candidates(texts)
