import { createHash } from 'node:crypto';

import { Batcher, Indexer, KvClient, cryptAt, decryptFile, getFlowContract, newSymmetricHeader, type StorageNode } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';

import type { AgentLogger } from './logger.ts';
import type { ZeroGConfig } from './config.ts';
import type { MISTStorageAdapter } from './sdk.ts';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function createZeroGStorageAdapter(
	config: ZeroGConfig | null,
	agentName: string,
	logger: AgentLogger,
): MISTStorageAdapter | undefined {
	if (!config) return undefined;
	return new ZeroGKVStorageAdapter(config, agentName, logger);
}

class ZeroGKVStorageAdapter implements MISTStorageAdapter {
	private readonly kvClient: KvClient;
	private readonly indexer: Indexer;
	private readonly wallet: ethers.Wallet;
	private readonly streamId: string;
	private readonly encryptionKey: Uint8Array;
	private nodesPromise?: Promise<StorageNode[]>;

	constructor(
		private readonly config: ZeroGConfig,
		agentName: string,
		private readonly logger: AgentLogger,
	) {
		this.kvClient = new KvClient(config.kvRpcUrl);
		this.indexer = new Indexer(config.indexerUrl);
		this.wallet = new ethers.Wallet(config.privateKey, new ethers.JsonRpcProvider(config.rpcUrl));
		this.streamId = config.streamId ?? ethers.id(`opag26:mist:${agentName}:${this.wallet.address.toLowerCase()}`);
		this.encryptionKey = createHash('sha256')
			.update('opag26:mist:0g:aes256:v1')
			.update(config.privateKey)
			.update(this.streamId)
			.digest();
	}

	async get(key: string): Promise<string | null> {
		try {
			const value = await this.kvClient.getValue(this.streamId, this.encodeKey(key));
			if (!value?.data) return null;
			return this.decryptValue(value.data);
		} catch (error) {
			this.logFailure('mist.store.0g.get.failed', error, { key });
			return null;
		}
	}

	async set(key: string, value: string): Promise<void> {
		try {
			const nodes = await this.getNodes();
			if (!nodes.length) return;

			const batcher = new Batcher(
				1,
				nodes,
				getFlowContract(this.config.flowAddress, this.wallet),
				this.config.rpcUrl,
			);
			batcher.streamDataBuilder.set(this.streamId, this.encodeKey(key), this.encryptValue(value));

			const [, error] = await batcher.exec();
			if (error) throw error;
		} catch (error) {
			this.logFailure('mist.store.0g.set.failed', error, { key });
		}
	}

	private async getNodes(): Promise<StorageNode[]> {
		if (!this.nodesPromise) {
			this.nodesPromise = this.indexer
				.selectNodes(1)
				.then(([nodes, error]: [StorageNode[], Error | null]) => {
					if (error) throw error;
					return nodes;
				})
				.catch((error: unknown) => {
					this.nodesPromise = undefined;
					throw error;
				});
		}
		return await this.nodesPromise;
	}

	private encodeKey(key: string): Uint8Array {
		return textEncoder.encode(key);
	}

	private encryptValue(value: string): Uint8Array {
		const header = newSymmetricHeader();
		const body = textEncoder.encode(value);
		const encrypted = new Uint8Array(body);
		cryptAt(this.encryptionKey, header.nonce, 0, encrypted);

		const headerBytes = header.toBytes();
		const payload = new Uint8Array(headerBytes.length + encrypted.length);
		payload.set(headerBytes, 0);
		payload.set(encrypted, headerBytes.length);
		return payload;
	}

	private decryptValue(base64Value: string): string {
		const encrypted = Uint8Array.from(Buffer.from(base64Value, 'base64'));
		const decrypted = decryptFile(this.encryptionKey, encrypted);
		return textDecoder.decode(decrypted);
	}

	private logFailure(event: string, error: unknown, details: Record<string, unknown>): void {
		void this.logger.blockchain(event, {
			...details,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}