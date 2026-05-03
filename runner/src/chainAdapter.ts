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
		const hash = await walletClient.sendTransaction({
			account,
			chain,
			to: tx.to as Hex,
			data: tx.data as Hex,
		});
		await publicClient.waitForTransactionReceipt({ hash });
		return hash;
	};

	const getTxArray = async (): Promise<bigint[]> => {
		const result = (await publicClient.readContract({
			address: opts.chamberAddress,
			abi: CHAMBER_ABI,
			functionName: 'getTxArray',
		})) as readonly bigint[];
		return [...result];
	};

	const getErc20Balance = (token: Hex): Promise<bigint> =>
		publicClient.readContract({
			address: token,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [account.address],
		}) as Promise<bigint>;

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
