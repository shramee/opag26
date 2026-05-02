import { describe, expect, it } from "vitest";

import { FIXTURES, proveEscrow } from "../src/index";

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
});

it("generates a proof w/o merkle, escrow nullifier, and recipient tx", async () => {
	const { MerkleRoot: _root, EscrowNullifier: _null, RecipientTx: _rTx, ...witness } = FIXTURES.WITNESS;
	const result = await proveEscrow(witness);
	expect(result.status).toBe("success");
}, 30000);
