import mistcashNs from '@mistcash/sdk';
import type { Witness } from '@mistcash/sdk';
const {
	hash2Sync: hash2,
	txSecret: deriveTxSecret,
	hash_with_asset,
	hash3Sync: hash3,
} = mistcashNs;
import { encodeFunctionData, erc20Abi } from 'viem';
import { CHAMBER_ABI } from './contracts/chamber';
import { Hex, merkleProofForTx, proveMist, strToHex, toTokenUnits } from './utils';
import { init, proveEscrow } from './gnark';
import { ProofResponse, SuccessResponse } from './gnark/types';
import { proofToContractArgs } from './proof';
import { MISTTxData, MISTTx } from './mistTx';
import { ESCROW_ABI } from './contracts/escrow';

export * from './mistTx';
export * from './utils';
export * from './gnark';
export * from './contracts/chamber';
export * from './contracts/escrow';
export * from './proof';
// `export * as ns from '@mistcash/sdk'` would only re-export names that
// cjs-module-lexer can detect — which is none, since the package is CJS without
// an exports map. Re-exporting the default object preserves the same access
// pattern (`mistcash.hash2Sync(...)`) for consumers.
export { mistcashNs as mistcash };

/**
 * Pluggable persistence adapter.
 * Pass localStorage (browser), a Map, a DB wrapper, or anything with get/set.
 */
export interface StorageAdapter {
	get(key: string): string | null | Promise<string | null>;
	set(key: string, value: string): void | Promise<void>;
}

/** Serialisable snapshot of MISTActions state for backup / restore */
export interface MISTState {
	txCount: number;
	requests: MISTTxData[];
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
	requests: MISTTx[] = [];

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
	requestFunds(amount: string | bigint, token: string, recipient?: string): MISTTx {
		const txIndex = this.txCount++;
		const owner = recipient || this.accountAddress;

		const claimingKey = hash2(`${txIndex}`, this.masterHidingKey);
		const secrets = `0x${BigInt(deriveTxSecret(claimingKey, owner)).toString(16)}` as Hex;

		const request = new MISTTx({
			amount: typeof amount === 'string' ? toTokenUnits(amount, 18) : amount,
			token,
			secrets,
			_key: claimingKey,
			_owner: owner,
			_index: txIndex,
			_status: 'PENDING',
		});

		this.requests.push(request);
		return request;
	}

	// creator and recipients escrow flow
	// (1) creator and recipient create and share their own requests
	// (2) creator calls escrowDeposit
	// (3) recipient calls escrowClaim to claim the recipient
	// (4) recipient calls escrowClaim to claim the recipient
	async escrowFund(creatorRequest: MISTTx, recipientRequest: MISTTx, blinding: Hex): Promise<MISTTx> {
		const escrowKey = hash3(blinding, creatorRequest.requestTxHash(), recipientRequest.secrets);
		const escrowOwner = this._chainAdapter.escrowContractAddress;
		const escrowReq = new MISTTx({
			amount: recipientRequest.amount,
			token: recipientRequest.token,
			secrets: hash2(escrowKey, escrowOwner),
		});

		await this.deposit(escrowReq);
		return escrowReq;
	}

	async escrowClaim(creatorRequest: MISTTx, recipientRequest: MISTTx, blinding: Hex): Promise<any> {
		const escrowKey = hash3(blinding, creatorRequest.requestTxHash(), recipientRequest.secrets);
		const escrowOwner = this._chainAdapter.escrowContractAddress;
		const escrowReq = new MISTTx({
			amount: recipientRequest.amount,
			token: recipientRequest.token,
			secrets: hash2(escrowKey, escrowOwner),
		});

		// check escrow was created
		const txStatus = await this.checkStatus(escrowReq);

		if (txStatus !== 'PAID') {
			throw new Error('Escrow not yet funded');
		}

		await this.deposit(creatorRequest);

		await new Promise((resolve) => setTimeout(resolve, 5000)); // wait for deposit to be processed

		const txLeaves = await this._getTxArray();
		// escrow ZKP
		const txHash = BigInt(creatorRequest.requestTxHash());
		const txIndex = txLeaves.findIndex((leaf) => leaf === txHash);
		if (txIndex === -1) throw new Error('Transaction not found in merkle tree — has it been paid?');

		const { root: escrowMerkleRoot, proof: escrowMerkleProof } = merkleProofForTx(txLeaves, txHash);

		const escrowProofResponse = await proveEscrow({
			Blinding: blinding,
			Owner: escrowOwner,
			TxAsset: {
				Addr: escrowReq.token,
				Amount: escrowReq.amount.toString(),
			},
			RecipientSecret: recipientRequest.secrets,
			SenderTx: creatorRequest.requestTxHash(),
			MerkleProof: escrowMerkleProof,
			MerkleRoot: escrowMerkleRoot,
		}) as SuccessResponse;

		if (escrowProofResponse.status !== "success") {
			throw new Error(`Escrow proof generation failed: ${JSON.stringify(escrowProofResponse, undefined, 2)}`);
		}

		const escrowProof = proofToContractArgs(escrowProofResponse.proof) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
		const escrowPubIn = escrowProofResponse.publicInputs as unknown as readonly [bigint, bigint, bigint];

		const { root, proof } = merkleProofForTx(txLeaves, BigInt(escrowReq.requestTxHash()));

		const witness: Witness = {
			ClaimingKey: escrowKey,
			Owner: escrowOwner,
			TxAsset: { Amount: escrowReq.amount.toString(), Addr: escrowReq.token },
			MerkleProof: proof,
			MerkleRoot: root,
			Withdraw: {
				Amount: '0', Addr: '0'
			}, // zero withdrawal
			Tx1Amount: escrowReq.amount.toString(), // full amount in tx1
			Tx1Secret: recipientRequest.secrets
		};

		const mistProofResp = await proveMist(witness) as SuccessResponse;

		if (mistProofResp.status !== "success") {
			throw new Error(`Mist proof generation failed: ${JSON.stringify(mistProofResp, undefined, 2)}`);
		}

		const mistProof = proofToContractArgs(mistProofResp.proof) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
		const mistPubIn = mistProofResp.publicInputs as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

		await this._chainAdapter.sendTransaction({
			to: this._chainAdapter.escrowContractAddress,
			data: encodeFunctionData({
				abi: ESCROW_ABI,
				functionName: 'consumeEscrow',
				args: [escrowProof, escrowPubIn, mistProof, mistPubIn],
			}),
		});


		// mist withdraw
	}

