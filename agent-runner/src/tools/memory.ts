import { tool } from 'ai';
import { z } from 'zod';
import { kvGet, kvSet } from '../store/index.js';

export const rememberFact = tool({
  description: 'Persist a key-value fact to encrypted 0G storage for later recall',
  parameters: z.object({
    key: z.string().describe('Unique fact identifier'),
    value: z.string().describe('Value to store'),
  }),
  execute: async ({ key, value }) => {
    await kvSet(key, value);
    return { stored: true, key };
  },
});

export const recallFact = tool({
  description: 'Retrieve a previously stored fact from encrypted 0G storage',
  parameters: z.object({
    key: z.string().describe('Fact identifier to look up'),
  }),
  execute: async ({ key }) => {
    const value = await kvGet(key);
    return { key, value };
  },
});
