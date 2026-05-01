package circuit

import (
	"github.com/consensys/gnark/frontend"
)

// Sender locks some funds in private tx with escrow as owner,
// with expect TX that should exist for him.
// escrowTx = h3(h2(h2(blinding, expected_tx), escrow_contract), token, amount)
//
// Then shares all the details with recipient,
// blinding, expected_tx, escrow_contract, token, amount
// and also token, amount and secret(blinding + owner) for expected_tx
//
// At this point recipient can make a passing ZKP to claim, but escrow wouldn't
// allow unless another ZKP is attached.
//
// Recipient creates the transaction sender expects expected_tx,
// and proves to the escrow with Merkle proof that it exists.
//
// Then escrow let's the recipient spend the sender's transaction
//

type EscrowCircuit struct {
	// escrow blinding vector
	Blinding Variable

	// This will be the escrow contract
	Owner Variable `gnark:",public"`
	// assets in escrow
	TxAsset Asset

	// compared against spent transaction
	// binds expected tx to escrowed transaction
	EscrowNullifier Variable `gnark:",public"` // This should match the nullifier of tx to spend

	// expected transaction should be in the merkle root
	ExpectedTx  Variable
	MerkleProof [20]Variable
	MerkleRoot  Variable `gnark:",public"`
}

func (circuit *EscrowCircuit) Define(api frontend.API) error {

	// Verify expected transacion exists in merkle root
	CheckMerkleRoot(api, circuit.ExpectedTx, circuit.MerkleProof, circuit.MerkleRoot)

	// check escrow transaction nullifier
	txBlinding := Hash2(api, circuit.Blinding, circuit.ExpectedTx)

	nullifierSecret := Hash2(api, api.Add(txBlinding, 1), circuit.Owner)
	nullifier := HashWithAsset(api, nullifierSecret, circuit.TxAsset)

	// this should match the spent tx from escrow
	api.AssertIsEqual(circuit.EscrowNullifier, nullifier)

	return nil
}