	// ─── Paying a request (payer role) ─────────────────────────────────────────

	/**
	 * Pay a request directly on an EVM chain that hosts the Chamber contract.
	 *
	 * Flow: ERC-20 approve → Chamber.deposit(txSecret, amount, token)
	 *
	 * @param request     The MISTTx to pay (only public fields needed)
	 * @param amountRaw   Amount in token base units (e.g. 10_000_000n for 10 USDC).
	 *                    Typically toTokenUnits(request.amount) + fee.
	 */
	async deposit(
		tx: MISTTx,
	): Promise<Hex> {
		const token = tx.token as Hex;

		await this._chainAdapter.sendTransaction({
			to: token,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: 'approve',
				args: [this._chainAdapter.chamberContractAddress, tx.amount],
			}),
		});

		return this._chainAdapter.sendTransaction({
			to: this._chainAdapter.chamberContractAddress,
			data: encodeFunctionData({
				abi: CHAMBER_ABI,
				functionName: 'deposit',
				args: [BigInt(tx.secrets), tx.amount, token],
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
		request: MISTTx
	): Promise<'PENDING' | 'PAID' | 'WITHDRAWN'> {
		if (request._status === 'WITHDRAWN') return 'WITHDRAWN';

		const txLeaves = await this._getTxArray();
		const addr = request.requestTxHash();

		if (txLeaves.indexOf(BigInt(addr)) === -1) return 'PENDING';

		request._status = 'PAID';
		return 'PAID';
	}

	/**
	 * Scan all PENDING requests and update their statuses.
	 * Returns the subset that are now PAID (ready to withdraw).
	 */
	async scanPayments(): Promise<MISTTx[]> {
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
	 * @param request       PAID MISTTx (must have _key and _owner)
	 * @param withdrawTo    Address that receives the withdrawn funds
	 * @param txLeaves      Array of all tx hashes from the merkle tree (getTxArray)
	 * @param merkleRoot    Current merkle root
	 * @param submitProof   Callback that submits the generated proof array to the contract
	 */
	async withdrawZkp(
		request: MISTTx,
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
		const txHash = BigInt(request.requestTxHash());

		const { root, proof } = merkleProofForTx(txLeaves, txHash);

		const isOwnerSelfAuth = request._owner === this.accountAddress;

		const witness: Witness = {
			ClaimingKey: request._key,
			Owner: request._owner,
			OwnerKey: isOwnerSelfAuth ? this.accountAuthKey : '0',
			TxAsset: { Amount: request.amount.toString(), Addr: tokenAddr },
			AuthDone: isOwnerSelfAuth ? '1' : '0',
			MerkleProof: proof,
			MerkleRoot: root,
			Withdraw: { Amount: request.amount.toString(), Addr: tokenAddr },
			WithdrawTo: withdrawTo,
		};

		const proofResp = await proveMist(witness);

		const result = await submitProof(proofResp);
		if (!result.success) throw new Error(result.error ?? 'ZK withdrawal failed');

		request._status = 'WITHDRAWN';
		this.save();
		return result.transactionHash ?? '';
	}


	/**
	 * Convenience method: fetch merkle state from an EVM Chamber and run withdrawZkp.
	 * Requires a viem PublicClient and a WalletClient.
	 */
	async withdrawEvm(
		request: MISTTx,
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
	deriveRequest(txIndex: number, amount: bigint, token: string, ownerAddress?: Hex): MISTTx {
		const owner = ownerAddress ?? this.accountAddress;
		const claimingKey = hash2(`${txIndex}`, this.masterHidingKey);
		const secrets = `0x${BigInt(deriveTxSecret(claimingKey, owner)).toString(16)}` as Hex;
		return new MISTTx({ amount, token, secrets, _key: claimingKey, _owner: owner, _index: txIndex, _status: 'PENDING' });
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
			JSON.stringify(this.requests.map((request) => request.data)),
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
			this.requests = (JSON.parse(requestsRaw) as MISTState['requests']).map((request) => new MISTTx(request));
		}
	}

	// ─── Export / restore ────────────────────────────────────────────────────────

	/** Snapshot the full state as a plain object (e.g. for encrypted backup). */
	exportState(): MISTState {
		return {
			txCount: this.txCount,
			requests: this.requests.map((request) => request.data),
		};
	}

	private async _locateTx(
		request: MISTTx,
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