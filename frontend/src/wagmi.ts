import { createConfig, http } from 'wagmi'
import { injected, metaMask } from 'wagmi/connectors'
import { defineChain } from 'viem'

// 0G Newton Testnet — https://build.0g.ai
export const zeroGTestnet = defineChain({
  id: 16601,
  name: '0G Testnet Newton',
  nativeCurrency: { name: '0G', symbol: 'A0GI', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
    public: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: {
      name: '0G Explorer',
      url: 'https://chainscan-newton.0g.ai',
    },
  },
  testnet: true,
})

export const wagmiConfig = createConfig({
  chains: [zeroGTestnet],
  connectors: [injected(), metaMask()],
  transports: {
    [zeroGTestnet.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
