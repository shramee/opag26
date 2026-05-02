import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Request, Response } from 'express';
import { config } from './config.js';
import {
  getWalletBalance,
  getTokenBalance,
  getBlockNumber,
  rememberFact,
  recallFact,
} from './tools/index.js';

const zerog = createOpenAI({
  baseURL: config.zerog.baseURL,
  apiKey: config.zerog.apiKey,
});

const model = zerog(config.zerog.model);

const tools = {
  getWalletBalance,
  getTokenBalance,
  getBlockNumber,
  rememberFact,
  recallFact,
};

export async function agentHandler(req: Request, res: Response): Promise<void> {
  const { prompt } = req.body as { prompt?: string };

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  const result = await generateText({
    model,
    tools,
    maxSteps: 5,
    prompt,
  });

  res.json({
    response: result.text,
    steps: result.steps.length,
    usage: result.usage,
  });
}
