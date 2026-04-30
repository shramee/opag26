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
  { symbol: 'ETH',    name: 'Ether',      address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  { symbol: 'USDC',   name: 'USD Coin',   address: '', decimals: 6 },
  { symbol: 'USDT',   name: 'Tether USD', address: '', decimals: 6 },
  { symbol: 'WBTC',   name: 'Wrapped BTC',address: '', decimals: 8 },
  { symbol: 'DumE20', name: 'DummyERC20', address: import.meta.env.VITE_TOKEN_ADDRESS || '', decimals: 18 },
]

interface LPAgent {
  id: string
  address: string
  quoteMultiplier: number // applied to base rate
  repScore: number
  latencyMs: number
}

const LP_AGENTS: LPAgent[] = [
  { id: 'lp1', address: '0x9f3a…d82c', quoteMultiplier: 1.0004, repScore: 98, latencyMs: 1200 },
  { id: 'lp2', address: '0x4b2e…f91a', quoteMultiplier: 0.9985, repScore: 95, latencyMs: 800  },
  { id: 'lp3', address: '0x7c1d…a34f', quoteMultiplier: 1.0001, repScore: 97, latencyMs: 2100 },
]

const AGENT_STEPS = [
  'Broadcasting swap intent to AXL network…',
  'Discovered 3 LP agents on 0G mesh',
  'Agents bidding — negotiating best rate…',
  'Best LP locking funds in MIST escrow…',
  'Private deal matched · Settlement ready',
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
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-mist-purple to-mist-cyan flex items-center justify-center text-xs font-bold text-white">
          {value.symbol[0]}
        </span>
        <span className="font-semibold text-sm">{value.symbol}</span>
        <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-48 bg-og-card border border-og-border rounded-xl shadow-xl overflow-hidden">
          {TOKENS.map(t => (
            <button
              key={t.symbol}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-og-card2 transition-colors text-left"
              onClick={() => { onChange(t); setOpen(false) }}
            >
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-mist-purple to-mist-cyan flex items-center justify-center text-xs font-bold text-white">
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

function StepRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex-shrink-0">
        {done ? (
          <span className="w-4 h-4 rounded-full bg-mist-green flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        ) : active ? (
          <span className="w-4 h-4 rounded-full border-2 border-mist-purple flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-mist-purple animate-pulse-slow" />
          </span>
        ) : (
          <span className="w-4 h-4 rounded-full border border-og-border2" />
        )}
      </div>
      <span className={`text-xs leading-relaxed ${done ? 'text-gray-300' : active ? 'text-white' : 'text-gray-600'}`}>
        {label}
      </span>
    </div>
  )
}

function LPBidRow({
  agent, baseRate, toSymbol, isBest, visible,
}: {
  agent: LPAgent; baseRate: number; toSymbol: string; isBest: boolean; visible: boolean
}) {
  if (!visible) return null
  const quote = baseRate * agent.quoteMultiplier
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-all ${
      isBest ? 'border-mist-green/40 bg-mist-green/5' : 'border-og-border bg-og-dark/40'
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${isBest ? 'bg-mist-green' : 'bg-gray-600'}`} />
        <span className="font-mono text-xs text-gray-400 truncate">{agent.address}</span>
        {isBest && (
          <span className="flex-shrink-0 text-xs bg-mist-green/20 text-mist-green px-1.5 py-0.5 rounded font-semibold">
            BEST
          </span>
        )}
      </div>
      <div className="text-right ml-3 flex-shrink-0">
        <p className={`text-xs font-semibold ${isBest ? 'text-mist-green' : 'text-gray-400'}`}>
          {quote.toFixed(4)} {toSymbol}
        </p>
        <p className="text-xs text-gray-600">{agent.repScore}% rep</p>
      </div>
    </div>
  )
}

export function SwapForm() {
  const { address, chain } = useAccount()

  const [fromToken, setFromToken] = useState(TOKENS[0])
  const [toToken, setToToken]     = useState(TOKENS[1])
  const [fromAmount, setFromAmount] = useState('')
  const [slippage, setSlippage]   = useState('0.5')
  const [phase, setPhase]         = useState<SwapPhase>('input')
  const [stepIdx, setStepIdx]     = useState(0)
  const [visibleLPs, setVisibleLPs] = useState(0)

  const isConnected = !!address && chain?.id === zeroGTestnet.id
  const canSwap = isConnected && !!fromAmount && Number(fromAmount) > 0

  const BASE_RATES: Record<string, Record<string, number>> = {
    ETH:  { USDC: 2800, USDT: 2799, WBTC: 0.063, DumE20: 1000 },
    USDC: { ETH: 1/2800, WBTC: 1/44000, DumE20: 0.0004 },
    USDT: { ETH: 1/2799, USDC: 1 },
    WBTC: { ETH: 1/0.063, USDC: 44000 },
    DumE20: { ETH: 0.001, USDC: 2500 },
  }
  const rate = BASE_RATES[fromToken.symbol]?.[toToken.symbol]
  const bestLP = LP_AGENTS[0] // highest multiplier
  const effectiveRate = rate ? rate * bestLP.quoteMultiplier : undefined
  const toAmount = effectiveRate && fromAmount ? (Number(fromAmount) * effectiveRate).toFixed(6) : '—'

  function flipTokens() {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmount('')
  }

  function initiateSwap() {
    setPhase('negotiating')
    setStepIdx(0)
    setVisibleLPs(0)
    const stepDelays = [1300, 2600, 4000, 5600]
    stepDelays.forEach((d, i) => setTimeout(() => setStepIdx(i + 1), d))
    setTimeout(() => setVisibleLPs(1), 3000)
    setTimeout(() => setVisibleLPs(2), 3400)
    setTimeout(() => setVisibleLPs(3), 3800)
    setTimeout(() => setPhase('settled'), 7200)
  }

  function reset() {
    setPhase('input')
    setStepIdx(0)
    setFromAmount('')
    setVisibleLPs(0)
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

      {/* Trade details — only in input phase */}
      {phase === 'input' && fromAmount && Number(fromAmount) > 0 && rate && (
        <div className="card-inner space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-500">
            <span>Rate</span>
            <span className="text-gray-300">
              1 {fromToken.symbol} ≈ {(rate * bestLP.quoteMultiplier).toFixed(4)} {toToken.symbol}
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
            <span className="text-mist-green">{'< 0.01%'}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Network</span>
            <span className="text-gray-300">AXL p2p · 0G Testnet</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Settlement</span>
            <span className="text-gray-300">MIST ZK escrow · ~30s</span>
          </div>
        </div>
      )}

      {/* Agent negotiation panel */}
      {phase !== 'input' && (
        <div className="card-inner border border-mist-purple/20 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                phase === 'settled' ? 'bg-mist-green' : 'bg-mist-purple animate-pulse-slow'
              }`} />
              <span className="text-sm font-medium text-mist-purple">
                {phase === 'settled' ? 'Deal matched · AXL' : 'Broker agent negotiating via AXL…'}
              </span>
            </div>
            {phase === 'negotiating' && (
              <svg className="w-4 h-4 text-mist-purple animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
          </div>

          {/* Step list */}
          <div className="space-y-2">
            {AGENT_STEPS.map((label, i) => (
              <StepRow
                key={i}
                label={label}
                done={i < stepIdx}
                active={i === stepIdx && phase === 'negotiating'}
              />
            ))}
          </div>

          {/* LP Bids */}
          {visibleLPs > 0 && rate && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">
                LP Agents Bidding
              </p>
              {LP_AGENTS.map((lp, i) => (
                <LPBidRow
                  key={lp.id}
                  agent={lp}
                  baseRate={rate}
                  toSymbol={toToken.symbol}
                  isBest={lp.id === bestLP.id}
                  visible={i < visibleLPs}
                />
              ))}
            </div>
          )}

          {/* Settled summary */}
          {phase === 'settled' && (
            <div className="border-t border-og-border pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Matched LP</span>
                <span className="font-mono text-gray-400">{bestLP.address}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Best quote</span>
                <span className="font-semibold text-mist-green">{toAmount} {toToken.symbol}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">LP Reputation</span>
                <span className="text-gray-300">{bestLP.repScore}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">MIST Escrow</span>
                <span className="text-mist-green">Locked ✓</span>
              </div>
              <p className="text-xs text-amber-400 bg-amber-900/10 border border-amber-800/30 rounded-lg px-3 py-2 mt-1">
                Proceed to the <strong>Deposit</strong> tab to complete private settlement.
              </p>
            </div>
          )}
        </div>
      )}

      {/* CTA button */}
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
          <span className="animate-pulse">Agent negotiating via AXL…</span>
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
