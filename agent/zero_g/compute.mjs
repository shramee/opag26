/**
 * Run an inference request on the 0G Compute network.
 *
 * Usage: node compute.mjs '<json: {prompt, providerAddress}>'
 * Output: JSON { result: "<model-response-text>" }
 *
 * Required env vars:
 *   ZERO_G_PRIVATE_KEY        — EVM wallet private key (0x…)
 *   ZERO_G_RPC_URL            — 0G EVM RPC endpoint
 *   ZERO_G_PROVIDER_ADDRESS   — on-chain address of the inference provider
 */

import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { ethers } from "ethers";

const RPC_URL =
  process.env.ZERO_G_RPC_URL || "https://evmrpc-testnet.0g.ai";
const PRIVATE_KEY = process.env.ZERO_G_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("ZERO_G_PRIVATE_KEY env var is required");
  process.exit(1);
}

async function runInference(prompt, providerAddress) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const { endpoint, model } =
    await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(
    providerAddress,
    model,
    prompt
  );

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      model,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Inference HTTP ${response.status}: ${body}`);
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content ?? "";
  console.log(JSON.stringify({ result: text }));
}

const input = JSON.parse(process.argv[2] ?? "{}");
if (!input.prompt) {
  console.error("Input must include 'prompt' field");
  process.exit(1);
}

runInference(
  input.prompt,
  input.providerAddress || process.env.ZERO_G_PROVIDER_ADDRESS
).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
