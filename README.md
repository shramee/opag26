# MIST-OTC

Private OTC escrow built on [MIST.cash](https://mist.cash). Two parties swap arbitrary ERC-20s atomically and privately: payments are unlinkable on-chain, escrow claims can't be sniped, and the funding/claim transactions stay disconnected. Comes with an LLM agent runner so two AI agents can negotiate and execute the full private swap end-to-end.

## Directories

| Path | Purpose |
| --- | --- |
| [`contracts/`](contracts) | Solidity `Chamber` (MIST shielded pool) + `Escrow` contract and Groth16 verifiers. |
| [`zk/`](zk) | gnark circuits — recipient-bound escrow circuit and supporting witness/utils. |
| [`sdk/`](sdk) | TypeScript SDK exposing `MISTActions`, proof generation bindings, and contract ABIs. |
| [`runner/`](runner) | Vercel-AI-SDK agent runner — drop in a persona + `.env`, get a private-swap agent. |
| [`frontend/`](frontend) | Vite/React + wagmi UI for human-driven requests, deposits, and withdrawals. |
| [`agent/axl/`](agent/axl) | Reference agent persona assets. |

---

## `MISTActions` — the one class you actually call

`sdk/src/index.ts`. Stateful gateway over the whole MIST + escrow protocol. Hand it a master key and a `ChainAdapter`; it derives every per-payment hiding key, tracks request status, generates Groth16 proofs, and submits the right calldata.

Key derivation chain (deterministic, fully recoverable from the master key):

```
masterKey
  ├── masterHidingKey  = h2('masterHiding', masterKey)   ← seeds per-tx claiming keys
  └── accountAuthKey   = h2('ownerSecret',  masterKey)   ← proves ownership in ZK
      └── accountAddress = h2('I own this transaction', accountAuthKey)
```

Per request: `claimingKey = h2(txIndex, masterHidingKey)`, `txSecret = h2(claimingKey, ownerAddress)`. Different requests are unlinkable on-chain.

Surface area:

- `requestFunds(amount, token)` — mint a fresh unlinkable payment request.
- `deposit(tx)` — payer-side ERC-20 approve + `Chamber.deposit`.
- `checkStatus` / `scanPayments` — poll the merkle tree for PAID requests.
- `withdrawEvm` / `withdrawZkp` — Groth16 proof + `Chamber.handleZkp` for fully-private withdrawal.
- `escrowFund(creatorReq, recipientReq, blinding)` — creator side of the swap.
- `escrowClaim(creatorReq, recipientReq, blinding)` — recipient side: waits for the escrow, deposits the counter-payment, generates **both** the escrow proof and the MIST spend proof, and calls `Escrow.consumeEscrow` in one shot.
- `save` / `load` / `exportState` — pluggable `StorageAdapter` (localStorage, Map, DB).

---

## Escrow ZK circuit — `zk/escrow/circuit.go`

The circuit binds three things into a single nullifier so claim sniping is impossible:

```
escrowBlinding   = h3(blinding, senderTx, recipientSecret)
nullifierSecret  = h2(escrowBlinding + 1, escrowContract)
escrowNullifier  = h3(nullifierSecret, token, amount)     ← public
recipientTx      = h3(recipientSecret, token, amount)     ← public
```

It also Merkle-proves that `senderTx` lives in Chamber's tx tree (public `MerkleRoot`). Result: the escrow can only be released once a payment to a *specific* recipient secret has been made, and only by someone holding that recipient secret. The two MIST payments and the escrow claim can each happen in independent on-chain transactions and can't be linked by an outside observer.

---

## Escrow contract — `contracts/src/Escrow.sol`

Permissionless wrapper sitting on top of `Chamber`. Single entrypoint:

```solidity
function consumeEscrow(
    uint256[8]  proof,    uint256[3]  input,    // escrow circuit
    uint256[8]  mistProof, uint256[10] mistInput // MIST spend circuit
) external;
```

It (1) verifies the escrow proof, (2) checks the sender's expected tx merkle root is one Chamber knows, (3) forwards the MIST spend proof to `Chamber.handleZkp`, and (4) glues the two proofs together by asserting `escrowNullifier == mistZkp.nullifier` and `recipientTx == mistZkp.tx1`. No state, no funds held — Chamber does the actual transfer.

---

## Chamber contract — `contracts/src/Chamber.sol`

The MIST shielded pool, ported to Solidity. Holds an append-only `txArray`, a merkle root history, a nullifier set, and a Groth16 verifier. `deposit(secret, amount, token)` shields funds; `handleZkp(proof, inputs)` privately spends them with two indistinguishable output txs appended to the tree. Escrow is just one consumer — anything privacy-preserving can sit on top of it the same way.

---

## Running two agents that do private swaps

Spin up Bob and Jill, give them wallets and a model key, and they negotiate a price, swap requests + a blinding value, and run the full escrow protocol end-to-end. Each agent is just a directory:

```
runner/agents/<name>/
  README.md   # persona — used verbatim as the system prompt
  task.md     # optional; if present the agent kicks things off
  .env        # PRIVATE_KEY, RPC_URL, CHAMBER_ADDRESS, ESCROW_ADDRESS, TOKENS, PEER_URL, INFERENCE_API_KEY
```

```sh
pnpm install
pnpm --filter @opag26/sdk build

# terminal 1
pnpm --filter @opag26/runner jill

# terminal 2 — Bob has task.md, so he opens negotiation
pnpm --filter @opag26/runner bob
```

The runner wires the LLM up to `MISTActions` via tools (`requestPayment`, `payRequest`, `escrowFund`, `escrowClaim`, `checkRequestStatus`, `showBalance`, `sendPeer`, `finalize`). That's the whole integration — adding a new agent is one folder.

See [`runner/README.md`](runner/README.md) for the full env spec and tool table.
