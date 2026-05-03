/**
 * Escrow Fund Step (Creator Side).
 *
 * Mirrors runner/src/tools.ts → `escrowFund`. Locks the recipient request's
 * amount into the escrow contract, bound to creatorRequest.requestTxHash and
 * recipientRequest.secrets. Call only after both parties have shared their
 * requests AND agreed on a BLINDING value.
 */
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { explorerConfigs } from "@/lib/db/schema";
import { getTransactionUrl } from "@/lib/explorer";
import { ErrorCategory, logUserError } from "@/lib/logging";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { getChainIdFromNetwork } from "@/lib/rpc/network-utils";
import {
  type StepInput,
  withStepLogging,
} from "@/lib/workflow/executor/step-handler";
import { resolveOrganizationContext } from "@/lib/web3/resolve-org-context";
import { getErrorMessage } from "@/lib/utils";
import type { Hex } from "@opag26/sdk";
import {
  buildMistActions,
  deserializeRequest,
  type SerializedMistRequest,
} from "./_mist-actions";

type EscrowFundResult =
  | {
      success: true;
      escrowSecrets: string;
      amountLocked: string;
      token: string;
      transactionHash?: string;
      transactionLink?: string;
    }
  | { success: false; error: string };

export type EscrowFundCoreInput = {
  network: string;
  chamberAddress: string;
  escrowAddress: string;
  creatorRequest: SerializedMistRequest | string;
  recipientRequest: SerializedMistRequest | string;
  blinding: string;
  gasLimitMultiplier?: string;
  _context?: {
    executionId?: string;
    organizationId?: string;
  };
};
export type EscrowFundInput = StepInput & EscrowFundCoreInput;

function toHex(value: string): Hex {
  const trimmed = value.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
}

async function buildTransactionLink(
  chainId: number,
  hash: string
): Promise<string> {
  try {
    const explorerConfig = await db.query.explorerConfigs.findFirst({
      where: eq(explorerConfigs.chainId, chainId),
    });
    return explorerConfig ? (getTransactionUrl(explorerConfig, hash) ?? "") : "";
  } catch {
    return "";
  }
}

async function stepHandler(
  input: EscrowFundInput
): Promise<EscrowFundResult> {
  const orgCtx = await resolveOrganizationContext(
    input._context,
    "[MIST Escrow Fund]",
    "escrow-fund"
  );
  if (!orgCtx.success) return orgCtx;

  try {
    const { mist } = await buildMistActions({
      network: input.network,
      chamberAddress: input.chamberAddress,
      escrowAddress: input.escrowAddress,
      organizationId: orgCtx.organizationId,
      userId: orgCtx.userId,
      gasLimitMultiplier: input.gasLimitMultiplier,
    });

    const creatorTx = deserializeRequest(input.creatorRequest);
    const recipientTx = deserializeRequest(input.recipientRequest);
    const blinding = toHex(input.blinding);

    const escrowReq = await mist.escrowFund(creatorTx, recipientTx, blinding);

    const chainId = getChainIdFromNetwork(input.network);
    // The deposit tx hash isn't exposed via escrowFund's return value (it
    // calls deposit internally and returns the escrow MISTTx). If we want a
    // link we'd need to instrument the chain adapter; for now omit it.
    const transactionLink = await buildTransactionLink(chainId, "");

    return {
      success: true,
      escrowSecrets: escrowReq.secrets,
      amountLocked: escrowReq.amount.toString(),
      token: escrowReq.token,
      transactionLink,
    };
  } catch (error) {
    logUserError(
      ErrorCategory.NETWORK_RPC,
      "[MIST Escrow Fund] Failed:",
      error,
      { plugin_name: "mist", action_name: "escrow-fund" }
    );
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function escrowFundStep(
  input: EscrowFundInput
): Promise<EscrowFundResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "mist",
      actionName: "escrow-fund",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

escrowFundStep.maxRetries = 0;

export const _integrationType = "mist";
