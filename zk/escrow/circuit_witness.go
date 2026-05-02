package circuit

import (
	frbn254 "github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/frontend"
)

var AllTransactionHashes = []string{
	"0x1b4adef71dd989e8fec13f06e6c9d585f6de0c7dd929e6855c1a696459d82f1b",
	"0x14b29b475563a280d0a16132a6c7199d21a18351b86fa900211c471e59e3f3ca",
	"0x1af7cdc80b745c42f8c5877b9147b096959192646aac921b4ab22b45d7e84631",
	"0x2193b8ccdc56d833d00bacd86c31421865b7326715f2e93a0097d617fcccee65",
	"0x1593cf6a98c4d827243453016515d69acaac65169720b30a36fb9149c22aecf",
	"0x22fe1811b8efa0e4832c1e5f1510e3314dd9a699c64a40328a17ccc23e8f4cd1",
	"0x2cf31da613176ebbb3cf535bf414f28176bd29f1ea264db339391b66d555989c",
	"0x1291646ac1ba37e246d84fde6ff41f784fc3d90da73091e0818a6e6a84bc1474",
	"0x4a4f9b46ef4564f6cd3e1533e593f9b9e99dad66fccdd70c5397136a93bba51",
	"0x2495c6969e370949f735f004a6261a6b95b15f6c795b7b1c37d848757af56199",
	"0x2248fc427a22a9f7247f2d31a2a4c52726a29015377de3a274241b932a61bfba",
	"0x1155c89283c0a4c07a3201cd3ce3d49547bb011ae906dac15da8d0be6262dfd",
	"0x26173c3c12e44dd954fb027ab2d09c3c7fba00e9e180b437960c5b7965e4150b",
	"0x1e1fa675df171699b4bac33ec6ee59fdaa596ccc77003f779d6c9b9df5ad6af7",
	"0x2a2c21df812f0312d9a4014f4702194b19bdbcde499275ebac9a43b615d61a46",
	"0x26ffb0ff811b0fab4d19fd8b600665e95f59fc03c9ae0158b3936b2bf1c4db09",
	"0x13c4a99c0082800866b2180df94ed9c3664210ac3717c51bbb3184a3ec64da8e",
}

// The tx escrow expects
var senders_tx = "0x1291646ac1ba37e246d84fde6ff41f784fc3d90da73091e0818a6e6a84bc1474"
var proof = [20]frontend.Variable{
	"0x2cf31da613176ebbb3cf535bf414f28176bd29f1ea264db339391b66d555989c",
	"0x2f2c4d50de48b60a8188793052bbc92f2a381d066ff0d0fe1aee993f30fdb75c",
	"0x25ace6f1331e9d018407e5320eed5834f817618e7801ec5e59632e7eed9f2e40",
	"0x2495d8b88166a1e5131b8273f2ac1e2d21de892372c5e7d55bd8bdb88b420f5",
	"0x13c4a99c0082800866b2180df94ed9c3664210ac3717c51bbb3184a3ec64da8e",
	"0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
}
var root = "0x1935947da594b4bc039293afa3a32bd696b5896bca7a427fc2162a7d50ae860b"

var recipientSecret = "0xdeadbeef"

var escrowTxBlinding = NativeHash3(NativeFrInt(1), NativeFr(senders_tx), NativeFr(recipientSecret))
var escrowNullifierSecret = new(frbn254.Element)
var _ = escrowNullifierSecret.Add(escrowTxBlinding, NativeFrInt(1))

var escrowTxAsset = AsAsset(0xf00, 4)

var EscrowCircuitWitness = EscrowCircuit{
	// circuit doesn't check is escrow tx exists
	// so just use dummy values
	Blinding: "1",
	Owner:    "0xb0b",
	TxAsset:  escrowTxAsset,

	RecipientSecret: "0xdeadbeef",
	RecipientTx: NativeHash3(
		NativeFr(recipientSecret),
		NativeFrInt(0xf00),
		NativeFrInt(4),
	),
	EscrowNullifier: NativeHash3(
		NativeHash2(escrowNullifierSecret, NativeFrInt(0xb0b)),
		NativeFrInt(0xf00),
		NativeFrInt(4),
	),
	// membership proof of expected tx
	SenderTx:    senders_tx,
	MerkleProof: proof,
	MerkleRoot:  root,
}
