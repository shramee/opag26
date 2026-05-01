import { useState } from 'react'
import { useAccount } from 'wagmi'
import { zeroGTestnet } from '../wagmi'
import { WalletButton } from './WalletButton'

const PAIR = {
  base: { symbol: 'DummyETH', decimals: 18 },
  quote: { symbol: 'DummyUSDC', decimals: 6 },
  rate: 2800,
}

const LP_OFFERS = [
  { id: 'lp1', lp: '0x9f3a…d82c', multiplier: 1.0004, rep: 98 },
  { id: 'lp2', lp: '0x7c1d…a34f', multiplier: 1.0001, rep: 97 },
  { id: 'lp3', lp: '0x4b2e…f91a', multiplier: 0.9985, rep: 95 },
]

type Phase = 'input' | 'offers' | 'confirm'

function Frame({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="mx-frame">
      <span className="absolute -top-px -left-px w-2.5 h-2.5 border-t-2 border-l-2 border-mx-green" />
      <span className="absolute -top-px -right-px w-2.5 h-2.5 border-t-2 border-r-2 border-mx-green" />
      <span className="absolute -bottom-px -left-px w-2.5 h-2.5 border-b-2 border-l-2 border-mx-green" />
      <span className="absolute -bottom-px -right-px w-2.5 h-2.5 border-b-2 border-r-2 border-mx-green" />
      {title && (
        <div className="absolute -top-2.5 left-4 px-2 bg-mx-bg text-mx-dim text-xs tracking-widest uppercase">
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

export function SwapCard() {
  const { address, chain } = useAccount()
  const [sellBase, setSellBase] = useState(true)
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [phase, setPhase] = useState<Phase>('input')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const isConnected = !!address && chain?.id === zeroGTestnet.id
  const canFind = isConnected && !!amount && Number(amount) > 0

  const fromToken = sellBase ? PAIR.base : PAIR.quote
  const toToken = sellBase ? PAIR.quote : PAIR.base
  const baseRate = sellBase ? PAIR.rate : 1 / PAIR.rate
  const toDecimals = toToken.decimals === 6 ? 2 : 6

  const sortedOffers = [...LP_OFFERS].sort((a, b) =>
    sellBase ? b.multiplier - a.multiplier : a.multiplier - b.multiplier
  )

  function offerAmount(multiplier: number) {
    if (!amount || !Number(amount)) return '—'
    const rate = sellBase ? baseRate * multiplier : baseRate / multiplier
    return (Number(amount) * rate).toFixed(toDecimals)
  }

  function offerPrice(multiplier: number) {
    const rate = sellBase ? baseRate * multiplier : baseRate / multiplier
    return rate.toFixed(toDecimals) + ' ' + toToken.symbol
  }

  function flip() {
    setSellBase(b => !b)
    setAmount('')
    setPhase('input')
    setSelectedId(null)
  }

  function reset() {
    setPhase('input')
    setSelectedId(null)
    setAmount('')
  }

  const selected = sortedOffers.find(o => o.id === selectedId)

  return (
    <div className="space-y-4 font-mono">
      {/* Swap order input */}
      <Frame title="swap order">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-mx-green text-sm font-semibold">{fromToken.symbol}</span>
            <button
              onClick={flip}
              className="w-8 h-8 border border-mx-green/40 text-mx-green flex items-center justify-center
                         hover:bg-mx-green hover:text-black transition-all text-base"
            >
              ⇄
            </button>
            <span className="text-mx-dim text-sm">{toToken.symbol}</span>
            <span className="ml-auto text-xs text-mx-deep">
              1 {PAIR.base.symbol} = {PAIR.rate.toLocaleString()} {PAIR.quote.symbol}
            </span>
          </div>

          <div className="mx-input-box flex items-center gap-3">
            <span className="text-xs text-mx-dim uppercase tracking-widest whitespace-nowrap">
              {fromToken.symbol}
            </span>
            <input
              className="flex-1 bg-transparent text-right text-xl font-semibold outline-none
                         text-mx-green placeholder-mx-deep"
              placeholder="0.00"
              type="number"
              min="0"
              value={amount}
              onChange={e => { setAmount(e.target.value); if (phase !== 'input') reset() }}
              disabled={phase === 'confirm'}
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-mx-dim uppercase tracking-widest">Slippage</span>
            <div className="flex gap-1 ml-auto">
              {['0.1', '0.5', '1.0'].map(s => (
                <button
                  key={s}
                  onClick={() => setSlippage(s)}
                  className={`px-2.5 py-1 text-xs border transition-all ${slippage === s
                    ? 'border-mx-green bg-mx-green text-black font-semibold'
                    : 'border-mx-green/30 text-mx-dim hover:border-mx-green/60 hover:text-mx-green'
                    }`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </Frame>

      {/* Find offers CTA */}
      {phase === 'input' && (
        !address || chain?.id !== zeroGTestnet.id
          ? <WalletButton btnClass='mx-btn w-full py-4' addrClass='hidden' /> :
          <button className="mx-btn w-full py-4" disabled={!canFind} onClick={() => setPhase('offers')}>
            {!address
              ? '[ CONNECT WALLET ]'
              : chain?.id !== zeroGTestnet.id
                ? '[ SWITCH TO 0G TESTNET ]'
                : !canFind
                  ? '[ ENTER AMOUNT ]'
                  : '[ FIND OFFERS ]'}
          </button>
      )}

      {/* LP offers table */}
      {(phase === 'offers' || phase === 'confirm') && (
        <Frame title="lp offers">
          <div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs text-mx-deep uppercase tracking-widest pb-2 border-b border-mx-green/20">
              <span>LP</span>
              <span className="text-right">You Receive</span>
              <span className="text-right">Price / {fromToken.symbol}</span>
            </div>

            {sortedOffers.map((offer, i) => {
              const isBest = i === 0
              const isSelected = selectedId === offer.id
              return (
                <button
                  key={offer.id}
                  onClick={() => { setSelectedId(offer.id); setPhase('confirm') }}
                  className={`w-full grid grid-cols-[1fr_auto_auto] gap-x-4 py-3 text-left
                               border-b border-mx-green/10 last:border-0 transition-all
                               ${isSelected ? 'bg-mx-green/5' : 'hover:bg-mx-green/[0.03]'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 flex-shrink-0 ${isBest ? 'bg-mx-green' : 'bg-mx-deep'}`} />
                    <span className={`text-xs truncate ${isSelected ? 'text-mx-green' : 'text-mx-dim'}`}>
                      {offer.lp}
                    </span>
                    {isBest && (
                      <span className="flex-shrink-0 text-xs border border-mx-green/50 text-mx-green px-1 leading-4">
                        BEST
                      </span>
                    )}
                  </div>
                  <span className={`text-right text-sm font-semibold ${isSelected ? 'text-mx-green' : 'text-mx-dim'}`}>
                    {offerAmount(offer.multiplier)} {toToken.symbol}
                  </span>
                  <span className="text-right text-xs text-mx-deep">
                    {offerPrice(offer.multiplier)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-mx-deep">&gt; Select an offer to proceed</p>
        </Frame>
      )}

      {/* Confirm selected offer */}
      {phase === 'confirm' && selected && (
        <>
          <Frame title="selected offer">
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-mx-deep">LP</span>
                <span className="text-mx-dim">{selected.lp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mx-deep">You send</span>
                <span className="text-mx-green">{amount} {fromToken.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mx-deep">You receive</span>
                <span className="text-mx-green font-semibold">
                  {offerAmount(selected.multiplier)} {toToken.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-mx-deep">Slippage</span>
                <span className="text-mx-dim">{slippage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mx-deep">LP reputation</span>
                <span className="text-mx-dim">{selected.rep}%</span>
              </div>
            </div>
          </Frame>

          <div className="flex gap-3">
            <button onClick={reset} className="mx-btn-ghost flex-1 py-3 text-sm">
              Cancel
            </button>
            <button
              onClick={reset}
              className="flex-1 border border-mx-green bg-mx-green text-black font-mono font-bold
                         py-3 text-sm uppercase tracking-widest hover:bg-mx-dim transition-all"
            >
              [ CONFIRM SWAP ]
            </button>
          </div>
        </>
      )}
    </div>
  )
}
