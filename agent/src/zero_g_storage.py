import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_SCRIPTS_DIR = Path(__file__).parent.parent / "zero_g"


class ZeroGStorage:
    """Persistent agent memory backed by 0G decentralised storage.

    Data is stored as JSON blobs on the 0G network and addressed by
    their merkle root hash.  An in-process label→hash index is kept so
    agents can quickly reload named blobs without an external database.

    Requires the Node.js helper scripts in agent/zero_g/ and the env vars:
      ZERO_G_PRIVATE_KEY      — EVM wallet private key (hex)
      ZERO_G_RPC_URL          — 0G EVM RPC (default: testnet)
      ZERO_G_INDEXER_URL      — 0G storage indexer (default: testnet turbo)
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self._index: dict[str, str] = {}  # label -> root_hash

    # ------------------------------------------------------------------
    # Core storage operations
    # ------------------------------------------------------------------

    def store(self, label: str, data: dict) -> Optional[str]:
        """Upload *data* to 0G and return the merkle root hash."""
        payload = json.dumps(
            {"label": label, "agent_id": self.agent_id, "data": data, "ts": time.time()}
        )
        result = self._run("upload.mjs", payload)
        if result and "rootHash" in result:
            root_hash: str = result["rootHash"]
            self._index[label] = root_hash
            logger.info("0G stored '%s': %.16s…", label, root_hash)
            return root_hash
        return None

    def retrieve(self, root_hash: str) -> Optional[dict]:
        """Download and return the JSON blob at *root_hash*."""
        result = self._run("download.mjs", root_hash)
        return result.get("data") if result else None

    def load(self, label: str) -> Optional[dict]:
        """Return the most recently stored blob for *label* (from cache or 0G)."""
        root_hash = self._index.get(label)
        if not root_hash:
            return None
        return self.retrieve(root_hash)

    # ------------------------------------------------------------------
    # High-level agent memory helpers
    # ------------------------------------------------------------------

    def remember_negotiation(
        self, counterparty: str, token_pair: str, rate: float, outcome: str
    ) -> Optional[str]:
        """Append a negotiation record to the LP's trading history on 0G."""
        history = self._load_history()
        history["records"].append(
            {
                "counterparty": counterparty,
                "token_pair": token_pair,
                "rate": rate,
                "outcome": outcome,
                "ts": time.time(),
            }
        )
        history["records"] = history["records"][-500:]  # rolling window
        return self.store("negotiation_history", history)

    def get_counterparty_score(self, counterparty: str) -> float:
        """Return a [0, 1] reliability score for *counterparty* based on past trades."""
        history = self._load_history()
        records = [r for r in history["records"] if r["counterparty"] == counterparty]
        if not records:
            return 0.5  # neutral prior
        successes = sum(1 for r in records if r["outcome"] == "SUCCESS")
        return successes / len(records)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_history(self) -> dict:
        h = self.load("negotiation_history")
        return h if isinstance(h, dict) and "records" in h else {"records": []}

    def _run(self, script: str, *args: str) -> Optional[dict]:
        cmd = ["node", str(_SCRIPTS_DIR / script), *args]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                env={**os.environ},
            )
            if result.returncode != 0:
                logger.error("0G %s failed: %s", script, result.stderr.strip())
                return None
            return json.loads(result.stdout)
        except subprocess.TimeoutExpired:
            logger.error("0G %s timed out", script)
        except json.JSONDecodeError as exc:
            logger.error("0G %s returned invalid JSON: %s", script, exc)
        return None
