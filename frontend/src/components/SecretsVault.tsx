import { useState } from 'react'
import { loadSecrets, type DepositSecret } from '../lib/secrets'
import { zeroGTestnet } from '../wagmi'

export function SecretsVault() {
  const [secrets, setSecrets] = useState<DepositSecret[]>(loadSecrets)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  function refresh() {
    setSecrets(loadSecrets())
  }

  function toggleReveal(id: string) {
    setRevealed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (secrets.length === 0) {
    return (
      <div className="card text-center text-gray-500 text-sm py-10">
        No secrets stored yet. Make a deposit to generate your first secret.
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Secrets Vault</h2>
        <button className="text-xs text-gray-500 hover:text-gray-300" onClick={refresh}>
          Refresh
        </button>
      </div>

      <p className="text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">
        These secret keys are stored only in your browser. Export and back them up —
        losing a secret key means losing access to the deposited funds.
      </p>

      <div className="space-y-3">
        {secrets.map(s => (
          <SecretRow
            key={s.id}
            secret={s}
            isRevealed={revealed.has(s.id)}
            onToggleReveal={() => toggleReveal(s.id)}
          />
        ))}
      </div>
    </div>
  )
}

function SecretRow({
  secret,
  isRevealed,
  onToggleReveal,
}: {
  secret: DepositSecret
  isRevealed: boolean
  onToggleReveal: () => void
}) {
  const explorerBase = zeroGTestnet.blockExplorers.default.url
  const date = new Date(secret.timestamp).toLocaleString()
  const shortAddr = `${secret.tokenAddress.slice(0, 6)}…${secret.tokenAddress.slice(-4)}`
  const shortTx = `${secret.depositTxHash.slice(0, 10)}…${secret.depositTxHash.slice(-6)}`

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-2 text-sm ${
        secret.spent
          ? 'border-gray-700 bg-gray-900/30 opacity-60'
          : 'border-og-border bg-og-dark'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-300 font-mono text-xs">{date}</span>
        {secret.spent && (
          <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
            Spent
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-gray-500">Token</span>
        <span className="font-mono text-gray-300">{shortAddr}</span>

        <span className="text-gray-500">Amount (raw)</span>
        <span className="font-mono text-gray-300">{BigInt(secret.amount).toLocaleString()}</span>

        <span className="text-gray-500">Deposit Tx</span>
        <a
          href={`${explorerBase}/tx/${secret.depositTxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-og-blue hover:underline"
        >
          {shortTx}
        </a>
      </div>

      <div className="pt-1 border-t border-og-border">
        <button
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
          onClick={onToggleReveal}
        >
          {isRevealed ? 'Hide secret key' : 'Reveal secret key'}
        </button>
        {isRevealed && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-gray-500">Secret Key (claiming key)</p>
            <p className="font-mono text-xs text-yellow-300 break-all bg-yellow-900/10 border border-yellow-800/30 rounded px-2 py-1">
              {secret.secretKey}
            </p>
            <p className="text-xs text-gray-500 mt-1">Commitment Hash (on-chain hash_)</p>
            <p className="font-mono text-xs text-gray-400 break-all">
              {secret.commitmentHash}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
