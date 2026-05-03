import {
	hash2Sync as hash2,
	txSecret as deriveTxSecret,
	txHash,
	type Witness,
	hash_with_asset,
} from '@mistcash/sdk';
import { encodeFunctionData, erc20Abi } from 'viem';
import { CHAMBER_ABI } from './contracts/chamber';
import { Hex, merkleProofForTx, proveMist, strToHex, toTokenUnits } from './utils';
import { init } from './gnark';
import { ProofResponse } from './gnark/types';
import { proofToContractArgs } from './proof';
import { hash } from 'node:crypto';

export * from './utils';
export * from './gnark';
export * from './contracts/chamber';
export * from './contracts/escrow';
export * from './proof';
export * as mistcash from '@mistcash/sdk';

/**
 * Pluggable persistence adapter.
 * Pass localStorage (browser), a Map, a DB wrapper, or anything with get/set.
 */
export interface StorageAdapter {
	get(key: string): string | null | Promise<string | null>;
	set(key: string, value: string): void | Promise<void>;
}

/**
 * A private payment request created by the requestor.
 * The public fields (amount, token, secrets) are safe to share.
 * The underscore-prefixed fields are private — only the creator knows them.
 */
export interface RequestMIST {

	amount: bigint;
	token: string; // token address
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
	txCount: number;
	requests: RequestMIST[];
}

interface ChainAdapter {
	getTxArray: () => Promise<bigint[]>;
	sendTransaction: (tx: {
		to: string;
		data: string;
	}) => Promise<any>;
	chamberContractAddress: Hex;
	escrowContractAddress: Hex;
}

/**
 * MISTActions — Stateful gateway for the MIST private payment protocol.
 *
 * MIST lets you receive payments without revealing your identity on-chain.
 * Each payment request derives a unique one-time "hiding key" so that
 * multiple payments cannot be linked to the same recipient.
 *
 * Key derivation chain:
 *   masterKey
 *     └── masterHidingKey  = h2('masterHiding',  masterKey)   ← seeds per-tx keys
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
 *   // ...later...
 *   const status  = await mist.checkStatus(request, viemPublicClient, CHAMBER_ADDRESS);
 *   const txHash  = await mist.withdraw(request, myEvmAddress, walletClient, publicClient, CHAMBER_ADDRESS);
 *   await mist.save();
 *
 * Usage (payer side):
 *   const mist = new MISTActions(prfHex);
 *   await mist.deposit(request, walletClient, CHAMBER_ADDRESS, amountRaw);
 */
export class MISTActions {
	_chainAdapter: ChainAdapter;

	/** Raw master entropy (PRF output or BIP-39-derived hex) */
	readonly masterKey: Hex;

	/**
	 * Seeds all per-transaction hiding keys.
	 * masterHidingKey = h2('masterHiding', masterKey)
	 * Never revealed on-chain; loss means inability to derive claiming keys.
	 */
	readonly masterHidingKey: string;

	/**
	 * Proves ownership inside the ZK circuit.
	 * accountAuthKey = h2('ownerSecret', masterKey)
	 */
	readonly accountAuthKey: string;

	/**
	 * Public MIST identity — the "owner" committed to in every request.
	 * accountAddress = h2('I own this transaction', accountAuthKey)
	 * Safe to share; reveals nothing about masterKey or individual payments.
	 */
	readonly accountAddress: string;

	// ── State ───────────────────────────────────────────────────────────────────

	/** Incremented each time requestFunds() is called. Determines claimingKey. */
	txCount = 0;

	/** All requests created by this instance (requestor role). */
	requests: RequestMIST[] = [];

	private store?: StorageAdapter;

	// ── Construction ────────────────────────────────────────────────────────────

	static async init(masterKey: Hex | string, _chainAdapter: ChainAdapter, store?: StorageAdapter): Promise<MISTActions> {
		await init();
		return new MISTActions(masterKey, _chainAdapter, store);
	}

