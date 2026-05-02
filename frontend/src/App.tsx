import { useEffect, useRef } from 'react'
import { WalletButton } from './components/WalletButton'
import { SwapCard } from './components/SwapCard'

const GLYPHS = 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789$€¥₿ETHBTCUSDC@#%&*+-=<>/\\|'

function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number
    let w = 0, h = 0, drops: number[] = []
    const fontSize = 14

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas!.clientWidth
      h = canvas!.clientHeight
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cols = Math.floor(w / fontSize)
      drops = Array.from({ length: cols }, () => Math.random() * -50)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    function draw() {
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      ctx.fillRect(0, 0, w, h)
      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`
      for (let i = 0; i < drops.length; i++) {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize
        ctx.fillStyle = Math.random() > 0.975
          ? 'rgba(220,255,220,0.55)'
          : 'rgba(0,255,65,0.45)'
        ctx.fillText(glyph, x, y)
        if (y > h && Math.random() > 0.975) drops[i] = 0
        drops[i] += 1
      }
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: 'screen', opacity: 0.35 }}
    />
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-mx-bg overflow-x-hidden animate-flicker">
      <MatrixRain />

      {/* CRT scanlines */}
      <div className="fixed inset-0 pointer-events-none z-50 crt-overlay" />

      <div className="relative z-10">
        <header className="border-b border-mx-green/20 px-5 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-mx-green font-mono font-bold text-xl tracking-widest">MIST_OTC</span>
              <a href='https://MIST.cash' className="text-mx-deep font-mono text-xs tracking-widest border-l border-mx-green/50 pl-3">
                MIST.cash
              </a>
            </div>
            <WalletButton btnClass='hidden' />
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-8">
          <div className="mb-5 font-mono space-y-0.5">
            <p className="text-mx-green text-xs tracking-widest">
              &gt; DARK POOL SWAP TERMINAL
            </p>
            <p className="text-mx-deep text-xs tracking-widest">
              &gt; PAIR: DummyETH / DummyUSDC
            </p>
          </div>

          <SwapCard />

          <div className="mt-8 text-center text-xs text-mx-deep tracking-widest font-mono space-y-1">
            <p>PRIVATE SETTLEMENT · MIST ESCROW · ZERO MEV</p>
            <p className="text-mx-deep/40">
              &gt; <span className="inline-block w-1.5 h-3 bg-mx-green animate-blink align-[-2px]" />
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
