// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import { Chamber } from "../src/Chamber.sol";
import { ChamberVerifier } from "../src/ChamberVerifier.sol";
import { Escrow, Transaction } from "../src/Escrow.sol";
import { DummyERC20 } from "../src/DummyERC20.sol";
import { Poseidon2 as Hasher } from "../src/Poseidon.sol";
import { console } from "forge-std/console.sol";
import { EscrowVerifier } from "../src/EscrowVerifier.sol";

contract EscrowTest is Test {
	Chamber chamber;
	Escrow escrow;
	DummyERC20 tknA;
	DummyERC20 tknB;

	address admin = address(this);
	address sender = address(0xaa11); // sender
	address recip = address(0xbb22); // reciever

	uint256 constant BLINDING = 0xcafebabe_deadbeef;

	function test_escrow() public {
		// tested in hardhat tests, just make sure it compiles and can be deployed
	}
}
