/**
 * MISTActions — Stateful gateway for the MIST private payment protocol.
 *
 * MIST lets you receive payments without revealing your identity on-chain.
 * Each payment request derives a unique one-time "hiding key" so that
 * multiple payments cannot be linked to the same recipient.
 *
 * Key derivation chain:
 *   masterKey (PRF/entropy)
 *     └── masterHidingKey  = h2('MasterHiding',  masterKey)   ← seeds per-tx keys
 *     └── accountAuthKey   = h2('ownerSecret',   masterKey)   ← proves ownership in ZK
 *         └── accountAddress = h2('I own this transaction', accountAuthKey) ← MIST identity
 *
 * Per request:
 *   claimingKey = h2(txIndex, masterHidingKey)   ← private, only known to requestor
 *   txSecret    = h2(claimingKey, ownerAddress)  ← public, embedded in payment URL
 *
 * Usage (requestor side):
 *   const mist    = new MISTActions(prfHex, localStorage);
 *   await mist.load();
 *   const request = mist.requestFunds('10.00', USDC_ADDRESS);
 *   const url     = mist.paymentUrl(request);   // share with payer
 *   // ...later...
 *   const status  = await mist.checkStatus(request, viemPublicClient, CHAMBER_ADDRESS);
 *   const txHash  = await mist.withdraw(request, myEvmAddress, walletClient, publicClient, CHAMBER_ADDRESS);
 *   await mist.save();
 *
 * Usage (payer side):
 *   const mist = new MISTActions(prfHex);
 *   await mist.depositToChain(request, walletClient, CHAMBER_ADDRESS, amountRaw);
 *   // — or bridge from any EVM chain —
 *   await mist.bridgePayment(request, walletClient, '1', amountRaw); // from Ethereum mainnet
 */

import {
	hash2Sync,
	txSecret as deriveTxSecret,
	txHash as deriveTxHash,
	full_prove,
	calculateMerkleRootAndProof,
	type Witness,
} from '@mistcash/sdk';
import { encodeFunctionData } from 'viem';
import { strToHex } from '@/lib/utils/nums';
import { bridgeToStarknet } from '@/lib/cctp';
import { getChainById } from '@/lib/cctp/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Hex = `0x${string}`;

/**
 * Pluggable persistence adapter.
 * Pass localStorage (browser), a Map, a DB wrapper, or anything with get/set.
 */
export interface StorageAdapter {
	get(key: string): string | null | Promise<string | null>;
	set(key: string, value: string): void | Promise<void>;
	del?(key: string): void | Promise<void>;
}

/**
 * A private payment request created by the requestor.
 * The public fields (amount, token, secrets) are safe to share.
 * The underscore-prefixed fields are private — only the creator knows them.
 */
export interface RequestMist {
	/** Human-readable amount, e.g. "10.00" */
	amount: string;
	/** ERC-20 token address on the payment chain (e.g. USDC) */
	token: string;
	/**
	 * Public payment secret — goes in the payment URL.
	 * txSecret = h2(claimingKey, ownerAddress).
	 * The payer calls chamber.deposit(txSecret, amount, token).
	 */
	secrets: string;
	/** claimingKey = h2(txIndex, masterHidingKey) — used for withdrawal auth */
	_key?: string;
	/**
	 * MIST owner identity used when this request was created.
	 * For ZK path: Poseidon-derived accountAddress.
	 * For EVM no-ZK path: uint256(uint160(evmWalletAddress)).
	 */
	_owner?: string;
	/** Monotonic index used to derive _key */
	_index?: number;
	_status?: 'PENDING' | 'PAID' | 'WITHDRAWN';
}

