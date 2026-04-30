import json
import logging
import os
from typing import Any, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

_DEFAULT_URL = os.getenv("AXL_BASE_URL", "http://127.0.0.1:9002")


class AXLClient:
    """Thin wrapper around the AXL node HTTP API (localhost:9002 by default).

    AXL node endpoints:
      GET  /topology  — returns node public key and peer list
      POST /send      — fire-and-forget to peer (X-Destination-Peer-Id header)
      GET  /recv      — dequeue next inbound message (204 when empty)
    """

    def __init__(self, base_url: str = _DEFAULT_URL):
        self.base_url = base_url.rstrip("/")
        self._peer_id: Optional[str] = None

    def get_topology(self) -> dict:
        resp = requests.get(f"{self.base_url}/topology", timeout=5)
        resp.raise_for_status()
        return resp.json()

    @property
    def peer_id(self) -> str:
        if not self._peer_id:
            topo = self.get_topology()
            # AXL returns either camelCase or snake_case depending on version
            self._peer_id = topo.get("publicKey") or topo.get("public_key", "")
        return self._peer_id

    def send(self, peer_id: str, message: Any) -> bool:
        if isinstance(message, dict):
            body = json.dumps(message).encode()
        elif isinstance(message, str):
            body = message.encode()
        else:
            body = message
        headers = {
            "X-Destination-Peer-Id": peer_id,
            "Content-Type": "application/json",
        }
        try:
            resp = requests.post(
                f"{self.base_url}/send", headers=headers, data=body, timeout=10
            )
            resp.raise_for_status()
            return True
        except Exception as exc:
            logger.warning("AXL send to %.8s… failed: %s", peer_id, exc)
            return False

    def recv(self) -> Tuple[Optional[str], Optional[Any]]:
        """Return (sender_peer_id, parsed_body) or (None, None) when queue is empty."""
        try:
            resp = requests.get(f"{self.base_url}/recv", timeout=5)
            if resp.status_code == 204:
                return None, None
            peer_id = resp.headers.get("X-From-Peer-Id")
            try:
                data = resp.json()
            except Exception:
                data = resp.content
            return peer_id, data
        except Exception as exc:
            logger.debug("AXL recv error: %s", exc)
            return None, None

    def broadcast(self, peer_ids: list, message: Any) -> int:
        """Send the same message to multiple peers; returns count of successful sends."""
        return sum(1 for p in peer_ids if self.send(p, message))
