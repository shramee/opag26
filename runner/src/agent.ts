import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type CoreMessage } from 'ai';
import { MISTActions, MISTTx, type Hex } from './sdk.ts';

import type { AgentConfig } from './config.ts';
import type { RunnerChainAdapter } from './chainAdapter.ts';
import type { PeerEnvelope, RequestEntry, SerializedRequest } from './types.ts';
import { buildTools } from './tools.ts';

export class Agent {
	readonly config: AgentConfig;
	readonly chain: RunnerChainAdapter;
	readonly mist: MISTActions;
	readonly requests = new Map<string, RequestEntry>();
	readonly tokenSymbolByAddress: Record<string, string>;
	readonly messages: CoreMessage[] = [];
	private mutex: Promise<void> = Promise.resolve();
	private finalized = false;
	private finalReason: string | null = null;

	private constructor(config: AgentConfig, chain: RunnerChainAdapter, mist: MISTActions) {
		this.config = config;
		this.chain = chain;
		this.mist = mist;
		this.tokenSymbolByAddress = Object.fromEntries(
			Object.entries(config.env.tokens).map(([sym, addr]) => [addr.toLowerCase(), sym]),
		);
	}

	static async create(config: AgentConfig, chain: RunnerChainAdapter): Promise<Agent> {
		const mist = await MISTActions.init(config.env.privateKey, {
			chamberContractAddress: chain.chamberContractAddress,
			escrowContractAddress: chain.escrowContractAddress,
			getTxArray: chain.getTxArray,
			sendTransaction: chain.sendTransaction,
		});
		return new Agent(config, chain, mist);
	}

	get isFinalized(): boolean {
		return this.finalized;
	}

	finalize(reason: string): void {
		this.finalized = true;
		this.finalReason = reason;
	}

	get finalSummary(): string | null {
		return this.finalReason;
	}

	registerOwnRequest(alias: string, tx: MISTTx, tokenSymbol?: string): void {
		this.requests.set(alias, { alias, tx, owner: 'self', tokenSymbol });
	}

	registerPeerRequest(serialized: SerializedRequest): void {
		const tx = new MISTTx({
			amount: BigInt(serialized.amount),
			token: serialized.token,
			secrets: serialized.secrets,
		});
		this.requests.set(serialized.alias, {
			alias: serialized.alias,
			tx,
			owner: 'peer',
			tokenSymbol: serialized.tokenSymbol,
		});
	}

	getRequest(alias: string): RequestEntry {
		const entry = this.requests.get(alias);
		if (!entry) {
			const known = [...this.requests.keys()].join(', ') || '<none>';
			throw new Error(`Unknown request alias "${alias}". Known aliases: ${known}`);
		}
		return entry;
	}

	serializeRequest(alias: string): SerializedRequest {
		const entry = this.getRequest(alias);
		return {
			alias,
			amount: entry.tx.amount.toString(),
			token: entry.tx.token,
			tokenSymbol: entry.tokenSymbol,
			secrets: entry.tx.secrets,
			owner: entry.owner,
		};
	}

	async runTurn(userMessage: string, attachedRequests: SerializedRequest[] = []): Promise<void> {
		await this.serialized(async () => {
			for (const r of attachedRequests) {
				this.registerPeerRequest({ ...r, owner: 'peer' });
			}

			const attachmentNote = attachedRequests.length
				? `\n\n[peer attached requests: ${attachedRequests
					.map((r) => `${r.alias} (${r.tokenSymbol ?? r.token}, ${r.amount})`)
					.join('; ')}]`
				: '';

			this.messages.push({ role: 'user', content: userMessage + attachmentNote });
			await this.step();
		});
	}

	async kickoff(initialTask: string): Promise<void> {
		await this.runTurn(`INITIAL TASK\n\n${initialTask}`);
	}

	private async step(): Promise<void> {
		if (this.finalized) return;

		const provider = createOpenAI({
			apiKey: this.config.env.inferenceApiKey,
			baseURL: 'https://compute-network-1.integratenetwork.work/v1/proxy',
		});
		const tools = buildTools(this);
		const verbose = this.config.env.verbose;

		const result = await generateText({
			model: provider(this.config.env.model),
			system: this.systemPrompt(),
			messages: this.messages,
			tools,
			maxSteps: this.config.env.maxStepsPerTurn,
			onStepFinish: verbose
				? (step) => {
					if (step.text) console.log(`[${this.config.name}] thought: ${step.text}`);
					for (const call of step.toolCalls) {
						console.log(`[${this.config.name}] → ${call.toolName}(${JSON.stringify(call.args)})`);
					}
				}
				: undefined,
		});

		this.messages.push(...result.response.messages);

		if (verbose && result.text) {
			console.log(`[${this.config.name}] said: ${result.text}`);
		}
	}

	private systemPrompt(): string {
		const tokenList = Object.entries(this.config.env.tokens)
			.map(([sym, addr]) => `  - ${sym} = ${addr}`)
			.join('\n');
		return [
			this.config.systemPrompt,
			'',
			'## Operating environment',
			'',
			`You are an autonomous agent named "${this.config.name}" running on chain ${this.config.env.chainId}.`,
			`Your peer is reachable via tools (no direct chat — always use sendPeer).`,
			`Your wallet address is ${this.chain.address}.`,
			`MIST chamber:  ${this.chain.chamberContractAddress}`,
			`MIST escrow:   ${this.chain.escrowContractAddress}`,
			'Known tokens:',
			tokenList || '  (none)',
			'',
			'## Protocol notes',
			'',
			'- Refer to MIST requests by stable string aliases (e.g. "myDumUsdReceive").',
			'- When sharing a request with your peer, list the alias under `share`. The peer will register it under the same alias on their side.',
			'- Coordinate the BLINDING value with your peer before either party calls escrowFund.',
			'- After a successful swap, call `finalize` to end the conversation.',
		].join('\n');
	}

	private serialized<T>(fn: () => Promise<T>): Promise<T> {
		const next = this.mutex.then(fn, fn);
		this.mutex = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}
}
