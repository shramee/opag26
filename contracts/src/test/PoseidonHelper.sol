// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Poseidon2 as Hasher } from "../Poseidon.sol";

/// @notice Exposes Poseidon2 hash primitives for TypeScript tests that need
///         to mirror on-chain key derivation without a WASM dependency.
contract PoseidonHelper {
    function hash2(uint256 a, uint256 b) external pure returns (uint256) {
        return Hasher.hash2(a, b);
    }

    function hash3(uint256 a, uint256 b, uint256 c) external pure returns (uint256) {
        return Hasher.hash3(a, b, c);
    }
}
