/**
 * Upload a JSON payload to 0G decentralised storage.
 *
 * Usage: node upload.mjs '<json-payload>'
 * Output: JSON { rootHash, tx }
 *
 * Required env vars:
 *   ZERO_G_PRIVATE_KEY    — EVM wallet private key (0x…)
 *   ZERO_G_RPC_URL        — 0G EVM RPC endpoint
 *   ZERO_G_INDEXER_URL    — 0G storage indexer URL
 */

import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const RPC_URL =
  process.env.ZERO_G_RPC_URL || "https://evmrpc-testnet.0g.ai";
const INDEXER_URL =
  process.env.ZERO_G_INDEXER_URL ||
  "https://indexer-storage-testnet-turbo.0g.ai";
const PRIVATE_KEY = process.env.ZERO_G_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("ZERO_G_PRIVATE_KEY env var is required");
  process.exit(1);
}

async function upload(payload) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const indexer = new Indexer(INDEXER_URL);

  const content = Buffer.from(JSON.stringify(payload), "utf-8");
  const file = new MemData(content);

  const [tree, treeErr] = await file.merkleTree();
  if (treeErr) throw new Error(`Merkle tree: ${treeErr}`);

  const [tx, uploadErr] = await indexer.upload(file, 0, RPC_URL, wallet);
  if (uploadErr) throw new Error(`Upload: ${uploadErr}`);

  console.log(JSON.stringify({ rootHash: tree.rootHash(), tx }));
}

const input = JSON.parse(process.argv[2] ?? "{}");
upload(input).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
