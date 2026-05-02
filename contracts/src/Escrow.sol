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
///   escrowBlinding  = hash2(blinding, expectedTx)
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

	/// @notice Deposits funds and withdraws escrow in the same transaction
	///         (non-ZK version, for testing and simplicity).
	/// @param expectedNote Struct containing the expected transaction details that unlock the escrow.
	/// @param expectedTx The expected transaction hash that unlocks the escrow.
	/// @param expectedTxProof Merkle proof that `expectedTx` is in a valid Chamber root.
	/// @param escrowNote Struct containing all necessary information for the escrow note.
	/// @param escrowNoteProof Merkle proof for the escrow note in Chamber's tx tree
	function depositAndConsumeEscrowNoZk(
		// for deposit
		Transaction calldata expectedNote,
		// for consumeEscrowNoZk
		uint256 expectedTx,
		uint256[] calldata expectedTxProof,
		Transaction calldata escrowNote,
		uint256[] calldata escrowNoteProof,
		address recipient
	) external {
		IERC20 erc20 = IERC20(expectedNote.token);
		// deposit to escrow
		erc20.transferFrom(msg.sender, address(this), expectedNote.amount);
		// escrow approve chamber to pull funds
		erc20.approve(address(chamber), expectedNote.amount);
		// make deposit to chamber
		chamber.deposit(expectedNote.key, expectedNote.amount, expectedNote.token);

		// now process withdrawing of the escrowed note as in consumeEscrowNoZk
		this.consumeEscrowNoZk(
			expectedTx,
			expectedTxProof,
			escrowNote,
			escrowNoteProof,
			recipient
		);
	}

	// ======== Consume (no ZK) ========

	/// @notice Releases an escrow without ZK proofs. The caller reveals `blinding`
	///         and `expectedTx` on-chain (privacy is sacrificed).
	///         Two merkle proofs are required:
	///         1. `expectedTxProof` — proves `expectedTx` exists in Chamber.
	///         2. `escrowNoteProof` — proves the escrow note exists so Chamber can spend it.
	/// @param expectedTx The expected transaction hash that unlocks the escrow.
	/// @param expectedTxProof Merkle proof that `expectedTx` is in a valid Chamber root.
	/// @param escrowNote Struct containing all necessary information for the escrow note.
	/// @param escrowNoteProof Merkle proof for the escrow note in Chamber's tx tree.
	function consumeEscrowNoZk(
		// will be private witness in zkp
		uint256 expectedTx,
		uint256[] calldata expectedTxProof,
		Transaction calldata escrowNote,
		uint256[] calldata escrowNoteProof,
		address recipient
	) external {
		// 1. Prove the condition: expectedTx exists in a valid Chamber merkle root
		uint256 root = chamber.computeRoot(expectedTx, expectedTxProof);
		require(chamber.merkleRoots(root), "expected tx not in chamber");
		IERC20 erc20 = IERC20(escrowNote.token);

		// 2. Derive the escrow claiming key from the revealed secrets
		// uint256 escrowBlinding = Hasher.hash2(escrowNote.key, expectedTx);

		// 3. Spend the escrow note from Chamber — funds land at address(this)
		//    Chamber checks: msg.sender == owner_ (both are address(this) ✓)
		chamber.withdrawNoZk(
			escrowNote.key,
			address(this),
			escrowNote.amount,
			address(erc20),
			escrowNoteProof
		);

		erc20.transfer(recipient, escrowNote.amount); // forward funds to recipient

		// 4. Forward funds to the intended recipient
		uint256 escrowNullifier = Hasher.hash2(escrowNote.key, expectedTx);
		emit EscrowConsumed(escrowNullifier);
	}

	/// @notice Deposits funds and withdraws escrow in the same transaction
	///         (non-ZK version, for testing and simplicity).
	/// @param expectedNote Struct containing the expected transaction details that unlock the escrow.
	/// @param proof Groth16 proof that expected transaction exists.
	/// @param input Public inputs from expected transaction exists proof circuit.
	/// @param mistProof Groth16 proof for the Chamber transaction that spends the escrow note.
	/// @param mistInput Public inputs for the Chamber transaction that spends the escrow note.
	function depositAndConsumeEscrow(
		// for deposit
		Transaction calldata expectedNote,
		// for consumeEscrow
		uint256[8] calldata proof,
		uint256[3] calldata input,
		uint256[8] calldata mistProof,
		uint256[10] calldata mistInput
	) external {
		IERC20 erc20 = IERC20(expectedNote.token);
		// deposit to escrow
		erc20.transferFrom(msg.sender, address(this), expectedNote.amount);
		// escrow approve chamber to pull funds
		erc20.approve(address(chamber), expectedNote.amount);
		// make deposit to chamber
		chamber.deposit(expectedNote.key, expectedNote.amount, expectedNote.token);

		// now process withdrawing of the escrowed note as in consumeEscrowNoZk
		this.consumeEscrowNoZk(
			expectedTx,
			expectedTxProof,
			escrowNote,
			escrowNoteProof,
			recipient
		);
	}

	/// @notice Releases an escrow without ZK proofs. The caller reveals `blinding`
	///         and `expectedTx` on-chain (privacy is sacrificed).
	///         Two merkle proofs are required:
	///         1. `expectedTxProof` — proves `expectedTx` exists in Chamber.
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

		uint256 escrowNullifier = input[1];
		uint256 merkleRoot = input[2];

		// skip owner check, proof wouldn't work without correct caller
		// uint256 owner = input[0];
		// require(owner == uint256(uint160(address(this))), "not escrow owner");

		// 2. verify expectedTx is in Chamber
		require(chamber.merkleRoots(merkleRoot), "expected tx not in chamber");

		uint256 mistNullifier = chamber.handleZkp(mistProof, mistInput).nullifier;

		// 3. glue connecting tx proof to escrow proof
		require(escrowNullifier == mistNullifier, "escrow nullifier mismatch");

		emit EscrowConsumed(escrowNullifier);
	}
}
