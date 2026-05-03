import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Agent } from './agent.ts';
import type { PeerEnvelope } from './types.ts';

async function readJson(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c as Buffer));
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
			} catch (err) {
				reject(err);
			}
		});
		req.on('error', reject);
	});
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

export function startAgentServer(agent: Agent, port: number): Promise<() => Promise<void>> {
	const server = createServer(async (req, res) => {
		try {
			if (req.method === 'GET' && req.url === '/health') {
				writeJson(res, 200, { ok: true, name: agent.config.name, finalized: agent.isFinalized });
				return;
			}

			if (req.method === 'POST' && req.url === '/message') {
				const body = (await readJson(req)) as PeerEnvelope;
				if (typeof body?.content !== 'string') {
					writeJson(res, 400, { ok: false, error: 'Missing content' });
					return;
				}
				if (agent.isFinalized) {
					writeJson(res, 200, { ok: true, finalized: true });
					return;
				}
				void agent.logger.conversation('conversation.peer.received', {
					from: body.from,
					message: body.content,
					requestAliases: (body.requests ?? []).map((request) => request.alias),
					blinding: body.blinding,
				});
				// Acknowledge immediately; the agent processes asynchronously to avoid
				// deadlocks where peer A is waiting on peer B who is waiting on peer A.
				writeJson(res, 200, { ok: true });
				agent
					.runTurn(`[message from ${body.from}]\n\n${body.content}`, body.requests ?? [])
					.catch((err) => {
						void agent.logger.conversation('conversation.turn.failed', {
							from: body.from,
							error: String((err as Error).message ?? err),
						});
						console.error(`[${agent.config.name}] turn failed:`, err);
					});
				return;
			}

			writeJson(res, 404, { ok: false, error: 'Not found' });
		} catch (err) {
			console.error(`[${agent.config.name}] server error:`, err);
			writeJson(res, 500, { ok: false, error: String((err as Error).message ?? err) });
		}
	});

	return new Promise((resolve) => {
		server.listen(port, () => {
			console.log(`[${agent.config.name}] listening on http://127.0.0.1:${port}`);
			resolve(
				() =>
					new Promise((r) => {
						server.close(() => r());
					}),
			);
		});
	});
}
