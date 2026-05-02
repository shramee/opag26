import { describe, expect, it } from "vitest";

import { add, FIXTURES, proveEscrow } from "../src/index";

describe("add", () => {
	it("returns the sum of two positive numbers", () => {
		expect(add(2, 3)).toBe(5);
	});

	it("handles negative values", () => {
		expect(add(-2, 3)).toBe(1);
	});
});

describe("proveEscrow", () => {
	it("generates a proof with FIXTURES.WITNESS", async () => {
		const result = await proveEscrow({ ...FIXTURES.WITNESS });
		expect(result.status).toBe("success");
	}, 30000);

	it("generates a proof when MerkleRoot is omitted (auto-computed from MerkleProof)", async () => {
		const { MerkleRoot: _root, ...witness } = FIXTURES.WITNESS;
		const result = await proveEscrow(witness);
		expect(result.status).toBe("success");
	}, 30000);
});
