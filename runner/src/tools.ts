import { randomBytes } from 'node:crypto';
import { tool } from 'ai';
import { z } from 'zod';
import type { Hex } from './sdk.ts';

import type { Agent } from './agent.ts';
import { resolveToken } from './config.ts';
import { sendToPeer } from './peer.ts';
import { computeBalances } from './balance.ts';
import type { SerializedRequest } from './types.ts';

const HEX_VALUE_RE = /^(?:0x)?[0-9a-fA-F]+$/;

function toHex(value: string, label = 'hex value'): Hex {
	const trimmed = value.trim();
	if (!trimmed || !HEX_VALUE_RE.test(trimmed)) {
		throw new Error(`Invalid ${label}: expected a hex string like 0xabc123.`);
	}
	const hex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
	return hex.toLowerCase() as Hex;
}

function generateBlindingValue(): Hex {
	return `0x${randomBytes(32).toString('hex')}`;
}

function describeToolError(error: unknown): { message: string; details?: string } {
	if (error instanceof Error) {
		const details = (error as Error & { details?: string }).details;
		return { message: error.message, details };
	}
	return { message: String(error) };
}

export function buildTools(agent: Agent) {
	return {
		generateBlinding: tool({
			description:
				'Generate a fresh BLINDING hex value in JavaScript. Call this instead of inventing a BLINDING string in chat, then reuse the returned value exactly in sendPeer/escrowFund/escrowClaim.',
			parameters: z.object({}),
			execute: async () => {
				const blinding = generateBlindingValue();
				return { blinding };
			},
		}),

		requestPayment: tool({
			description:
				'Create a private MIST payment request that the peer can fulfill. ' +
				'Use a stable alias so future tool calls and peer messages can reference it.',
			parameters: z.object({
				alias: z.string().min(1).describe('Local alias for this request, e.g. "myDumUsdReceive".'),
				amount: z.string().describe('Decimal amount, e.g. "23" or "1.5". Resolved with 18 decimals.'),
				token: z.string().describe('Token symbol (dumETH/dumUSD) or 0x address.'),
			}),
			execute: async ({ alias, amount, token }) => {
				if (agent.requests.has(alias)) {
					throw new Error(`Alias "${alias}" already exists.`);
				}
				const tokenAddr = resolveToken(agent.config.env.tokens, token);
				const tx = agent.mist.requestFunds(amount, tokenAddr);
				const symbol = agent.tokenSymbolByAddress[tokenAddr.toLowerCase()];
				agent.registerOwnRequest(alias, tx, symbol);
				await agent.persistMistState('requestPayment');
				return {
					alias,
					amount: tx.amount.toString(),
					token: tokenAddr,
					tokenSymbol: symbol,
					secrets: tx.secrets,
				};
			},
		}),

		payRequest: tool({
			description:
				'Directly pay (deposit) into a previously-shared MIST request. ' +
				'Use this only for direct transfers — for the escrow swap protocol, use escrowFund/escrowClaim instead.',
			parameters: z.object({
				alias: z.string().describe('Alias of the request to pay (must already exist locally).'),
			}),
			execute: async ({ alias }) => {
				const entry = agent.getRequest(alias);
				await agent.logger.blockchain('mist.deposit.started', {
					alias,
					token: entry.tx.token,
					amount: entry.tx.amount.toString(),
				});
				const txHash = await agent.mist.deposit(entry.tx);
				await agent.logger.blockchain('mist.deposit.completed', { alias, txHash });
				return { alias, txHash };
			},
		}),

		showBalance: tool({
			description:
				'Show your private MIST balance: per-token sum of paid (received), withdrawn, and pending request amounts. ' +
				'Also includes your on-chain ERC-20 balance for known tokens.',
			parameters: z.object({}),
			execute: async () => {
				await agent.logger.blockchain('mist.balanceCheck.started', {});
				const tokenSymbols = agent.tokenSymbolByAddress;
				const mistBalances = await computeBalances(agent.mist, tokenSymbols);
				await agent.persistMistState('showBalance');
				const onchain: Array<{ token: string; symbol: string; balance: string }> = [];
				for (const [symbol, addr] of Object.entries(agent.config.env.tokens)) {
					const bal = await agent.chain.getErc20Balance(addr);
					onchain.push({ token: addr, symbol, balance: bal.toString() });
				}
				await agent.logger.blockchain('mist.balanceCheck.completed', {
					onchainCount: onchain.length,
					mistCount: mistBalances.length,
				});
				return { mist: mistBalances, onchain, address: agent.chain.address };
			},
		}),

		escrowFund: tool({
			description:
				'Creator-side of the escrow protocol. Locks recipientRequest.amount into the escrow contract, bound to ' +
				"creatorRequest.requestTxHash and recipientRequest.secrets. Call this only after both parties have shared their requests and agreed on a BLINDING value.",
			parameters: z.object({
				creatorAlias: z.string().describe('Alias of YOUR request (what you want to receive from the peer).'),
				recipientAlias: z.string().describe("Alias of the PEER's request (what they want to receive from you)."),
				blinding: z.string().describe('Shared BLINDING hex value (e.g. 0xcafebabe...).'),
			}),
			execute: async ({ creatorAlias, recipientAlias, blinding }) => {
				const creator = agent.getRequest(creatorAlias);
				const recipient = agent.getRequest(recipientAlias);
				const blindingHex = toHex(blinding, 'BLINDING');
				await agent.logger.blockchain('mist.escrowFund.started', {
					creatorAlias,
					recipientAlias,
					blinding: blindingHex,
				});
				const escrowReq = await agent.mist.escrowFund(creator.tx, recipient.tx, blindingHex);
				await agent.logger.blockchain('mist.escrowFund.completed', {
					creatorAlias,
					recipientAlias,
					amountLocked: escrowReq.amount.toString(),
					token: escrowReq.token,
				});
				return {
					ok: true,
					escrowSecrets: escrowReq.secrets,
					amountLocked: escrowReq.amount.toString(),
					token: escrowReq.token,
				};
			},
		}),

		escrowClaim: tool({
			description:
				'Recipient-side of the escrow protocol. Pays creatorRequest into the chamber and consumes the escrow, ' +
				"releasing the locked funds into your recipientRequest. Call only after the peer has confirmed escrowFund succeeded.",
			parameters: z.object({
				creatorAlias: z.string().describe("Alias of the PEER's request (what they want to receive from you)."),
				recipientAlias: z.string().describe('Alias of YOUR request (what you want to receive from them).'),
				blinding: z.string().describe('Shared BLINDING hex value, must match what was used in escrowFund.'),
			}),
			execute: async ({ creatorAlias, recipientAlias, blinding }) => {
				const creator = agent.getRequest(creatorAlias);
				const recipient = agent.getRequest(recipientAlias);
				const blindingHex = toHex(blinding, 'BLINDING');
				await agent.logger.blockchain('mist.escrowClaim.started', {
					creatorAlias,
					recipientAlias,
					blinding: blindingHex,
				});
				try {
					await agent.mist.escrowClaim(creator.tx, recipient.tx, blindingHex);
					await agent.logger.blockchain('mist.escrowClaim.completed', {
						creatorAlias,
						recipientAlias,
					});
					return { ok: true };
				} catch (error) {
					const described = describeToolError(error);
					await agent.logger.blockchain('mist.escrowClaim.failed', {
						creatorAlias,
						recipientAlias,
						blinding: blindingHex,
						error: described.message,
						details: described.details,
					});
					return {
						ok: false,
						error: described.message,
						details: described.details,
					};
				}
			},
		}),

		checkRequestStatus: tool({
			description: 'Check whether a request has been paid (PENDING / PAID / WITHDRAWN).',
			parameters: z.object({ alias: z.string() }),
			execute: async ({ alias }) => {
				const entry = agent.getRequest(alias);
				await agent.logger.blockchain('mist.checkStatus.started', {
					alias,
					token: entry.tx.token,
					amount: entry.tx.amount.toString(),
				});
				const status = await agent.mist.checkStatus(entry.tx);
				await agent.persistMistState('checkRequestStatus');
				await agent.logger.blockchain('mist.checkStatus.completed', { alias, status });
				return { alias, status };
			},
		}),

		sendPeer: tool({
			description:
				'Send a chat message to your peer agent. Optionally attach requests by alias — your peer will be able to ' +
				'reference them by the same alias. Use `blinding` to negotiate or confirm the shared BLINDING value.',
			parameters: z.object({
				message: z.string().describe('Free-form chat message to your peer.'),
				share: z
					.array(z.string())
					.optional()
					.describe('Aliases of YOUR requests to share with the peer (public fields only).'),
				blinding: z
					.string()
					.optional()
					.describe('Optional shared BLINDING value to communicate to the peer. Prefer passing the exact value returned by generateBlinding.'),
			}),
			execute: async ({ message, share, blinding }) => {
				const requests: SerializedRequest[] = (share ?? []).map((alias) => agent.serializeRequest(alias));
				const normalizedBlinding = blinding ? toHex(blinding, 'BLINDING') : undefined;
				await agent.logger.conversation('conversation.peer.sent', {
					message,
					share: share ?? [],
					blinding: normalizedBlinding,
				});
				try {
					const ack = await sendToPeer(agent.config.env.peerUrl, {
						from: agent.config.name,
						content: message,
						requests: requests.length ? requests : undefined,
						blinding: normalizedBlinding,
					});
					await agent.logger.conversation('conversation.peer.ack', {
						ok: ack.ok,
						error: ack.error,
					});
					return ack;
				} catch (error) {
					await agent.logger.conversation('conversation.peer.sendFailed', {
						error: String((error as Error).message ?? error),
					});
					throw error;
				}
			},
		}),

		finalize: tool({
			description:
				'Mark this conversation/trade as complete. The agent will stop processing further turns. ' +
				'Use only after the swap has settled or it is clear no agreement is possible.',
			parameters: z.object({ summary: z.string().describe('Brief summary of the outcome.') }),
			execute: async ({ summary }) => {
				agent.finalize(summary);
				return { ok: true };
			},
		}),
	};
}
