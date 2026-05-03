import { resolve } from 'node:path';
import { Agent } from './agent.ts';
import { makeChainAdapter } from './chainAdapter.ts';
import { loadAgentConfig } from './config.ts';
import { startAgentServer } from './server.ts';

async function main() {
	const [, , dirArg] = process.argv;
	if (!dirArg) {
		console.error('Usage: opag26-runner <agent-directory>');
		console.error('  e.g. opag26-runner ./agents/bob');
		process.exit(1);
	}

	const config = loadAgentConfig(resolve(dirArg));
	console.log(`[${config.name}] booting from ${config.dir}`);

	const chain = makeChainAdapter({
		privateKey: config.env.privateKey,
		rpcUrl: config.env.rpcUrl,
		chainId: config.env.chainId,
		chamberAddress: config.env.chamberAddress,
		escrowAddress: config.env.escrowAddress,
	});
	console.log(`[${config.name}] wallet ${chain.address} on chain ${config.env.chainId}`);

	const agent = await Agent.create(config, chain);

	const stop = await startAgentServer(agent, config.env.listenPort);

	const shutdown = async (sig: string) => {
		console.log(`\n[${config.name}] received ${sig}, shutting down`);
		await stop();
		if (agent.finalSummary) {
			console.log(`[${config.name}] final summary: ${agent.finalSummary}`);
		}
		process.exit(0);
	};
	process.on('SIGINT', () => void shutdown('SIGINT'));
	process.on('SIGTERM', () => void shutdown('SIGTERM'));

	if (config.initialTask) {
		console.log(`[${config.name}] initial task loaded — beginning conversation`);
		try {
			await agent.kickoff(config.initialTask);
		} catch (err) {
			console.error(`[${config.name}] initial task failed:`, err);
		}
	} else {
		console.log(`[${config.name}] no task.md — waiting for peer to initiate`);
	}
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
