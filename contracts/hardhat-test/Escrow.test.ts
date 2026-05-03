import { expect } from "chai";
import { ethers } from "hardhat";
import { Chamber, DummyERC20, Escrow } from "../typechain-types";
import { proveEscrow, proveMist, mistcash, proofToContractArgs, init, merkleProofForTx, hash2 } from "@opag26/sdk";

async function setup() {
  const [admin, bob, jill] = await ethers.getSigners();
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

  const EscrowFactory = await ethers.getContractFactory("Escrow");
  const escrow = (await EscrowFactory.deploy(await chamber.getAddress(), await EscrowVerifier.getAddress())) as unknown as Escrow;

  // Act: approve and deposit 1 tknA
  await tknA.approve(await chamber.getAddress(), 100n);
  // random transactions
  await chamber.deposit(0xffffffff123n, 11n, await tknA.getAddress());
  await chamber.deposit(0xffffffff234n, 20n, await tknA.getAddress());
  await chamber.deposit(0xffffffff345n, 10n, await tknA.getAddress());
  await chamber.deposit(0xffffffff456n, 25n, await tknA.getAddress());
  await chamber.deposit(0xffffffff567n, 34n, await tknA.getAddress());

  return { admin, bob, jill, bobAddr, tknA, tknB, chamber, escrow };
}

describe("Chamber", function () {
  it("deposit adds a tx hash to the merkle tree", async function () {
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
});

describe("Escrow", function () {
  const BLINDING = '0xcafebabe_deadbeef';

  async function prepareEscrow() {
    const { admin, bob, bobAddr, tknA, tknB, chamber, escrow } = await setup();
    await tknA.transfer(bobAddr, 100_000n);

    const expectedNote = {
      key: await hash2("1234", '0xb0b'),
      token: await tknA.getAddress(),
      amount: '2',
    };

    const senderTx = await chamber.hashWithAsset(
      expectedNote.key,
      expectedNote.token,
      expectedNote.amount,
    );

    const escrowClaimingKey = await hash2(BLINDING, String(senderTx));
    const escrowTxSecret = await hash2(escrowClaimingKey, await escrow.getAddress());

    const escrowNote = {
      key: escrowClaimingKey,
      token: await tknB.getAddress(),
      amount: '10000',
    };

    await tknB.approve(await chamber.getAddress(), escrowNote.amount);
    await chamber.deposit(escrowTxSecret, escrowNote.amount, escrowNote.token);

    const escrowTx = await chamber.hashWithAsset(
      escrowTxSecret,
      escrowNote.token,
      escrowNote.amount,
    );

    const txs = { expectedNote, escrowNote, senderTx, escrowTx, escrowClaimingKey };

    return {
      admin,
      bob,
      bobAddr,
      tknA,
      tknB,
      chamber,
      escrow,
      txs,
    };
  }

  it("depositAndConsumeEscrowNoZk releases escrow in one shot", async function () {
    const { bob, bobAddr, tknA, tknB, chamber, escrow, txs } = await prepareEscrow();
    const { expectedNote, escrowNote, senderTx, escrowTx } = txs;

    const nextTransactions = [...(await chamber.getTxArray()), senderTx];
    const { proof: senderTxProof } = merkleProofForTx(nextTransactions, senderTx);
    const { proof: escrowNoteProof } = merkleProofForTx(nextTransactions, escrowTx);

    await tknA.connect(bob).approve(await escrow.getAddress(), expectedNote.amount);
    await escrow.connect(bob).depositAndConsumeEscrowNoZk(
      expectedNote,
      senderTx,
      senderTxProof,
      escrowNote,
      escrowNoteProof,
      bobAddr,
    );

    const [senderTxExists] = await chamber.transactionsExist([senderTx]);
    const [escrowTxExists] = await chamber.transactionsExist([escrowTx]);

    expect(senderTxExists).to.equal(true);
    expect(escrowTxExists).to.equal(true);
    expect(await tknA.balanceOf(bobAddr)).to.equal(99_998n);
    expect(await tknB.balanceOf(bobAddr)).to.equal(10_000n);
  });

  it("depositAndConsumeEscrow with Zk", async function () {
    const { bob, bobAddr, tknA, tknB, chamber, escrow, txs } = await prepareEscrow();
    const { expectedNote, escrowNote, senderTx, escrowTx, escrowClaimingKey } = txs;

    const nextTransactions = [...(await chamber.getTxArray()), senderTx];
    const transactions = await chamber.getTxArray();
    const { proof: senderTxProof, root: merkleRoot } = merkleProofForTx(nextTransactions, senderTx);
    const { proof: escrowNoteProof } = merkleProofForTx(nextTransactions, escrowTx);

    await tknA.connect(bob).approve(await escrow.getAddress(), expectedNote.amount);

    const escrowProofResponse = await proveEscrow({
      Blinding: escrowNote.key,
      Owner: await escrow.getAddress(),
      TxAsset: {
        Addr: escrowNote.token,
        Amount: escrowNote.amount.toString(),
      },
      // EscrowNullifier: "EscrowNullifier",
      RecipientSecret: senderTx.toString(),
      SenderTx: senderTx.toString(),
      MerkleProof: senderTxProof,
      MerkleRoot: merkleRoot,
    }) as mistcash.SuccessResponse;

    if (escrowProofResponse.status !== "success") {
      throw new Error(`Escrow proof generation failed: ${JSON.stringify(escrowProofResponse, undefined, 2)}`);
    }

    const escrowProof = proofToContractArgs(escrowProofResponse.proof);

    const witness: mistcash.Witness = {
      ClaimingKey: escrowClaimingKey,
      Owner: await escrow.getAddress(),
      TxAsset: {
        Addr: expectedNote.token,
        Amount: expectedNote.amount.toString(),
      },
      MerkleProof: escrowNoteProof,
      MerkleRoot: merkleRoot,
      OwnerKey: "0",
      AuthDone: "0",
      Withdraw: {
        Addr: expectedNote.token,
        Amount: expectedNote.amount.toString(),
      },
      WithdrawTo: bobAddr,
    };

    const mistProofResp = await proveMist(witness) as mistcash.SuccessResponse;

    const mistProof = proofToContractArgs(mistProofResp.proof);

    await escrow.connect(bob).depositAndConsumeEscrow(
      expectedNote,
      escrowProof,
      [escrowProofResponse.publicInputs[0], escrowProofResponse.publicInputs[1], escrowProofResponse.publicInputs[2]], // Pass only the necessary public inputs for the Escrow proof verification
      mistProof,
      mistProofResp.publicInputs,
    );
    // await escrow.connect(bob).depositAndConsumeEscrow(
    //   expectedNote,
    //   senderTx,
    //   senderTxProof,
    //   escrowNote,
    //   escrowNoteProof,
    //   bobAddr,
    // );

    const [senderTxExists] = await chamber.transactionsExist([senderTx]);
    const [escrowTxExists] = await chamber.transactionsExist([escrowTx]);

    expect(senderTxExists).to.equal(true);
    expect(escrowTxExists).to.equal(true);
    expect(await tknA.balanceOf(bobAddr)).to.equal(99_998n);
    expect(await tknB.balanceOf(bobAddr)).to.equal(10_000n);
  });
});
