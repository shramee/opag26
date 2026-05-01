// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import { Chamber } from "../src/Chamber.sol";
import { Escrow } from "../src/Escrow.sol";
import { DummyERC20 } from "../src/DummyERC20.sol";
import { Poseidon2 as Hasher } from "../src/Poseidon.sol";
import { console } from "forge-std/console.sol";

/// @notice End-to-end tests for the no-ZK escrow flow.
///
/// Scenario: John (sender) wants to pay 100,000 tokens to Jane (recipient)
/// only after Jane deposits 500 tokens into Chamber herself.
/// Jane's deposit is the `expectedTx` John encodes in his escrow.
contract EscrowTest is Test {
	Chamber chamber;
	Escrow escrow;
	DummyERC20 erc20;

	address admin = address(this);
	address sender = address(0xaa11); // John
	address recipient = address(0xbb22); // Jane

	uint256 constant BLINDING = 0xcafebabe_deadbeef;
	uint256 constant ESCROW_AMOUNT = 100_000;
	uint256 constant JANE_DEPOSIT_AMOUNT = 500;
	uint256 constant JANE_CLAIMING_KEY = 0x1234abcd;

	function setUp() public {
		// Deploy DummyERC20 as admin so admin holds all supply
		erc20 = new DummyERC20();

		chamber = new Chamber(admin);
		escrow = new Escrow(address(chamber));

		// Fund John and Jane
		erc20.transfer(sender, ESCROW_AMOUNT + 1_000);
		erc20.transfer(recipient, JANE_DEPOSIT_AMOUNT + 1_000);
	}

	// ======== Helpers ========

	/// @dev Jane makes her deposit into Chamber. Returns the tx hash (expectedTx).
	function _janeDeposit()
		internal
		returns (uint256 expectedTx, uint256 janeIndex)
	{
		uint256 janeSecret = Hasher.hash2(
			JANE_CLAIMING_KEY,
			uint256(uint160(recipient))
		);

		vm.startPrank(recipient);
		erc20.approve(address(chamber), JANE_DEPOSIT_AMOUNT);
		chamber.deposit(janeSecret, JANE_DEPOSIT_AMOUNT, address(erc20));
		vm.stopPrank();

		expectedTx = chamber.hashWithAsset(
			janeSecret,
			address(erc20),
			JANE_DEPOSIT_AMOUNT
		);
		janeIndex = chamber.getTxArray().length - 1;
	}

	/// @dev John creates an escrow locked on `expectedTx`. Returns the escrow note index.
	function _johnEscrow(
		uint256 expectedTx
	) internal returns (uint256 escrowIndex) {
		vm.startPrank(sender);
		erc20.approve(address(escrow), ESCROW_AMOUNT);
		escrow.createEscrowTx(BLINDING, expectedTx, address(erc20), ESCROW_AMOUNT);
		vm.stopPrank();

		escrowIndex = chamber.getTxArray().length - 1;
	}

	// ======== Tests ========

	function test_create_escrow_deposits_into_chamber() public {
		(uint256 expectedTx, ) = _janeDeposit();
		uint256 beforeLen = chamber.getTxArray().length;

		_johnEscrow(expectedTx);

		assertEq(
			chamber.getTxArray().length,
			beforeLen + 1,
			"escrow note added to chamber"
		);
		assertEq(
			erc20.balanceOf(address(chamber)),
			JANE_DEPOSIT_AMOUNT + ESCROW_AMOUNT
		);
	}

	function test_consume_escrow_releases_funds() public {
		(uint256 expectedTx, uint256 janeIndex) = _janeDeposit();
		uint256 escrowIndex = _johnEscrow(expectedTx);

		uint256[] memory expectedTxProof = chamber.computeProof(janeIndex);
		uint256[] memory escrowNoteProof = chamber.computeProof(escrowIndex);

		uint256 initialBal = erc20.balanceOf(recipient);

		escrow.consumeEscrowNoZk(
			BLINDING,
			expectedTx,
			expectedTxProof,
			address(erc20),
			ESCROW_AMOUNT,
			recipient,
			escrowNoteProof
		);

		assertEq(
			erc20.balanceOf(recipient),
			initialBal + ESCROW_AMOUNT,
			"recipient received escrow funds"
		);
	}

	function test_consume_escrow_marks_nullifier_spent() public {
		(uint256 expectedTx, uint256 janeIndex) = _janeDeposit();
		uint256 escrowIndex = _johnEscrow(expectedTx);

		uint256[] memory expectedTxProof = chamber.computeProof(janeIndex);
		uint256[] memory escrowNoteProof = chamber.computeProof(escrowIndex);

		escrow.consumeEscrowNoZk(
			BLINDING,
			expectedTx,
			expectedTxProof,
			address(erc20),
			ESCROW_AMOUNT,
			recipient,
			escrowNoteProof
		);

		// Attempting to consume again should revert
		vm.expectRevert("transaction is spent");
		escrow.consumeEscrowNoZk(
			BLINDING,
			expectedTx,
			expectedTxProof,
			address(erc20),
			ESCROW_AMOUNT,
			recipient,
			escrowNoteProof
		);
	}

	function test_consume_fails_without_expected_tx_in_chamber() public {
		// Don't let Jane deposit — expectedTx doesn't exist yet
		uint256 fakeExpectedTx = 0xdeadbeef;
		uint256[] memory emptyProof = new uint256[](0);

		// John creates escrow against fakeExpectedTx
		vm.startPrank(sender);
		erc20.approve(address(escrow), ESCROW_AMOUNT);
		escrow.createEscrowTx(
			BLINDING,
			fakeExpectedTx,
			address(erc20),
			ESCROW_AMOUNT
		);
		vm.stopPrank();

		uint256 escrowIndex = chamber.getTxArray().length - 1;
		uint256[] memory escrowNoteProof = chamber.computeProof(escrowIndex);

		// Consuming should fail because fakeExpectedTx is not in a valid root
		vm.expectRevert("expected tx not in chamber");
		escrow.consumeEscrowNoZk(
			BLINDING,
			fakeExpectedTx,
			emptyProof,
			address(erc20),
			ESCROW_AMOUNT,
			recipient,
			escrowNoteProof
		);
	}

	function test_consume_fails_with_wrong_blinding() public {
		(uint256 expectedTx, uint256 janeIndex) = _janeDeposit();
		uint256 escrowIndex = _johnEscrow(expectedTx);

		uint256[] memory expectedTxProof = chamber.computeProof(janeIndex);
		uint256[] memory escrowNoteProof = chamber.computeProof(escrowIndex);

		uint256 wrongBlinding = BLINDING ^ 0xffffffff;

		// Wrong blinding derives a different depositKey, so the merkle proof won't match
		vm.expectRevert("invalid merkle proof");
		escrow.consumeEscrowNoZk(
			wrongBlinding,
			expectedTx,
			expectedTxProof,
			address(erc20),
			ESCROW_AMOUNT,
			recipient,
			escrowNoteProof
		);
	}

	function test_consume_fails_with_wrong_expected_tx() public {
		(uint256 expectedTx, uint256 janeIndex) = _janeDeposit();
		uint256 escrowIndex = _johnEscrow(expectedTx);

		uint256[] memory expectedTxProof = chamber.computeProof(janeIndex);
		uint256[] memory escrowNoteProof = chamber.computeProof(escrowIndex);

		uint256 wrongExpectedTx = expectedTx ^ 1;

		// Wrong expectedTx produces a root not in chamber.merkleRoots
		vm.expectRevert("expected tx not in chamber");
		escrow.consumeEscrowNoZk(
			BLINDING,
			wrongExpectedTx,
			expectedTxProof,
			address(erc20),
			ESCROW_AMOUNT,
			recipient,
			escrowNoteProof
		);
	}

	function test_anyone_can_trigger_consume_with_correct_secrets() public {
		(uint256 expectedTx, uint256 janeIndex) = _janeDeposit();
		uint256 escrowIndex = _johnEscrow(expectedTx);

		uint256[] memory expectedTxProof = chamber.computeProof(janeIndex);
		uint256[] memory escrowNoteProof = chamber.computeProof(escrowIndex);

		uint256 initialBal = erc20.balanceOf(recipient);

		// A third party can call consumeEscrowNoZk as long as they know the secrets
		address thirdParty = address(0xcccc);
		vm.prank(thirdParty);
		escrow.consumeEscrowNoZk(
			BLINDING,
			expectedTx,
			expectedTxProof,
			address(erc20),
			ESCROW_AMOUNT,
			recipient,
			escrowNoteProof
		);

		assertEq(
			erc20.balanceOf(recipient),
			initialBal + ESCROW_AMOUNT,
			"recipient still receives funds"
		);
	}

	function test_escrow_note_hash_is_deterministic() public {
		(uint256 expectedTx, ) = _janeDeposit();

		vm.startPrank(sender);
		erc20.approve(address(escrow), ESCROW_AMOUNT);

		vm.recordLogs();
		escrow.createEscrowTx(BLINDING, expectedTx, address(erc20), ESCROW_AMOUNT);
		vm.stopPrank();

		Vm.Log[] memory logs = vm.getRecordedLogs();
		// EscrowCreated event: topic[0] = sig, topic[1] = escrowNote
		uint256 emittedNote = uint256(logs[logs.length - 1].topics[1]);

		// Recompute manually
		uint256 escrowBlinding = Hasher.hash2(BLINDING, expectedTx);
		uint256 depositKey = Hasher.hash2(
			escrowBlinding,
			uint256(uint160(address(escrow)))
		);
		uint256 expected = chamber.hashWithAsset(
			depositKey,
			address(erc20),
			ESCROW_AMOUNT
		);

		assertEq(
			emittedNote,
			expected,
			"emitted escrow note hash matches manual computation"
		);
	}
}
