/**
 * Generate Blinding Step.
 *
 * Mirrors runner/src/tools.ts → `generateBlinding`. Pure compute — does not
 * touch the chain or wallet, but kept as a workflow node so downstream
 * escrow-fund/escrow-claim nodes can pipe `{{GenerateBlindingNode.blinding}}`.
 */
import "server-only";

import { randomBytes } from "node:crypto";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import {
  type StepInput,
  withStepLogging,
} from "@/lib/workflow/executor/step-handler";

type GenerateBlindingResult =
  | { success: true; blinding: string }
  | { success: false; error: string };

export type GenerateBlindingCoreInput = Record<string, never>;
export type GenerateBlindingInput = StepInput & GenerateBlindingCoreInput;

function stepHandler(): GenerateBlindingResult {
  const blinding = `0x${randomBytes(32).toString("hex")}`;
  return { success: true, blinding };
}

export async function generateBlindingStep(
  input: GenerateBlindingInput
): Promise<GenerateBlindingResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "mist",
      actionName: "generate-blinding",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, async () => stepHandler())
  );
}

generateBlindingStep.maxRetries = 0;

export const _integrationType = "mist";
