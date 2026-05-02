// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Poseidon2 as Hasher } from "./Poseidon.sol";
import { Chamber } from "./Chamber.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EscrowVerifier } from "./EscrowVerifier.sol";

struct Transaction {
	uint256 key; // can be transaction secret or blinding vector (plus separate recipient)
	address token;
	uint256 amount;
}

/// @title Escrow
/// @notice Permissionless escrow built on top of Chamber.
///         A sender locks funds in Chamber with this contract as owner,
///         encoding a condition: an expected transaction must exist in Chamber
///         before the funds can be released.
///
/// Escrow note construction (mirrors the ZK circuit):
///   escrowBlinding  = hash2(blinding, senderTx, recipientTx)
///   depositKey      = hash2(escrowBlinding, escrowContractAddr)
///   escrowNote      = hash3(depositKey, token, amount)   <- lives in Chamber's tx tree
///
/// Nullifier (used internally by Chamber on spend):
///   nullifierSecret = hash2(escrowBlinding + 1, escrowContractAddr)
///   nullifier       = hash3(nullifierSecret, token, amount)
contract Escrow {
	Chamber public immutable chamber;
	EscrowVerifier public immutable verifier;

	event EscrowConsumed(uint256 indexed escrowNullifier);

	constructor(address chamber_, address verifier_) {
		chamber = Chamber(chamber_);
		verifier = EscrowVerifier(verifier_);
	}

	/// @notice Releases an escrow without ZK proofs. The caller reveals `blinding`
	///         and `senderTx` on-chain (privacy is sacrificed).
	///         Two merkle proofs are required:
	///         1. `senderTxProof` — proves `senderTx` exists in Chamber.
	///         2. `escrowNoteProof` — proves the escrow note exists so Chamber can spend it.
	/// @param proof Groth16 proof that expected transaction exists.
	/// @param input Public inputs from expected transaction exists proof circuit.
	/// @param mistProof Groth16 proof for the Chamber transaction that spends the escrow note.
	/// @param mistInput Public inputs for the Chamber transaction that spends the escrow note.
	function consumeEscrow(
		uint256[8] calldata proof,
		uint256[3] calldata input,
		uint256[8] calldata mistProof,
		uint256[10] calldata mistInput
	) external {
		// 1. verify proof and input
		verifier.verifyProof(proof, input);

		uint256 escrowNullifier = input[0];
		uint256 recipientTx = input[1];
		uint256 merkleRoot = input[2];

		// 2. verify senderTx is in Chamber
		require(chamber.merkleRoots(merkleRoot), "expected tx not in chamber");

		Chamber.PublicParams memory mistZkp = chamber.handleZkp(
			mistProof,
			mistInput
		);

		// 3. glue connecting tx proof to escrow proof
		require(escrowNullifier == mistZkp.nullifier, "escrow nullifier mismatch");

		// 4. confirm tx for recipient, same assets but recipients secrets
		require(recipientTx == mistZkp.tx1, "escrow nullifier mismatch");

		emit EscrowConsumed(escrowNullifier);
	}
}
