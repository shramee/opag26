# Contracts | MIST OTC

This version of the escrow flow binds the escrow to both the sender's expected transaction and a recipient secret. That prevents third-party claim sniping after the recipient makes the payment and lets payment and escrow claim happen in separate private transactions.

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

The blinding vector can contain further details. An escrow note binds the sender's expected transaction and the recipient's secret into the escrow nullifier.

```
escrow_blinding = Hash( blinding, expected_tx, recipient_secret )
tx_secret = Hash( escrow_blinding + 1, ESCROW_CONTRACT )
escrow_note = Hash( tx_secret, token, amount )
recipient_note = Hash( recipient_secret, token, amount )
```

This transaction is created just like any other transaction and does not leak any distinguishable information.

### Consuming an escrow

Consuming an escrow uses two proofs,
1. Escrow tx existance proof, merkle proof for existance of the sender payment transaction in MIST.cash transactions.
   - This proves that the sender-side payment transaction now exists in MIST.cash. The circuit binds that transaction together with the recipient secret and checks that the derived escrow nullifier matches the escrowed note.
2. MIST escrow_note spending proof.
   - The recipient generates the proof to withdraw the transaction to their own account. The same circuit also checks that a recipient note for the same asset exists under `recipient_secret`, so payment and escrow claim can stay disconnected on-chain. The contract forwards this proof directly to MIST.cash spending the escrow transaction.
