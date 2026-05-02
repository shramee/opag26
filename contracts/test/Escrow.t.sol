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

	function setUp() public {
		// Deploy DummyERC20 contracts
		tknA = new DummyERC20();
		tknB = new DummyERC20();

		ChamberVerifier chamberVerifier = new ChamberVerifier();
		chamber = new Chamber(admin, address(chamberVerifier));

		EscrowVerifier verifier = new EscrowVerifier();
		escrow = new Escrow(address(chamber), address(verifier));

		// recip has tknA, wants tknB, sender has tknB
		tknA.transfer(recip, 100_000);
		tknB.transfer(sender, 100_000_000);
	}

	function prepareEscrow()
		public
		returns (
			Transaction memory expectedNote,
			Transaction memory escrowNote,
			uint256 expectedTx,
			uint256 escrowTx
		)
	{
		expectedNote = Transaction({
			key: Hasher.hash2(1234, 0xb0b),
			token: address(tknA),
			amount: 2
		});

		expectedTx = chamber.hashWithAsset(
			expectedNote.key,
			address(expectedNote.token),
			expectedNote.amount
		);

		// sender puts up the escrow
		uint256 escrowBlinder = Hasher.hash2(BLINDING, expectedTx);

		escrowNote = Transaction({
			key: escrowBlinder,
			token: address(tknB),
			amount: 10_000
		});

		vm.startPrank(sender);
		tknB.approve(address(chamber), escrowNote.amount);
		chamber.deposit(
			Hasher.hash2(escrowBlinder, uint256(uint160(address(escrow)))),
			escrowNote.amount,
			escrowNote.token
		);
		vm.stopPrank();
		// ✅ escrow created

		escrowTx = chamber.hashWithAsset(
			Hasher.hash2(escrowNote.key, uint256(uint160(address(escrow)))),
			address(escrowNote.token),
			escrowNote.amount
		);

		return (expectedNote, escrowNote, expectedTx, escrowTx);
	}

	// ======== Tests ========

	function test_full_escrow_flow() public {
		// recip wants to swap 2 tknA -> 10000 tknB
		// sender escrows 10000 tknB with expectedTx = 2 tknA with secret h(1234, 0xb0b)

		(
			Transaction memory expectedNote,
			Transaction memory escrowNote,
			uint256 expectedTx,

		) = prepareEscrow();

		// now recip creates the expected tx in chamber
		vm.startPrank(recip);
		tknA.approve(address(chamber), expectedNote.amount);
		chamber.deposit(expectedNote.key, expectedNote.amount, expectedNote.token);
		// 🔥 expected tx created

		escrow.consumeEscrowNoZk(
			expectedTx,
			chamber.computeProof(1), // expectedTx is at index 1
			escrowNote,
			chamber.computeProof(0), // escrowNote is at index 0
			recip
		);
		vm.stopPrank();

		require(
			tknB.balanceOf(recip) == escrowNote.amount,
			"recip did not receive escrow funds"
		);
	}

	function test_escrow_1shot() public {
		// recip wants to swap 2 tknA -> 10000 tknB
		// sender escrows 10000 tknB with expectedTx = 2 tknA with secret h(1234, 0xb0b)

		(
			Transaction memory expectedNote,
			Transaction memory escrowNote,
			uint256 expectedTx,
			uint256 escrowTx
		) = prepareEscrow();

		// now recip creates the expected tx in chamber
		vm.startPrank(recip);
		tknA.approve(address(escrow), expectedNote.amount);
		uint256[] memory expectedTxProof = new uint256[](1);
		expectedTxProof[0] = escrowTx;
		uint256[] memory escrowNoteProof = new uint256[](1);
		escrowNoteProof[0] = expectedTx;
		escrow.depositAndConsumeEscrowNoZk(
			expectedNote,
			expectedTx,
			expectedTxProof, // expectedTx is at index 1
			escrowNote,
			escrowNoteProof, // escrowNote is at index 0
			recip
		);
		vm.stopPrank();

		require(
			tknB.balanceOf(recip) == escrowNote.amount,
			"recip did not receive escrow funds"
		);
	}
}
