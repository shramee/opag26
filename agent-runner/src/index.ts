import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { agentHandler } from './agent.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/agent', agentHandler);

app.listen(config.port, () => {
  console.log(`Agent runner listening on port ${config.port}`);
});
