/**
 * Check Request Status Step.
 *
 * Mirrors runner/src/tools.ts → `checkRequestStatus`. Calls
 * `MISTActions.checkStatus(tx)` and reports PENDING / PAID / WITHDRAWN.
 */
import "server-only";

import { ErrorCategory, logUserError } from "@/lib/logging";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
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

type CheckRequestStatusResult =
  | { success: true; status: "PENDING" | "PAID" | "WITHDRAWN" }
  | { success: false; error: string };

export type CheckRequestStatusCoreInput = {
  network: string;
  chamberAddress: string;
  request: SerializedMistRequest | string;
  _context?: {
    executionId?: string;
    organizationId?: string;
  };
};
export type CheckRequestStatusInput = StepInput & CheckRequestStatusCoreInput;

async function stepHandler(
  input: CheckRequestStatusInput
): Promise<CheckRequestStatusResult> {
  const orgCtx = await resolveOrganizationContext(
    input._context,
    "[MIST Check Status]",
    "check-request-status"
  );
  if (!orgCtx.success) return orgCtx;

  try {
    const { mist } = await buildMistActions({
      network: input.network,
      chamberAddress: input.chamberAddress,
      organizationId: orgCtx.organizationId,
      userId: orgCtx.userId,
    });
    const tx = deserializeRequest(input.request);
    const status = await mist.checkStatus(tx);
    return { success: true, status };
  } catch (error) {
    logUserError(
      ErrorCategory.NETWORK_RPC,
      "[MIST Check Status] Failed:",
      error,
      { plugin_name: "mist", action_name: "check-request-status" }
    );
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function checkRequestStatusStep(
  input: CheckRequestStatusInput
): Promise<CheckRequestStatusResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "mist",
      actionName: "check-request-status",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

checkRequestStatusStep.maxRetries = 0;

export const _integrationType = "mist";
