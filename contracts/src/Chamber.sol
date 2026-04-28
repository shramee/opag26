// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Poseidon2 as Hasher } from "./Poseidon.sol";
import { StoredMerkle } from "./StoredMerkle.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Chamber
/// @notice Privacy-preserving fund management contract ported from Cairo.
///         Supports deposits, non-ZK withdrawals with merkle proofs,
///         and seek-and-hide operations for partial withdrawal + re-wrapping.
///         ZK proof handling is omitted (EVM-specific verifier not in scope).
contract Chamber is StoredMerkle, Ownable {
	/// @notice Maximum amount supported per transaction (2^128).
	uint256 public constant MAX_AMOUNT_SUPPORTED = 1 << 128;

	struct Asset {
		uint256 amount;
		address addr;
	}

	/// @notice All transaction hashes in order.
	uint256[] public txArray;

	/// @notice Asset data keyed by transaction secret hash.
	mapping(uint256 => Asset) public assets;

	/// @notice History of valid merkle roots.
	mapping(uint256 => bool) public merkleRoots;

	/// @notice Nullifier tracking (prevents double-spend).
	mapping(uint256 => bool) public nullified;

	constructor(address owner_) Ownable(owner_) {}

	/// @notice Hash a secret with asset address and amount.
	/// @dev Mirrors Cairo's hash_with_asset(secrets_hash, asset, amount).
	///      Uses hash3 (mocked as multiplication).
	function hashWithAsset(
		uint256 secretsHash,
		address asset,
		uint256 amount
	) public pure returns (uint256) {
		return Hasher.hash3(secretsHash, uint256(uint160(asset)), amount);
	}

	/// @notice Get the full transaction array.
	function getTxArray() external view returns (uint256[] memory) {
		return txArray;
	}

	/// @notice Get the current merkle root.
	function merkleRoot() external view returns (uint256) {
		return getRoot();
	}

	/// @notice Get a merkle proof for a transaction at a given index.
	function merkleProof(uint256 index) external view returns (uint256[] memory) {
		return computeProof(index);
	}

	/// @notice Get all leaves at a given height.
	function merkleLeaves(uint256 h) external view returns (uint256[] memory) {
		return readLeavesAtHeight(h);
	}

	/// @notice Get asset details from a transaction secret.
	function assetsFromSecret(
		uint256 txSecret
	) external view returns (uint256 amount, address addr) {
		Asset storage a = assets[txSecret];
		return (a.amount, a.addr);
	}

	/// @notice Check which nullifiers have been spent.
	function nullifiersSpent(
		uint256[] calldata nullifiers_
	) external view returns (bool[] memory) {
		bool[] memory spent = new bool[](nullifiers_.length);
		for (uint256 i = 0; i < nullifiers_.length; i++) {
			spent[i] = nullified[nullifiers_[i]];
		}
		return spent;
	}

	/// @notice Check which transactions exist in the tx array.
	function transactionsExist(
		uint256[] calldata transactions
	) external view returns (bool[] memory) {
		bool[] memory exists = new bool[](transactions.length);
		for (uint256 i = 0; i < transactions.length; i++) {
			for (uint256 j = 0; j < txArray.length; j++) {
				if (txArray[j] == transactions[i]) {
					exists[i] = true;
					break;
				}
			}
		}
		return exists;
	}

	/// @notice Recalculate the merkle root from stored transactions.
	function recalculateMerkleRoot() external {
		initStorage(txArray);
	}

	// ======== Core Operations ========

	/// @notice Add a new transaction hash to the tx array and update the merkle tree.
	function _addNewTx(uint256 txHash) internal {
		txArray.push(txHash);
		uint256 newRoot = append(txHash);
		merkleRoots[newRoot] = true;
	}

	/// @notice Deposit funds into the chamber.
	/// @param hash_ The secret hash for the transaction.
	/// @param amount The amount of tokens to deposit.
	/// @param asset_ The ERC20 token address.
	function deposit(uint256 hash_, uint256 amount, address asset_) external {
		require(amount < MAX_AMOUNT_SUPPORTED, "amount exceeds 4bn");
		require(amount > 0, "amount must be positive");

		// Transfer tokens from caller
		IERC20(asset_).transferFrom(msg.sender, address(this), amount);

		// Check no duplicate
		require(assets[hash_].amount == 0, "transaction already exists");
		assets[hash_] = Asset({ amount: amount, addr: asset_ });

		// Create tx hash with amount
		uint256 txHash = hashWithAsset(hash_, asset_, amount);
		_addNewTx(txHash);
	}

	/// @notice Withdraw without ZK proof (full withdrawal).
	/// @param claimingKey The claiming key for the transaction.
	/// @param owner_ The owner/recipient of the funds.
	/// @param amount The amount being claimed.
	/// @param asset_ The ERC20 token address.
	/// @param proof The merkle proof.
	function withdrawNoZk(
		uint256 claimingKey,
		address owner_,
		uint256 amount,
		address asset_,
		uint256[] calldata proof
	) external {
		seekAndHideNoZk(claimingKey, owner_, amount, asset_, proof, 0, 0);
	}

	/// @notice Withdraw with option to re-wrap remaining funds in a new transaction.
	/// @param claimingKey The claiming key for the transaction.
	/// @param owner_ The owner/recipient.
	/// @param amount The original transaction amount.
	/// @param asset_ The ERC20 token address.
	/// @param proof The merkle proof.
	/// @param newTxSecret The secret for the new wrapped transaction (0 if full withdrawal).
	/// @param newTxAmount The amount to re-wrap (0 if full withdrawal).
	function seekAndHideNoZk(
		uint256 claimingKey,
		address owner_,
		uint256 amount,
		address asset_,
		uint256[] calldata proof,
		uint256 newTxSecret,
		uint256 newTxAmount
	) public {
		// Locate transaction and get nullifier secret
		uint256 nullifierSecret = _locateTransaction(
			claimingKey,
			owner_,
			amount,
			asset_,
			proof
		);
		uint256 originalNullifier = hashWithAsset(nullifierSecret, asset_, amount);

		// Subtract new_tx_amount from original
		uint256 withdrawAmount = amount - newTxAmount;

		uint256 ownerU256 = uint256(uint160(owner_));

		if (newTxAmount != 0) {
			_spendTransaction(
				ownerU256,
				false,
				withdrawAmount,
				asset_,
				owner_,
				originalNullifier
			);
			// Create new transaction with remaining amount
			uint256 newTx = hashWithAsset(newTxSecret, asset_, newTxAmount);
			_addNewTx(newTx);
		} else {
			// Full withdrawal
			_spendTransaction(
				ownerU256,
				true,
				withdrawAmount,
				asset_,
				owner_,
				originalNullifier
			);
		}
	}

	/// @notice Spend a transaction: verify auth, mark nullifier, transfer funds.
	function _spendTransaction(
		uint256 owner_,
		bool authDone,
		uint256 amount,
		address asset_,
		address recipient,
		uint256 nullifier_
	) internal {
		require(
			authDone || owner_ == uint256(uint160(msg.sender)),
			"only owner caller or zk auth"
		);

		require(!nullified[nullifier_], "transaction is spent");
		nullified[nullifier_] = true;

		if (amount > 0) {
			IERC20(asset_).transfer(recipient, amount);
		}
	}

	/// @notice Locate a transaction in the merkle tree and return the nullifier secret.
	function _locateTransaction(
		uint256 claimingKey,
		address recipient,
		uint256 amount,
		address asset_,
		uint256[] calldata proof
	) internal view returns (uint256) {
		uint256 recipientU256 = uint256(uint160(recipient));

		// Compute secrets from preimage
		uint256 secrets = Hasher.hash2(claimingKey, recipientU256);

		// Create tx hash with amount
		uint256 txHash = hashWithAsset(secrets, asset_, amount);

		// Verify merkle membership
		uint256 root = computeRoot(txHash, proof);
		require(merkleRoots[root], "invalid merkle proof");

		// Return nullifier secret: hash(claimingKey + 1, recipient)
		return Hasher.hash2(claimingKey + 1, recipientU256);
	}
}
