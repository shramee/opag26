"""LP (Liquidity Provider) Agent — autonomous market maker.

Responsibilities:
  - Listen for SWAP_REQUEST messages on AXL
  - Price quotes using 0G Compute (AI inference) and stored memory
  - Negotiate back-and-forth with brokers
  - On agreement, lock funds in MIST escrow (via KeeperHub)
  - Persist every negotiation outcome to 0G Storage for future learning

Usage:
  AXL_BASE_URL=http://127.0.0.1:9002 python lp_agent.py [--agent-id lp-1]
"""

import argparse
import logging
import os
import time
from typing import Optional

from axl_client import AXLClient
from messages import (
    Confirm,
    MsgType,
    Quote,
    Reject,
    SwapRequest,
    from_dict,
    to_dict,
)
from zero_g_compute import ZeroGCompute
from zero_g_storage import ZeroGStorage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [LP] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

_AGENT_ID = os.getenv("LP_AGENT_ID", "lp-agent-1")
_POLL_INTERVAL = float(os.getenv("POLL_INTERVAL_SECS", "0.5"))
_QUOTE_TTL = 60.0  # seconds before an outstanding quote expires


# ---------------------------------------------------------------------------
# Placeholder market rates — replace with a real price oracle in production
# ---------------------------------------------------------------------------
_MARKET_RATES: dict[tuple[str, str], float] = {
    ("ETH", "USDC"): 3200.0,
    ("ETH", "USDT"): 3198.0,
    ("USDC", "ETH"): 1.0 / 3200.0,
    ("USDT", "ETH"): 1.0 / 3198.0,
    ("BTC", "USDC"): 65000.0,
    ("USDC", "BTC"): 1.0 / 65000.0,
}


