/**
 * Escrow Claim Step (Recipient Side).
 *
 * Mirrors runner/src/tools.ts → `escrowClaim`. Pays the creator's request into
 * the chamber and consumes the escrow, releasing the locked funds into the
 * recipient request. Call only after the peer has confirmed escrow-fund
 * succeeded.
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
  getErrorDetails,
  type SerializedMistRequest,
} from "./_mist-actions";

type EscrowClaimResult =
  | {
      success: true;
      transactionHash?: string;
      transactionLink?: string;
    }
  | { success: false; error: string; details?: string };

export type EscrowClaimCoreInput = {
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
export type EscrowClaimInput = StepInput & EscrowClaimCoreInput;

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
  input: EscrowClaimInput
): Promise<EscrowClaimResult> {
  const orgCtx = await resolveOrganizationContext(
    input._context,
    "[MIST Escrow Claim]",
    "escrow-claim"
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

    await mist.escrowClaim(creatorTx, recipientTx, blinding);

    const chainId = getChainIdFromNetwork(input.network);
    const transactionLink = await buildTransactionLink(chainId, "");

    return { success: true, transactionLink };
  } catch (error) {
    const described = getErrorDetails(error);
    logUserError(
      ErrorCategory.NETWORK_RPC,
      "[MIST Escrow Claim] Failed:",
      error,
      { plugin_name: "mist", action_name: "escrow-claim" }
    );
    return {
      success: false,
      error: described.message || getErrorMessage(error),
      details: described.details,
    };
  }
}

export async function escrowClaimStep(
  input: EscrowClaimInput
): Promise<EscrowClaimResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "mist",
      actionName: "escrow-claim",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

escrowClaimStep.maxRetries = 0;

export const _integrationType = "mist";
