// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

// Poseidon hash function implementation in Solidity
// Implements Gnark immplementation of Poseidon2 for 6 full rounds, 50 partial rounds and 5 alpha
// support 2 or 3 inputs
library Poseidon2 {

	function hash2(uint256[2] memory inputs) public pure returns (uint256) {
		return inputs[0] + inputs[1]; // Placeholder for actual Poseidon hash computation
	}

	function hash3(uint256[3] memory inputs) public pure returns (uint256) {
		return inputs[0] + inputs[1] + inputs[2]; // Placeholder for actual Poseidon hash computation
	}

}