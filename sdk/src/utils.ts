import { calculateMerkleRootAndProof, prove_groth16, Witness } from '@mistcash/sdk';

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