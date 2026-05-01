# Contracts | MIST OTC

## Setup

### Deploy

```sh
./deploy.sh --broadcast
```

## Escrow contract

Escrow contract manages permissionless and private escrow.

### An escrow

An escrow is a private payment in MIST.cash that encodes unlocking transaction condition.

For the discussion below we will assume John is trying to put `100Eth` in escrow for Jane who can withdraw the amount if she locks `1,000,000 USDC`

### Creating an escrow

Private notes in MIST.cash contain recipient, token and amount along with a blinding vector.

```
tx_secret = Hash( blinding, recipient )
note = Hash( tx_secret, token, amount )
```

The blinding vector can contain further details, an escrow note looks lik this

```
escrow_blinding = Hash( blinding, expected_tx )
tx_secret = Hash( ESCROW_CONTRACT, escrow_blinding )
escrow_note = Hash( tx_secret, token, amount )
```

This transaction is created just like any other transaction and does not leak any distinguishable information.

### Consuming an escrow

Consuming an escrow uses two proofs,
1. Escrow tx existance proof, merkle proof for existance of `expected_tx` in MIST.cash transacitons.
   - This proves that required transaction now exists in MIST.cash, we don't check if it is already spent for privacy.
2. MIST escrow_note spending proof.
   - The recipient generates the proof to withdraw the transaction to their own account. Contract forwards this proof directly to MIST.cash spending the escrow transaction.
