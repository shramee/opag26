# MIST plugin (KeeperHub)

KeeperHub integration plugin that exposes [`@opag26/sdk`](../../sdk)
`MISTActions` as workflow nodes, so KeeperHub agents can run the same
private-payment / OTC-escrow flow as the Vercel AI SDK runner in
[`runner/src/tools.ts`](../../runner/src/tools.ts).

The plugin layout mirrors `plugins/web3/` in the KeeperHub repo and is
intended to drop into `plugins/mist/` there.

```
plugins/mist/
├── icon.tsx                       # MIST icon (svg)
├── index.ts                       # Plugin definition: actions, configFields, outputFields
├── test.ts                        # No-op connection test (Para wallet handles auth)
├── steps/
│   ├── _mist-actions.ts           # Shared MISTActions builder + (de)serialization helpers
│   ├── generate-blinding.ts
│   ├── request-payment.ts
│   ├── pay-request.ts
│   ├── check-request-status.ts
│   ├── show-balance.ts
│   ├── escrow-fund.ts
│   └── escrow-claim.ts
└── README.md
```

## Action ↔ tool mapping

Each plugin slug corresponds 1:1 to a runner tool in
[`runner/src/tools.ts`](../../runner/src/tools.ts):

| Plugin slug             | Runner tool          | MISTActions call                    |
| ----------------------- | -------------------- | ----------------------------------- |
| `generate-blinding`     | `generateBlinding`   | (pure compute — no SDK call)        |
| `request-payment`       | `requestPayment`     | `mist.requestFunds(amount, token)`  |
| `pay-request`           | `payRequest`         | `mist.deposit(tx)`                  |
| `check-request-status`  | `checkRequestStatus` | `mist.checkStatus(tx)`              |
| `show-balance`          | `showBalance`        | `mist.scanPayments()` + ERC-20 read |
| `escrow-fund`           | `escrowFund`         | `mist.escrowFund(c, r, blinding)`   |
| `escrow-claim`          | `escrowClaim`        | `mist.escrowClaim(c, r, blinding)`  |

`sendPeer` and `finalize` from the runner are intentionally excluded —
peer messaging and conversation lifecycle are handled by the workflow
graph itself, not by individual nodes.

## Wiring

Each step file calls `buildMistActions(ctx)` from `_mist-actions.ts`,
which:

1. Resolves the chain ID + RPC provider via the standard KeeperHub
   helpers (`getChainIdFromNetwork`, `getRpcProvider`).
2. Loads the user's Para wallet (private key as MIST master key + a
   signer for write transactions).
3. Constructs a viem-style `ChainAdapter` and passes it to
   `MISTActions.init` — the same construction as
   [`runner/src/agent.ts`](../../runner/src/agent.ts) and
   [`runner/src/chainAdapter.ts`](../../runner/src/chainAdapter.ts).

MIST requests flow between nodes as serialized objects:

```ts
// SerializedMistRequest in steps/_mist-actions.ts
{
  amount: string,
  token: string,
  secrets: string,        // public — safe to share with peer
  claimingKey?: string,   // PRIVATE — keep on creator side only
  owner?: string,
  index?: number,
  status?: 'PENDING' | 'PAID' | 'WITHDRAWN'
}
```

Downstream nodes pipe the request through a template input, e.g.
`{{RequestPaymentNode.request}}` for `pay-request` /
`check-request-status`, or `{{MyRequestNode.request}}` +
`{{PeerRequestNode.request}}` for the escrow pair.

## Notes

* The plugin imports `@opag26/sdk` directly — KeeperHub's `package.json`
  must depend on `@opag26/sdk` (or a published mirror).
* `chamberAddress` and `escrowAddress` are required per-action because
  MIST contracts are app-specific deployments rather than canonical per
  chain. A future iteration could replace the template inputs with a
  registry lookup keyed by network.
* `getOrganizationWalletPrivateKey` is referenced from
  `@/lib/para/wallet-helpers`. KeeperHub already exposes
  `getOrganizationWalletAddress` and `initializeWalletSigner`; this
  plugin needs the private-key variant since `MISTActions` derives all
  hiding/auth keys from a 32-byte master secret rather than from a
  remote signer.
