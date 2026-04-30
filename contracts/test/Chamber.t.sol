// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import { Chamber } from "../src/Chamber.sol";
import { ChamberVerifier } from "../src/ChamberVerifier.sol";
import { DummyERC20 } from "../src/DummyERC20.sol";
import { Poseidon2 as Hasher } from "../src/Poseidon.sol";

contract MockChamberVerifier {
	bool public shouldRevert;

	function setShouldRevert(bool shouldRevert_) external {
		shouldRevert = shouldRevert_;
	}

	function verifyProof(
		uint256[8] calldata,
		uint256[10] calldata
	) external view {
		require(!shouldRevert, "invalid proof");
	}
}

contract ChamberTest is Test {
	Chamber chamber;
	DummyERC20 erc20;
	MockChamberVerifier verifier;
	ChamberVerifier realVerifier;

	address caller = address(0xb0b);
	address ownerAddr = address(0x10e); // "joe"
	address newOwner = address(0x1111); // "jill"

	uint256 constant CLAIMING_KEY = 12345;
	uint256 constant NEW_CLAIMING_KEY = CLAIMING_KEY + 5;

	function setUp() public {
		vm.startPrank(caller);
		erc20 = new DummyERC20();
		chamber = new Chamber(caller);
		vm.stopPrank();
		verifier = new MockChamberVerifier();
		realVerifier = new ChamberVerifier();
	}

	// ========== Helper functions (mirrors Cairo test helpers) ==========

	function _deposit(uint256 hash_, uint256 amount) internal {
		vm.startPrank(caller);
		erc20.approve(address(chamber), amount);
		chamber.deposit(hash_, amount, address(erc20));
		vm.stopPrank();
	}

	function _multiDeposit(
		uint256[] memory amounts,
		uint256[] memory keys,
		address owner_
	) internal returns (uint256 totalAmt) {
		for (uint256 i = 0; i < amounts.length; i++) {
			uint256 hash_ = Hasher.hash2(keys[i], uint256(uint160(owner_)));
			vm.startPrank(caller);
			erc20.approve(address(chamber), amounts[i]);
			chamber.deposit(hash_, amounts[i], address(erc20));
			vm.stopPrank();
			totalAmt += amounts[i];
		}
	}

	/// @dev Sets up 17 transactions with various amounts, mirrors Cairo's withdrawal_setup.
	///      Performs an initial withdrawal at index 5 (amount=1, key=0xf5).
	function _withdrawalSetup()
		internal
		returns (uint256 totalDeposited, uint256 spentKey, uint256 spentAmt)
	{
		uint256[] memory amounts = new uint256[](17);
		uint256[] memory keys = new uint256[](17);

		amounts[0] = 1000;
		keys[0] = 0xf0;
		amounts[1] = 2000;
		keys[1] = 0xf1;
		amounts[2] = 1000;
		keys[2] = 0xf2;
		amounts[3] = 2000;
		keys[3] = 0xf3;
		amounts[4] = 1000;
		keys[4] = 0xf4;
		amounts[5] = 1;
		keys[5] = 0xf5;
		amounts[6] = 2000;
		keys[6] = 0xe1;
		amounts[7] = 100000;
		keys[7] = CLAIMING_KEY;
		amounts[8] = 3000;
		keys[8] = 0xe3;
		amounts[9] = 2000;
		keys[9] = 0xe4;
		amounts[10] = 1000;
		keys[10] = 0xe5;
		amounts[11] = 1000;
		keys[11] = 0xa0;
		amounts[12] = 2000;
		keys[12] = 0xa1;
		amounts[13] = 1000;
		keys[13] = 0xa2;
		amounts[14] = 2000;
		keys[14] = 0xa3;
		amounts[15] = 1000;
		keys[15] = 0xa4;
		amounts[16] = 1000;
		keys[16] = 0xa5;

		totalDeposited = _multiDeposit(amounts, keys, ownerAddr);

		assertEq(
			erc20.balanceOf(address(chamber)),
			totalDeposited,
			"deposits add up"
		);

		// Withdraw the transaction at index 5 (amount=1, key=0xf5)
		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(5);

		vm.prank(ownerAddr);
		chamber.withdrawNoZk(0xf5, ownerAddr, 1, address(erc20), proof);

		spentKey = 0xf5;
		spentAmt = 1;
	}

	// ========== Deposit Tests ==========

	function test_deposit() public {
		uint256 amount = 10000;
		uint256 hash_ = 0x00;

		// Need to use a non-zero hash for hashWithAsset to work (it's multiplication-based)
		// Actually hash_ = 0 means hashWithAsset will return 0, which is fine for the tx
		// But let's use a value that makes the test meaningful
		_deposit(hash_, amount);

		assertEq(erc20.balanceOf(address(chamber)), amount, "deposit not made");
	}

	function test_deposit_amount_exceeds_max() public {
		uint256 amount = chamber.MAX_AMOUNT_SUPPORTED();
		vm.startPrank(caller);
		erc20.approve(address(chamber), amount);
		vm.expectRevert("amount exceeds 4bn");
		chamber.deposit(1, amount, address(erc20));
		vm.stopPrank();
	}

	function test_deposit_zero_amount() public {
		vm.startPrank(caller);
		erc20.approve(address(chamber), 0);
		vm.expectRevert("amount must be positive");
		chamber.deposit(1, 0, address(erc20));
		vm.stopPrank();
	}

	function test_deposit_duplicate_transaction() public {
		uint256 hash_ = 0x1234;
		_deposit(hash_, 100);

		vm.startPrank(caller);
		erc20.approve(address(chamber), 100);
		vm.expectRevert("transaction already exists");
		chamber.deposit(hash_, 100, address(erc20));
		vm.stopPrank();
	}

	// ========== Withdraw Tests ==========

	function test_withdraw_no_zk() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(7);

		uint256 initialBal = erc20.balanceOf(ownerAddr);

		vm.prank(ownerAddr);
		chamber.withdrawNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof
		);

		assertEq(
			erc20.balanceOf(ownerAddr),
			initialBal + 100000,
			"amount not received"
		);
	}

	function test_seek_and_hide_only_owner() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(7);

		uint256 newTxSecret = Hasher.hash2(
			uint256(keccak256("opensesame")),
			uint256(uint160(caller))
		);
		uint256 newTxAmt = 90000;

		vm.prank(address(0xdead)); // unknown caller
		vm.expectRevert("only owner caller or zk auth");
		chamber.seekAndHideNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof,
			newTxSecret,
			newTxAmt
		);
	}

	function test_third_party_withdraw() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(7);

		uint256 initialBal = erc20.balanceOf(ownerAddr);

		vm.prank(ownerAddr);
		chamber.seekAndHideNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof,
			0,
			0
		);

		assertEq(
			erc20.balanceOf(ownerAddr),
			initialBal + 100000,
			"amount not received"
		);
	}

	function test_seek_and_hide_no_zk() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(7);

		uint256 newTxSecret = Hasher.hash2(
			uint256(keccak256("opensesame")),
			uint256(uint160(ownerAddr))
		);
		uint256 newTxAmt = 90000;

		uint256 initialBal = erc20.balanceOf(ownerAddr);

		vm.prank(ownerAddr);
		chamber.seekAndHideNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof,
			newTxSecret,
			newTxAmt
		);

		// Owner receives amount - newTxAmt = 100000 - 90000 = 10000
		assertEq(
			erc20.balanceOf(ownerAddr),
			initialBal + 100000 - newTxAmt,
			"amount not received"
		);
	}

	function test_seek_and_hide_no_zk_hidden_tx() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(7);

		// Wrap in new tx with different owner
		uint256 newTxClaimingKey = uint256(keccak256("opensesame"));
		uint256 newTxSecret = Hasher.hash2(
			newTxClaimingKey,
			uint256(uint160(newOwner))
		);
		uint256 newTxAmt = 90000;

		uint256 initialBal = erc20.balanceOf(ownerAddr);

		vm.prank(ownerAddr);
		chamber.seekAndHideNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof,
			newTxSecret,
			newTxAmt
		);

		assertEq(
			erc20.balanceOf(ownerAddr),
			initialBal + 100000 - newTxAmt,
			"amount not received"
		);

		// Now the new owner can withdraw the wrapped transaction
		uint256 newTxInitialBal = erc20.balanceOf(newOwner);
		uint256[] memory newTxArr = chamber.getTxArray();
		uint256[] memory newTxProof = chamber.computeProof(newTxArr.length - 1);

		chamber.withdrawNoZk(
			newTxClaimingKey,
			newOwner,
			newTxAmt,
			address(erc20),
			newTxProof
		);

		assertEq(
			erc20.balanceOf(newOwner),
			newTxInitialBal + newTxAmt,
			"amount not received"
		);
	}

	// ========== Double Spend Tests ==========

	function test_double_spend() public {
		(, uint256 key, uint256 amt) = _withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(5);

		vm.prank(ownerAddr);
		vm.expectRevert("transaction is spent");
		chamber.withdrawNoZk(key, ownerAddr, amt, address(erc20), proof);
	}

	function test_double_spend_hide_and_seek() public {
		(, uint256 key, uint256 amt) = _withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(5);

		vm.prank(ownerAddr);
		vm.expectRevert("transaction is spent");
		chamber.seekAndHideNoZk(key, ownerAddr, amt, address(erc20), proof, 2, 1);
	}

	function test_double_spend_withdraw_then_seek() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(7);

		vm.startPrank(ownerAddr);
		chamber.withdrawNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof
		);

		// Try seek_and_hide on same transaction
		txArr = chamber.getTxArray();
		proof = chamber.computeProof(7);

		vm.expectRevert("transaction is spent");
		chamber.seekAndHideNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof,
			1,
			2
		);
		vm.stopPrank();
	}

	function test_double_spend_seek_then_withdraw() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(7);

		uint256 newTxSecret = Hasher.hash2(
			uint256(keccak256("opensesame")),
			uint256(uint160(ownerAddr))
		);

		vm.startPrank(ownerAddr);
		chamber.seekAndHideNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof,
			newTxSecret,
			90000
		);

		// Try withdraw on same transaction
		txArr = chamber.getTxArray();
		proof = chamber.computeProof(7);

		vm.expectRevert("transaction is spent");
		chamber.withdrawNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof
		);
		vm.stopPrank();
	}

	// ========== Invalid Proof Tests ==========

	function test_withdraw_wrong_path() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		// Use proof for index 0 instead of 7
		uint256[] memory wrongProof = chamber.computeProof(0);

		vm.prank(ownerAddr);
		vm.expectRevert("invalid merkle proof");
		chamber.withdrawNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			wrongProof
		);
	}

	// ========== View function tests ==========

	function test_merkle_root_updates() public {
		uint256 hash1 = 0x1111;
		_deposit(hash1, 100);
		uint256 root1 = chamber.merkleRoot();

		uint256 hash2 = 0x2222;
		_deposit(hash2, 200);
		uint256 root2 = chamber.merkleRoot();

		assertTrue(root1 != root2, "root should change after deposit");
	}

	function test_tx_array() public {
		_deposit(0x1111, 100);
		_deposit(0x2222, 200);

		uint256[] memory txArr = chamber.getTxArray();
		assertEq(txArr.length, 2);
	}

	function test_assets_from_secret() public {
		uint256 hash_ = 0x1234;
		_deposit(hash_, 500);

		(uint256 amount, address addr) = chamber.assetsFromSecret(hash_);
		assertEq(amount, 500);
		assertEq(addr, address(erc20));
	}

	function test_nullifiers_spent() public {
		_withdrawalSetup();

		// The nullifier for the spent transaction at index 5
		uint256 nullifierSecret = Hasher.hash2(
			0xf5 + 1,
			uint256(uint160(ownerAddr))
		);
		uint256 nullifier = chamber.hashWithAsset(
			nullifierSecret,
			address(erc20),
			1
		);

		uint256[] memory nullifiers = new uint256[](2);
		nullifiers[0] = nullifier;
		nullifiers[1] = 0xdead; // unspent

		bool[] memory spent = chamber.nullifiersSpent(nullifiers);
		assertTrue(spent[0], "should be spent");
		assertFalse(spent[1], "should not be spent");
	}

	function test_transactions_exist() public {
		_deposit(0x1111, 100);
		uint256[] memory txArr = chamber.getTxArray();

		uint256[] memory queries = new uint256[](2);
		queries[0] = txArr[0]; // exists
		queries[1] = 0xdead; // doesn't exist

		bool[] memory exists = chamber.transactionsExist(queries);
		assertTrue(exists[0], "should exist");
		assertFalse(exists[1], "should not exist");
	}

	function test_merkle_leaves() public {
		_deposit(0x1111, 100);
		_deposit(0x2222, 200);

		uint256[] memory leaves = chamber.merkleLeaves(0);
		assertEq(leaves.length, 2);
	}

	function test_merkle_proof() public {
		_deposit(0x1111, 100);
		_deposit(0x2222, 200);

		uint256[] memory proof = chamber.merkleProof(0);
		assertEq(proof.length, 1);
	}

	function test_recalculate_merkle_root() public {
		_deposit(0x1111, 100);
		_deposit(0x2222, 200);
		_deposit(0x3333, 300);

		uint256 rootBefore = chamber.merkleRoot();
		chamber.recalculateMerkleRoot();
		uint256 rootAfter = chamber.merkleRoot();

		assertEq(rootBefore, rootAfter, "root should not change after recalculate");
	}

	// ========== hashWithAsset test ==========

	function test_hashWithAsset() public view {
		uint256 result = chamber.hashWithAsset(10, address(uint160(20)), 30);
		// hash3(10, 20, 30) = 10 * 20 * 30 = 6000
		assertEq(
			result,
			Hasher.hash3(10, 20, 30),
			"hashWithAsset should match Poseidon hash3"
		);
	}

	// ========== Multiple deposits and withdrawals ==========

	function test_multiple_deposits_and_withdrawals() public {
		uint256 hash1 = 0x1111;
		uint256 hash2 = 0x2222;
		uint256 amount1 = 500;
		uint256 amount2 = 700;

		// Deposit two transactions
		vm.startPrank(caller);
		erc20.approve(address(chamber), amount1);
		chamber.deposit(hash1, amount1, address(erc20));
		erc20.approve(address(chamber), amount2);
		chamber.deposit(hash2, amount2, address(erc20));
		vm.stopPrank();

		assertEq(erc20.balanceOf(address(chamber)), amount1 + amount2);

		// Both tx should be in the array
		uint256[] memory txArr = chamber.getTxArray();
		assertEq(txArr.length, 2);
	}

	// ========== Edge case: withdraw with zero-value newTxAmount ==========

	function test_full_withdrawal_via_seek_and_hide() public {
		_withdrawalSetup();

		uint256[] memory txArr = chamber.getTxArray();
		uint256[] memory proof = chamber.computeProof(7);

		uint256 initialBal = erc20.balanceOf(ownerAddr);

		vm.prank(ownerAddr);
		chamber.seekAndHideNoZk(
			CLAIMING_KEY,
			ownerAddr,
			100000,
			address(erc20),
			proof,
			0,
			0
		);

		assertEq(erc20.balanceOf(ownerAddr), initialBal + 100000);
	}

	// ========== Verifier + ZKP tests ==========

	function test_set_verifier_only_owner() public {
		vm.prank(caller);
		chamber.setVerifier(address(verifier));
		assertEq(address(chamber.verifier()), address(verifier));

		vm.prank(address(0xdead));
		vm.expectRevert();
		chamber.setVerifier(address(verifier));
	}

	function test_handle_zkp_spends_and_appends_outputs() public {
		_deposit(0x1111, 1000);

		vm.prank(caller);
		chamber.setVerifier(address(verifier));

		uint256 beforeOwnerBal = erc20.balanceOf(ownerAddr);
		uint256 beforeChamberBal = erc20.balanceOf(address(chamber));
		uint256[] memory beforeTxArray = chamber.getTxArray();

		uint256[8] memory proof;
		uint256[10] memory input;
		input[0] = uint256(uint160(ownerAddr));
		input[1] = 0;
		input[2] = 300;
		input[3] = uint256(uint160(address(erc20)));
		input[4] = uint256(uint160(ownerAddr));
		input[5] = chamber.merkleRoot();
		input[6] = 0xabc;
		input[7] = 0x777;
		input[8] = 0x888;
		input[9] = 0;

		vm.prank(ownerAddr);
		chamber.handleZkp(proof, input);

		assertEq(erc20.balanceOf(ownerAddr), beforeOwnerBal + 300);
		assertEq(erc20.balanceOf(address(chamber)), beforeChamberBal - 300);
		assertTrue(chamber.nullified(0xabc));

		uint256[] memory txArr = chamber.getTxArray();
		assertEq(txArr.length, beforeTxArray.length + 2);
		assertEq(txArr[txArr.length - 2], 0x777);
		assertEq(txArr[txArr.length - 1], 0x888);
	}

	function test_handle_zkp_auth_done_allows_third_party() public {
		_deposit(0x1111, 1000);

		vm.prank(caller);
		chamber.setVerifier(address(verifier));

		uint256 beforeRecipientBal = erc20.balanceOf(newOwner);

		uint256[8] memory proof;
		uint256[10] memory input;
		input[0] = uint256(uint160(ownerAddr));
		input[1] = 1;
		input[2] = 250;
		input[3] = uint256(uint160(address(erc20)));
		input[4] = uint256(uint160(newOwner));
		input[5] = chamber.merkleRoot();
		input[6] = 0xdef;
		input[7] = 0x999;
		input[8] = 0xaaa;
		input[9] = 0;

		vm.prank(address(0xdead));
		chamber.handleZkp(proof, input);

		assertEq(erc20.balanceOf(newOwner), beforeRecipientBal + 250);
	}

	function test_handle_zkp_real_proof_params() public {

		uint256[8] memory proof = [
			19736442097160619192768540409670959456185810498602414919154852253035558235352,
			3489338710417729951925139801199595377097832610139045609042733091986591860191,
			246664391616423933576093789780463787542133773475550552738397811400920481467,
			19659447899510155424682102833984541568481626818680476129736047490627505335260,
			1060264115799393559259843908246125534349846104129386201559207506102948869420,
			20398213997739016703055037189642665255827359010540522915818387080985077466102,
			21797822751876009167954625985771102864378950589605674148892608769314198746627,
			20956742334324173876297978045711111162720061649422857674216911713309458009883
		];

		uint256[10] memory input = [
			6975333,
			0,
			97500,
			1144022798169253328525803632930404416797185922853879902368195142838760174561,
			723713,
			11402488954905274699035045812898916448161870642682362089225182747648261522955,
			5019339604212232730570900705368530083697760804650143795776013915548077286447,
			7819865104477025542056490010245371931472441593688757656714357970670562452766,
			5440099144717804486365413326721007562901980536546103113370629408967033105336,
			22589849925009732
		];

		vm.prank(caller);
		chamber.setVerifier(address(realVerifier));
		chamber.handleZkp(proof, input);
	}
}
