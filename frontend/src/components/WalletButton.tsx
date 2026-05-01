import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { zeroGTestnet } from '../wagmi'

type WalletButtonProps = {
  btnClass?: string
  addrClass?: string
}

export function WalletButton({ btnClass = '', addrClass = '' }: WalletButtonProps) {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  if (isConnected && address) {
    const onWrongChain = chain?.id !== zeroGTestnet.id
    console.log('WalletButton', { chID: zeroGTestnet.id, chIdConnected: chain?.id, onWrongChain })
    return (
      <div className="flex items-center gap-2 font-mono text-xs">
        {onWrongChain ? (
          <button
            onClick={() => switchChain({ chainId: zeroGTestnet.id })}
            disabled={isSwitching}
            className={`border border-mx-amber/50 text-mx-amber px-3 py-1.5 uppercase tracking-widest
                       hover:bg-mx-amber hover:text-black transition-all disabled:opacity-40 ${btnClass}`}
          >
            {isSwitching ? 'SWITCHING…' : '[ SWITCH TO 0G ]'}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 border border-mx-green/30 text-mx-dim px-2.5 py-1.5">
            <span className="w-1.5 h-1.5 bg-mx-green animate-pulse-slow" />
            0G LIVE
          </span>
        )}
        <div className={`flex items-center gap-2 border border-mx-green/20 px-3 py-1.5 text-mx-dim ${addrClass}`}>
          <span>{address.slice(0, 6)}…{address.slice(-4)}</span>
          <button
            onClick={() => disconnect()}
            className="text-mx-deep hover:text-mx-red transition-colors ml-1"
            title="Disconnect"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  const connector = connectors.find(c => c.type === 'injected') ?? connectors[0]
  return (
    <button
      onClick={() => connect({ connector })}
      disabled={isPending}
      className={`border border-mx-green text-mx-green font-mono text-xs uppercase tracking-widest
                 px-4 py-2 hover:bg-mx-green hover:text-black transition-all
                 disabled:opacity-40 disabled:cursor-not-allowed ${btnClass}`}
    >
      {isPending ? 'CONNECTING…' : '[ CONNECT WALLET ]'}
    </button>
  )
}
