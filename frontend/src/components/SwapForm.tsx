import { useState } from 'react'
import { useAccount } from 'wagmi'
import { zeroGTestnet } from '../wagmi'

interface Token {
  symbol: string
  name: string
  address: string
  decimals: number
}

const TOKENS: Token[] = [
  { symbol: 'ETH',  name: 'Ether',        address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin',      address: '',  decimals: 6 },
  { symbol: 'USDT', name: 'Tether USD',    address: '',  decimals: 6 },
  { symbol: 'WBTC', name: 'Wrapped BTC',   address: '',  decimals: 8 },
  { symbol: 'DumE20', name: 'DummyERC20',  address: import.meta.env.VITE_TOKEN_ADDRESS || '', decimals: 18 },
]

type AgentStep =
  | { id: 'broadcast'; label: 'Broadcasting swap intent…'; done: false }
  | { id: 'discovery'; label: 'Discovered 3 LP agents'; done: boolean }
  | { id: 'negotiate'; label: 'Negotiating best rate…'; done: boolean }
  | { id: 'lock';      label: 'LP locking funds in MIST escrow…'; done: boolean }
  | { id: 'settle';    label: 'Ready to settle'; done: boolean }

const STEPS: AgentStep[] = [
  { id: 'broadcast', label: 'Broadcasting swap intent…', done: false },
  { id: 'discovery', label: 'Discovered 3 LP agents',   done: false },
  { id: 'negotiate', label: 'Negotiating best rate…',   done: false },
  { id: 'lock',      label: 'LP locking funds in MIST escrow…', done: false },
  { id: 'settle',    label: 'Ready to settle',          done: false },
]

type SwapPhase = 'input' | 'negotiating' | 'settled'

function TokenSelect({ value, onChange }: { value: Token; onChange: (t: Token) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-og-card border border-og-border rounded-xl px-3 py-2 hover:border-og-border2 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-mist-purple to-mist-cyan flex items-center justify-center text-xs font-bold">
          {value.symbol[0]}
        </span>
        <span className="font-semibold text-sm">{value.symbol}</span>
        <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-44 bg-og-card border border-og-border rounded-xl shadow-xl overflow-hidden">
          {TOKENS.map(t => (
            <button
              key={t.symbol}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-og-card2 transition-colors text-left"
              onClick={() => { onChange(t); setOpen(false) }}
            >
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-mist-purple to-mist-cyan flex items-center justify-center text-xs font-bold">
                {t.symbol[0]}
              </span>
              <div>
                <p className="text-sm font-medium">{t.symbol}</p>
                <p className="text-xs text-gray-500">{t.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StepIcon({ active, done }: { active: boolean; done: boolean }) {
  if (done) return (
    <span className="w-5 h-5 rounded-full bg-mist-green flex items-center justify-center flex-shrink-0">
      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </span>
  )
  if (active) return (
    <span className="w-5 h-5 rounded-full border-2 border-mist-purple flex items-center justify-center flex-shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-mist-purple animate-pulse-slow" />
    </span>
  )
  return <span className="w-5 h-5 rounded-full border border-og-border2 flex-shrink-0" />
}

export function SwapForm() {
  const { address, chain } = useAccount()

  const [fromToken, setFromToken] = useState(TOKENS[0])
  const [toToken, setToToken]     = useState(TOKENS[1])
  const [fromAmount, setFromAmount] = useState('')
  const [slippage, setSlippage]   = useState('0.5')
  const [phase, setPhase]         = useState<SwapPhase>('input')
  const [stepIdx, setStepIdx]     = useState(0)

  const isConnected = !!address && chain?.id === zeroGTestnet.id
  const canSwap = isConnected && !!fromAmount && Number(fromAmount) > 0

  // Simulated quote: 1 ETH ≈ 2800 USDC
  const RATE: Record<string, Record<string, number>> = {
    ETH:  { USDC: 2800, USDT: 2799.5, WBTC: 0.063, DumE20: 1000 },
    USDC: { ETH: 1/2800, WBTC: 1/44000, DumE20: 0.0004 },
  }
  const rate = RATE[fromToken.symbol]?.[toToken.symbol]
  const toAmount = rate && fromAmount ? (Number(fromAmount) * rate).toFixed(6) : '—'
  const priceImpact = fromAmount && Number(fromAmount) > 100 ? '< 0.01%' : '< 0.01%'

  function flipTokens() {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmount('')
  }

  function initiateSwap() {
    setPhase('negotiating')
    setStepIdx(0)
    // Simulate agent negotiation
    const delays = [1200, 2000, 3200, 5000]
    delays.forEach((d, i) => {
      setTimeout(() => setStepIdx(i + 1), d)
    })
    setTimeout(() => setPhase('settled'), 6500)
  }

  function reset() {
    setPhase('input')
    setStepIdx(0)
    setFromAmount('')
  }

  return (
    <div className="space-y-3">
      {/* From token */}
      <div className="input-box">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">You sell</span>
          {address && <span className="text-xs text-gray-600">Bal: —</span>}
        </div>
        <div className="flex items-center gap-3">
          <TokenSelect value={fromToken} onChange={setFromToken} />
          <input
            className="flex-1 bg-transparent text-right text-xl font-semibold outline-none placeholder-gray-700 text-white"
            placeholder="0.00"
            type="number"
            min="0"
            value={fromAmount}
            onChange={e => setFromAmount(e.target.value)}
            disabled={phase !== 'input'}
          />
        </div>
      </div>

      {/* Flip arrow */}
      <div className="flex justify-center">
        <button className="divider-arrow" onClick={flipTokens} disabled={phase !== 'input'}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* To token */}
      <div className="input-box">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">You receive (private)</span>
          <span className="badge bg-mist-purple/15 text-mist-purple border border-mist-purple/30">
            via MIST
          </span>
        </div>
        <div className="flex items-center gap-3">
          <TokenSelect value={toToken} onChange={setToToken} />
          <span className="flex-1 text-right text-xl font-semibold text-gray-400">
            {toAmount}
          </span>
        </div>
      </div>

      {/* Trade details */}
      {fromAmount && Number(fromAmount) > 0 && (
        <div className="card-inner space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-500">
            <span>Rate</span>
            <span className="text-gray-300">
              1 {fromToken.symbol} ≈ {rate?.toFixed(4) ?? '—'} {toToken.symbol}
            </span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Max slippage</span>
            <div className="flex gap-1">
              {['0.1', '0.5', '1.0'].map(s => (
                <button key={s}
                  className={`px-2 py-0.5 rounded ${slippage === s ? 'bg-mist-purple/30 text-mist-purple' : 'text-gray-500 hover:text-gray-300'}`}
                  onClick={() => setSlippage(s)}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Price impact</span>
            <span className="text-mist-green">{priceImpact}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Route</span>
            <span className="text-gray-300">MIST Privacy Protocol</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Settlement</span>
            <span className="text-gray-300">Private · ~30s</span>
          </div>
        </div>
      )}

      {/* Agent status panel */}
      {phase !== 'input' && (
        <div className="card-inner border border-mist-purple/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-mist-purple">
              {phase === 'settled' ? 'Agent matched a deal' : 'Agent negotiating…'}
            </span>
            {phase === 'negotiating' && (
              <svg className="w-4 h-4 text-mist-purple animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
          </div>
          <div className="space-y-2.5">
            {STEPS.map((step, i) => {
              const done   = i < stepIdx
              const active = i === stepIdx && phase === 'negotiating'
              return (
                <div key={step.id} className="flex items-center gap-2.5">
                  <StepIcon active={active} done={done} />
                  <span className={`text-xs ${done ? 'text-gray-300' : active ? 'text-white' : 'text-gray-600'}`}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>

          {phase === 'settled' && (
            <div className="border-t border-og-border pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Best quote</span>
                <span className="font-semibold text-mist-green">{toAmount} {toToken.symbol}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">LP Agent</span>
                <span className="font-mono text-gray-400">0x9f3a…d82c</span>
              </div>
              <p className="text-xs text-amber-400 bg-amber-900/10 border border-amber-800/30 rounded-lg px-3 py-2">
                Proceed to the <strong>Deposit</strong> tab to complete the private settlement.
              </p>
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      {phase === 'input' && (
        <button
          className="btn-primary w-full py-4 text-base glow-purple"
          disabled={!canSwap}
          onClick={initiateSwap}
        >
          {!address
            ? 'Connect Wallet'
            : chain?.id !== zeroGTestnet.id
              ? 'Switch to 0G Testnet'
              : !fromAmount || Number(fromAmount) === 0
                ? 'Enter an amount'
                : `Swap ${fromToken.symbol} → ${toToken.symbol} Privately`}
        </button>
      )}

      {phase === 'negotiating' && (
        <button className="btn-ghost w-full py-4 text-sm" disabled>
          <span className="animate-pulse">Agent working…</span>
        </button>
      )}

      {phase === 'settled' && (
        <button className="btn-ghost w-full py-2 text-sm" onClick={reset}>
          New swap
        </button>
      )}
    </div>
  )
}
