# Dark-Pool OTC Agent

Autonomous OTC swap agents for the [MIST-OTC](../README.md) protocol.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Broker Agent (user-side)        LP Agent (market maker)      │
│  broker_agent.py                lp_agent.py                  │
│       │                               │                      │
│   AXL node :9002               AXL node :9003                │
└───────┼───────────────────────────────┼──────────────────────┘
        │        Gensyn AXL P2P mesh    │
        └──────────── /send /recv ──────┘
                                        │
                              ┌─────────┴──────────┐
                              │   0G Storage        │
                              │  (negotiation       │
                              │   memory / history) │
                              └─────────┬──────────┘
                                        │
                              ┌─────────┴──────────┐
                              │   0G Compute        │
                              │  (AI price quoting) │
                              └────────────────────┘
```

- **Broker** — represents a user wanting to swap tokens. Broadcasts requests to LPs, picks the best quote, and drives the negotiation to a MIST escrow confirmation.
- **LP Agent** — autonomous market maker. Uses 0G Compute (verifiable AI inference) for pricing and 0G Storage for persistent memory of past negotiations.
- **AXL** — Gensyn's P2P mesh node. All negotiation messages flow through the `/send` / `/recv` HTTP API at `localhost:9002` (broker) / `localhost:9003` (LP, local dev).
- **0G Storage** — LP agents persist trading history here; memory is addressed by Merkle root hash and improves future pricing decisions.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | ≥ 3.11 |
| Node.js | ≥ 18 |
| Go | ≥ 1.25 (for building AXL node) |
| openssl | any modern version |

---

## Setup

### 1. Build the AXL node

```bash
git clone https://github.com/gensyn-ai/axl
cd axl && make build
cp node ../opag26/axl/         # or set AXL_BIN env var
```

### 2. Install Python deps

```bash
cd agent/
pip install -r requirements.txt
```

### 3. Install Node.js deps (0G SDK)

```bash
cd agent/
npm install
```

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set ZERO_G_PRIVATE_KEY
```

### 5. Start AXL nodes

```bash
bash axl/start-nodes.sh
```

This generates ED25519 keys if missing, starts both AXL nodes, and prints their peer IDs.

### 6. Register LP peer IDs

After the LP node starts, add its peer ID to `lp-peers.json`:

```json
{
  "peers": ["<64-char-hex-public-key-from-lp-axl-topology>"]
}
```

You can also retrieve a node's peer ID at any time:

```bash
curl http://127.0.0.1:9003/topology | python3 -m json.tool
```

---

## Running

### Start the LP Agent

```bash
cd agent/src
AXL_BASE_URL=http://127.0.0.1:9003 \
  $(cat ../.env | xargs) \
  python lp_agent.py --agent-id lp-1
```

### Run a Broker swap request

```bash
cd agent/src
AXL_BASE_URL=http://127.0.0.1:9002 \
  $(cat ../.env | xargs) \
  python broker_agent.py \
    --token-in ETH \
    --amount-in 10 \
    --token-out USDC \
    --max-slippage 0.005
```

Successful output:

```json
{
  "status": "confirmed",
  "token_in": "ETH",
  "amount_in": 10.0,
  "token_out": "USDC",
  "rate": 3194.56,
  "amount_out": 31945.6,
  "escrow": { ... }
}
```

---

## Negotiation Protocol

| Step | Direction | Message |
|------|-----------|---------|
| 1 | Broker → LP(s) | `SWAP_REQUEST` — token pair, amount, max slippage |
| 2 | LP → Broker | `QUOTE` — rate, amount_out, expiry |
| 3 | Broker → LP | `ACCEPT` or `COUNTER` (with min acceptable rate) |
| 4 | LP → Broker | `CONFIRM` (escrow details) or `REJECT` |

All messages are JSON blobs transported over AXL `/send` / `/recv`.

---

## 0G Integration Details

### Storage (LP memory)

LP agents call `ZeroGStorage.remember_negotiation()` after every trade.  
History is stored on 0G as a JSON blob addressed by Merkle root hash.  
On startup the LP loads this history and uses `get_counterparty_score()` to offer tighter spreads to trusted counterparties.

```
Node.js helper: zero_g/upload.mjs  zero_g/download.mjs
SDK: @0gfoundation/0g-ts-sdk
```

### Compute (AI pricing)

`ZeroGCompute.evaluate_price()` submits a structured prompt to 0G Compute and parses the returned JSON rate.  Falls back to a rule-based spread if the provider is unreachable.

```
Node.js helper: zero_g/compute.mjs
SDK: @0glabs/0g-serving-broker
```

Set `ZERO_G_PROVIDER_ADDRESS` to a live inference provider. List providers:

```bash
node -e "
import('@0glabs/0g-serving-broker').then(async ({createZGComputeNetworkBroker}) => {
  const {ethers} = await import('ethers');
  const w = new ethers.Wallet(process.env.ZERO_G_PRIVATE_KEY, new ethers.JsonRpcProvider(process.env.ZERO_G_RPC_URL));
  const b = await createZGComputeNetworkBroker(w);
  console.log(await b.inference.listService());
})"
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AXL_BASE_URL` | Yes | AXL HTTP API (`http://127.0.0.1:9002`) |
| `ZERO_G_PRIVATE_KEY` | Yes | EVM wallet private key for 0G auth |
| `ZERO_G_RPC_URL` | No | 0G EVM RPC (default: testnet) |
| `ZERO_G_INDEXER_URL` | No | 0G storage indexer (default: testnet) |
| `ZERO_G_PROVIDER_ADDRESS` | No | 0G inference provider address |
| `LP_AGENT_ID` | No | Unique name for the LP agent |
| `LP_PEERS_FILE` | No | Path to JSON file with LP peer IDs |
| `QUOTE_TIMEOUT_SECS` | No | Seconds to collect quotes (default 15) |
| `CONFIRM_TIMEOUT_SECS` | No | Seconds to wait for confirm (default 30) |
| `MIST_ESCROW_ADDRESS` | No | MIST Chamber contract address |
