import { tool } from 'ai';
import { ethers } from 'ethers';
import { z } from 'zod';
import { config } from '../config.js';

function provider() {
  return new ethers.JsonRpcProvider(config.rpc.url);
}

export const getWalletBalance = tool({
  description: 'Get the ETH balance of a wallet address in ether',
  parameters: z.object({
    address: z.string().describe('EVM wallet address (0x…)'),
  }),
  execute: async ({ address }) => {
    const balance = await provider().getBalance(address);
    return { address, balance: ethers.formatEther(balance), unit: 'ETH' };
  },
});

export const getTokenBalance = tool({
  description: 'Get the ERC-20 token balance of a wallet address',
  parameters: z.object({
    address: z.string().describe('Wallet address'),
    token: z.string().describe('ERC-20 token contract address'),
  }),
  execute: async ({ address, token }) => {
    const erc20 = new ethers.Contract(
      token,
      ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
      provider(),
    );
    const [raw, decimals, symbol] = await Promise.all([
      erc20.balanceOf(address) as Promise<bigint>,
      erc20.decimals() as Promise<number>,
      erc20.symbol() as Promise<string>,
    ]);
    return { address, token, balance: ethers.formatUnits(raw, decimals), symbol };
  },
});

export const getBlockNumber = tool({
  description: 'Get the latest block number from the connected chain',
  parameters: z.object({}),
  execute: async () => {
    const block = await provider().getBlockNumber();
    return { blockNumber: block };
  },
});
