import { mkdir, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type LogChannel = 'conversation' | 'blockchain';

interface LogEntry {
	timestamp: string;
	agent: string;
	event: string;
	details: Record<string, unknown>;
}

export class AgentLogger {
	private readonly conversationPath: string;
	private readonly blockchainPath: string;
	private queue: Promise<void> = Promise.resolve();

	constructor(
		private readonly agentName: string,
		agentDir: string,
	) {
		const logDir = resolve(agentDir, 'logs');
		this.conversationPath = resolve(logDir, 'conversation.log');
		this.blockchainPath = resolve(logDir, 'blockchain.log');
		this.queue = mkdir(logDir, { recursive: true }).then(() => undefined);
	}

	conversation(event: string, details: Record<string, unknown>): Promise<void> {
		return this.write('conversation', event, details);
	}

	blockchain(event: string, details: Record<string, unknown>): Promise<void> {
		return this.write('blockchain', event, details);
	}

	private write(channel: LogChannel, event: string, details: Record<string, unknown>): Promise<void> {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			agent: this.agentName,
			event,
			details,
		};
		const line = `${JSON.stringify(entry)}\n`;
		const target = channel === 'conversation' ? this.conversationPath : this.blockchainPath;

		this.queue = this.queue.then(() => appendFile(target, line, 'utf8'));
		return this.queue;
	}
}