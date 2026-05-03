/**
 * Show MIST Balance Step.
 *
 * Mirrors runner/src/tools.ts → `showBalance` and runner/src/balance.ts
 * (`computeBalances`). Per-token sum of paid / withdrawn / pending request
 * amounts, plus on-chain ERC-20 balances for any tokens listed in the
 * `tokens` config field.
 */
import "server-only";

import { erc20Abi } from "viem";
import { ErrorCategory, logUserError } from "@/lib/logging";
import { withPluginMetrics } from "@/lib/metrics/instrumentation/plugin";
import { getChainIdFromNetwork } from "@/lib/rpc/network-utils";
import { getRpcProvider } from "@/lib/rpc/provider-factory";
import {
  type StepInput,
  withStepLogging,
} from "@/lib/workflow/executor/step-handler";
import { resolveOrganizationContext } from "@/lib/web3/resolve-org-context";
import { getErrorMessage } from "@/lib/utils";
import { getChainAdapter } from "@/lib/web3/chain-adapter";
import { buildMistActions } from "./_mist-actions";

type TokenBalance = {
  token: string;
  tokenSymbol?: string;
  paidIn: string;
  withdrawn: string;
  pending: string;
  count: { paid: number; withdrawn: number; pending: number };
};

type OnchainBalance = { token: string; symbol: string; balance: string };

type ShowBalanceResult =
  | {
      success: true;
      address: string;
      mist: TokenBalance[];
      onchain: OnchainBalance[];
    }
  | { success: false; error: string };

export type ShowBalanceCoreInput = {
  network: string;
  chamberAddress: string;
  /** "SYM:0x...,SYM2:0x..." — same format as runner's TOKENS env var. */
  tokens?: string;
  _context?: {
    executionId?: string;
    organizationId?: string;
  };
};
export type ShowBalanceInput = StepInput & ShowBalanceCoreInput;

function parseTokens(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [symbol, address] = trimmed.split(":").map((s) => s.trim());
    if (!symbol || !address) {
      throw new Error(
        `Invalid TOKENS entry "${entry}" — expected SYMBOL:0x...`
      );
    }
    map[symbol] = address;
  }
  return map;
}

async function computeMistBalances(
  mist: Awaited<ReturnType<typeof buildMistActions>>["mist"],
  tokenSymbols: Record<string, string>
): Promise<TokenBalance[]> {
  await mist.scanPayments();

  const totals = new Map<
    string,
    {
      paid: bigint;
      withdrawn: bigint;
      pending: bigint;
      cP: number;
      cW: number;
      cN: number;
    }
  >();
  for (const req of mist.requests) {
    const key = req.token.toLowerCase();
    let row = totals.get(key);
    if (!row) {
      row = { paid: 0n, withdrawn: 0n, pending: 0n, cP: 0, cW: 0, cN: 0 };
      totals.set(key, row);
    }
    switch (req._status) {
      case "PAID":
        row.paid += req.amount;
        row.cP += 1;
        break;
      case "WITHDRAWN":
        row.withdrawn += req.amount;
        row.cW += 1;
        break;
      default:
        row.pending += req.amount;
        row.cN += 1;
    }
  }

  const result: TokenBalance[] = [];
  for (const [token, row] of totals) {
    result.push({
      token,
      tokenSymbol: tokenSymbols[token],
      paidIn: row.paid.toString(),
      withdrawn: row.withdrawn.toString(),
      pending: row.pending.toString(),
      count: { paid: row.cP, withdrawn: row.cW, pending: row.cN },
    });
  }
  return result;
}

async function stepHandler(input: ShowBalanceInput): Promise<ShowBalanceResult> {
  const orgCtx = await resolveOrganizationContext(
    input._context,
    "[MIST Show Balance]",
    "show-balance"
  );
  if (!orgCtx.success) return orgCtx;

  let tokensBySymbol: Record<string, string>;
  try {
    tokensBySymbol = parseTokens(input.tokens);
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
  const tokenSymbolByAddress = Object.fromEntries(
    Object.entries(tokensBySymbol).map(([sym, addr]) => [
      addr.toLowerCase(),
      sym,
    ])
  );

  try {
    const { mist, address } = await buildMistActions({
      network: input.network,
      chamberAddress: input.chamberAddress,
      organizationId: orgCtx.organizationId,
      userId: orgCtx.userId,
    });

    const mistBalances = await computeMistBalances(mist, tokenSymbolByAddress);

    const chainId = getChainIdFromNetwork(input.network);
    const rpcManager = await getRpcProvider({
      chainId,
      userId: orgCtx.userId,
    });
    const chainAdapter = getChainAdapter(chainId);

    const onchain: OnchainBalance[] = [];
    for (const [symbol, tokenAddress] of Object.entries(tokensBySymbol)) {
      const balance = (await chainAdapter.readContract(rpcManager, {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      onchain.push({ token: tokenAddress, symbol, balance: balance.toString() });
    }

    return { success: true, address, mist: mistBalances, onchain };
  } catch (error) {
    logUserError(
      ErrorCategory.NETWORK_RPC,
      "[MIST Show Balance] Failed:",
      error,
      { plugin_name: "mist", action_name: "show-balance" }
    );
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function showBalanceStep(
  input: ShowBalanceInput
): Promise<ShowBalanceResult> {
  "use step";

  return withPluginMetrics(
    {
      pluginName: "mist",
      actionName: "show-balance",
      executionId: input._context?.executionId,
    },
    () => withStepLogging(input, () => stepHandler(input))
  );
}

showBalanceStep.maxRetries = 0;

export const _integrationType = "mist";
