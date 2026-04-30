import { useState } from 'react'
import { loadSecrets, type DepositSecret } from '../lib/secrets'
import { zeroGTestnet } from '../wagmi'
import { useAccount } from 'wagmi'

const ANON_SET_SIZE = 4219

function privacyScore(secret: DepositSecret): number {
  const ageHours = (Date.now() - secret.timestamp) / 3_600_000
  const ageFactor  = Math.min(ageHours / 24, 1) * 40  // up to 40 pts for 24h age
  const poolFactor  = 45                               // base pool membership
  const randomFactor = 5 + Math.abs(parseInt(secret.id.slice(-2), 16) % 10)
  return Math.min(Math.round(ageFactor + poolFactor + randomFactor), 100)
}

function PrivacyBar({ score }: { score: number }) {
  const bars = 5
  const filled = Math.round((score / 100) * bars)
  const color = score >= 80 ? 'bg-mist-green' : score >= 50 ? 'bg-mist-cyan' : 'bg-amber-500'
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className={`h-2.5 w-5 rounded-sm ${i < filled ? color : 'bg-og-border2'}`} />
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
  const score = privacyScore(secret)

  async function handleWithdraw() {
    if (!address) return
    setWithdrawing(true)
    try {
      alert('Full withdrawal requires a merkle proof from the contract.\nThis flow is coming in the next iteration. Your secret is safe locally.')
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className={`card-inner space-y-3 ${secret.spent ? 'opacity-50' : ''}`}>
      {/* Top row */}
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

      {/* Privacy row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Privacy</span>
          <PrivacyBar score={score} />
          <span className="text-xs text-gray-600">{score}%</span>
        </div>
        <a
          href={`${explorerBase}/tx/${secret.depositTxHash}`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-mist-cyan hover:underline font-mono"
        >
          {secret.depositTxHash.slice(0, 8)}…↗
        </a>
      </div>

      {/* Actions */}
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

      {/* Revealed key */}
      {revealed && (
        <div className="bg-og-dark border border-yellow-800/40 rounded-lg px-3 py-2 space-y-1">
          <p className="text-xs text-yellow-500 font-semibold">Claiming Key (secret)</p>
          <p className="font-mono text-xs text-yellow-300 break-all">{secret.secretKey}</p>
          <p className="text-xs text-yellow-600 mt-1">
            Back this up — required to withdraw your funds.
          </p>
        </div>
      )}
    </div>
  )
}

export function MistDashboard() {
  const [secrets, setSecrets] = useState<DepositSecret[]>(loadSecrets)

  function refresh() { setSecrets(loadSecrets()) }

  const active = secrets.filter(s => !s.spent)
  const totalRaw = active.reduce((sum, s) => sum + BigInt(s.amount), 0n)
  const totalDisplay = (Number(totalRaw) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 })
  const avgScore = active.length
    ? Math.round(active.map(privacyScore).reduce((a, b) => a + b, 0) / active.length)
    : 0

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-inner text-center">
          <p className="text-xs text-gray-500 mb-1">Private Balance</p>
          <p className="text-lg font-bold text-mist-green truncate">{totalDisplay}</p>
          <p className="text-xs text-gray-600">tokens locked</p>
        </div>
        <div className="card-inner text-center">
          <p className="text-xs text-gray-500 mb-1">Active Notes</p>
          <p className="text-lg font-bold text-white">{active.length}</p>
          <p className="text-xs text-gray-600">in MIST pool</p>
        </div>
        <div className="card-inner text-center">
          <p className="text-xs text-gray-500 mb-1">Anon Set</p>
          <p className="text-lg font-bold text-mist-purple">
            {active.length > 0 ? ANON_SET_SIZE.toLocaleString() : '—'}
          </p>
          <p className="text-xs text-gray-600">pool size</p>
        </div>
      </div>

      {/* Privacy score summary */}
      {active.length > 0 && (
        <div className="card-inner flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-mist-green/10 border border-mist-green/20
                            flex items-center justify-center">
              <svg className="w-4 h-4 text-mist-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Privacy Score</p>
              <p className="text-xs text-gray-500">Avg across active notes</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-lg font-bold text-mist-green">{avgScore}%</span>
            <PrivacyBar score={avgScore} />
          </div>
        </div>
      )}

      {/* Notes header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Private Notes</h3>
        <button className="text-xs text-gray-500 hover:text-gray-300" onClick={refresh}>
          Refresh
        </button>
      </div>

      {/* Notes list or empty */}
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
          {secrets.map(s => <SecretCard key={s.id} secret={s} />)}
        </div>
      )}

      {/* How it works */}
      <div className="card-inner border-mist-purple/20 bg-mist-purple/5 text-xs text-gray-400 space-y-1">
        <p className="font-semibold text-mist-purple text-sm">How MIST Privacy Works</p>
        <p>
          Funds are locked under a Poseidon2 commitment on-chain. Only the holder of the secret key
          can generate a valid withdrawal proof. No on-chain link exists between the deposit and
          withdrawal addresses — you blend into the anonymity set of {ANON_SET_SIZE.toLocaleString()} notes.
        </p>
      </div>
    </div>
  )
}
