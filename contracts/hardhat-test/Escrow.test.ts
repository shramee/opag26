import { expect } from "chai";
import { ethers } from "hardhat";
import { Chamber, DummyERC20, PoseidonHelper } from "../typechain-types";

describe("Chamber", function () {
  it("deposit adds a tx hash to the merkle tree", async function () {
    const [admin] = await ethers.getSigners();

    // Deploy Poseidon2 library and link it
    const Poseidon2Factory = await ethers.getContractFactory("Poseidon2");
    const poseidon2 = await Poseidon2Factory.deploy();
    const poseidonLib = { "src/Poseidon.sol:Poseidon2": await poseidon2.getAddress() };

    const tknA = (await ethers.deployContract("DummyERC20")) as DummyERC20;

    const ChamberFactory = await ethers.getContractFactory("Chamber", { libraries: poseidonLib });
    const chamber = (await ChamberFactory.deploy(admin.address, ethers.ZeroAddress)) as Chamber;

    const HasherFactory = await ethers.getContractFactory("PoseidonHelper", { libraries: poseidonLib });
    const hasher = (await HasherFactory.deploy()) as PoseidonHelper;

    // Arrange: compute the deposit key and expected tx hash
    const claimingKey = 1234n;
    const depositKey = await hasher.hash2(claimingKey, BigInt(admin.address));
    const expectedTxHash = await chamber.hashWithAsset(depositKey, await tknA.getAddress(), 1n);

    // Act: approve and deposit 1 tknA
    await tknA.approve(await chamber.getAddress(), 1n);
    await chamber.deposit(depositKey, 1n, await tknA.getAddress());

    // Assert: tx exists in Chamber's array
    const [exists] = await chamber.transactionsExist([expectedTxHash]);
    expect(exists).to.be.true;
  });
});
