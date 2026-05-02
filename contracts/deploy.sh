#!/usr/bin/env bash
# Deploy Chamber contracts to the 0G Newton Testnet.
# Usage:
#   ./deploy.sh            # dry-run (no broadcast)
#   ./deploy.sh --broadcast
#   ./deploy.sh --broadcast --verify

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env if present
if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -o allexport
    source .env
    set +o allexport
else
    echo "Warning: .env not found. Copy .env.example to .env and fill in your values."
    echo "         Continuing with current environment variables."
fi

# ---- Validate required vars ------------------------------------------------
: "${PRIVATE_KEY:?'PRIVATE_KEY is not set'}"
: "${RPC_URL:?'RPC_URL is not set'}"
: "${CHAIN_ID:?'CHAIN_ID is not set'}"

# ---- Deploy ----------------------------------------------------------------
MODE="DRY-RUN (add --broadcast to deploy)"

if [[ " $* " == *" --broadcast "* ]]; then
    MODE="BROADCAST (live)"
fi

echo ""
echo "=============================================="
echo " Deploying Contracts"
echo " RPC : $RPC_URL"
echo " Chain ID: $CHAIN_ID"
echo " Mode: $MODE"
echo "=============================================="
echo ""

forge script script/DeployContracts.s.sol:DeployContracts \
    --rpc-url "$RPC_URL" \
    --chain-id "$CHAIN_ID" \
    --legacy \
    -vvvv \
    "$@"

if [[ "$MODE" == "BROADCAST (live)" ]]; then
    echo ""
    echo "Deployment complete. Contract addresses are logged above."
    echo "Broadcast artifacts saved in: broadcast/DeployContracts.s.sol/$CHAIN_ID/"
fi
