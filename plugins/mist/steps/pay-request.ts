/**
 * Pay Request Step.
 *
 * Mirrors runner/src/tools.ts → `payRequest`. Calls
 * `MISTActions.deposit(tx)` to directly fund a previously-shared MIST
 * request. Use the escrow-fund/escrow-claim pair for OTC swaps; this
 * action is for direct one-way transfers only.
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
import {
  buildMistActions,
  deserializeRequest,
  type SerializedMistRequest,
} from "./_mist-actions";

type PayRequestResult =
  | {
      success: true;
      transactionHash: string;
      transactionLink: string;
    }
  | { success: false; error: string };

export type PayRequestCoreInput = {
  network: string;
  chamberAddress: string;
  request: SerializedMistRequest | string;
  gasLimitMultiplier?: string;
  _context?: {
    executionId?: string;
    organizationId?: string;
  };
};
export type PayRequestInput = StepInput & PayRequestCoreInput;

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
  input: PayRequestInput
): Promise<PayRequestResult> {
  const orgCtx = await resolveOrganizationContext(
    input._context,
    "[MIST Pay Request]",
    "pay-request"
  );
  if (!orgCtx.success) return orgCtx;

  try {
    const { mist } = await buildMistActions({
      network: input.network,
      chamberAddress: input.chamberAddress,
      organizationId: orgCtx.organizationId,
      userId: orgCtx.userId,
      gasLimitMultiplier: input.gasLimitMultiplier,
    });

    const tx = deserializeRequest(input.request);
    const txHash = await mist.deposit(tx);

    const chainId = getChainIdFromNetwork(input.network);
    const transactionLink = await buildTransactionLink(chainId, txHash);

    return { success: true, transactionHash: txHash, transactionLink };
  } catch (error) {
    logUserError(
      ErrorCategory.NETWORK_RPC,
      "[MIST Pay Request] Failed:",
      error,
      { plugin_name: "mist", action_name: "pay-request" }
    );
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function payRequestStep(
  input: PayRequestInput
): Promise<PayRequestResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "mist",
      actionName: "pay-request",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

payRequestStep.maxRetries = 0;

export const _integrationType = "mist";
