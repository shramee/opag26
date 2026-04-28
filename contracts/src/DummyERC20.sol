// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DummyERC20
/// @notice Simple ERC20 token for testing, mirrors Cairo's DummyERC20.
///         Mints 1,000,000,000,000,000,000,000,000 tokens to the deployer.
contract DummyERC20 is ERC20 {
	constructor() ERC20("DummyERC20", "DumE20") {
		_mint(msg.sender, 1_000_000_000_000_000_000_000_000);
	}
}
