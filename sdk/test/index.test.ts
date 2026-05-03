import { beforeAll, describe, expect, it } from "vitest";
import { FIXTURES, MISTActions, proveEscrow } from "../src/index";

describe("proveEscrow", () => {
	it("generates a proof with FIXTURES.WITNESS", async () => {
		const result = await proveEscrow({ ...FIXTURES.WITNESS });
		expect(result.status).toBe("success");
	}, 30000);

	it("generates a proof without merkle", async () => {
		const { MerkleRoot: _root, ...witness } = FIXTURES.WITNESS;
		const result = await proveEscrow(witness);
		expect(result.status).toBe("success");
	}, 30000);

	it("generates a proof without escrow nullifier", async () => {
		const { EscrowNullifier: _null, ...witness } = FIXTURES.WITNESS;
		const result = await proveEscrow(witness);
		expect(result.status).toBe("success");
	}, 30000);

	it("generates a proof with partial recipient tx", async () => {
		const { RecipientTx: _rTx, ...witness } = FIXTURES.WITNESS;
		const result = await proveEscrow(witness);
		expect(result.status).toBe("success");
	}, 30000);

	it("generates a proof w/o merkle, escrow nullifier, and recipient tx", async () => {
		const { MerkleRoot: _root, EscrowNullifier: _null, RecipientTx: _rTx, ...witness } = FIXTURES.WITNESS;
		const result = await proveEscrow(witness);
		expect(result.status).toBe("success");
	}, 30000);
});

describe("mist actions escrow flow", async () => {

	const txArray = [1n, 2n, 3n]; // Mock transaction array

	const BLINDING = '0xdeadbeef';

	const mistAdmin = await MISTActions.init("0x1234", {
		getTxArray: async () => txArray,
		sendTransaction: async (tx) => tx,
		chamberContractAddress: '0xB1B2b3b000B1B2B3b000B1B2B3B000b1b2B3B000',
		escrowContractAddress: '0xA1A2A3a000A1a2A3a000a1A2A3A000A1a2A3a000',
	});

	const mistBob = await MISTActions.init("0x1234", {
		getTxArray: async () => txArray,
		sendTransaction: async (tx) => tx,
		chamberContractAddress: '0xB1B2b3b000B1B2B3b000B1B2B3B000b1b2B3B000',
		escrowContractAddress: '0xA1A2A3a000A1a2A3a000a1A2A3A000A1a2A3a000',
	});

	beforeAll(async () => {
	})

	it("handle escrow flow zkp", async () => {

		// bob wants to swap 100A for 5B in escrow with admin

		// bob request for 5B
		const recipientsRequest = mistBob.requestFunds(5n, '0xc0ffee00c0ffee00c0ffee00c0ffee00c0ffee00');

		// admin requests for 100A
		const adminRequest = mistAdmin.requestFunds(100n, '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');

		// parties share BLINDING, adminRequest and recipientsRequest

		// now admin makes escrow tx
		const escrowReq = await mistAdmin.escrowFund(adminRequest, recipientsRequest, BLINDING);

		//mock admins funded escrow
		txArray.push(BigInt(escrowReq.requestTxHash()));
		// mock admins request as paid premeptively
		txArray.push(BigInt(adminRequest.requestTxHash()));

		await mistBob.escrowClaim(adminRequest, recipientsRequest, BLINDING);

	}, 30000);

});