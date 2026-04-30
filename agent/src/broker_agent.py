"""Broker Agent — represents a user seeking the best OTC swap.

Flow:
  1. Load known LP peer IDs from lp-peers.json
  2. Broadcast SWAP_REQUEST to all LPs via AXL
  3. Collect QUOTE responses within a timeout
  4. Pick best quote (highest amount_out, not expired)
  5. Send ACCEPT, wait for CONFIRM with MIST escrow details

Usage:
  AXL_BASE_URL=http://127.0.0.1:9002 python broker_agent.py \\
      --token-in ETH --amount-in 10 --token-out USDC
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

from axl_client import AXLClient
from messages import (
    Accept,
    MsgType,
    Quote,
    SwapRequest,
    from_dict,
    to_dict,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [BROKER] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

_QUOTE_TIMEOUT = float(os.getenv("QUOTE_TIMEOUT_SECS", "15"))
_CONFIRM_TIMEOUT = float(os.getenv("CONFIRM_TIMEOUT_SECS", "30"))
_LP_PEERS_FILE = Path(os.getenv("LP_PEERS_FILE", "lp-peers.json"))
_POLL_INTERVAL = 0.5


def _load_lp_peers() -> list[str]:
    try:
        peers = json.loads(_LP_PEERS_FILE.read_text()).get("peers", [])
        logger.info("Loaded %d LP peer(s) from %s", len(peers), _LP_PEERS_FILE)
        return peers
    except FileNotFoundError:
        logger.warning(
            "No %s found — create it with LP peer IDs before running.", _LP_PEERS_FILE
        )
        return []


class BrokerAgent:
    def __init__(self):
        self.axl = AXLClient()
        self.lp_peers = _load_lp_peers()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def request_swap(
        self,
        token_in: str,
        amount_in: float,
        token_out: str,
        max_slippage: float = 0.005,
    ) -> Optional[dict]:
        if not self.lp_peers:
            logger.error("No LP peers configured — cannot request swap.")
            return None

        req = SwapRequest(
            token_in=token_in,
            amount_in=amount_in,
            token_out=token_out,
            max_slippage=max_slippage,
            broker_peer_id=self.axl.peer_id,
        )
        msg = to_dict(req)
        sent = self.axl.broadcast(self.lp_peers, msg)
        logger.info(
            "SWAP_REQUEST %.8s: %s %s→%s sent to %d/%d LP(s)",
            req.msg_id,
            amount_in,
            token_in,
            token_out,
            sent,
            len(self.lp_peers),
        )

        best = self._collect_best_quote(req.msg_id)
        if not best:
            logger.error("No valid quotes received within %.0fs.", _QUOTE_TIMEOUT)
            return None

        peer_id, quote = best
        return self._accept_and_confirm(peer_id, quote, req)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _collect_best_quote(self, request_id: str) -> Optional[tuple]:
        quotes: list[tuple[str, Quote]] = []
        deadline = time.time() + _QUOTE_TIMEOUT
        while time.time() < deadline:
            peer_id, raw = self.axl.recv()
            if raw and isinstance(raw, dict):
                if (
                    raw.get("msg_type") == MsgType.QUOTE
                    and raw.get("request_id") == request_id
                ):
                    quote: Quote = from_dict(raw)
                    quotes.append((peer_id, quote))
                    logger.info(
                        "Quote from %.8s…: rate=%.6f → %.4f %s out",
                        peer_id,
                        quote.rate,
                        quote.amount_out,
                        "",
                    )
            time.sleep(_POLL_INTERVAL)

        now = time.time()
        valid = [(p, q) for p, q in quotes if q.expiry > now]
        if not valid:
            return None
        # Best = most output tokens received
        return max(valid, key=lambda x: x[1].amount_out)

    def _accept_and_confirm(
        self, peer_id: str, quote: Quote, req: SwapRequest
    ) -> Optional[dict]:
        accept = Accept(quote_id=quote.msg_id, request_id=req.msg_id)
        self.axl.send(peer_id, to_dict(accept))
        logger.info("Sent ACCEPT for quote %.8s to LP %.8s…", quote.msg_id, peer_id)

        deadline = time.time() + _CONFIRM_TIMEOUT
        while time.time() < deadline:
            src, raw = self.axl.recv()
            if raw and isinstance(raw, dict):
                msg_type = raw.get("msg_type")
                if msg_type == MsgType.CONFIRM and raw.get("request_id") == req.msg_id:
                    confirm = from_dict(raw)
                    logger.info("CONFIRM received. Escrow: %s", confirm.escrow_data)
                    return {
                        "status": "confirmed",
                        "token_in": req.token_in,
                        "amount_in": req.amount_in,
                        "token_out": req.token_out,
                        "rate": quote.rate,
                        "amount_out": quote.amount_out,
                        "escrow": confirm.escrow_data,
                    }
                if msg_type == MsgType.REJECT and raw.get("request_id") == req.msg_id:
                    logger.warning("LP rejected after ACCEPT: %s", raw.get("reason"))
                    return None
            time.sleep(_POLL_INTERVAL)

        logger.error("Timed out waiting for CONFIRM after %.0fs.", _CONFIRM_TIMEOUT)
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="OTC Broker Agent")
    parser.add_argument("--token-in", required=True, help="Token to sell (e.g. ETH)")
    parser.add_argument("--amount-in", type=float, required=True, help="Amount to sell")
    parser.add_argument("--token-out", required=True, help="Token to buy (e.g. USDC)")
    parser.add_argument(
        "--max-slippage", type=float, default=0.005, help="Max slippage (default 0.5%%)"
    )
    args = parser.parse_args()

    agent = BrokerAgent()
    logger.info("Broker peer ID: %s", agent.axl.peer_id)

    result = agent.request_swap(
        token_in=args.token_in,
        amount_in=args.amount_in,
        token_out=args.token_out,
        max_slippage=args.max_slippage,
    )

    if result:
        print(json.dumps(result, indent=2))
        sys.exit(0)
    else:
        logger.error("Swap negotiation failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
