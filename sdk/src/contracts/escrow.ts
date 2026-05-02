import { hash2Sync, hash3Sync } from '@mistcash/sdk';
import { evmAddrToField } from './chamber';

const TRANSACTION_TUPLE = {
	type: 'tuple',
	components: [
		{ name: 'key', type: 'uint256' },
		{ name: 'token', type: 'address' },
		{ name: 'amount', type: 'uint256' },
	],
} as const;

export const ESCROW_ABI = [
	{
		type: 'function',
		name: 'depositAndConsumeEscrow',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'expectedNote', ...TRANSACTION_TUPLE },
			{ name: 'proof', type: 'uint256[8]' },
			{ name: 'input', type: 'uint256[3]' },
			{ name: 'mistProof', type: 'uint256[8]' },
			{ name: 'mistInput', type: 'uint256[10]' },
		],
		outputs: [],
	},
	{
		type: 'function',
		name: 'consumeEscrow',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'proof', type: 'uint256[8]' },
			{ name: 'input', type: 'uint256[3]' },
			{ name: 'mistProof', type: 'uint256[8]' },
			{ name: 'mistInput', type: 'uint256[10]' },
		],
		outputs: [],
	},
	{
		type: 'function',
		name: 'depositAndConsumeEscrowNoZk',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'expectedNote', ...TRANSACTION_TUPLE },
			{ name: 'expectedTx', type: 'uint256' },
			{ name: 'expectedTxProof', type: 'uint256[]' },
			{ name: 'escrowNote', ...TRANSACTION_TUPLE },
			{ name: 'escrowNoteProof', type: 'uint256[]' },
			{ name: 'recipient', type: 'address' },
		],
		outputs: [],
	},
	{
		type: 'function',
		name: 'consumeEscrowNoZk',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'expectedTx', type: 'uint256' },
			{ name: 'expectedTxProof', type: 'uint256[]' },
			{ name: 'escrowNote', ...TRANSACTION_TUPLE },
			{ name: 'escrowNoteProof', type: 'uint256[]' },
			{ name: 'recipient', type: 'address' },
		],
		outputs: [],
	},
	// ======== Events ========
	{
		type: 'event',
		name: 'EscrowConsumed',
		inputs: [{ name: 'escrowNullifier', type: 'uint256', indexed: true }],
	},
] as const;

export interface EscrowTransaction {
	key: bigint;
	token: `0x${string}`;
	amount: bigint;
}

// ======== Crypto Utilities ========
// Requires WASM to be initialized via init() from gnark module before use.

/**
 * Compute the escrow blinding factor.
 * = hash2(blinding, expectedTx)
 */
export function escrowBlinding(blinding: bigint, expectedTx: bigint): bigint {
	return BigInt(hash2Sync(blinding.toString(), expectedTx.toString()));
}

/**
 * Compute the deposit key used when depositing the escrow into Chamber.
 * = hash2(escrowBlinding, uint256(uint160(escrowAddr)))
 *
 * Pass this as `hash_` to chamber.deposit().
 */
export function escrowDepositKey(blinding: bigint, expectedTx: bigint, escrowAddr: string): bigint {
	const eb = escrowBlinding(blinding, expectedTx);
	return BigInt(hash2Sync(eb.toString(), evmAddrToField(escrowAddr).toString()));
}

/**
 * Compute the tx hash that lands in Chamber's merkle tree for the escrow deposit.
 * = hash3(escrowDepositKey, uint256(uint160(token)), amount)
 */
export function escrowTxHash(
	blinding: bigint,
	expectedTx: bigint,
	escrowAddr: string,
	tokenAddr: string,
	amount: bigint,
): bigint {
	const depositKey = escrowDepositKey(blinding, expectedTx, escrowAddr);
	return BigInt(hash3Sync(
		depositKey.toString(),
		evmAddrToField(tokenAddr).toString(),
		amount.toString(),
	));
}

/**
 * The claiming key passed as escrowNote.key to consumeEscrowNoZk.
 * = hash2(blinding, expectedTx)  (same as escrowBlinding)
 */
export function escrowClaimingKey(blinding: bigint, expectedTx: bigint): bigint {
	return escrowBlinding(blinding, expectedTx);
}

/**
 * Compute the escrow nullifier.
 * = hash3(hash2(escrowBlinding + 1, escrowAddr), token, amount)
 */
export function escrowNullifier(
	blinding: bigint,
	expectedTx: bigint,
	escrowAddr: string,
	tokenAddr: string,
	amount: bigint,
): bigint {
	const eb = escrowBlinding(blinding, expectedTx);
	const nullifierSecret = BigInt(hash2Sync(
		(eb + 1n).toString(),
		evmAddrToField(escrowAddr).toString(),
	));
	return BigInt(hash3Sync(
		nullifierSecret.toString(),
		evmAddrToField(tokenAddr).toString(),
		amount.toString(),
	));
}
