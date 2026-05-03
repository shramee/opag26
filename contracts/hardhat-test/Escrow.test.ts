import { expect } from "chai";
import { ethers } from "hardhat";
import { Chamber, DummyERC20, Escrow } from "../typechain-types";
import { MISTActions, proveMist, proofToContractArgs, init, merkleProofForTx, hash2, Hex } from "@opag26/sdk";

async function setup() {
  const [admin, bob, jill] = await ethers.getSigners();
  const bobAddr = bob.address;

  await init(); // Initialize the WASM module before running tests

  // Deploy Poseidon2 library and link it
  const Poseidon2Factory = await ethers.getContractFactory("Poseidon2");
  const poseidon2 = await Poseidon2Factory.deploy();
  const poseidonLib = { "Poseidon2": await poseidon2.getAddress() };

  const tknA = (await ethers.deployContract("DummyERC20")) as unknown as DummyERC20;
  const tknB = (await ethers.deployContract("DummyERC20")) as unknown as DummyERC20;

  const ChamberVerifierFactory = await ethers.getContractFactory("ChamberVerifier");
  const chamberVerifier = (await ChamberVerifierFactory.deploy()) as unknown as Chamber;

  const ChamberFactory = await ethers.getContractFactory("Chamber", { libraries: poseidonLib });
  const chamber = (await ChamberFactory.deploy(admin.address, await chamberVerifier.getAddress())) as unknown as Chamber;

  const EscrowVerifierFactory = await ethers.getContractFactory("EscrowVerifier");
  const EscrowVerifier = (await EscrowVerifierFactory.deploy()) as unknown as Escrow;

  const EscrowFactory = await ethers.getContractFactory("Escrow");
  const escrow = (await EscrowFactory.deploy(await chamber.getAddress(), await EscrowVerifier.getAddress())) as unknown as Escrow;

  const mistActions = await MISTActions.init("0x1234", {
    getTxArray: () => chamber.getTxArray(),
    sendTransaction: async (tx) => admin.sendTransaction(tx),
    chamberContractAddress: await chamber.getAddress() as Hex,
    escrowContractAddress: await escrow.getAddress() as Hex,
  });


  // Act: approve and deposit 1 tknA
  await tknA.approve(await chamber.getAddress(), 100n);
  // random transactions
  await chamber.deposit(0xffffffff123n, 11n, await tknA.getAddress());
  await chamber.deposit(0xffffffff234n, 20n, await tknA.getAddress());
  await chamber.deposit(0xffffffff345n, 10n, await tknA.getAddress());
  await chamber.deposit(0xffffffff456n, 25n, await tknA.getAddress());
  await chamber.deposit(0xffffffff567n, 34n, await tknA.getAddress());

  return { admin, bob, jill, bobAddr, tknA, tknB, chamber, escrow, mistActions };
}

describe("Chamber", function () {
  it("deposit and spend", async function () {
    const { admin, bobAddr, tknA, chamber } = await setup();

    // Arrange: compute the deposit key and expected tx hash
    const claimingKey = 1234n;
    const depositKey = await hash2(String(claimingKey), admin.address);
    const senderTxHash = await chamber.hashWithAsset(depositKey, await tknA.getAddress(), 1n);

    // Act: approve and deposit 1 tknA
    await tknA.approve(await chamber.getAddress(), 1n);
    // actual test transaction
    await chamber.deposit(depositKey, 1n, await tknA.getAddress());

    // Assert: tx exists in Chamber's array
    const [exists] = await chamber.transactionsExist([senderTxHash]);
    expect(exists).to.be.true;

    const transactions = await chamber.getTxArray();
    const { root, proof } = merkleProofForTx(transactions, senderTxHash);

    const witness = {
      ClaimingKey: claimingKey.toString(),
      Owner: admin.address,
      TxAsset: {
        Addr: await tknA.getAddress(),
        Amount: "1"
      },
      MerkleProof: proof,
      OwnerKey: "0",
      AuthDone: "0",
      Withdraw: {
        Addr: await tknA.getAddress(),
        Amount: "1"
      },
      WithdrawTo: bobAddr,
      MerkleRoot: root,
    };

    const proofResponse = await proveMist(witness)

    expect(proofResponse.status).to.equal("success");

    if (proofResponse.status == "success") {
      const proof = proofToContractArgs(proofResponse.proof);
      await chamber.handleZkp(proof, proofResponse.publicInputs);
      expect(String(await tknA.balanceOf(bobAddr))).to.equal("1");
    }
  });

  it("deposit and spend MISTActions", async function () {
    const { bobAddr, tknA, chamber, mistActions } = await setup();

    const amt = 1n;
    const request = mistActions.requestFunds(amt, await tknA.getAddress());

    await mistActions.deposit(request, amt);

    expect(await mistActions.checkStatus(request)).to.equal("PAID");

    await mistActions.withdrawEvm(request, bobAddr);

    expect(await chamber.nullified(BigInt(mistActions.requestNullifer(request)))).to.be.true;

    expect(await tknA.balanceOf(bobAddr)).to.equal(amt);
  });
});
