/**
 * Download a JSON blob from 0G storage by merkle root hash.
 *
 * Usage: node download.mjs <root-hash>
 * Output: JSON object that was originally uploaded
 *
 * Required env vars:
 *   ZERO_G_PRIVATE_KEY  — EVM wallet private key (0x…)
 *   ZERO_G_RPC_URL      — 0G EVM RPC endpoint
 *   ZERO_G_INDEXER_URL  — 0G storage indexer URL
 */

import { Indexer } from "@0gfoundation/0g-ts-sdk";

const RPC_URL =
  process.env.ZERO_G_RPC_URL || "https://evmrpc-testnet.0g.ai";
const INDEXER_URL =
  process.env.ZERO_G_INDEXER_URL ||
  "https://indexer-storage-testnet-turbo.0g.ai";
const PRIVATE_KEY = process.env.ZERO_G_PRIVATE_KEY;

const rootHash = process.argv[2];
if (!rootHash) {
  console.error("Usage: node download.mjs <root-hash>");
  process.exit(1);
}

async function download(hash) {
  const indexer = new Indexer(INDEXER_URL);
  const [data, err] = await indexer.download(hash, RPC_URL, PRIVATE_KEY);
  if (err) throw new Error(`Download: ${err}`);
  const parsed = JSON.parse(Buffer.from(data).toString("utf-8"));
  console.log(JSON.stringify(parsed));
}

download(rootHash).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
