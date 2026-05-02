import { hash2Sync, hash3Sync } from '@mistcash/sdk';

export const CHAMBER_ABI = [
	// ======== View / Read ========
	{
		type: 'function',
		name: 'merkleRoot',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'merkleRoots',
		stateMutability: 'view',
		inputs: [{ name: 'root', type: 'uint256' }],
		outputs: [{ name: '', type: 'bool' }],
	},
	{
		type: 'function',
		name: 'getTxArray',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256[]' }],
	},
	{
		type: 'function',
		name: 'merkleProof',
		stateMutability: 'view',
		inputs: [{ name: 'index', type: 'uint256' }],
		outputs: [{ name: '', type: 'uint256[]' }],
	},
	{
		type: 'function',
		name: 'computeProof',
		stateMutability: 'view',
		inputs: [{ name: 'index', type: 'uint256' }],
		outputs: [{ name: 'proof', type: 'uint256[]' }],
	},
	{
		type: 'function',
		name: 'computeRoot',
		stateMutability: 'pure',
		inputs: [
			{ name: 'leaf', type: 'uint256' },
			{ name: 'proof', type: 'uint256[]' },
		],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'merkleLeaves',
		stateMutability: 'view',
		inputs: [{ name: 'h', type: 'uint256' }],
		outputs: [{ name: '', type: 'uint256[]' }],
	},
	{
		type: 'function',
		name: 'assetsFromSecret',
		stateMutability: 'view',
		inputs: [{ name: 'txSecret', type: 'uint256' }],
		outputs: [
			{ name: 'amount', type: 'uint256' },
			{ name: 'addr', type: 'address' },
		],
	},
	{
		type: 'function',
		name: 'nullifiersSpent',
		stateMutability: 'view',
		inputs: [{ name: 'nullifiers_', type: 'uint256[]' }],
		outputs: [{ name: '', type: 'bool[]' }],
	},
	{
		type: 'function',
		name: 'nullified',
		stateMutability: 'view',
		inputs: [{ name: 'nullifier', type: 'uint256' }],
		outputs: [{ name: '', type: 'bool' }],
	},
	{
		type: 'function',
		name: 'transactionsExist',
		stateMutability: 'view',
		inputs: [{ name: 'transactions', type: 'uint256[]' }],
		outputs: [{ name: '', type: 'bool[]' }],
	},
	{
		type: 'function',
		name: 'hashWithAsset',
		stateMutability: 'pure',
		inputs: [
			{ name: 'secretsHash', type: 'uint256' },
			{ name: 'asset', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [{ name: '', type: 'uint256' }],
	},
	// ======== Write ========
	{
		type: 'function',
		name: 'deposit',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'hash_', type: 'uint256' },
			{ name: 'amount', type: 'uint256' },
			{ name: 'asset_', type: 'address' },
		],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'withdrawNoZk',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'claimingKey', type: 'uint256' },
			{ name: 'owner_', type: 'address' },
			{ name: 'amount', type: 'uint256' },
			{ name: 'asset_', type: 'address' },
			{ name: 'proof', type: 'uint256[]' },
		],
		outputs: [],
	},
	{
		type: 'function',
		name: 'seekAndHideNoZk',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'claimingKey', type: 'uint256' },
			{ name: 'owner_', type: 'address' },
			{ name: 'amount', type: 'uint256' },
			{ name: 'asset_', type: 'address' },
			{ name: 'proof', type: 'uint256[]' },
			{ name: 'newTxSecret', type: 'uint256' },
			{ name: 'newTxAmount', type: 'uint256' },
		],
		outputs: [],
	},
	{
		type: 'function',
		name: 'handleZkp',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'proof', type: 'uint256[8]' },
			{ name: 'input', type: 'uint256[10]' },
		],
		outputs: [
			{
				name: 'params',
				type: 'tuple',
				components: [
					{ name: 'owner', type: 'uint256' },
					{ name: 'authDone', type: 'bool' },
					{ name: 'withdrawAmt', type: 'uint256' },
					{ name: 'withdrawAsset', type: 'address' },
					{ name: 'withdrawTo', type: 'address' },
					{ name: 'merkleRoot', type: 'uint256' },
					{ name: 'nullifier', type: 'uint256' },
					{ name: 'tx1', type: 'uint256' },
					{ name: 'tx2', type: 'uint256' },
					{ name: 'payload', type: 'uint256' },
				],
			},
		],
	},
	// ======== Events ========
	{
		type: 'event',
		name: 'VerifierUpdated',
		inputs: [{ name: 'verifier', type: 'address', indexed: true }],
	},
] as const;

export interface ChamberAsset {
	amount: bigint;
	addr: `0x${string}`;
}

export interface ChamberPublicParams {
	owner: bigint;
	authDone: boolean;
	withdrawAmt: bigint;
	withdrawAsset: `0x${string}`;
	withdrawTo: `0x${string}`;
	merkleRoot: bigint;
	nullifier: bigint;
	tx1: bigint;
	tx2: bigint;
	payload: bigint;
}

// ======== Crypto Utilities ========
// Requires WASM to be initialized via init() from gnark module before use.

/** Convert an EVM address to a uint256 field element (uint256(uint160(addr))). */
export function evmAddrToField(addr: string): bigint {
	return BigInt(addr);
}

/**
 * Compute the deposit key stored in Chamber's assets mapping.
 * Mirrors Solidity: hash2(claimingKey, uint256(uint160(recipient)))
 */
export function chamberDepositKey(claimingKey: bigint, recipient: string): bigint {
	return BigInt(hash2Sync(claimingKey.toString(), evmAddrToField(recipient).toString()));
}

/**
 * Compute the hash with asset: hash3(secretsHash, uint256(uint160(asset)), amount).
 * Mirrors Chamber.hashWithAsset().
 */
export function chamberHashWithAsset(secretsHash: bigint, tokenAddr: string, amount: bigint): bigint {
	return BigInt(hash3Sync(
		secretsHash.toString(),
		evmAddrToField(tokenAddr).toString(),
		amount.toString(),
	));
}

/**
 * Compute the tx hash that lands in Chamber's merkle tree for a deposit.
 * = hash3(hash2(claimingKey, recipient), token, amount)
 */
export function chamberTxHash(claimingKey: bigint, recipient: string, tokenAddr: string, amount: bigint): bigint {
	const depositKey = chamberDepositKey(claimingKey, recipient);
	return chamberHashWithAsset(depositKey, tokenAddr, amount);
}

/**
 * Compute the nullifier for a Chamber transaction.
 * = hash3(hash2(claimingKey + 1, recipient), token, amount)
 */
export function chamberNullifier(claimingKey: bigint, recipient: string, tokenAddr: string, amount: bigint): bigint {
	const nullifierSecret = BigInt(hash2Sync(
		(claimingKey + 1n).toString(),
		evmAddrToField(recipient).toString(),
	));
	return chamberHashWithAsset(nullifierSecret, tokenAddr, amount);
}
