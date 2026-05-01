// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Poseidon2 as Hasher } from "./Poseidon.sol";
import { Chamber } from "./Chamber.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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

	event EscrowCreated(
		uint256 indexed escrowNote,
		address token,
		uint256 amount
	);
	event EscrowConsumed(
		uint256 indexed escrowNote,
		address token,
		uint256 amount,
		address recipient
	);

	constructor(address chamber_) {
		chamber = Chamber(chamber_);
	}

	// ======== Create ========

	/// @notice Locks `amount` of `token` in Chamber, unlockable once `expectedTx`
	///         appears in the Chamber merkle tree.
	/// @param blinding Random blinding factor chosen by the sender.
	/// @param expectedTx Transaction hash that must be proven to exist to unlock.
	/// @param token ERC20 token address to lock.
	/// @param amount Amount to lock (caller must have approved this contract).
	function createEscrowTx(
		uint256 blinding,
		uint256 expectedTx,
		address token,
		uint256 amount
	) external {
		IERC20(token).transferFrom(msg.sender, address(this), amount);

		uint256 escrowBlinding = Hasher.hash2(blinding, expectedTx);
		uint256 depositKey = Hasher.hash2(
			escrowBlinding,
			uint256(uint160(address(this)))
		);

		IERC20(token).approve(address(chamber), amount);
		chamber.deposit(depositKey, amount, token);

		uint256 escrowNote = chamber.hashWithAsset(depositKey, token, amount);
		emit EscrowCreated(escrowNote, token, amount);
	}

	// ======== Consume (no ZK) ========

	/// @notice Releases an escrow without ZK proofs. The caller reveals `blinding`
	///         and `expectedTx` on-chain (privacy is sacrificed).
	///         Two merkle proofs are required:
	///         1. `expectedTxProof` — proves `expectedTx` exists in Chamber.
	///         2. `escrowNoteProof` — proves the escrow note exists so Chamber can spend it.
	/// @param blinding The blinding factor used at creation time.
	/// @param expectedTx The expected transaction hash that unlocks the escrow.
	/// @param expectedTxProof Merkle proof that `expectedTx` is in a valid Chamber root.
	/// @param token ERC20 token address.
	/// @param amount Escrow amount (must match the original deposit).
	/// @param recipient Address to receive the released funds.
	/// @param escrowNoteProof Merkle proof for the escrow note in Chamber's tx tree.
	function consumeEscrowNoZk(
		uint256 blinding,
		uint256 expectedTx,
		uint256[] calldata expectedTxProof,
		address token,
		uint256 amount,
		address recipient,
		uint256[] calldata escrowNoteProof
	) external {
		// 1. Prove the condition: expectedTx exists in a valid Chamber merkle root
		uint256 root = chamber.computeRoot(expectedTx, expectedTxProof);
		require(chamber.merkleRoots(root), "expected tx not in chamber");

		// 2. Derive the escrow claiming key from the revealed secrets
		uint256 escrowBlinding = Hasher.hash2(blinding, expectedTx);

		// 3. Spend the escrow note from Chamber — funds land at address(this)
		//    Chamber checks: msg.sender == owner_ (both are address(this) ✓)
		chamber.withdrawNoZk(
			escrowBlinding,
			address(this),
			amount,
			token,
			escrowNoteProof
		);

		// 4. Forward funds to the intended recipient
		require(
			IERC20(token).transfer(recipient, amount),
			"forward to recipient failed"
		);

		uint256 depositKey = Hasher.hash2(
			escrowBlinding,
			uint256(uint160(address(this)))
		);
		uint256 escrowNote = chamber.hashWithAsset(depositKey, token, amount);
		emit EscrowConsumed(escrowNote, token, amount, recipient);
	}
}