/** Serialisable snapshot of MISTActions state for backup / restore */
export interface MISTState {
	masterKey: Hex;
	txCount: number;
	requests: RequestMist[];
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

/** Minimal Chamber.sol ABI (EVM) — based on https://github.com/shramee/opag26 */
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
		outputs: [{ type: 'uint256' }],
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
		outputs: [],
	},
	{
		type: 'function',
		name: 'getTxArray',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ type: 'uint256[]' }],
	},
	{
		type: 'function',
		name: 'merkleRoot',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'merkleProof',
		stateMutability: 'view',
		inputs: [{ name: 'index', type: 'uint256' }],
		outputs: [{ type: 'uint256[]' }],
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
		name: 'hashWithAsset',
		stateMutability: 'pure',
		inputs: [
			{ name: 'secretsHash', type: 'uint256' },
			{ name: 'asset', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [{ type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'nullifiersSpent',
		stateMutability: 'view',
		inputs: [{ name: 'nullifiers_', type: 'uint256[]' }],
		outputs: [{ type: 'bool[]' }],
	},
	{
		type: 'function',
		name: 'transactionsExist',
		stateMutability: 'view',
		inputs: [{ name: 'transactions', type: 'uint256[]' }],
		outputs: [{ type: 'bool[]' }],
	},
] as const;

const ERC20_APPROVAL_ABI = [
	{
		type: 'function',
		name: 'approve',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'spender', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [{ name: '', type: 'bool' }],
	},
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function h2hex(a: string, b: string): Hex {
	return `0x${BigInt(hash2Sync(a, b)).toString(16)}`;
}

/** Convert a human-readable USDC amount like "10.00" → 10_000_000n */
export function toTokenUnits(amount: string, decimals = 6): bigint {
	return BigInt(Math.round(parseFloat(amount) * 10 ** decimals));
}

/** Inverse of toTokenUnits — for display */
export function fromTokenUnits(raw: bigint, decimals = 6): string {
	return (Number(raw) / 10 ** decimals).toFixed(2);
}

// ─── MISTActions ──────────────────────────────────────────────────────────────

export class MISTActions {
	// ── Identity ────────────────────────────────────────────────────────────────

	/** Raw master entropy (PRF output or BIP-39-derived hex) */
	readonly masterKey: Hex;

	/**
	 * Seeds all per-transaction hiding keys.
	 * masterHidingKey = h2('MasterHiding', masterKey)
	 * Never revealed on-chain; loss means inability to derive claiming keys.
	 */
	readonly masterHidingKey: Hex;

	/**
	 * Proves ownership inside the ZK circuit.
	 * accountAuthKey = h2('ownerSecret', masterKey)
	 */
	readonly accountAuthKey: Hex;

	/**
	 * Public MIST identity — the "owner" committed to in every request.
	 * accountAddress = h2('I own this transaction', accountAuthKey)
	 * Safe to share; reveals nothing about masterKey or individual payments.
	 */
	readonly accountAddress: Hex;

	// ── State ───────────────────────────────────────────────────────────────────

	/** Incremented each time requestFunds() is called. Determines claimingKey. */
	txCount = 0;

	/** All requests created by this instance (requestor role). */
	requests: RequestMist[] = [];

	private store?: StorageAdapter;

	// ── Construction ────────────────────────────────────────────────────────────

	constructor(masterKey: Hex | string, store?: StorageAdapter) {
		this.masterKey = masterKey as Hex;
		this.masterHidingKey = h2hex(strToHex('MasterHiding'), masterKey);
		this.accountAuthKey = h2hex(strToHex('ownerSecret'), masterKey);
		this.accountAddress = h2hex(strToHex('I own this transaction'), this.accountAuthKey);
		this.store = store;
	}

	// ─── Requesting funds ───────────────────────────────────────────────────────

	/**
	 * Create a new private payment request.
	 *
	 * Each call derives a fresh one-time claimingKey so that on-chain deposits
	 * for different requests are unlinkable.
	 *
	 * @param amount   Human-readable amount, e.g. "10.00"
	 * @param token    ERC-20 token address on the payment chain
	 * @param ownerAddress  Override the MIST identity (default: this.accountAddress).
	 *                      Pass an EVM wallet address (as Hex) when using the
	 *                      no-ZK EVM withdrawal path, so the contract can verify
	 *                      ownership via msg.sender.
	 */
	requestFunds(amount: string, token: string, ownerAddress?: Hex): RequestMist {
		const txIndex = this.txCount++;
		const owner = ownerAddress ?? this.accountAddress;

		// Derive a fresh one-time key for this payment slot
		const claimingKey = h2hex(`${txIndex}`, this.masterHidingKey);

		// txSecret commits claimingKey → owner without exposing either on-chain
		const secrets = `0x${BigInt(deriveTxSecret(claimingKey, owner)).toString(16)}` as Hex;

		const request: RequestMist = {
			amount,
			token,
			secrets,
			_key: claimingKey,
			_owner: owner,
			_index: txIndex,
			_status: 'PENDING',
		};

		this.requests.push(request);
		return request;
	}

	/**
	 * Recover a previously-created request by index.
	 * Useful when re-deriving state from the master key without stored history.
	 */
	deriveRequest(txIndex: number, amount: string, token: string, ownerAddress?: Hex): RequestMist {
		const owner = ownerAddress ?? this.accountAddress;
		const claimingKey = h2hex(`${txIndex}`, this.masterHidingKey);
		const secrets = `0x${BigInt(deriveTxSecret(claimingKey, owner)).toString(16)}` as Hex;
		return { amount, token, secrets, _key: claimingKey, _owner: owner, _index: txIndex, _status: 'PENDING' };
	}

	// ─── Payment URL ────────────────────────────────────────────────────────────

	/**
	 * Build the shareable payment URL for a request.
	 * The payer opens this link and pays from any supported chain.
	 */
	paymentUrl(request: RequestMist, baseUrl?: string): string {
		const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
		return `${base}/pay/${request.secrets}`;
	}

	/**
	 * Return only the public fields of a request — safe to pass to payers or
	 * store in an untrusted backend.
	 */
	publicRequest(request: RequestMist): Pick<RequestMist, 'amount' | 'token' | 'secrets'> {
		return { amount: request.amount, token: request.token, secrets: request.secrets };
	}

	// ─── Paying a request (payer role) ─────────────────────────────────────────

	/**
	 * Pay a request directly on an EVM chain that hosts the Chamber contract.
	 *
	 * Flow: ERC-20 approve → Chamber.deposit(txSecret, amount, token)
	 *
	 * @param request     The RequestMist to pay (only public fields needed)
	 * @param walletClient  Viem WalletClient connected to the correct chain
	 * @param chamberAddress  Chamber contract address on this chain
	 * @param amountRaw   Amount in token base units (e.g. 10_000_000n for 10 USDC).
	 *                    Typically toTokenUnits(request.amount) + fee.
	 */
	async depositToChain(
		request: RequestMist,
		walletClient: any,
		chamberAddress: Hex,
		amountRaw: bigint,
	): Promise<Hex> {
		const token = request.token as Hex;

		// Step 1 — authorise Chamber to pull the tokens
		await walletClient.sendTransaction({
			to: token,
			data: encodeFunctionData({
				abi: ERC20_APPROVAL_ABI,
				functionName: 'approve',
				args: [chamberAddress, amountRaw],
			}),
		});

		// Step 2 — lock tokens against this txSecret in the Chamber merkle tree
		return walletClient.sendTransaction({
			to: chamberAddress,
			data: encodeFunctionData({
				abi: CHAMBER_ABI,
				functionName: 'deposit',
				args: [BigInt(request.secrets), amountRaw, token],
			}),
		}) as Promise<Hex>;
	}

	/**
	 * Pay a request by bridging USDC from any supported EVM chain via CCTP.
	 *
	 * The txSecret is forwarded as hookData so the destination relayer can
	 * attribute the deposit to the correct request.
	 *
	 * @param request         The RequestMist to pay
	 * @param walletClient    Viem WalletClient on the source chain
	 * @param sourceChainId   EVM chain ID string, e.g. '1' (Ethereum), '8453' (Base)
	 * @param amountRaw       Amount in USDC base units (6 decimals)
	 * @param hookData        Optional override; defaults to encoding txSecret + amountRaw
	 */
	async bridgePayment(
		request: RequestMist,
		walletClient: any,
		sourceChainId: string,
		amountRaw: bigint,
		hookData?: Hex,
	) {
		const sourceChain = getChainById(sourceChainId);
		if (!sourceChain) throw new Error(`Unsupported source chain: ${sourceChainId}`);

		// Encode txSecret as hookData so the Starknet/EVM receiver can match the deposit
		const encodedHookData =
			hookData ??
			(encodeFunctionData({
				abi: [
					{
						type: 'function',
						name: '_',
						inputs: [
							{ name: 'txSecret', type: 'uint256' },
							{ name: 'amount', type: 'uint256' },
						],
						outputs: [],
						stateMutability: 'nonpayable',
					},
				],
				functionName: '_',
				args: [BigInt(request.secrets), amountRaw],
			}).slice(10) as Hex); // strip 4-byte selector — keep only ABI-encoded params

		return bridgeToStarknet({
			client: walletClient,
			amount: amountRaw,
			starknetRecipient: request.secrets as Hex,
			sourceChainId,
			hookData: `0x${encodedHookData}` as Hex,
		});
	}

	// ─── Status ─────────────────────────────────────────────────────────────────

	/**
	 * Check on-chain whether a request has been paid.
	 *
	 * Calls Chamber.assetsFromSecret(txSecret) — returns zero address if unpaid.
	 * Updates the in-memory _status on the request.
	 */
	async checkStatus(
		request: RequestMist,
		publicClient: any,
		chamberAddress: Hex,
	): Promise<'PENDING' | 'PAID' | 'WITHDRAWN'> {
		if (request._status === 'WITHDRAWN') return 'WITHDRAWN';

		const [amount, addr] = (await publicClient.readContract({
			address: chamberAddress,
			abi: CHAMBER_ABI,
			functionName: 'assetsFromSecret',
			args: [BigInt(request.secrets)],
		})) as [bigint, string];

		if (BigInt(addr) === 0n) return 'PENDING';

		request._status = 'PAID';
		return 'PAID';
	}

	/**
	 * Scan all PENDING requests and update their statuses.
	 * Returns the subset that are now PAID (ready to withdraw).
	 */
	async scanPayments(publicClient: any, chamberAddress: Hex): Promise<RequestMist[]> {
		const pending = this.requests.filter((r) => r._status === 'PENDING');
		await Promise.all(pending.map((r) => this.checkStatus(r, publicClient, chamberAddress)));
		return this.requests.filter((r) => r._status === 'PAID');
	}

	/**
	 * Verify a batch of txSecrets against the contract in a single call.
	 * Useful for quickly discovering which of many derived requests exist on-chain.
	 */
	async transactionsExist(
		txSecrets: string[],
		publicClient: any,
		chamberAddress: Hex,
	): Promise<boolean[]> {
		return publicClient.readContract({
			address: chamberAddress,
			abi: CHAMBER_ABI,
			functionName: 'transactionsExist',
			args: [txSecrets.map((s) => BigInt(s))],
		}) as Promise<boolean[]>;
	}

	// ─── Withdrawal (EVM — no ZK required) ──────────────────────────────────────

	/**
	 * Withdraw the full amount from a paid request using a merkle proof.
	 * No ZK proof needed — uses Chamber.withdrawNoZk.
	 *
	 * The `evmOwner` must match the address used as `ownerAddress` when
	 * requestFunds() was called (or this.accountAddress if none was provided).
	 * The contract verifies: txSecret == h2(claimingKey, uint256(uint160(evmOwner))).
	 *
	 * @param request       The PAID RequestMist (must have _key)
	 * @param evmOwner      EVM address to receive funds and authorise the withdrawal
	 * @param walletClient  Viem WalletClient
	 * @param publicClient  Viem PublicClient (read-only)
	 * @param chamberAddress  Chamber contract address
	 */
	async withdraw(
		request: RequestMist,
		evmOwner: Hex,
		walletClient: any,
		publicClient: any,
		chamberAddress: Hex,
	): Promise<Hex> {
		if (!request._key) throw new Error('Claiming key missing — only the requestor can withdraw');

		const amountRaw = toTokenUnits(request.amount);
		const txIndex = await this._locateTx(request, amountRaw, publicClient, chamberAddress);

		const merkleProofArr = (await publicClient.readContract({
			address: chamberAddress,
			abi: CHAMBER_ABI,
			functionName: 'merkleProof',
			args: [BigInt(txIndex)],
		})) as bigint[];

		const txHash = await walletClient.sendTransaction({
			to: chamberAddress,
			data: encodeFunctionData({
				abi: CHAMBER_ABI,
				functionName: 'withdrawNoZk',
				args: [BigInt(request._key), evmOwner, amountRaw, request.token as Hex, merkleProofArr],
			}),
		});

		request._status = 'WITHDRAWN';
		return txHash as Hex;
	}

	/**
	 * Partially withdraw from a paid request and re-wrap the remainder into a
	 * new private transaction (seekAndHideNoZk).
	 *
	 * @param withdrawAmount  Amount to send to evmOwner (in token base units)
	 * @returns The on-chain tx hash and the new RequestMist for the remainder
	 */
	async partialWithdraw(
		request: RequestMist,
		withdrawAmount: bigint,
		evmOwner: Hex,
		walletClient: any,
		publicClient: any,
		chamberAddress: Hex,
	): Promise<{ txHash: Hex; remainder: RequestMist }> {
		if (!request._key) throw new Error('Claiming key missing — only the requestor can withdraw');

		const amountRaw = toTokenUnits(request.amount);
		if (withdrawAmount >= amountRaw) {
			throw new Error('withdrawAmount must be less than the request amount; use withdraw() for full withdrawal');
		}

		const txIndex = await this._locateTx(request, amountRaw, publicClient, chamberAddress);

		const merkleProofArr = (await publicClient.readContract({
			address: chamberAddress,
			abi: CHAMBER_ABI,
			functionName: 'merkleProof',
			args: [BigInt(txIndex)],
		})) as bigint[];

		const remainderAmount = amountRaw - withdrawAmount;
		// Create a new request for the re-wrapped remainder
		const remainder = this.requestFunds(
			fromTokenUnits(remainderAmount),
			request.token,
			request._owner as Hex | undefined,
		);

		const txHash = (await walletClient.sendTransaction({
			to: chamberAddress,
			data: encodeFunctionData({
				abi: CHAMBER_ABI,
				functionName: 'seekAndHideNoZk',
				args: [
					BigInt(request._key),
					evmOwner,
					amountRaw,
					request.token as Hex,
					merkleProofArr,
					BigInt(remainder.secrets),
					remainderAmount,
				],
			}),
		})) as Hex;

		request._status = 'WITHDRAWN';
		return { txHash, remainder };
	}

	// ─── Withdrawal (ZK proof — Starknet / EVM handleZkp) ───────────────────────

	/**
	 * Generate a Groth16 zero-knowledge proof and submit a private withdrawal.
	 *
	 * This is the fully-private path: the claimingKey and owner are never exposed
	 * on-chain. Two output transactions are appended for indistinguishability.
	 *
	 * Compatible with both the Starknet Chamber (via submitProof callback) and
	 * the EVM Chamber.handleZkp (pass a viem-based submitProof).
	 *
	 * @param request       PAID RequestMist (must have _key and _owner)
	 * @param withdrawTo    Address that receives the withdrawn funds
	 * @param txLeaves      Array of all tx hashes from the merkle tree (getTxArray)
	 * @param merkleRoot    Current merkle root
	 * @param submitProof   Callback that submits the generated proof array to the contract
	 */
	async withdrawZk(
		request: RequestMist,
		withdrawTo: string,
		txLeaves: bigint[],
		merkleRoot: bigint,
		submitProof: (
			proof: string[],
		) => Promise<{ success: boolean; transactionHash?: string; error?: string }>,
	): Promise<string> {
		if (!request._key || !request._owner) {
			throw new Error('Private fields (_key, _owner) missing — only the requestor can withdraw');
		}

		const amountRaw = toTokenUnits(request.amount);
		const tokenAddr = request.token;

		// Locate this request's tx hash in the merkle tree
		const txHashVal = BigInt(
			deriveTxHash(request._key, request._owner, tokenAddr, amountRaw.toString()),
		);
		const txIndex = txLeaves.findIndex((leaf) => leaf === txHashVal);
		if (txIndex === -1) throw new Error('Transaction not found in merkle tree — has it been paid?');

		// Compute merkle path (last element is the root; exclude it)
		const merkleProofWithRoot = calculateMerkleRootAndProof(txLeaves, txIndex);
		const proofPath = merkleProofWithRoot
			.slice(0, -1)
			.map((bi: bigint) => bi.toString());
		const paddedProof = [...proofPath, ...new Array(20 - proofPath.length).fill('0')];

		// New transaction secret for the "change" output (amount 0 = full withdrawal)
		const newTxSecret = deriveTxSecret(request._key, withdrawTo);

		const witness: Witness = {
			ClaimingKey: request._key,
			Owner: request._owner,
			OwnerKey: this.accountAuthKey,
			TxAsset: { Amount: amountRaw.toString(), Addr: tokenAddr },
			AuthDone: '1',
			MerkleProof: paddedProof,
			MerkleRoot: merkleRoot.toString(),
			Withdraw: { Amount: amountRaw.toString(), Addr: tokenAddr },
			WithdrawTo: withdrawTo,
			Tx1Secret: newTxSecret.toString(),
		};

		const rawProof = await full_prove(witness);
		// First element is metadata; remainder are the proof field elements
		const proofStrings = rawProof.slice(1).map((p: { toString(): string }) => p.toString());

		const result = await submitProof(proofStrings);
		if (!result.success) throw new Error(result.error ?? 'ZK withdrawal failed');

		request._status = 'WITHDRAWN';
		return result.transactionHash ?? '';
	}

	/**
	 * Convenience method: fetch merkle state from an EVM Chamber and run withdrawZk.
	 * Requires a viem PublicClient and a WalletClient.
	 */
	async withdrawZkEvm(
		request: RequestMist,
		withdrawTo: string,
		publicClient: any,
		walletClient: any,
		chamberAddress: Hex,
	): Promise<string> {
		const [txLeaves, merkleRoot] = await Promise.all([
			publicClient.readContract({
				address: chamberAddress,
				abi: CHAMBER_ABI,
				functionName: 'getTxArray',
			}) as Promise<bigint[]>,
			publicClient.readContract({
				address: chamberAddress,
				abi: CHAMBER_ABI,
				functionName: 'merkleRoot',
			}) as Promise<bigint>,
		]);

		return this.withdrawZk(request, withdrawTo, txLeaves, merkleRoot, async (proof) => {
			try {
				const txHash = await walletClient.writeContract({
					address: chamberAddress,
					abi: CHAMBER_ABI,
					functionName: 'handleZkp',
					args: [proof.slice(0, 8), proof.slice(8, 18)],
				});
				return { success: true, transactionHash: txHash };
			} catch (err) {
				return { success: false, error: String(err) };
			}
		});
	}

	// ─── Key discovery ───────────────────────────────────────────────────────────

	/**
	 * Scan the chain for any paid requests in a given index range.
	 * Useful when restoring from masterKey alone (no stored request history).
	 *
	 * For each index in [startIndex, startIndex + count), derives the claimingKey
	 * and txSecret, then batch-checks existence on-chain.
	 *
	 * @returns Array of paid requests found, ready for withdrawal
	 */
	async discoverPayments(
		token: string,
		amount: string,
		publicClient: any,
		chamberAddress: Hex,
		startIndex = 0,
		count = 20,
		ownerAddress?: Hex,
	): Promise<RequestMist[]> {
		const candidates = Array.from({ length: count }, (_, i) =>
			this.deriveRequest(startIndex + i, amount, token, ownerAddress),
		);

		const exists = await this.transactionsExist(
			candidates.map((r) => r.secrets),
			publicClient,
			chamberAddress,
		);

		return candidates
			.filter((_, i) => exists[i])
			.map((r) => ({ ...r, _status: 'PAID' as const }));
	}

	// ─── Persistence ────────────────────────────────────────────────────────────

	/** Persist current state via the configured StorageAdapter. */
	async save(): Promise<void> {
		if (!this.store) return;
		await this.store.set(
			'mist_actions_state',
			JSON.stringify({ txCount: this.txCount, requests: this.requests }),
		);
	}

	/** Restore state from the StorageAdapter (call after construction). */
	async load(): Promise<void> {
		if (!this.store) return;
		const raw = await this.store.get('mist_actions_state');
		if (!raw) return;
		const { txCount, requests } = JSON.parse(raw) as Pick<MISTState, 'txCount' | 'requests'>;
		this.txCount = txCount;
		this.requests = requests;
	}

	// ─── Export / restore ────────────────────────────────────────────────────────

	/** Snapshot the full state as a plain object (e.g. for encrypted backup). */
	exportState(): MISTState {
		return {
			masterKey: this.masterKey,
			txCount: this.txCount,
			requests: this.requests,
		};
	}

	/** Restore a MISTActions instance from a previously exported snapshot. */
	static fromState(state: MISTState, store?: StorageAdapter): MISTActions {
		const instance = new MISTActions(state.masterKey, store);
		instance.txCount = state.txCount;
		instance.requests = state.requests;
		return instance;
	}

	// ─── Private helpers ─────────────────────────────────────────────────────────

	/** Find the index of a request's tx hash in the on-chain merkle tree. */
	private async _locateTx(
		request: RequestMist,
		amountRaw: bigint,
		publicClient: any,
		chamberAddress: Hex,
	): Promise<number> {
		const [txArray, txHashOnChain] = await Promise.all([
			publicClient.readContract({
				address: chamberAddress,
				abi: CHAMBER_ABI,
				functionName: 'getTxArray',
			}) as Promise<bigint[]>,
			publicClient.readContract({
				address: chamberAddress,
				abi: CHAMBER_ABI,
				functionName: 'hashWithAsset',
				args: [BigInt(request.secrets), request.token as Hex, amountRaw],
			}) as Promise<bigint>,
		]);

		const idx = (txArray as bigint[]).findIndex((leaf) => leaf === txHashOnChain);
		if (idx === -1) throw new Error('Transaction not found in merkle tree — not yet paid?');
		return idx;
	}
}