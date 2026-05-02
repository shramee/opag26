// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Poseidon2 as Hasher } from "./Poseidon.sol";

/// @title StoredMerkle
/// @notice Storage-backed merkle tree ported from Cairo's StoredMerkle.
///         Supports incremental append and proof computation from storage.
///         Uses mapping(uint256 => uint256) keyed as height * SEPARATOR + index.
contract StoredMerkle {
	/// @dev Separator between height levels in storage key space.
	///      Mirrors Cairo's _SEPARATOR = 2^64.
	uint256 private constant _SEPARATOR = 1 << 64;

	/// @dev Special key for storing tree height.
	///      Mirrors Cairo's _HEIGHT_KEY = 2^128 + 'height'.
	///      We use a similarly unique constant.
	uint256 private constant _HEIGHT_KEY =
		(1 << 128) + uint256(keccak256("height"));

	/// @dev Special suffix for storing length at each height.
	///      Mirrors Cairo's _LENGTH_KEY = 'length'.
	uint256 private constant _LENGTH_KEY = uint256(keccak256("length"));

	/// @notice The tree storage. Key = height * SEPARATOR + index.
	mapping(uint256 => uint256) internal _store;

	/// @notice Get the storage key for a leaf.
	function _leafKey(uint256 h, uint256 index) internal pure returns (uint256) {
		return h * _SEPARATOR + index;
	}

	/// @notice Get tree height.
	function height() public view returns (uint256) {
		return _store[_HEIGHT_KEY];
	}

	/// @notice Get the merkle root.
	function getRoot() public view returns (uint256) {
		uint256 h = height();
		return readLeaf(h, 0);
	}

	/// @notice Get number of nodes at a given height.
	function lenAtHeight(uint256 h) public view returns (uint256) {
		return _store[_leafKey(h, _LENGTH_KEY)];
	}

	/// @notice Set number of nodes at a given height.
	function _setLenAtHeight(uint256 h, uint256 length) internal {
		_store[_leafKey(h, _LENGTH_KEY)] = length;
	}

	/// @notice Set the tree height.
	function _setHeight(uint256 h) internal {
		_store[_HEIGHT_KEY] = h;
	}

	/// @notice Read a leaf from storage.
	function readLeaf(uint256 h, uint256 index) public view returns (uint256) {
		return _store[_leafKey(h, index)];
	}

	/// @notice Write a leaf to storage.
	function _writeLeaf(uint256 h, uint256 index, uint256 val) internal {
		_store[_leafKey(h, index)] = val;
	}

	/// @notice Append a leaf at a given height.
	function _appendLeafAtHeight(uint256 h, uint256 val) internal {
		uint256 index = lenAtHeight(h);
		_store[_leafKey(h, index)] = val;
		_setLenAtHeight(h, index + 1);
	}

	/// @notice Write an array of leaves at a given height.
	function _writeLeavesAtHeight(uint256 h, uint256[] memory leaves) internal {
		uint256 storeIndex = h * _SEPARATOR;
		for (uint256 i = 0; i < leaves.length; i++) {
			_store[storeIndex + i] = leaves[i];
		}
		_setLenAtHeight(h, leaves.length);
	}

	/// @notice Read all leaves at a given height.
	function readLeavesAtHeight(
		uint256 h
	) public view returns (uint256[] memory leaves) {
		uint256 len = lenAtHeight(h);
		leaves = new uint256[](len);
		uint256 storeIndex = h * _SEPARATOR;
		for (uint256 i = 0; i < len; i++) {
			leaves[i] = _store[storeIndex + i];
		}
	}

	/// @notice Initialize the merkle tree storage from an array of leaves.
	/// @dev Mirrors Cairo's init_storage(). Builds all layers bottom-up.
	function initStorage(uint256[] memory leaves) public {
		uint256 h = 0;
		_writeLeavesAtHeight(h, leaves);

		uint256[] memory current = leaves;
		while (current.length > 1) {
			h++;
			current = _computeNextLevel(current);
			_writeLeavesAtHeight(h, current);
		}
		_setHeight(h);
	}

	/// @notice Append a leaf to the tree and return the new root.
	/// @dev Mirrors Cairo's StoredMerkle.append().
	function append(uint256 leaf) public returns (uint256) {
		uint256 level = 0;
		_appendLeafAtHeight(level, leaf);
		uint256 index = lenAtHeight(level) - 1;
		uint256 node = leaf;

		while (lenAtHeight(level) != 1) {
			if (index % 2 != 0) {
				// odd index => pair with previous leaf
				uint256 pairedNode = readLeaf(level, index - 1);
				node = _merkleHash(node, pairedNode);
			} else {
				// even index => no sibling yet, carry the node upward unchanged
			}
			level++;
			index /= 2;
			if (lenAtHeight(level) > index) {
				_writeLeaf(level, index, node); // update existing node
			} else {
				_appendLeafAtHeight(level, node); // add new node at level
			}
		}
		_setHeight(level);
		return node; // merkle root
	}

	/// @notice Compute a merkle proof for the leaf at a given index.
	/// @dev Mirrors Cairo's StoredMerkle.compute_proof().
	function computeProof(
		uint256 index
	) public view returns (uint256[] memory proof) {
		uint256 h = height();
		uint256[] memory proofBuffer = new uint256[](h);
		uint256 proofLen = 0;
		uint256 currentIndex = index;

		for (uint256 i = 0; i < h; i++) {
			uint256 levelLen = lenAtHeight(i);
			if (currentIndex % 2 == 0) {
				uint256 siblingIndex = currentIndex + 1;
				if (siblingIndex < levelLen) {
					proofBuffer[proofLen] = readLeaf(i, siblingIndex);
					proofLen++;
				}
			} else {
				proofBuffer[proofLen] = readLeaf(i, currentIndex - 1);
				proofLen++;
			}
			currentIndex /= 2;
		}

		proof = new uint256[](proofLen);
		for (uint256 i = 0; i < proofLen; i++) {
			proof[i] = proofBuffer[i];
		}
	}

	/// @notice Compute the merkle root from a leaf and proof.
	function computeRoot(
		uint256 leaf,
		uint256[] memory proof
	) public pure returns (uint256) {
		uint256 current = leaf;
		for (uint256 i = 0; i < proof.length; i++) {
			current = _merkleHash(current, proof[i]);
		}
		return current;
	}

	/// @notice Verify a merkle proof.
	function verifyProof(
		uint256 root,
		uint256 leaf,
		uint256[] memory proof
	) public pure returns (bool) {
		return computeRoot(leaf, proof) == root;
	}

	/// @notice Compute the next level from a set of nodes (internal helper).
	/// @dev Carries an odd trailing node upward unchanged. Uses sorted pair hashing.
	function _computeNextLevel(
		uint256[] memory nodes
	) internal pure returns (uint256[] memory nextLevel) {
		uint256 len = nodes.length;
		nextLevel = new uint256[]((len + 1) / 2);
		uint256 nextIndex = 0;

		for (uint256 i = 0; i + 1 < len; i += 2) {
			uint256 left = nodes[i];
			uint256 right = nodes[i + 1];
			nextLevel[nextIndex] = _merkleHash(left, right);
			nextIndex++;
		}

		if (len % 2 != 0) {
			nextLevel[nextIndex] = nodes[len - 1];
		}
	}

	function _merkleHashNot0(
		uint256 left,
		uint256 right
	) internal pure returns (uint256) {
		if (left == 0) {
			return right;
		} else {
			return Hasher.hash2(left, right);
		}
	}

	function _merkleHash(
		uint256 left,
		uint256 right
	) internal pure returns (uint256) {
		if (left < right) {
			return _merkleHashNot0(left, right);
		} else {
			return _merkleHashNot0(right, left);
		}
	}
}
