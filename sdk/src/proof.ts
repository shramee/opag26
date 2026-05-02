import type { Proof, ProofResponse, SuccessResponse } from './gnark/types';

/**
 * Convert a gnark Groth16 Proof to the uint256[8] array expected by the EVM verifier.
 *
 * Encoding follows EIP-197:
 *   [Ar.X, Ar.Y, Bs.X.A1, Bs.X.A0, Bs.Y.A1, Bs.Y.A0, Krs.X, Krs.Y]
 *
 * Note: G2 Fp2 coefficients are stored A1-first (big-endian) per EIP-197 convention.
 */
export function proofToContractArgs(proof: Proof): readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] {
	return [
		BigInt(proof.Ar.X),
		BigInt(proof.Ar.Y),
		BigInt(proof.Bs.X.A1),
		BigInt(proof.Bs.X.A0),
		BigInt(proof.Bs.Y.A1),
		BigInt(proof.Bs.Y.A0),
		BigInt(proof.Krs.X),
		BigInt(proof.Krs.Y),
	] as const;
}

/** Convert publicInputs from ProofResponse to bigint[]. */
export function publicInputsToBigInt(publicInputs: (string | number)[]): bigint[] {
	return publicInputs.map((v) => BigInt(v));
}

/**
 * Extract proof and public inputs from a successful ProofResponse,
 * ready for passing to Chamber.handleZkp or Escrow.consumeEscrow.
 *
 * Throws if the response is an error.
 */
export function extractProofArgs(response: ProofResponse): {
	proof: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
	publicInputs: bigint[];
} {
	if (response.status === 'error') {
		throw new Error(`Proof generation failed: ${response.message}`);
	}
	return {
		proof: proofToContractArgs((response as SuccessResponse).proof),
		publicInputs: publicInputsToBigInt((response as SuccessResponse).publicInputs),
	};
}
