import { describe, expect, it } from "vitest";

import { add } from "../src/index";

describe("add", () => {
	it("returns the sum of two positive numbers", () => {
		expect(add(2, 3)).toBe(5);
	});

	it("handles negative values", () => {
		expect(add(-2, 3)).toBe(1);
	});
});