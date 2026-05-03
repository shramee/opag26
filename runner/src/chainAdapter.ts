import { CHAMBER_ABI, type Hex } from './sdk.ts';
import {
	createPublicClient,
	createWalletClient,
	defineChain,
	erc20Abi,
	http,
	type PublicClient,
	type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { AgentLogger } from './logger.ts';

export interface RunnerChainAdapter {
	getTxArray: () => Promise<bigint[]>;
	sendTransaction: (tx: { to: string; data: string }) => Promise<Hex>;
	chamberContractAddress: Hex;
	escrowContractAddress: Hex;
	publicClient: PublicClient;
	walletClient: WalletClient;
	address: Hex;
	getErc20Balance: (token: Hex) => Promise<bigint>;
}

export function makeChainAdapter(opts: {
	privateKey: Hex;
	rpcUrl: string;
	chainId: number;
	chamberAddress: Hex;
	escrowAddress: Hex;
	logger: AgentLogger;
}): RunnerChainAdapter {
	const account = privateKeyToAccount(opts.privateKey);

	const chain = defineChain({
		id: opts.chainId,
		name: `chain-${opts.chainId}`,
		nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
		rpcUrls: { default: { http: [opts.rpcUrl] } },
	});

	const transport = http(opts.rpcUrl);
	const publicClient = createPublicClient({ chain, transport });
	const walletClient = createWalletClient({ account, chain, transport });

	const sendTransaction = async (tx: { to: string; data: string }): Promise<Hex> => {
		await opts.logger.blockchain('sendTransaction.request', {
			to: tx.to,
			data: tx.data,
		});
		try {
			const hash = await walletClient.sendTransaction({
				account,
				chain,
				to: tx.to as Hex,
				data: tx.data as Hex,
			});
			const receipt = await publicClient.waitForTransactionReceipt({ hash });
			await opts.logger.blockchain('sendTransaction.confirmed', {
				hash,
				blockNumber: receipt.blockNumber.toString(),
				status: receipt.status,
			});
			return hash;
		} catch (error) {
			await opts.logger.blockchain('sendTransaction.failed', {
				to: tx.to,
				data: tx.data,
				error: String((error as Error).message ?? error),
			});
			throw error;
		}
	};

	const getTxArray = async (): Promise<bigint[]> => {
		try {
			const result = (await publicClient.readContract({
				address: opts.chamberAddress,
				abi: CHAMBER_ABI,
				functionName: 'getTxArray',
			})) as readonly bigint[];
			await opts.logger.blockchain('readContract.getTxArray', {
				contract: opts.chamberAddress,
				resultLength: result.length,
			});
			return [...result];
		} catch (error) {
			await opts.logger.blockchain('readContract.getTxArray.failed', {
				contract: opts.chamberAddress,
				error: String((error as Error).message ?? error),
			});
			throw error;
		}
	};

	const getErc20Balance = async (token: Hex): Promise<bigint> => {
		try {
			const balance = (await publicClient.readContract({
				address: token,
				abi: erc20Abi,
				functionName: 'balanceOf',
				args: [account.address],
			})) as bigint;
			await opts.logger.blockchain('readContract.balanceOf', {
				token,
				owner: account.address,
				balance: balance.toString(),
			});
			return balance;
		} catch (error) {
			await opts.logger.blockchain('readContract.balanceOf.failed', {
				token,
				owner: account.address,
				error: String((error as Error).message ?? error),
			});
			throw error;
		}
	};

	return {
		chamberContractAddress: opts.chamberAddress,
		escrowContractAddress: opts.escrowAddress,
		getTxArray,
		sendTransaction,
		publicClient,
		walletClient,
		address: account.address as Hex,
		getErc20Balance,
	};
}
