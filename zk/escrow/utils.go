package circuit

import (
	"math/big"
	"strconv"

	frbn254 "github.com/consensys/gnark-crypto/ecc/bn254/fr"
	poseidonbn254 "github.com/consensys/gnark-crypto/ecc/bn254/fr/poseidon2"
	"github.com/consensys/gnark/constraint/solver"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/permutation/poseidon2"
	"github.com/mistcash/gnark-circomlib/circuits"
)

type Variable = frontend.Variable

// Asset represents an asset with amount and address
type Asset struct {
	Amount Variable
	Addr   Variable
}

func AsAsset(addr, amount Variable) Asset {
	switch v := amount.(type) {
	case int:
		return Asset{
			Amount: strconv.Itoa(v),
			Addr:   addr,
		}
	default:
		return Asset{
			Amount: amount,
			Addr:   addr,
		}
	}
}

// HashCircom computes Poseidon hash of two elements and forces result to be even
func HashCircom(api frontend.API, a, b Variable) Variable {
	return circuits.Poseidon(api, []Variable{a, b})
}

// Gnark's efficient Poseidon2 hasher
func Hash2(api frontend.API, a, b Variable) Variable {
	p, err := poseidon2.NewPoseidon2FromParameters(api, 2, 6, 50)
	if err != nil {
		panic(err)
	}
	return p.Compress(a, b)
}

// Gnark's efficient Poseidon2 hasher
func Hash3(api frontend.API, a, b, c Variable) Variable {
	p, err := poseidon2.NewPoseidon2FromParameters(api, 3, 6, 50)
	if err != nil {
		panic(err)
	}
	vars := [3]frontend.Variable{a, b, c}
	if err := p.Permutation(vars[:]); err != nil {
		panic(err) // this would never happen
	}
	return api.Add(vars[0], a)
}

// HashWithAsset computes hash of secrets with asset
func HashWithAsset(api frontend.API, secrets Variable, asset Asset) Variable {
	return Hash3(api, secrets, asset.Addr, asset.Amount)
}

// MerkleHash computes merkle tree hash with ordering and zero handling
func MerkleHash(api frontend.API, a, b Variable) Variable {
	aGreater, _ := api.NewHint(hintIsGreater, 1, a, b)
	api.AssertIsBoolean(aGreater[0])
	smaller := api.Select(aGreater[0], b, a)
	bigger := api.Select(aGreater[0], a, b)
	zeroInput := api.IsZero(smaller)

	// Ordered hash smaller first then bigger
	hash := Hash2(api, smaller, bigger)

	// No hash if smaller input is zero
	res := api.Select(zeroInput, bigger, hash)

	// force odd output, force even then add 1
	return res
}

// CheckMerkleRoot verifies the merkle proof
func CheckMerkleRoot(api frontend.API, merkleTemp Variable, proof [20]Variable, root Variable) {
	for i := 0; i < 20; i++ {
		merkleTemp = MerkleHash(api, merkleTemp, proof[i])
	}
	api.AssertIsEqual(root, merkleTemp)
}

func hintIsGreater(field *big.Int, inputs []*big.Int, outputs []*big.Int) error {
	// placeholder for hint
	if inputs[0].Cmp(inputs[1]) == 1 {
		outputs[0].SetInt64(1)
	} else {
		outputs[0].SetInt64(0)
	}
	return nil
}

func InitHints() {
	solver.RegisterHint(hintIsGreater)
}

// NativeHash2 computes Poseidon2 hash of two field elements directly (outside circuit)
func NativeHash2(a, b *frbn254.Element) *frbn254.Element {
	out := []frbn254.Element{*a, *b}
	h := poseidonbn254.NewPermutation(2, 6, 50)
	if err := h.Permutation(out); err != nil {
		panic(err)
	}
	result := new(frbn254.Element)
	result.Add(&out[1], b)
	return result
}

// NativeHash3 computes Poseidon2 hash of three field elements directly (outside circuit)
func NativeHash3(a, b, c *frbn254.Element) *frbn254.Element {
	out := []frbn254.Element{*a, *b, *c}
	h := poseidonbn254.NewPermutation(3, 6, 50)
	if err := h.Permutation(out); err != nil {
		panic(err)
	}
	result := new(frbn254.Element)
	result.Add(&out[0], a)
	return result
}

func NativeFrInt(i uint64) *frbn254.Element {
	var e frbn254.Element
	e.SetUint64(i)
	return &e
}

func NativeFr(v string) *frbn254.Element {
	var e frbn254.Element
	e.SetString(v)
	return &e
}
