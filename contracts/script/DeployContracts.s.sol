// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script, console } from "forge-std/Script.sol";
import { Chamber } from "../src/Chamber.sol";
import { Escrow } from "../src/Escrow.sol";
import { EscrowVerifier } from "../src/EscrowVerifier.sol";
import { ChamberVerifier } from "../src/ChamberVerifier.sol";
import { NamedERC20 } from "../src/DummyERC20.sol";

contract DeployContracts is Script {
	NamedERC20 public tkn1;
	NamedERC20 public tkn2;

	function run() public {
		uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
		address deployer = vm.addr(deployerPrivateKey);

		console.log("Deploying Chamber contracts to 0G testnet");
		console.log("Deployer:", deployer);
		console.log("Balance:", deployer.balance);

		vm.startBroadcast(deployerPrivateKey);

		// 1. Deploy the Groth16 verifier
		ChamberVerifier verifier = new ChamberVerifier();

		// 2. Deploy the main Chamber contract (owner = deployer)
		Chamber chamber = new Chamber(deployer, address(verifier));

		// 3. Deploy escrow contract
		EscrowVerifier escrowVerifier = new EscrowVerifier();
		Escrow escrow = new Escrow(address(chamber), address(escrowVerifier));

		// 4. Optionally deploy DummyERC20 for testnet testing
		bool deployDummy = vm.envOr("DEPLOY_DUMMY_ERC20", true);
		if (deployDummy) {
			tkn1 = new NamedERC20("DummyEth", "DumEth");
			tkn2 = new NamedERC20("DummyUSD", "DumUSD");
		}

		vm.stopBroadcast();

		console.log("\n=== Deployment complete ===");
		console.log("ChamberVerifier:", address(verifier));
		console.log("Chamber:        ", address(chamber));
		console.log("EscrowVerifier: ", address(escrowVerifier));
		console.log("Escrow:         ", address(escrow));
		if (deployDummy) {
			console.log("DummyEth ERC20 deployed at:", address(tkn1));
			console.log("DummyUSD ERC20 deployed at:", address(tkn2));
		}
	}
}