class LPAgent:
    def __init__(self, agent_id: str = _AGENT_ID):
        self.agent_id = agent_id
        self.axl = AXLClient()
        self.memory = ZeroGStorage(agent_id)
        self.compute = ZeroGCompute()
        # request_id -> {request, quote, broker_peer_id, state}
        self._negotiations: dict[str, dict] = {}

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def start(self) -> None:
        peer_id = self.axl.peer_id
        logger.info("LP Agent '%s' started — AXL peer ID: %s", self.agent_id, peer_id)
        self._load_memory()
        logger.info("Listening for swap requests… (Ctrl-C to stop)")
        while True:
            try:
                self._tick()
            except KeyboardInterrupt:
                logger.info("Shutting down.")
                break
            except Exception as exc:
                logger.error("Unhandled error: %s", exc, exc_info=True)
            time.sleep(_POLL_INTERVAL)

    # ------------------------------------------------------------------
    # Per-tick message dispatch
    # ------------------------------------------------------------------

    def _tick(self) -> None:
        sender, raw = self.axl.recv()
        if not raw or not isinstance(raw, dict):
            return
        msg_type = raw.get("msg_type")
        handlers = {
            MsgType.SWAP_REQUEST: self._on_swap_request,
            MsgType.ACCEPT: self._on_accept,
            MsgType.COUNTER: self._on_counter,
            MsgType.REJECT: self._on_reject,
        }
        handler = handlers.get(msg_type)
        if handler:
            handler(sender, raw)
        else:
            logger.debug("Ignored unknown msg_type: %s", msg_type)

    # ------------------------------------------------------------------
    # Message handlers
    # ------------------------------------------------------------------

    def _on_swap_request(self, sender: Optional[str], raw: dict) -> None:
        req: SwapRequest = from_dict(raw)
        logger.info(
            "SWAP_REQUEST %.8s from %.8s…: %s %s → %s",
            req.msg_id,
            sender,
            req.amount_in,
            req.token_in,
            req.token_out,
        )
        counterparty = req.broker_peer_id or sender or ""
        score = self.memory.get_counterparty_score(counterparty)
        market_rate = self._market_rate(req.token_in, req.token_out)
        if market_rate is None:
            logger.warning("No market rate for %s/%s — rejecting.", req.token_in, req.token_out)
            self._send_reject(counterparty, req.msg_id, "Unsupported token pair")
            return

        rate = self.compute.evaluate_price(
            req.token_in,
            req.amount_in,
            req.token_out,
            {"counterparty_score": score},
            market_rate,
        )
        quote = Quote(
            msg_id=f"q-{req.msg_id[:8]}",
            request_id=req.msg_id,
            rate=rate,
            amount_out=req.amount_in * rate,
            expiry=time.time() + _QUOTE_TTL,
            lp_peer_id=self.axl.peer_id,
        )
        self._negotiations[req.msg_id] = {
            "request": req,
            "quote": quote,
            "broker_peer_id": counterparty,
            "state": "QUOTED",
        }
        self.axl.send(counterparty, to_dict(quote))
        logger.info(
            "Sent QUOTE rate=%.6f → %.4f %s (counterparty score=%.2f)",
            rate,
            quote.amount_out,
            req.token_out,
            score,
        )

    def _on_accept(self, sender: Optional[str], raw: dict) -> None:
        request_id = raw.get("request_id", "")
        neg = self._negotiations.get(request_id)
        if not neg:
            logger.warning("ACCEPT for unknown request %.8s", request_id)
            return
        neg["state"] = "ACCEPTED"
        req: SwapRequest = neg["request"]
        quote: Quote = neg["quote"]
        counterparty: str = neg["broker_peer_id"] or sender or ""
        logger.info("ACCEPT received for %.8s — locking escrow…", req.msg_id)

        escrow = self._lock_escrow(req, quote)
        confirm = Confirm(
            request_id=req.msg_id,
            quote_id=quote.msg_id,
            escrow_data=escrow,
        )
        self.axl.send(counterparty, to_dict(confirm))
        logger.info("Sent CONFIRM to %.8s…", counterparty)

        self.memory.remember_negotiation(counterparty, f"{req.token_in}/{req.token_out}", quote.rate, "SUCCESS")
        neg["state"] = "CONFIRMED"

    def _on_counter(self, sender: Optional[str], raw: dict) -> None:
        request_id = raw.get("request_id", "")
        neg = self._negotiations.get(request_id)
        if not neg:
            return
        req: SwapRequest = neg["request"]
        quote: Quote = neg["quote"]
        counterparty: str = neg["broker_peer_id"] or sender or ""
        min_rate: float = float(raw.get("min_rate", 0))

        # Accept counter if it's within our minimum spread
        min_acceptable = quote.rate * (1 - req.max_slippage)
        if min_rate >= min_acceptable:
            adjusted = Quote(
                msg_id=f"q2-{req.msg_id[:8]}",
                request_id=req.msg_id,
                rate=min(quote.rate, min_rate * 1.001),
                amount_out=req.amount_in * min(quote.rate, min_rate * 1.001),
                expiry=time.time() + _QUOTE_TTL,
                lp_peer_id=self.axl.peer_id,
            )
            neg["quote"] = adjusted
            self.axl.send(counterparty, to_dict(adjusted))
            logger.info("Counter accepted — revised rate %.6f", adjusted.rate)
        else:
            self._send_reject(counterparty, req.msg_id, "Counter below minimum spread")
            self.memory.remember_negotiation(counterparty, f"{req.token_in}/{req.token_out}", quote.rate, "FAILED")
            neg["state"] = "REJECTED"
            logger.info("Rejected counter (too low: %.6f < %.6f)", min_rate, min_acceptable)

    def _on_reject(self, sender: Optional[str], raw: dict) -> None:
        request_id = raw.get("request_id", "")
        neg = self._negotiations.get(request_id)
        if not neg:
            return
        req: SwapRequest = neg["request"]
        counterparty = neg["broker_peer_id"] or sender or ""
        self.memory.remember_negotiation(
            counterparty, f"{req.token_in}/{req.token_out}", neg["quote"].rate, "REJECTED"
        )
        neg["state"] = "REJECTED"
        logger.info("Broker rejected our quote for %.8s.", request_id)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _send_reject(self, peer_id: str, request_id: str, reason: str) -> None:
        self.axl.send(peer_id, {"msg_type": MsgType.REJECT, "request_id": request_id, "reason": reason})

    def _market_rate(self, token_in: str, token_out: str) -> Optional[float]:
        return _MARKET_RATES.get((token_in.upper(), token_out.upper()))

    def _lock_escrow(self, req: SwapRequest, quote: Quote) -> dict:
        """Lock LP funds in MIST escrow via KeeperHub MCP. Returns escrow metadata."""
        # TODO: integrate KeeperHub MCP server for reliable on-chain execution
        # See: https://docs.keeperhub.com/ai-tools
        logger.warning("KeeperHub/MIST escrow not yet wired — returning stub.")
        return {
            "status": "stub",
            "token": req.token_out,
            "amount": quote.amount_out,
            "escrow_contract": os.getenv("MIST_ESCROW_ADDRESS", "0x0000"),
            "note": "Integrate KeeperHub MCP for production",
        }

    def _load_memory(self) -> None:
        history = self.memory.load("negotiation_history")
        if history:
            n = len(history.get("records", []))
            logger.info("Loaded %d historical negotiations from 0G Storage.", n)
        else:
            logger.info("No prior memory found on 0G — starting fresh.")


def main() -> None:
    parser = argparse.ArgumentParser(description="OTC Liquidity Provider Agent")
    parser.add_argument("--agent-id", default=_AGENT_ID, help="Unique LP agent identifier")
    args = parser.parse_args()
    os.environ["LP_AGENT_ID"] = args.agent_id
    LPAgent(agent_id=args.agent_id).start()


if __name__ == "__main__":
    main()
