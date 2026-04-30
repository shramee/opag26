import { useState } from 'react'
import { loadSecrets, type DepositSecret } from '../lib/secrets'
import { zeroGTestnet } from '../wagmi'
import { useAccount } from 'wagmi'

function PrivacyScore({ score }: { score: number }) {
  const bars = 5
  const filled = Math.round((score / 100) * bars)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i}
          className={`h-3 w-5 rounded-sm ${i < filled ? 'bg-mist-green' : 'bg-og-border2'}`}
        />
      ))}
    </div>
  )
}

function SecretCard({ secret }: { secret: DepositSecret }) {
  const { address } = useAccount()
  const [revealed, setRevealed] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const explorerBase = zeroGTestnet.blockExplorers.default.url
  const rawAmt = BigInt(secret.amount)
  const displayAmt = (Number(rawAmt) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 })
  const date = new Date(secret.timestamp).toLocaleDateString()
  const shortKey = `${secret.commitmentHash.slice(0, 8)}…${secret.commitmentHash.slice(-6)}`

  // Withdraw (no-ZK) requires claimingKey + merkle proof — simplified UI hint
  async function handleWithdraw() {
    if (!address) return
    setWithdrawing(true)
    try {
      // In a real flow: fetch merkleProof from contract, compute nullifier
      // For demo: call withdrawNoZk with stored claimingKey
      // This is a placeholder — full withdrawal requires proof computation
      alert('Full withdrawal requires a merkle proof from the contract.\nThis flow is coming in the next iteration. Your secret is safe locally.')
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className={`card-inner space-y-3 ${secret.spent ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-white">{shortKey}</span>
            {secret.spent && (
              <span className="badge bg-gray-700 text-gray-400">Withdrawn</span>
            )}
          </div>
          <span className="text-xs text-gray-500">{date}</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-white">{displayAmt}</p>
          <span className="text-xs text-gray-500 font-mono">
            {secret.tokenAddress.slice(0, 6)}…{secret.tokenAddress.slice(-4)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Privacy</span>
          <PrivacyScore score={85} />
        </div>
        <a
          href={`${explorerBase}/tx/${secret.depositTxHash}`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-mist-cyan hover:underline font-mono"
        >
          {secret.depositTxHash.slice(0, 8)}…↗
        </a>
      </div>

      {!secret.spent && (
        <div className="flex gap-2 pt-1">
          <button
            className="flex-1 btn-ghost text-xs py-2"
            onClick={() => setRevealed(r => !r)}
          >
            {revealed ? 'Hide key' : 'Reveal key'}
          </button>
          <button
            className="flex-1 btn-primary text-xs py-2"
            onClick={handleWithdraw}
            disabled={withdrawing || !address}
          >
            {withdrawing ? 'Processing…' : 'Withdraw'}
          </button>
        </div>
      )}

      {revealed && (
        <div className="bg-og-dark border border-yellow-800/40 rounded-lg px-3 py-2 space-y-1">
          <p className="text-xs text-yellow-500 font-semibold">Claiming Key (secret)</p>
          <p className="font-mono text-xs text-yellow-300 break-all">{secret.secretKey}</p>
          <p className="text-xs text-yellow-600 mt-1">
            Back this up — it's required to withdraw your funds.
          </p>
        </div>
      )}
    </div>
  )
}

export function MistDashboard() {
  const [secrets, setSecrets] = useState<DepositSecret[]>(loadSecrets)

  function refresh() { setSecrets(loadSecrets()) }

  const totalRaw = secrets
    .filter(s => !s.spent)
    .reduce((sum, s) => sum + BigInt(s.amount), 0n)
  const totalDisplay = (Number(totalRaw) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 })
  const depositCount = secrets.filter(s => !s.spent).length

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-inner text-center">
          <p className="text-xs text-gray-500 mb-1">Private Balance</p>
          <p className="text-lg font-bold text-mist-green">{totalDisplay}</p>
          <p className="text-xs text-gray-600">tokens locked</p>
        </div>
        <div className="card-inner text-center">
          <p className="text-xs text-gray-500 mb-1">Deposits</p>
          <p className="text-lg font-bold text-white">{depositCount}</p>
          <p className="text-xs text-gray-600">active notes</p>
        </div>
        <div className="card-inner text-center">
          <p className="text-xs text-gray-500 mb-1">Privacy</p>
          <p className="text-lg font-bold text-mist-purple">MIST</p>
          <p className="text-xs text-gray-600">ZK escrow</p>
        </div>
      </div>

      {/* Notes */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Private Notes</h3>
        <button className="text-xs text-gray-500 hover:text-gray-300" onClick={refresh}>
          Refresh
        </button>
      </div>

      {secrets.length === 0 ? (
        <div className="card-inner py-10 text-center">
          <div className="w-10 h-10 rounded-full bg-og-border mx-auto mb-3 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">No private notes yet</p>
          <p className="text-xs text-gray-600 mt-1">
            Make a deposit to create your first private note
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {secrets.map(s => (
            <SecretCard key={s.id} secret={s} />
          ))}
        </div>
      )}

      {/* Privacy info */}
      <div className="card-inner border-mist-purple/20 bg-mist-purple/5 text-xs text-gray-400 space-y-1">
        <p className="font-semibold text-mist-purple text-sm">How MIST Privacy Works</p>
        <p>Funds are locked under a Poseidon2 commitment on-chain. Only the holder of the secret key can generate a valid withdrawal proof. No link between deposit and withdrawal address is visible on-chain.</p>
      </div>
    </div>
  )
}
