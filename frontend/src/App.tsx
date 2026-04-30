import { useState } from 'react'
import { WalletButton } from './components/WalletButton'
import { SwapForm } from './components/SwapForm'
import { DepositForm } from './components/DepositForm'
import { MistDashboard } from './components/MistDashboard'

type Tab = 'swap' | 'deposit' | 'dashboard'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'swap',      label: 'Swap',      icon: '⇄' },
  { id: 'deposit',   label: 'Deposit',   icon: '🔒' },
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
]

function MistLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-mist-purple to-mist-cyan opacity-90" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white text-sm font-black">M</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-bold tracking-tight leading-none text-white">MIST OTC</p>
        <p className="text-xs text-gray-500 leading-none mt-0.5">Dark Pool · 0G</p>
      </div>
    </div>
  )
}

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 bg-og-card2 border border-og-border rounded-xl p-1">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
            active === t.id ? 'bg-og-card text-white shadow-sm border border-og-border' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <span className="text-base leading-none">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function PoweredBy() {
  return (
    <div className="flex items-center justify-center gap-4 text-xs text-gray-700 pt-2">
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-mist-purple" />
        MIST Privacy
      </span>
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-mist-cyan" />
        0G Testnet
      </span>
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-og-blue" />
        Poseidon2 ZK
      </span>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('swap')

  return (
    <div className="min-h-screen bg-og-dark bg-mist-glow">
      {/* Header */}
      <header className="border-b border-og-border/60 px-5 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <MistLogo />
          <WalletButton />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Tab bar */}
        <TabBar active={tab} onChange={setTab} />

        {/* Cards */}
        <div className="card glow-purple">
          {/* Card header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-white">
                {tab === 'swap'      && 'Private OTC Swap'}
                {tab === 'deposit'   && 'Deposit into Chamber'}
                {tab === 'dashboard' && 'MIST Dashboard'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {tab === 'swap'      && 'Agent-negotiated, privacy-preserving settlement'}
                {tab === 'deposit'   && 'Lock funds under a Poseidon2 commitment'}
                {tab === 'dashboard' && 'Your private notes and balances'}
              </p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-mist-purple/10 border border-mist-purple/20
                            flex items-center justify-center text-mist-purple text-sm">
              {TABS.find(t => t.id === tab)?.icon}
            </div>
          </div>

          {/* Tab content */}
          {tab === 'swap'      && <SwapForm />}
          {tab === 'deposit'   && <DepositForm />}
          {tab === 'dashboard' && <MistDashboard />}
        </div>

        {/* Privacy notice */}
        {tab === 'swap' && (
          <div className="card-inner text-xs text-gray-500 space-y-1">
            <p className="text-gray-400 font-medium">How the Dark Pool works</p>
            <p>
              Your swap intent is broadcast via the Gensyn AXL p2p network.
              LP agents bid privately, locking their side into a MIST ZK escrow.
              You then deposit your side into Chamber to complete the atomic swap —
              with no MEV exposure and no on-chain footprint linking the parties.
            </p>
          </div>
        )}

        <PoweredBy />
      </main>
    </div>
  )
}
