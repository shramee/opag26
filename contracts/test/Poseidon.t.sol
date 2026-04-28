// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import { Test, console } from "forge-std/Test.sol";
import { Poseidon2 } from "../src/Poseidon.sol";

contract PoseidonTest is Test {
	function setUp() public {
		// No setup required for Poseidon2 library
	}

	function test_hash2() public pure {
		assertEq(
			Poseidon2.hash2(0x1234567890, 0x9876543210),
			12568779716737065222642790056079768987407335034357740360530248514749971992218
		);
	}

	function test_hash3() public pure {
		assertEq(
			Poseidon2.hash3(0x1234567890, 0x9876543210, 0x1),
			2784974624267642952678807846760602137517276342215733276839677432747945500053
		);
	}
}
