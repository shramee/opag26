/**
 * Shared MIST helpers for the keeperhub MIST plugin steps.
 *
 * Mirrors runner/src/chainAdapter.ts + runner/src/sdk.ts patterns from opag26:
 * builds a viem-based ChainAdapter, then uses it to construct a MISTActions
 * instance bound to the user's Para wallet.
 */
import "server-only";

import { CHAMBER_ABI, MISTActions, MISTTx } from "@opag26/sdk";
import type { Hex } from "@opag26/sdk";
import {
  getOrganizationWalletAddress,
  getOrganizationWalletPrivateKey,
  initializeWalletSigner,
} from "@/lib/para/wallet-helpers";
import { getChainIdFromNetwork } from "@/lib/rpc/network-utils";
import { getRpcProvider } from "@/lib/rpc/provider-factory";
import { getChainAdapter } from "@/lib/web3/chain-adapter";

export type MistContext = {
  network: string;
  chamberAddress: string;
  escrowAddress?: string;
  organizationId?: string;
  userId?: string;
  /** Optional gas-limit multiplier applied to write transactions. */
  gasLimitMultiplier?: string;
};

/**
 * Resolve the chain + RPC + wallet, then construct a MISTActions instance.
 *
 * Uses the wallet's private key as the MIST master key — same convention as
 * runner/src/agent.ts (`MISTActions.init(config.env.privateKey, ...)`).
 *
 * `escrowAddress` is required only for escrow-fund/escrow-claim. For read /
 * direct-deposit actions a zero-address placeholder is fine.
 */
export async function buildMistActions(
  ctx: MistContext
): Promise<{ mist: MISTActions; address: string; chainId: number }> {
  const chainId = getChainIdFromNetwork(ctx.network);
  const rpcManager = await getRpcProvider({ chainId, userId: ctx.userId });

  if (!ctx.organizationId) {
    throw new Error("organizationId is required to access the Para wallet");
  }
  const walletAddress = await getOrganizationWalletAddress(ctx.organizationId);
  const masterKey = (await getOrganizationWalletPrivateKey(
    ctx.organizationId
  )) as Hex;

  const signer = await initializeWalletSigner({
    organizationId: ctx.organizationId,
    chainId,
    rpcManager,
  });
  const chainAdapter = getChainAdapter(chainId);

  const sendTransaction = async (tx: { to: string; data: string }) => {
    const populated = await signer.sendTransaction({
      to: tx.to,
      data: tx.data,
    });
    const receipt = await populated.wait();
    return receipt?.hash ?? populated.hash;
  };

  const getTxArray = async (): Promise<bigint[]> => {
    const result = await chainAdapter.readContract(rpcManager, {
      address: ctx.chamberAddress,
      abi: CHAMBER_ABI,
      functionName: "getTxArray",
    });
    return [...(result as readonly bigint[])];
  };

  const mist = await MISTActions.init(masterKey, {
    chamberContractAddress: ctx.chamberAddress as Hex,
    escrowContractAddress: (ctx.escrowAddress ??
      "0x0000000000000000000000000000000000000000") as Hex,
    getTxArray,
    sendTransaction,
  });

  return { mist, address: walletAddress, chainId };
}

/** Public/serializable shape passed between MIST plugin nodes. */
export type SerializedMistRequest = {
  amount: string;
  token: string;
  secrets: string;
  /** PRIVATE — only present on requests YOU created. */
  claimingKey?: string;
  owner?: string;
  index?: number;
  status?: "PENDING" | "PAID" | "WITHDRAWN";
};

export function serializeRequest(tx: MISTTx): SerializedMistRequest {
  return {
    amount: tx.amount.toString(),
    token: tx.token,
    secrets: tx.secrets,
    claimingKey: tx._key,
    owner: tx._owner,
    index: tx._index,
    status: tx._status,
  };
}

/**
 * Reconstruct a MISTTx from its serialized form. Accepts either an already-
 * parsed object or a JSON string (template inputs may pass either).
 */
export function deserializeRequest(
  raw: SerializedMistRequest | string
): MISTTx {
  const data: SerializedMistRequest =
    typeof raw === "string" ? JSON.parse(raw) : raw;
  return new MISTTx({
    amount: BigInt(data.amount),
    token: data.token,
    secrets: data.secrets,
    _key: data.claimingKey,
    _owner: data.owner,
    _index: data.index,
    _status: data.status,
  });
}

export function getErrorDetails(error: unknown): {
  message: string;
  details?: string;
} {
  if (error instanceof Error) {
    const details = (error as Error & { details?: string }).details;
    return { message: error.message, details };
  }
  return { message: String(error) };
}
