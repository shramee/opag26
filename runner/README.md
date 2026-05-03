# @opag26/runner

Vercel AI SDK based agent runner for MIST private OTC swaps.

Each agent is a directory with three files:

| File        | Required | Purpose                                                                          |
| ----------- | -------- | -------------------------------------------------------------------------------- |
| `README.md` | yes      | The agent's persona and behavior — used verbatim as the LLM system prompt.       |
| `task.md`   | no       | Optional initial user message; if present, the agent kicks off the conversation. |
| `.env`      | yes      | Wallet, RPC, chain, contract/token addresses, peer URL, inference API key.       |

The runner reads those files, instantiates a `MISTActions` with the private key as master key (and a viem-based ChainAdapter that signs with the same key), starts an HTTP server, and lets the LLM drive the swap via tools.

If 0g kv settings are present, the runner also attaches a `StorageAdapter` to `MISTActions` and persists its state through 0g kv. Stored values are AES-256 encrypted before they are written, and storage failures are logged without interrupting the agent.

## Required `.env` variables

```
PRIVATE_KEY=0x...
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
CHAMBER_ADDRESS=0x...
ESCROW_ADDRESS=0x...
TOKENS=dumETH:0x...,dumUSD:0x...
PEER_URL=http://127.0.0.1:3101
PORT=3100
INFERENCE_API_KEY=sk-...
MODEL=zai-org/GLM-5-FP8    # optional, default zai-org/GLM-5-FP8
MAX_STEPS=12               # optional, max LLM tool steps per turn
VERBOSE=true               # optional, log thoughts and tool calls

# --- Optional 0g kv persistence for MIST state ---
ZERO_G_PRIVATE_KEY=0x...   # optional, defaults to PRIVATE_KEY
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZERO_G_KV_RPC_URL=http://127.0.0.1:6789
ZERO_G_FLOW_ADDRESS=0x...
ZERO_G_STREAM_ID=0x...     # optional, defaults to a derived per-agent stream id
```

If `ZERO_G_FLOW_ADDRESS` or `ZERO_G_KV_RPC_URL` is missing, the runner simply skips persistent storage and continues normally.

## Tools exposed to the LLM

| Tool                 | Purpose                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `generateBlinding`   | Generate a fresh JS BLINDING hex value for escrow coordination.               |
| `requestPayment`     | Create a private MIST request (`MISTActions.requestFunds`).                   |
| `payRequest`         | Direct deposit to a known request (`MISTActions.deposit`).                    |
| `escrowFund`         | Creator side of the escrow protocol (`MISTActions.escrowFund`).               |
| `escrowClaim`        | Recipient side of the escrow protocol (`MISTActions.escrowClaim`).            |
| `checkRequestStatus` | PENDING / PAID / WITHDRAWN status for a request.                              |
| `showBalance`        | Sum of paid/withdrawn/pending MIST request amounts plus on-chain ERC-20 bal.  |
| `sendPeer`           | POST a message (and optionally shared requests + blinding) to the peer agent. |
| `finalize`           | Mark conversation done — agent stops processing further turns.                |

## Running

```bash
pnpm install
pnpm --filter @opag26/sdk build      # one-time

# terminal 1
cp runner/agents/jill/.env.example runner/agents/jill/.env
$EDITOR runner/agents/jill/.env
pnpm --filter @opag26/runner jill

# terminal 2
cp runner/agents/bob/.env.example runner/agents/bob/.env
$EDITOR runner/agents/bob/.env
pnpm --filter @opag26/runner bob
```

Bob has a `task.md` and so initiates. Jill has no `task.md` and waits. They negotiate a price, exchange MIST requests + a BLINDING value, and then run the full escrow protocol (Jill `escrowFund`, Bob `escrowClaim`) — same flow as the `escrow flow` test in `contracts/hardhat-test/Escrow.test.ts`.

## Prerequisites

- Built `@opag26/sdk` (`pnpm --filter @opag26/sdk build`).
- A reachable RPC with `Chamber`, `Escrow`, `dumETH`, `dumUSD` deployed (see `contracts/script/DeployContracts.s.sol`).
- The wallets used by Bob and Jill must be funded with the tokens they're spending and a small amount of native gas.
