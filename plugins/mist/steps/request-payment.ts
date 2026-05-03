/**
 * Request Payment Step.
 *
 * Mirrors runner/src/tools.ts → `requestPayment`. Calls
 * `MISTActions.requestFunds(amount, token)` and returns both the public
 * (shareable) and private (claimingKey) request fields.
 *
 * The PRIVATE `claimingKey` and `owner` are required to later
 * `escrow-claim`/withdraw the request — keep them in your workflow's
 * private state. The peer should only ever see {amount, token, secrets}.
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
  type SerializedMistRequest,
  serializeRequest,
} from "./_mist-actions";

type RequestPaymentResult =
  | { success: true; request: SerializedMistRequest }
  | { success: false; error: string };

export type RequestPaymentCoreInput = {
  network: string;
  chamberAddress: string;
  amount: string;
  /** Token symbol or ERC-20 address. */
  tokenConfig: string | { tokenAddress?: string };
  _context?: {
    executionId?: string;
    organizationId?: string;
  };
};
export type RequestPaymentInput = StepInput & RequestPaymentCoreInput;

function extractTokenAddress(
  tokenConfig: RequestPaymentCoreInput["tokenConfig"]
): string {
  if (typeof tokenConfig === "string") return tokenConfig;
  if (tokenConfig?.tokenAddress) return tokenConfig.tokenAddress;
  throw new Error("Missing token address in tokenConfig");
}

async function stepHandler(
  input: RequestPaymentInput
): Promise<RequestPaymentResult> {
  const orgCtx = await resolveOrganizationContext(
    input._context,
    "[MIST Request Payment]",
    "request-payment"
  );
  if (!orgCtx.success) return orgCtx;

  let token: string;
  try {
    token = extractTokenAddress(input.tokenConfig);
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }

  try {
    const { mist } = await buildMistActions({
      network: input.network,
      chamberAddress: input.chamberAddress,
      organizationId: orgCtx.organizationId,
      userId: orgCtx.userId,
    });

    const tx = mist.requestFunds(input.amount, token);
    return { success: true, request: serializeRequest(tx) };
  } catch (error) {
    logUserError(
      ErrorCategory.VALIDATION,
      "[MIST Request Payment] Failed:",
      error,
      { plugin_name: "mist", action_name: "request-payment" }
    );
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function requestPaymentStep(
  input: RequestPaymentInput
): Promise<RequestPaymentResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "mist",
      actionName: "request-payment",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

requestPaymentStep.maxRetries = 0;

export const _integrationType = "mist";
