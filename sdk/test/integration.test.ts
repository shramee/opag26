/**
 * Integration tests against pre-deployed contracts.
 *
 * Copy .env.example to .env and fill in deployed contract addresses + RPC URL.
 * Tests are skipped automatically when addresses are missing or zero.
 */
import { describe, expect, it } from 'vitest';
import { createPublicClient, createWalletClient, http, getAddress, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import {
	CHAMBER_ABI,
	ESCROW_ABI,
	chamberDepositKey,
	chamberTxHash,
	chamberNullifier,
	escrowBlinding,
	escrowDepositKey,
	escrowTxHash,
	escrowClaimingKey,
	escrowNullifier,
	init,
} from '../src/index';

// ======== Env loading ========

function loadEnv(): Record<string, string> {
	const path = resolve(__dirname, '../.env');
	if (!existsSync(path)) return {};
	return Object.fromEntries(
		readFileSync(path, 'utf8')
			.split('\n')
			.filter((l) => l && !l.startsWith('#'))
			.map((l) => l.split('=').map((s) => s.trim()) as [string, string]),
	);
}

const env = loadEnv();
const RPC_URL = env.RPC_URL || 'http://127.0.0.1:8545';
const ZERO = '0x0000000000000000000000000000000000000000';
const chamberAddr = (env.CHAMBER_ADDRESS || ZERO) as Address;
const escrowAddr = (env.ESCROW_ADDRESS || ZERO) as Address;
const tknAAddr = (env.TOKEN_A_ADDRESS || ZERO) as Address;
const tknBAddr = (env.TOKEN_B_ADDRESS || ZERO) as Address;

const configured = chamberAddr !== ZERO && escrowAddr !== ZERO && tknAAddr !== ZERO;
const skip = !configured;

// ======== Clients ========

const publicClient = createPublicClient({ transport: http(RPC_URL) });

// Optional wallet for write tests — only needed if PRIVATE_KEY is set
const privateKey = env.PRIVATE_KEY as `0x${string}` | undefined;
const walletClient = privateKey
	? createWalletClient({ account: privateKeyToAccount(privateKey), transport: http(RPC_URL) })
	: null;

const ERC20_ABI = parseAbi([
	'function approve(address spender, uint256 amount) returns (bool)',
	'function balanceOf(address) view returns (uint256)',
	'function allowance(address owner, address spender) view returns (uint256)',
]);

// ======== Tests ========

describe.skipIf(skip)('Chamber read calls', () => {
	it('merkleRoot returns a uint256', async () => {
		const root = await publicClient.readContract({
			address: chamberAddr,
			abi: CHAMBER_ABI,
			functionName: 'merkleRoot',
		});
		expect(typeof root).toBe('bigint');
	});

	it('getTxArray returns an array', async () => {
		const txs = await publicClient.readContract({
			address: chamberAddr,
			abi: CHAMBER_ABI,
			functionName: 'getTxArray',
		});
		expect(Array.isArray(txs)).toBe(true);
	});

	it('hashWithAsset on-chain matches SDK chamberTxHash', async () => {
		await init();
		const claimingKey = 1234n;
		const recipient = getAddress('0x000000000000000000000000000000000000b0b0');
		const amount = 100n;

		const depositKey = chamberDepositKey(claimingKey, recipient);

		const onChain = await publicClient.readContract({
			address: chamberAddr,
			abi: CHAMBER_ABI,
			functionName: 'hashWithAsset',
			args: [depositKey, tknAAddr, amount],
		});

		const sdkResult = chamberTxHash(claimingKey, recipient, tknAAddr, amount);
		expect(sdkResult).toBe(onChain);
	});

	it('nullifiersSpent returns false for a fresh nullifier', async () => {
		await init(); // ensure WASM ready for hash functions
		const claimingKey = 0xdeadn;
		const recipient = getAddress('0x000000000000000000000000000000000000beef');
		const amount = 1n;
		const nullifier = chamberNullifier(claimingKey, recipient, tknAAddr, amount);

		const [spent] = await publicClient.readContract({
			address: chamberAddr,
			abi: CHAMBER_ABI,
			functionName: 'nullifiersSpent',
			args: [[nullifier]],
		});
		expect(spent).toBe(false);
	});

	it('transactionsExist returns false for a phantom tx', async () => {
		const [exists] = await publicClient.readContract({
			address: chamberAddr,
			abi: CHAMBER_ABI,
			functionName: 'transactionsExist',
			args: [[1n]],
		});
		expect(exists).toBe(false);
	});
});

describe.skipIf(skip || tknBAddr === ZERO)('Escrow read calls', () => {
	it('escrow.chamber() points to the configured chamber', async () => {
		const linked = await publicClient.readContract({
			address: escrowAddr,
			abi: parseAbi(['function chamber() view returns (address)']),
			functionName: 'chamber',
		});
		expect(getAddress(linked)).toBe(getAddress(chamberAddr));
	});

	it('SDK escrowTxHash matches on-chain hashWithAsset for escrow deposit key', async () => {
		await init();
		const blinding = 0xcafebaben;
		const expectedTx = 42n; // arbitrary stand-in for expectedTx
		const amount = 10_000n;

		const sdkDepositKey = escrowDepositKey(blinding, expectedTx, escrowAddr);
		const sdkTxHash = escrowTxHash(blinding, expectedTx, escrowAddr, tknBAddr, amount);

		const onChain = await publicClient.readContract({
			address: chamberAddr,
			abi: CHAMBER_ABI,
			functionName: 'hashWithAsset',
			args: [sdkDepositKey, tknBAddr, amount],
		});

		expect(sdkTxHash).toBe(onChain);
	});
});

describe.skipIf(skip || !walletClient)('Chamber write calls (requires PRIVATE_KEY)', () => {
	it('deposit adds a tx to the merkle tree', async () => {
		if (!walletClient) return;
		await init();

		const account = walletClient.account!;
		const claimingKey = BigInt(Date.now()); // unique each run
		const amount = 1n;

		const depositKey = chamberDepositKey(claimingKey, account.address);
		const expectedTx = chamberTxHash(claimingKey, account.address, tknAAddr, amount);

		// Approve
		const { request: approveReq } = await publicClient.simulateContract({
			account: account.address,
			address: tknAAddr,
			abi: ERC20_ABI,
			functionName: 'approve',
			args: [chamberAddr, amount],
		});
		await walletClient.writeContract(approveReq);

		// Deposit
		const { request: depositReq } = await publicClient.simulateContract({
			account: account.address,
			address: chamberAddr,
			abi: CHAMBER_ABI,
			functionName: 'deposit',
			args: [depositKey, amount, tknAAddr],
		});
		const hash = await walletClient.writeContract(depositReq);
		await publicClient.waitForTransactionReceipt({ hash });

		// Verify tx is in tree
		const [exists] = await publicClient.readContract({
			address: chamberAddr,
			abi: CHAMBER_ABI,
			functionName: 'transactionsExist',
			args: [[expectedTx]],
		});
		expect(exists).toBe(true);
	});
});
