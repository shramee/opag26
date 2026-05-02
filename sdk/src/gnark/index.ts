import { ProofFn, ProofResponse, WasmInstance } from './types';
import { decodeMAIN_WASM } from './wasm-main.embedded';
import './wasm_exec.js';
import WITNESS_JSON from './assignment.json';
import VK_JSON from './vk.json';
import PROOF_JSON from './proof.json';
import { initWasm, txHash } from '@mistcash/sdk';

const FIXTURES: {
	WITNESS: Witness, VK: typeof VK_JSON, PROOF: typeof PROOF_JSON
} = {
	WITNESS: WITNESS_JSON,
	VK: VK_JSON,
	PROOF: PROOF_JSON
};
export { FIXTURES };

export type Witness = typeof WITNESS_JSON;

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
export async function init(): Promise<ProofFn> {
	await initWasm(); // Ensure any necessary setup is done before accessing exports
	return (await getWasmInstance()).exports;
}

/**
 * Calls prove function from WASM module
 * @param witness Proof generation witness
 * @returns Proof response
 */
export async function proveEscrow(witness: Partial<Witness>): Promise<ProofResponse> {
	let proveEscrow = await init();

	witness.EscrowNullifier = txHash(
		(BigInt(witness.Blinding) + 1n).toString(),
		witness.Owner,
		witness.TxAsset.Addr,
		witness.TxAsset.Amount,
	).toString();

	return await proveEscrow(JSON.stringify(witness));
}
