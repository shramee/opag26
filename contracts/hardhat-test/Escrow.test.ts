import { expect } from "chai";
import { ethers } from "hardhat";
import { Chamber, DummyERC20, Escrow, PoseidonHelper } from "../typechain-types";
import { proveEscrow, proveMist, mistcash, proofToContractArgs, init, merkleProofForTx, hash2 } from "@opag26/sdk";

async function setup() {
  const [admin, bob] = await ethers.getSigners();
  const bobAddr = bob.address;

  await init(); // Initialize the WASM module before running tests

  // Deploy Poseidon2 library and link it
  const Poseidon2Factory = await ethers.getContractFactory("Poseidon2");
  const poseidon2 = await Poseidon2Factory.deploy();
  const poseidonLib = { "src/Poseidon.sol:Poseidon2": await poseidon2.getAddress() };

  const tknA = (await ethers.deployContract("DummyERC20")) as unknown as DummyERC20;
  const tknB = (await ethers.deployContract("DummyERC20")) as unknown as DummyERC20;

  const ChamberVerifierFactory = await ethers.getContractFactory("ChamberVerifier");
  const chamberVerifier = (await ChamberVerifierFactory.deploy()) as unknown as Chamber;

  const ChamberFactory = await ethers.getContractFactory("Chamber", { libraries: poseidonLib });
  const chamber = (await ChamberFactory.deploy(admin.address, await chamberVerifier.getAddress())) as unknown as Chamber;

  const EscrowVerifierFactory = await ethers.getContractFactory("EscrowVerifier");
  const EscrowVerifier = (await EscrowVerifierFactory.deploy()) as unknown as Escrow;

  const EscrowFactory = await ethers.getContractFactory("Escrow", { libraries: poseidonLib });
  const escrow = (await EscrowFactory.deploy(await chamber.getAddress(), await EscrowVerifier.getAddress())) as unknown as Escrow;

  // Act: approve and deposit 1 tknA
  await tknA.approve(await chamber.getAddress(), 100n);
  // random transactions
  await chamber.deposit(0xffffffff123n, 11n, await tknA.getAddress());
  await chamber.deposit(0xffffffff234n, 20n, await tknA.getAddress());
  await chamber.deposit(0xffffffff345n, 10n, await tknA.getAddress());
  await chamber.deposit(0xffffffff456n, 25n, await tknA.getAddress());
  await chamber.deposit(0xffffffff567n, 34n, await tknA.getAddress());

  return { admin, bob, bobAddr, tknA, tknB, chamber, escrow };
}

describe("Chamber", function () {
  it("deposit adds a tx hash to the merkle tree", async function () {
    const { admin, bobAddr, tknA, chamber } = await setup();

    // Arrange: compute the deposit key and expected tx hash
    const claimingKey = 1234n;
    const depositKey = await hash2(String(claimingKey), admin.address);
    const expectedTxHash = await chamber.hashWithAsset(depositKey, await tknA.getAddress(), 1n);

    // Act: approve and deposit 1 tknA
    await tknA.approve(await chamber.getAddress(), 1n);
    // actual test transaction
    await chamber.deposit(depositKey, 1n, await tknA.getAddress());

    // Assert: tx exists in Chamber's array
    const [exists] = await chamber.transactionsExist([expectedTxHash]);
    expect(exists).to.be.true;

    const transactions = await chamber.getTxArray();
    const { root, proof } = merkleProofForTx(transactions, expectedTxHash);

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
});

describe("Escrow", function () {
  function prepareEscrow() {

  }

  it("deposit adds a tx hash to the merkle tree", async function () {
    const { admin, bob, bobAddr, tknA, tknB, chamber, escrow } = await setup();
    // Arrange: compute the deposit key and expected tx hash
    const claimingKey = '1234';
    const depositKey = await hash2(claimingKey, admin.address);
    const expectedTxHash = await chamber.hashWithAsset(depositKey, await tknA.getAddress(), 1n);

    // Act: approve and deposit 1 tknA
    await tknA.approve(await chamber.getAddress(), 1n);
    // actual test transaction
    await chamber.deposit(depositKey, 1n, await tknA.getAddress());

    // Assert: tx exists in Chamber's array
    const [exists] = await chamber.transactionsExist([expectedTxHash]);
    expect(exists).to.be.true;

    const transactions = await chamber.getTxArray();
    const { root, proof } = merkleProofForTx(transactions, expectedTxHash);

    const witness = {
      ClaimingKey: claimingKey,
      Owner: admin.address,
      TxAsset: {
        Addr: await tknA.getAddress(),
        Amount: "1"
      },
      MerkleProof: proof,
      MerkleRoot: root,
      Withdraw: {
        Addr: await tknA.getAddress(),
        Amount: "1"
      },
      WithdrawTo: bobAddr,
    };

    const proofResponse = await proveMist(witness)

    expect(proofResponse.status).to.equal("success");

    if (proofResponse.status == "success") {
      const proof = proofToContractArgs(proofResponse.proof);
      await chamber.handleZkp(proof, proofResponse.publicInputs);
      expect(String(await tknA.balanceOf(bobAddr))).to.equal("1");
    }
  });
});
