package circuit

// Sender locks some funds in private tx with escrow as owner,
// with expect TX that should exist for him.
// escrowTx = h3(h2(h2(expected_tx, blinding), escrow_contract), token, amount)
//
// Then shares all the details with recipient,
// expected_tx, blinding, escrow_contract, token, amount
// and also expected_tx token, amount and secret
//
// At this point recipient can make a passing ZKP to claim, but escrow wouldn't
// allow unless another ZKP is attached.
//
// Recipient creates the transaction sender expects expected_tx,
// and proves to the escrow with Merkle proof that it exists.
//
// Then escrow let's the recipient spend the sender's transaction

