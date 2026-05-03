import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { Hex } from './sdk.ts';

export interface AgentConfig {
	dir: string;
	name: string;
	systemPrompt: string;
	initialTask: string | null;
	env: AgentEnv;
}

export interface ZeroGConfig {
	privateKey: Hex;
	rpcUrl: string;
	indexerUrl: string;
	kvRpcUrl: string;
	flowAddress: Hex;
	streamId?: Hex;
}

export interface AgentEnv {
	privateKey: Hex;
	rpcUrl: string;
	chainId: number;
	chamberAddress: Hex;
	escrowAddress: Hex;
	tokens: Record<string, Hex>;
	peerUrl: string;
	listenPort: number;
	inferenceApiKey: string;
	model: string;
	maxStepsPerTurn: number;
	verbose: boolean;
	zeroG: ZeroGConfig | null;
}

function readFileIfExists(path: string): string | null {
	return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function requireEnv(env: Record<string, string | undefined>, key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Missing required env var ${key}`);
	return value;
}

function parseTokens(raw: string | undefined): Record<string, Hex> {
	if (!raw) return {};
	const map: Record<string, Hex> = {};
	for (const entry of raw.split(',')) {
		const trimmed = entry.trim();
		if (!trimmed) continue;
		const [symbol, address] = trimmed.split(':').map((s) => s.trim());
		if (!symbol || !address) {
			throw new Error(`Invalid TOKENS entry "${entry}" — expected SYMBOL:0x...`);
		}
		map[symbol] = address as Hex;
	}
	return map;
}

function parsePort(raw: string | undefined, fallback: number): number {
	if (!raw) return fallback;
	const n = Number(raw);
	if (!Number.isInteger(n) || n <= 0 || n > 65535) {
		throw new Error(`Invalid PORT value "${raw}"`);
	}
	return n;
}

function parseOptionalZeroG(env: Record<string, string | undefined>, defaultPrivateKey: Hex): ZeroGConfig | null {
	const requested = Boolean(
		env.ZERO_G_PRIVATE_KEY ||
			env.ZERO_G_RPC_URL ||
			env.ZERO_G_INDEXER_URL ||
			env.ZERO_G_KV_RPC_URL ||
			env.ZERO_G_FLOW_ADDRESS ||
			env.ZERO_G_STREAM_ID,
	);
	if (!requested) return null;

	const kvRpcUrl = env.ZERO_G_KV_RPC_URL?.trim();
	const flowAddress = env.ZERO_G_FLOW_ADDRESS?.trim();
	if (!kvRpcUrl || !flowAddress) {
		return null;
	}

	const zeroGPrivateKey = env.ZERO_G_PRIVATE_KEY?.trim();
	const privateKey = (zeroGPrivateKey
		? zeroGPrivateKey.startsWith('0x')
			? zeroGPrivateKey
			: `0x${zeroGPrivateKey}`
		: defaultPrivateKey) as Hex;
	const streamId = env.ZERO_G_STREAM_ID?.trim();

	return {
		privateKey,
		rpcUrl: env.ZERO_G_RPC_URL || 'https://evmrpc-testnet.0g.ai',
		indexerUrl: env.ZERO_G_INDEXER_URL || 'https://indexer-storage-testnet-turbo.0g.ai',
		kvRpcUrl,
		flowAddress: flowAddress as Hex,
		streamId: streamId ? (streamId as Hex) : undefined,
	};
}

export function loadAgentConfig(agentDir: string): AgentConfig {
	const dir = resolve(agentDir);
	if (!existsSync(dir)) throw new Error(`Agent directory not found: ${dir}`);

	const readme = readFileIfExists(resolve(dir, 'README.md'));
	if (!readme) throw new Error(`Missing README.md in ${dir} — it defines the agent's persona`);

	const taskPath = resolve(dir, 'task.md');
	const initialTask = readFileIfExists(taskPath);

	const envPath = resolve(dir, '.env');
	if (!existsSync(envPath)) throw new Error(`Missing .env in ${dir}`);
	const parsed = loadDotenv({ path: envPath, processEnv: {} });
	const env = (parsed.parsed ?? {}) as Record<string, string>;

	const pk = requireEnv(env, 'PRIVATE_KEY');
	const privateKey = (pk.startsWith('0x') ? pk : `0x${pk}`) as Hex;
	const zeroG = parseOptionalZeroG(env, privateKey);

	return {
		dir,
		name: basename(dir),
		systemPrompt: readme,
		initialTask,
		env: {
			privateKey,
			rpcUrl: requireEnv(env, 'RPC_URL'),
			chainId: Number(requireEnv(env, 'CHAIN_ID')),
			chamberAddress: requireEnv(env, 'CHAMBER_ADDRESS') as Hex,
			escrowAddress: requireEnv(env, 'ESCROW_ADDRESS') as Hex,
			tokens: parseTokens(env.TOKENS),
			peerUrl: requireEnv(env, 'PEER_URL'),
			listenPort: parsePort(env.PORT, 3000),
			inferenceApiKey: requireEnv(env, 'INFERENCE_API_KEY'),
			model: env.MODEL || 'zai-org/GLM-5-FP8',
			maxStepsPerTurn: Number(env.MAX_STEPS || '12'),
			verbose: (env.VERBOSE || 'true').toLowerCase() !== 'false',
				zeroG,
		},
	};
}

export function resolveToken(tokens: Record<string, Hex>, symbolOrAddress: string): Hex {
	if (symbolOrAddress.startsWith('0x') && symbolOrAddress.length === 42) {
		return symbolOrAddress as Hex;
	}
	const addr = tokens[symbolOrAddress];
	if (!addr) {
		const known = Object.keys(tokens).join(', ') || '<none>';
		throw new Error(`Unknown token "${symbolOrAddress}". Known symbols: ${known}`);
	}
	return addr;
}
