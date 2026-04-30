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
: "${OG_TESTNET_RPC_URL:?'OG_TESTNET_RPC_URL is not set'}"

# ---- Parse flags -----------------------------------------------------------
BROADCAST=""
VERIFY=""
for arg in "$@"; do
    case "$arg" in
        --broadcast) BROADCAST="--broadcast" ;;
        --verify)    VERIFY="--verify" ;;
    esac
done

# ---- Build -----------------------------------------------------------------
echo "Building contracts..."
forge build

# ---- Deploy ----------------------------------------------------------------
CHAIN_ID=16600   # 0G Newton Testnet

echo ""
echo "=============================================="
echo " Deploying Chamber to 0G Newton Testnet"
echo " RPC : $OG_TESTNET_RPC_URL"
echo " Chain ID: $CHAIN_ID"
[[ -n "$BROADCAST" ]] && echo " Mode: BROADCAST (live)" || echo " Mode: DRY-RUN (add --broadcast to deploy)"
echo "=============================================="
echo ""

forge script script/DeployChamber.s.sol:DeployChamber \
    --rpc-url "$OG_TESTNET_RPC_URL" \
    --chain-id "$CHAIN_ID" \
    $BROADCAST \
    $VERIFY \
    --legacy \
    -vvvv

if [[ -n "$BROADCAST" ]]; then
    echo ""
    echo "Deployment complete. Contract addresses are logged above."
    echo "Broadcast artifacts saved in: broadcast/DeployChamber.s.sol/$CHAIN_ID/"
fi
