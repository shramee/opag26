export const CHAMBER_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'hash_', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'asset_', type: 'address' },
    ],
    outputs: [],
  },
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
] as const
