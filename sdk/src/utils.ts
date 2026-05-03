import { calculateMerkleRootAndProof, hash2Sync, prove_groth16, Witness } from '@mistcash/sdk';

export function proveMist(witness: Witness) {
	witness.AuthDone = witness.AuthDone || "0";
	return prove_groth16(witness);
}

export function merkleProofForTx(transactions: bigint[], txHash: bigint, circuitRequiresItems = 20): { root: string, proof: string[] } {
	const txIndex = transactions.indexOf(txHash);
	if (txIndex === -1) {
		throw new Error(`Transaction hash not in array`);
	}
	const merkleProof = calculateMerkleRootAndProof(transactions, txIndex).map(e => e.toString());
	const merkleRoot = merkleProof.pop();
	return {
		root: merkleRoot || '0',
		proof: [...merkleProof, ...new Array(circuitRequiresItems - merkleProof.length).fill('0')]
	};
}

export { hash2, hash3, txHash, txSecret } from '@mistcash/sdk';

/**
 * Converts a character into hexadecimal character code
 * @param {string} char
 * @returns  {string} Hex representation of characters
 */
export const charCodeToHex = (char: string) => char.charCodeAt(0).toString(16).padStart(2, '0');

/**
 * Convert string to hexadecimal character code representation
 * @param {string} str Input string
 * @returns {Hex} Hexadecimal representation of the input string
 */
export function strToHex(str: string): Hex {
	return `0x${Array.from(str).map(charCodeToHex).join('')}`;
}

export type Hex = `0x${string}`;

/** Convert a human-readable USDC amount like "10.00" → 10_000_000n */
export function toTokenUnits(amount: string, decimals: number): bigint {
	return BigInt(Math.round(parseFloat(amount) * 10 ** decimals));
}

/** Inverse of toTokenUnits — for display */
export function fromTokenUnits(raw: bigint, decimals = 6): string {
	return (Number(raw) / 10 ** decimals).toFixed(2);
}
