"""HTTP sender module: posts detected positions to the web API."""

import requests
import logging

logger = logging.getLogger(__name__)


def send_positions(
    server_url: str,
    api_token: str,
    positions: list[dict],
) -> dict | None:
    """
    Send detected aircraft positions to POST /api/radar/ingest.
    positions: list of {"x": float, "y": float, "cluster_id": int}
    Returns the server response dict or None on error.
    """
    if not positions:
        return None

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
            logger.info(
                "Envoyé %d positions : %d matchées, %d non matchées",
                data.get("ingested", 0),
                data.get("matched", 0),
                data.get("unmatched", 0),
            )
            return data
        else:
            logger.warning("Erreur serveur %d: %s", resp.status_code, resp.text[:200])
            return None

    except requests.RequestException as e:
        logger.error("Erreur réseau: %s", e)
        return None
