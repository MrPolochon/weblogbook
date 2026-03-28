"""HTTP sender module: posts detected positions to the web API."""

import requests
import logging

logger = logging.getLogger(__name__)


def send_positions(
    server_url: str,
    api_token: str,
    positions: list[dict],
) -> dict:
    """
    Send detected aircraft positions to POST /api/radar/ingest.
    positions: list of {"x": float, "y": float, "cluster_id": int}
    Returns {"ok": True, ...} on success, or {"ok": False, "error": "..."} on failure.
    """
    if not positions:
        return {"ok": False, "error": "Aucune position"}

    url = f"{server_url.rstrip('/')}/api/radar/ingest"

    try:
        resp = requests.post(
            url,
            json={"positions": positions},
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json",
            },
            timeout=5,
        )

        if resp.status_code == 200:
            data = resp.json()
            data["ok"] = True
            logger.info(
                "Envoyé %d positions : %d matchées, %d non matchées",
                data.get("ingested", 0),
                data.get("matched", 0),
                data.get("unmatched", 0),
            )
            return data
        else:
            detail = resp.text[:120] if resp.text else "pas de détail"
            logger.warning("Erreur serveur %d: %s", resp.status_code, detail)
            return {"ok": False, "error": f"HTTP {resp.status_code}: {detail}"}

    except requests.RequestException as e:
        logger.error("Erreur réseau: %s", e)
        return {"ok": False, "error": str(e)[:120]}
