#!/usr/bin/env bash
# Start AXL nodes for broker and LP agents.
# Run this from the project root: bash agent/axl/start-nodes.sh

set -euo pipefail

AXL_BIN="${AXL_BIN:-./axl/node}"
AXL_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f "$AXL_BIN" ]]; then
  echo "ERROR: AXL binary not found at $AXL_BIN"
  echo "  Build it: git clone https://github.com/gensyn-ai/axl && cd axl && make build"
  exit 1
fi

# Generate keys if missing
for ROLE in broker lp; do
  KEY="$AXL_DIR/${ROLE}-node.key"
  if [[ ! -f "$KEY" ]]; then
    echo "Generating ED25519 key for $ROLE node: $KEY"
    openssl genpkey -algorithm ED25519 -out "$KEY"
  fi
done

echo "Starting broker AXL node (HTTP API: 127.0.0.1:9002)..."
"$AXL_BIN" -config "$AXL_DIR/broker-config.json" &
BROKER_PID=$!

echo "Starting LP AXL node (HTTP API: 127.0.0.1:9003)..."
"$AXL_BIN" -config "$AXL_DIR/lp-config.json" &
LP_PID=$!

echo "AXL nodes running (broker PID=$BROKER_PID, lp PID=$LP_PID)"
echo "Stop with: kill $BROKER_PID $LP_PID"

# Print peer IDs once nodes are ready
sleep 3
echo ""
echo "--- Broker peer ID ---"
curl -s http://127.0.0.1:9002/topology | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('publicKey') or d.get('public_key','?'))" 2>/dev/null || true
echo ""
echo "--- LP peer ID ---"
curl -s http://127.0.0.1:9003/topology | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('publicKey') or d.get('public_key','?'))" 2>/dev/null || true

wait