	private constructor(masterKey: Hex | string, _chainAdapter: ChainAdapter, store?: StorageAdapter) {
		this.masterKey = masterKey as Hex;
		this.masterHidingKey = hash2(strToHex('masterHiding'), masterKey);
		this.accountAuthKey = hash2(strToHex('ownerSecret'), masterKey);
		this.accountAddress = hash2(strToHex('I own this transaction'), this.accountAuthKey.toString());
		this.store = store;
		this._chainAdapter = _chainAdapter;
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
	 * @param recipient The recipient of the payment
	 */
	requestFunds(amount: string | bigint, token: string, recipient?: string): RequestMIST {
		const txIndex = this.txCount++;
		const owner = recipient || this.accountAddress;

		const claimingKey = hash2(`${txIndex}`, this.masterHidingKey);
		const secrets = `0x${BigInt(deriveTxSecret(claimingKey, owner)).toString(16)}` as Hex;

		const request: RequestMIST = {
			amount: typeof amount === 'string' ? toTokenUnits(amount, 18) : amount,
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

	// ─── Paying a request (payer role) ─────────────────────────────────────────

	/**
	 * Pay a request directly on an EVM chain that hosts the Chamber contract.
	 *
	 * Flow: ERC-20 approve → Chamber.deposit(txSecret, amount, token)
	 *
	 * @param request     The RequestMIST to pay (only public fields needed)
	 * @param amountRaw   Amount in token base units (e.g. 10_000_000n for 10 USDC).
	 *                    Typically toTokenUnits(request.amount) + fee.
	 */
	async deposit(
		request: RequestMIST,
		amountRaw: bigint,
	): Promise<Hex> {
		const token = request.token as Hex;

		await this._chainAdapter.sendTransaction({
			to: token,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: 'approve',
				args: [this._chainAdapter.chamberContractAddress, amountRaw],
			}),
		});

		return this._chainAdapter.sendTransaction({
			to: this._chainAdapter.chamberContractAddress,
			data: encodeFunctionData({
				abi: CHAMBER_ABI,
				functionName: 'deposit',
				args: [BigInt(request.secrets), amountRaw, token],
			}),
		}) as Promise<Hex>;
	}

	// ─── Status ─────────────────────────────────────────────────────────────────

	/**
	 * Check on-chain whether a request has been paid.
	 *
	 * Calls Chamber.assetsFromSecret(txSecret) — returns zero address if unpaid.
	 * Updates the in-memory _status on the request.
	 */
	async checkStatus(
		request: RequestMIST
	): Promise<'PENDING' | 'PAID' | 'WITHDRAWN'> {
		if (request._status === 'WITHDRAWN') return 'WITHDRAWN';

		const txLeaves = await this._getTxArray();
		const addr = this.requestTxHash(request);

		if (txLeaves.indexOf(BigInt(addr)) === -1) return 'PENDING';

		request._status = 'PAID';
		return 'PAID';
	}

	/**
	 * Scan all PENDING requests and update their statuses.
	 * Returns the subset that are now PAID (ready to withdraw).
	 */
	async scanPayments(): Promise<RequestMIST[]> {
		const pending = this.requests.filter((r) => r._status === 'PENDING');
		const txLeaves = await this._getTxArray();
		await Promise.all(pending.map((r) => this.checkStatus(r)));
		return this.requests.filter((r) => r._status === 'PAID');
	}

	// ─── Withdrawal (ZK proof — handleZkp) ───────────────────────

	/**
	 * Generate a Groth16 zero-knowledge proof and submit a private withdrawal.
	 *
	 * This is the fully-private path: the claimingKey and owner are never exposed
	 * on-chain. Two output transactions are appended for indistinguishability.
	 *
	 * Compatible with both the Starknet Chamber (via submitProof callback) and
	 * the EVM Chamber.handleZkp (pass a viem-based submitProof).
	 *
	 * @param request       PAID RequestMIST (must have _key and _owner)
	 * @param withdrawTo    Address that receives the withdrawn funds
	 * @param txLeaves      Array of all tx hashes from the merkle tree (getTxArray)
	 * @param merkleRoot    Current merkle root
	 * @param submitProof   Callback that submits the generated proof array to the contract
	 */
	async withdrawZkp(
		request: RequestMIST,
		withdrawTo: string,
		txLeaves: bigint[],
		submitProof: (
			proof: ProofResponse,
		) => Promise<{ success: boolean; transactionHash?: string; error?: string }>,
	): Promise<string> {
		if (!request._key || !request._owner) {
			throw new Error('Private fields (_key, _owner) missing — only the requestor can withdraw');
		}
		const tokenAddr = request.token;
		const txHashVal = BigInt(
			txHash(request._key, request._owner, tokenAddr, request.amount.toString()),
		);
		const txIndex = txLeaves.findIndex((leaf) => leaf === txHashVal);
		if (txIndex === -1) throw new Error('Transaction not found in merkle tree — has it been paid?');

		const { root, proof } = merkleProofForTx(txLeaves, txHashVal);
		const newTxSecret = deriveTxSecret(request._key, withdrawTo);

		const witness: Witness = {
			ClaimingKey: request._key,
			Owner: request._owner,
			OwnerKey: this.accountAuthKey,
			TxAsset: { Amount: request.amount.toString(), Addr: tokenAddr },
			AuthDone: '1',
			MerkleProof: proof,
			MerkleRoot: root,
			Withdraw: { Amount: request.amount.toString(), Addr: tokenAddr },
			WithdrawTo: withdrawTo,
			Tx1Secret: newTxSecret.toString(),
		};

		const proofResp = await proveMist(witness);

		const result = await submitProof(proofResp);
		if (!result.success) throw new Error(result.error ?? 'ZK withdrawal failed');

		request._status = 'WITHDRAWN';
		this.save();
		return result.transactionHash ?? '';
	}

	requestTxHash(request: RequestMIST): string {
		return hash_with_asset(request.secrets, request.token, request.amount.toString());
	}

	requestNullifer(request: RequestMIST): string {
		const nullifierKey = BigInt(request._key || 0) + 1n;
		const nullifierSecret = hash2(nullifierKey.toString(), request._owner || '0');
		return hash_with_asset(nullifierSecret.toString(), request.token, request.amount.toString());
	}

	/**
	 * Convenience method: fetch merkle state from an EVM Chamber and run withdrawZkp.
	 * Requires a viem PublicClient and a WalletClient.
	 */
	async withdrawEvm(
		request: RequestMIST,
		withdrawTo: string,
	): Promise<string> {
		const txLeaves = await this._getTxArray();

		return this.withdrawZkp(request, withdrawTo, txLeaves, async (proofResp: ProofResponse) => {
			if (proofResp.status == "success") {
				const proofArgs = proofToContractArgs(proofResp.proof) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
				const publicInputs = proofResp.publicInputs as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

				const txHash = await this._chainAdapter.sendTransaction({
					to: this._chainAdapter.chamberContractAddress,
					data: encodeFunctionData({
						abi: CHAMBER_ABI,
						functionName: 'handleZkp',
						args: [proofArgs, publicInputs],
					}),
				});
				return { success: true, transactionHash: txHash };
			} else {
				return { success: false, error: `Proof failed ${JSON.stringify(proofResp, undefined, 2)}` };
			}
		});
	}

	/**
	 * Recover a previously-created request by index.
	 * Useful when re-deriving state from the master key without stored history.
	 */
	deriveRequest(txIndex: number, amount: bigint, token: string, ownerAddress?: Hex): RequestMIST {
		const owner = ownerAddress ?? this.accountAddress;
		const claimingKey = hash2(`${txIndex}`, this.masterHidingKey);
		const secrets = `0x${BigInt(deriveTxSecret(claimingKey, owner)).toString(16)}` as Hex;
		return { amount, token, secrets, _key: claimingKey, _owner: owner, _index: txIndex, _status: 'PENDING' };
	}

	// ─── Persistence ────────────────────────────────────────────────────────────

	/** Persist current state via the configured StorageAdapter. */
	async save(): Promise<void> {
		if (!this.store) return;
		await this.store.set(
			'mist_tx_count',
			JSON.stringify({ txCount: this.txCount }),
		);
		await this.store.set(
			'mist_requests',
			JSON.stringify(this.requests),
		);
	}

	/** Restore state from the StorageAdapter (call after construction). */
	async load(): Promise<void> {
		if (!this.store) return;
		const txCountRaw = await this.store.get('mist_tx_count');
		if (txCountRaw) {
			const { txCount } = JSON.parse(txCountRaw) as Pick<MISTState, 'txCount'>;
			this.txCount = txCount;
		}
		const requestsRaw = await this.store.get('mist_requests');
		if (requestsRaw) {
			this.requests = JSON.parse(requestsRaw) as MISTState['requests'];
		}
	}

	// ─── Export / restore ────────────────────────────────────────────────────────

	/** Snapshot the full state as a plain object (e.g. for encrypted backup). */
	exportState(): MISTState {
		return {
			txCount: this.txCount,
			requests: this.requests,
		};
	}

	private async _locateTx(
		request: RequestMIST,
		amountRaw: bigint
	): Promise<number> {
		const txHash = BigInt(hash_with_asset(request.secrets, request.token, amountRaw.toString()));
		const txArray = await this._getTxArray();

		const idx = (txArray as bigint[]).findIndex((leaf) => leaf === txHash);
		if (idx === -1) throw new Error('Transaction not found in merkle tree — not yet paid?');
		return idx;
	}

	private async _getTxArray(): Promise<bigint[]> {
		return this._chainAdapter.getTxArray();
		// return publicClient.readContract({
		// 	address: chamberAddress,
		// 	abi: CHAMBER_ABI,
		// 	functionName: 'getTxArray',
		// }) as Promise<bigint[]>;
	}
}