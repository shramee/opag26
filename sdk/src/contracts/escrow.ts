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
] as const;

export interface EscrowTransaction {
	key: bigint;
	token: `0x${string}`;
	amount: bigint;
}
