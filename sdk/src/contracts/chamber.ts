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
