/**
 * AES-256-GCM encrypted wrapper around the 0G KV store.
 *
 * Docs: https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk#key-value-storage
 *
 * All values are encrypted before writing and decrypted after reading so that
 * the KV node never sees plaintext (agent memory, negotiation state, etc.).
 */
import { KvClient } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import { config } from '../config.js';
import { encrypt, decrypt } from './crypto.js';

const TEXT = new TextEncoder();
const DECODER = new TextDecoder();

function toBytes(s: string): Uint8Array {
  return TEXT.encode(s);
}

function buildClient() {
  const provider = new ethers.JsonRpcProvider(config.rpc.url);
  const signer = new ethers.Wallet(config.kv.privateKey, provider);
  const client = new KvClient(config.kv.url);
  return { client, signer };
}

export async function kvSet(key: string, value: string): Promise<void> {
  const { client, signer } = buildClient();
  const blob = encrypt(value, config.kv.encryptionKey);
  await client.set(
    config.kv.streamId,
    toBytes(key),
    blob,
    signer,
  );
}

export async function kvGet(key: string): Promise<string | null> {
  const { client } = buildClient();
  const raw: Uint8Array | null = await client.get(
    config.kv.streamId,
    toBytes(key),
  );
  if (!raw || raw.length === 0) return null;
  return decrypt(Buffer.from(raw), config.kv.encryptionKey);
}

export async function kvDelete(key: string): Promise<void> {
  const { client, signer } = buildClient();
  await client.set(
    config.kv.streamId,
    toBytes(key),
    new Uint8Array(0),
    signer,
  );
}
