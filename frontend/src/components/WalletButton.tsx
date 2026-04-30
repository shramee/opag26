import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { zeroGTestnet } from '../wagmi'

export function WalletButton() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  if (isConnected && address) {
    const onWrongChain = chain?.id !== zeroGTestnet.id
    return (
      <div className="flex items-center gap-2">
        {onWrongChain ? (
          <button
            className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400
                       px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors"
            onClick={() => switchChain({ chainId: zeroGTestnet.id })}
            disabled={isSwitching}
          >
            {isSwitching ? 'Switching…' : 'Switch to 0G'}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs bg-mist-green/10 border border-mist-green/20
                           text-mist-green px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-mist-green animate-pulse-slow" />
            0G Testnet
          </span>
        )}
        <div className="flex items-center gap-2 bg-og-card2 border border-og-border rounded-xl px-3 py-1.5">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-mist-purple to-mist-cyan" />
          <span className="text-sm font-mono text-gray-300">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          <button
            className="text-gray-600 hover:text-gray-300 transition-colors ml-1"
            onClick={() => disconnect()}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  const connector = connectors.find(c => c.type === 'injected') ?? connectors[0]
  return (
    <button
      className="btn-primary text-sm py-2 px-4"
      onClick={() => connect({ connector })}
      disabled={isPending}
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}
