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
      <div className="flex items-center gap-3">
        {onWrongChain ? (
          <button
            className="btn-primary text-sm py-2 px-4 bg-amber-500 hover:bg-amber-400"
            onClick={() => switchChain({ chainId: zeroGTestnet.id })}
            disabled={isSwitching}
          >
            {isSwitching ? 'Switching…' : 'Switch to 0G Testnet'}
          </button>
        ) : (
          <span className="text-xs bg-green-900/40 border border-green-700/50 text-green-400 px-3 py-1 rounded-full">
            0G Testnet
          </span>
        )}
        <span className="text-sm text-gray-400 font-mono">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button
          className="btn-secondary text-sm py-2 px-4"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    )
  }

  const injectedConnector = connectors.find(c => c.type === 'injected') ?? connectors[0]

  return (
    <button
      className="btn-primary"
      onClick={() => connect({ connector: injectedConnector })}
      disabled={isPending}
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}
