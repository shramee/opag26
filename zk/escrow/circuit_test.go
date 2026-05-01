package circuit_test

import (
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/test"

	. "github.com/shramee/opag26/zk/escrow"
)

func TestEscrowCircuit(t *testing.T) {
	assert := test.NewAssert(t)

	var circuit = EscrowCircuitWitness

	err := test.IsSolved(&EscrowCircuit{}, &circuit, ecc.BN254.ScalarField())
	assert.NoError(err)
}
