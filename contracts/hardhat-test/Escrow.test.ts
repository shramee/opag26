import { expect } from "chai";
import { ethers } from "hardhat";
import { Chamber, DummyERC20, Escrow } from "../typechain-types";
import { MISTActions, proveMist, proofToContractArgs, init, merkleProofForTx, hash2, Hex, MISTTx, hash3 } from "@opag26/sdk";

async function setup() {
  const [admin, bob] = await ethers.getSigners();
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

  const mistAdmin = await MISTActions.init("0x1234", {
    getTxArray: () => chamber.getTxArray(),
    sendTransaction: async (tx) => admin.sendTransaction(tx),
    chamberContractAddress: await chamber.getAddress() as Hex,
    escrowContractAddress: await escrow.getAddress() as Hex,
  });

  const mistBob = await MISTActions.init("0x1234", {
    getTxArray: () => chamber.getTxArray(),
    sendTransaction: async (tx) => bob.sendTransaction(tx),
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

  return { admin, bob, bobAddr, tknA, tknB, chamber, escrow, mistAdmin, mistBob };
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
    const { bobAddr, tknA, chamber, mistAdmin } = await setup();

    const amt = 1n;
    const request = mistAdmin.requestFunds(amt, await tknA.getAddress());

    await mistAdmin.deposit(request);

    expect(await mistAdmin.checkStatus(request)).to.equal("PAID");

    await mistAdmin.withdrawEvm(request, bobAddr);

    expect(await chamber.nullified(BigInt(request.requestNullifer()))).to.be.true;

    expect(await tknA.balanceOf(bobAddr)).to.equal(amt);
  });
});

describe("Escrow", function () {
  const BLINDING = '0xcafebabe_deadbeef';

  async function escrowRequest(recipientsRequest: MISTTx, adminRequest: MISTTx, blinding: Hex): Promise<MISTTx> {
    const escrowReq: any = {
      amount: recipientsRequest.amount,
      token: recipientsRequest.token,
    }
    escrowReq._key = hash3(blinding, recipientsRequest.requestTxHash(), adminRequest.requestTxHash());
    return escrowReq;
  }

  it("escrow flow", async function () {
    const { admin, bob, bobAddr, tknA, tknB, mistAdmin, mistBob } = await setup();
    await tknA.transfer(bobAddr, 100_000n);

    // bob wants to swap 100A for 5B in escrow with admin

    // bob request for 5B
    const recipientsRequest = mistBob.requestFunds(5n, await tknB.getAddress());

    // admin requests for 100A
    const adminRequest = mistAdmin.requestFunds(100n, await tknA.getAddress());

    // parties share BLINDING, adminRequest and recipientsRequest

    // now admin makes escrow tx
    await mistAdmin.escrowFund(adminRequest, recipientsRequest, BLINDING);

    // now bob claims escrow
    await mistBob.escrowClaim(adminRequest, recipientsRequest, BLINDING);

    // bob's recipient request should now be paid
    expect(await mistAdmin.checkStatus(recipientsRequest)).to.equal("PAID");
  });
});
