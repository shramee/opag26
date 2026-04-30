// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script, console } from "forge-std/Script.sol";
import { Chamber } from "../src/Chamber.sol";
import { ChamberVerifier } from "../src/ChamberVerifier.sol";
import { DummyERC20 } from "../src/DummyERC20.sol";

contract DeployChamber is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying Chamber contracts to 0G testnet");
        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy the Groth16 verifier
        ChamberVerifier verifier = new ChamberVerifier();
        console.log("ChamberVerifier deployed at:", address(verifier));

        // 2. Deploy the main Chamber contract (owner = deployer)
        Chamber chamber = new Chamber(deployer);
        console.log("Chamber deployed at:", address(chamber));

        // 3. Wire the verifier into Chamber
        chamber.setVerifier(address(verifier));
        console.log("Verifier set on Chamber");

        // 4. Optionally deploy DummyERC20 for testnet testing
        bool deployDummy = vm.envOr("DEPLOY_DUMMY_ERC20", true);
        if (deployDummy) {
            DummyERC20 token = new DummyERC20();
            console.log("DummyERC20 deployed at:", address(token));
        }

        vm.stopBroadcast();

        console.log("\n=== Deployment complete ===");
        console.log("ChamberVerifier:", address(verifier));
        console.log("Chamber:        ", address(chamber));
    }
}
