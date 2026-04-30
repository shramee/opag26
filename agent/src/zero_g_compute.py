import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_SCRIPTS_DIR = Path(__file__).parent.parent / "zero_g"


class ZeroGCompute:
    """0G Compute client — runs AI inference on the 0G decentralised network.

    Uses the @0glabs/0g-serving-broker TypeScript SDK via a Node.js subprocess.
    LP agents call this to obtain verifiable, AI-driven price quotes.

    Required env vars:
      ZERO_G_PRIVATE_KEY       — EVM wallet private key
      ZERO_G_RPC_URL           — 0G EVM RPC endpoint
      ZERO_G_PROVIDER_ADDRESS  — on-chain address of the inference provider
    """

    def __init__(self, provider_address: Optional[str] = None):
        self.provider_address = provider_address or os.getenv(
            "ZERO_G_PROVIDER_ADDRESS", ""
        )

    def evaluate_price(
        self,
        token_in: str,
        amount_in: float,
        token_out: str,
        memory: dict,
        market_rate: float,
    ) -> float:
        """Return an LP quote rate via 0G inference, falling back to rule-based pricing."""
        prompt = (
            f"You are an OTC liquidity provider pricing engine. "
            f"A broker wants to swap {amount_in} {token_in} for {token_out}. "
            f"Current market rate: {market_rate:.6f} {token_out}/{token_in}. "
            f"Counterparty reliability score: {memory.get('counterparty_score', 0.5):.2f} (0=bad, 1=trusted). "
            f"Recent market volatility: {memory.get('volatility', 0.01):.4f}. "
            f"Reply with ONLY valid JSON: {{\"rate\": <float>, \"reasoning\": \"<one sentence>\"}}. "
            f"Rate must be in {token_out} per {token_in}."
        )
        rate = self._run_inference(prompt)
        if rate is not None:
            return rate

        # Rule-based fallback: tighter spread for trusted counterparties
        score = memory.get("counterparty_score", 0.5)
        spread = 0.003 + 0.002 * (1.0 - score)
        return market_rate * (1.0 - spread)

    # ------------------------------------------------------------------

    def _run_inference(self, prompt: str) -> Optional[float]:
        if not self.provider_address:
            logger.debug("ZERO_G_PROVIDER_ADDRESS not set — using rule-based fallback")
            return None
        payload = json.dumps({"prompt": prompt, "providerAddress": self.provider_address})
        cmd = ["node", str(_SCRIPTS_DIR / "compute.mjs"), payload]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60,
                env={**os.environ},
            )
            if result.returncode != 0:
                logger.error("0G compute failed: %s", result.stderr.strip())
                return None
            data = json.loads(result.stdout)
            parsed = json.loads(data.get("result", "{}"))
            rate = float(parsed["rate"])
            logger.info(
                "0G compute rate: %.6f (%s)", rate, parsed.get("reasoning", "")
            )
            return rate
        except Exception as exc:
            logger.warning("0G compute unavailable: %s", exc)
            return None
