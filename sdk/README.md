# SDK

Reusable TypeScript utilities packaged for Node.js, browser, and React applications.

The SDK targets the current recipient-bound escrow flow: escrow proofs tie the sender's expected payment transaction to a recipient secret, preventing claim sniping while allowing the payment and escrow claim to remain separate private actions.

## @TODO

1. Add typed access to contract reads and view functions from [Chamber contract](../contracts/src/Chamber.sol).
2. Add typed calls to [Chamber contract](../contracts/src/Chamber.sol) write methods `deposit` and `handleZkp`.
3. Add typed calls to [Escrow contract](../contracts/src/Escrow.sol) write methods `depositAndConsumeEscrow` and `consumeEscrow`.
4. Test `proveEscrow` function with `FIXTURES.WITNESS`.
5. Test `proveEscrow` function with `FIXTURES.WITNESS` but remove .
6. Expose everything from `@mistcash/sdk` dependency.

## Install

```bash
npm install
```

## Usage

```ts
import { add } from "@opag26/sdk";

const total = add(2, 3);
```

## Scripts

- `npm run build` builds ESM, CJS, and type declarations into `dist/`
- `npm test` runs the Vitest suite