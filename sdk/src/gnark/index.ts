import { ProofFn, ProofResponse, WasmInstance } from './types';
import { decodeMAIN_WASM } from './wasm-main.embedded';
import './wasm_exec.js';
import WITNESS_JSON from './assignment.json';
import VK_JSON from './vk.json';
import PROOF_JSON from './proof.json';
import mistcash from '@mistcash/sdk';
import type { WasmExports } from '@mistcash/sdk';
const { hash3Sync, hash_with_asset, initWasm, merkleRootFromPath, txHash } = mistcash;

export type EscrowWasmExports = WasmExports & { proveEscrow: ProofFn }

const FIXTURES: {
	WITNESS: WitnessStrict, VK: typeof VK_JSON, PROOF: typeof PROOF_JSON
} = {
	WITNESS: WITNESS_JSON,
	VK: VK_JSON,
	PROOF: PROOF_JSON
};
export { FIXTURES };

export type WitnessStrict = typeof WITNESS_JSON;
export type Witness = Omit<WitnessStrict, 'EscrowNullifier' | 'MerkleRoot' | 'RecipientTx'> & {
	// EscrowNullifier and MerkleRoot can be computed if not provided
	EscrowNullifier?: WitnessStrict['EscrowNullifier'];
	MerkleRoot?: WitnessStrict['MerkleRoot'];
	RecipientTx?: WitnessStrict['RecipientTx'];
};

// Shared state management
let wasmInstance: WasmInstance | null = null;

/**
 * Initializes the WASM module in Node.js environment
 */
export async function getWasmInstance(): Promise<WasmInstance> {
	if (wasmInstance) {
		return wasmInstance;
	}
	if (!globalThis.Go) {
		throw new Error('Go runtime not available after loading wasm_exec.js');
	}

	const go = new globalThis.Go();

	const wasmData = decodeMAIN_WASM();
	const wasmBuffer = wasmData.buffer as ArrayBuffer;
	const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);

	// Run the Go program
	go.run(result.instance);

	wasmInstance = await new Promise<WasmInstance>((resolve) =>
		setTimeout(
			() => {
				if (typeof (globalThis as any).proveEscrow != 'function') {
					throw new Error(`WASM export function '${'proveEscrow'}' not found in global scope`);
				}
				resolve({
					instance: result.instance,
					go,
					exports: (globalThis as any).proveEscrow,
				})
			},
			200,
		),
	);

	return wasmInstance;
}

/**
 * Initializes the WASM module in Node.js environment
 */
export async function init(): Promise<EscrowWasmExports> {
	const mistWasm = await initWasm(); // Ensure any necessary setup is done before accessing exports
	const proveBkp = (globalThis as any).prove;

	const proveEscrow = (await getWasmInstance()).exports;

	(globalThis as any).prove = proveBkp
	return { ...mistWasm, proveEscrow };
}

/**
 * Calls prove function from WASM module
 * @param witness Proof generation witness
 * @returns Proof response
 */
export async function proveEscrow(witness: Witness): Promise<ProofResponse> {
	const wasm = await init();

	witness.EscrowNullifier = witness.EscrowNullifier ?? txHash(
		(BigInt(hash3Sync(witness.Blinding, witness.SenderTx, witness.RecipientSecret)) + 1n).toString(),
		witness.Owner,
		witness.TxAsset.Addr,
		witness.TxAsset.Amount,
	).toString();

	witness.RecipientTx = witness.RecipientTx ?? hash_with_asset(
		witness.RecipientSecret,
		witness.TxAsset.Addr,
		witness.TxAsset.Amount,
	).toString();

	witness.MerkleRoot = witness.MerkleRoot ?? merkleRootFromPath(BigInt(witness.SenderTx), witness.MerkleProof.map((e: string) => BigInt(e))).toString();

	return await wasm.proveEscrow(JSON.stringify(witness));
}
