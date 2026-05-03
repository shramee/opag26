#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const cli = resolve(__dir, '..', 'src', 'cli.ts');
const tsx = resolve(__dir, '..', 'node_modules', '.bin', 'tsx');

const child = spawn(tsx, [cli, ...process.argv.slice(2)], {
	stdio: 'inherit',
	env: process.env,
});

child.on('exit', (code, signal) => {
	if (signal) process.kill(process.pid, signal);
	else process.exit(code ?? 0);
});
