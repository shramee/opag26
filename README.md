# Agents with MIST

What if two AI agents could discover each other, haggle over a price, and atomically swap real ERC-20s — without ever leaking who they are, what they're trading, or that the two payments are even related? That's this project.

We take [MIST.cash](https://mist.cash) — a shielded pool where every payment is a private note unlinkable to its sender or recipient — and bolt on (a) a recipient-bound escrow that makes cross-asset OTC swaps atomic and snipe-proof, (b) a tight TypeScript SDK that hides every key, hash, and Groth16 proof behind a single class, and (c) an LLM agent runner so a model with a wallet and a peer URL can negotiate and execute the whole flow itself. The result is a small but complete stack for autonomous, private, on-chain commerce.

## Directories

| Path | What's there |
| --- | --- |
| [`contracts/`](contracts) | Solidity `Chamber` (the MIST shielded pool) plus the `Escrow` wrapper and Groth16 verifiers. |
| [`zk/`](zk) | The gnark circuits — including the recipient-bound escrow circuit at the heart of the swap. |
| [`sdk/`](sdk) | TypeScript SDK exposing `MISTActions`, proof generation, and typed contract bindings. |
| [`runner/`](runner) | Vercel-AI-SDK agent runner — drop in a persona folder + `.env`, get an autonomous trading agent. |
| [`frontend/`](frontend) | Vite/React + wagmi UI for human-driven requests, deposits, and withdrawals. |
| [`agent/axl/`](agent/axl) | Reference agent persona assets. |

---

## `MISTActions` — the one class you actually call

The whole protocol — key derivation, request creation, status polling, Groth16 proving, withdrawals, and the full escrow choreography — lives behind `MISTActions` in [`sdk/src/index.ts`](sdk/src/index.ts). You hand it a master key and a `ChainAdapter`; it does the rest.

The nice part is that everything is deterministic. From a single master key, `MISTActions` derives a separate hiding key for each payment, so two requests from the same wallet can't be linked on-chain, and yet the user can recover their full state from scratch with just that one secret:

```
masterKey
  ├── masterHidingKey  = h2('masterHiding', masterKey)   ← seeds per-tx claiming keys
  └── accountAuthKey   = h2('ownerSecret',  masterKey)   ← proves ownership in ZK
      └── accountAddress = h2('I own this transaction', accountAuthKey)
```

For each payment request, `claimingKey = h2(txIndex, masterHidingKey)` and the public `txSecret = h2(claimingKey, ownerAddress)` go into the URL/QR. Different requests share no observable correlation.

The class is intentionally narrow:

- `requestFunds(amount, token)` — mint a fresh, unlinkable payment request.
- `deposit(tx)` — payer side: ERC-20 approve + `Chamber.deposit` in two calls.
- `checkStatus` / `scanPayments` — walks the on-chain tx tree to mark requests PAID.
- `withdrawEvm` / `withdrawZkp` — generates a Groth16 proof and calls `Chamber.handleZkp` for a fully private withdrawal.
- `escrowFund(creatorReq, recipientReq, blinding)` — creator side of the swap; deposits funds with the escrow contract as owner under a key bound to *both* the counter-payment and the recipient's secret.
- `escrowClaim(creatorReq, recipientReq, blinding)` — recipient side: waits for the escrow note, deposits the counter-payment, generates **both** the escrow proof and the MIST spend proof, and submits them to `Escrow.consumeEscrow` in one transaction.
- `save` / `load` / `exportState` — pluggable `StorageAdapter` (localStorage, Map, DB — your call).

A whole agent integration is just constructing one of these and calling four methods.

---

## The escrow ZK circuit — `zk/escrow/circuit.go`

This is the contribution that makes private OTC actually safe. A naïve escrow on a shielded pool has a sniping problem: as soon as the counter-payment hits the chain, anyone can race to claim the locked funds. Our circuit fixes that by binding three things — the escrow blinding, the *expected* counter-payment transaction, and a *recipient secret only the intended counterparty knows* — into a single nullifier:

```
escrowBlinding   = h3(blinding, senderTx, recipientSecret)
nullifierSecret  = h2(escrowBlinding + 1, escrowContract)
escrowNullifier  = h3(nullifierSecret, token, amount)     ← public
recipientTx      = h3(recipientSecret, token, amount)     ← public
```

The circuit also Merkle-proves that `senderTx` actually exists in Chamber's tx tree (public `MerkleRoot`), so the escrow only releases once the counter-payment has settled. Two independent guarantees come out of this design:

1. **No sniping.** Knowing the on-chain payment alone is not enough to compute the nullifier — you also need `recipientSecret`, which never touches the chain.
2. **Unlinkability.** The funding deposit, the counter-payment, and the escrow claim are three independent on-chain transactions to three different secrets. An observer can't tell they belong to the same swap.

---

## Escrow contract — `contracts/src/Escrow.sol`

A permissionless wrapper that holds no state and no funds. Single entrypoint:

```solidity
function consumeEscrow(
    uint256[8]  proof,    uint256[3]  input,     // escrow circuit
    uint256[8]  mistProof, uint256[10] mistInput  // MIST spend circuit
) external;
```

It (1) verifies the escrow proof, (2) checks the merkle root the proof references is one Chamber actually knows about, (3) forwards the MIST spend proof to `Chamber.handleZkp`, then (4) **glues the two proofs together** by asserting `escrowNullifier == mistZkp.nullifier` and `recipientTx == mistZkp.tx1`. Chamber does the transfer; the escrow contract just enforces the binding.

---

## Chamber contract — `contracts/src/Chamber.sol`

The MIST shielded pool itself, ported to Solidity. An append-only `txArray`, a merkle root history, a nullifier set, and a Groth16 verifier. `deposit(secret, amount, token)` shields funds; `handleZkp(proof, inputs)` privately spends a note and appends two indistinguishable output txs. Escrow is one consumer — anything privacy-preserving can sit on top of it the same way.

---

## Two AI agents trading privately, in two terminals

The runner makes this trivial. An "agent" is a folder: a `README.md` (used verbatim as the system prompt), an optional `task.md` (if present, the agent opens the conversation), and a `.env` with its key, RPC, contract addresses, peer URL, and inference API key. The runner instantiates `MISTActions` for the agent, exposes a small set of tools to the LLM (`requestPayment`, `payRequest`, `escrowFund`, `escrowClaim`, `checkRequestStatus`, `showBalance`, `sendPeer`, `finalize`), and lets the model drive.

Setup is three commands:

```sh
pnpm i
pnpm build ./sdk
pnpm i ./runner
```

> ⚠️ **Fund the agent wallets first.** Each agent's `PRIVATE_KEY` wallet must hold (a) some native gas, and (b) enough of the ERC-20 it's offering to actually settle the swap. If Bob is selling dumUSD for Jill's dumETH, Bob's wallet needs dumUSD and Jill's needs dumETH. The escrow protocol can't conjure tokens — it just moves them privately.

Then run each agent in its own terminal:

```sh
# terminal 1 — Jill waits to be contacted
pnpm jill

# terminal 2 — Bob has task.md, so he opens the negotiation
pnpm bob
```

They'll find each other over the configured `PEER_URL`, agree a price, swap MIST requests + a blinding value, and run the escrow protocol exactly the way `contracts/hardhat-test/Escrow.test.ts` does — only this time it's two LLMs improvising the conversation around it. Adding a new agent is one folder.

See [`runner/README.md`](runner/README.md) for the full env spec and tool table.
