import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const G = '#00ff41'
const G_DIM = '#00b82e'
const G_DEEP = '#005c17'
const G_GHOST = 'rgba(0,255,65,0.08)'
const G_LINE = 'rgba(0,255,65,0.18)'
const AMBER = '#ffb000'
const RED = '#ff2a2a'
const WHITE = '#e8ffe8'
const MONO = "'JetBrains Mono','IBM Plex Mono','Courier New',monospace"

function MatrixRain({ density = 1, speed = 1, opacity = 0.55 }: { density?: number; speed?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number
    let w: number, h: number, cols: number, drops: number[]
    const fontSize = 14
    const glyphs = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789$€¥₿ETHBTCUSDC@#%&*+-=<>/\\|'

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas!.clientWidth
      h = canvas!.clientHeight
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.floor((w / fontSize) * density)
      drops = new Array(cols).fill(0).map(() => Math.random() * -50)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    function draw() {
      ctx.fillStyle = `rgba(0,0,0,${0.08 / speed})`
      ctx.fillRect(0, 0, w, h)
      ctx.font = `${fontSize}px ${MONO}`
      for (let i = 0; i < cols; i++) {
        const text = glyphs.charAt(Math.floor(Math.random() * glyphs.length))
        const x = (i * fontSize) / density
        const y = drops[i] * fontSize
        ctx.fillStyle = Math.random() > 0.975
          ? `rgba(220,255,220,${opacity})`
          : `rgba(0,255,65,${opacity * 0.85})`
        ctx.fillText(text, x, y)
        if (y > h && Math.random() > 0.975) drops[i] = 0
        drops[i] += speed
      }
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [density, speed, opacity])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', mixBlendMode: 'screen' }}
    />
  )
}

function CRTOverlay() {
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100,
      backgroundImage: 'repeating-linear-gradient(to bottom,rgba(0,0,0,0) 0px,rgba(0,0,0,0) 2px,rgba(0,0,0,0.18) 3px,rgba(0,0,0,0) 4px)',
      boxShadow: 'inset 0 0 220px 30px rgba(0,0,0,0.95)',
    }} />
  )
}

function Cursor() {
  return (
    <span style={{
      display: 'inline-block', width: '0.55em', height: '1em', background: G,
      marginLeft: 2, verticalAlign: '-2px', animation: 'mist-blink 1s steps(2,start) infinite',
    }} />
  )
}

function Typing({ lines, speed = 32, startDelay = 0, prefix = '' }: { lines: string[]; speed?: number; startDelay?: number; prefix?: string }) {
  const [shown, setShown] = useState<string[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    let li = 0, ci = 0
    const out = lines.map(() => '')
    const tick = () => {
      if (li >= lines.length) { setDone(true); return }
      out[li] = lines[li].slice(0, ci + 1)
      setShown([...out])
      ci++
      if (ci > lines[li].length) { li++; ci = 0 }
      t = setTimeout(tick, speed + Math.random() * speed * 0.3)
    }
    const start = setTimeout(tick, startDelay)
    return () => { clearTimeout(start); clearTimeout(t) }
  }, [])

  return (
    <div style={{ fontFamily: MONO, whiteSpace: 'pre-wrap' }}>
      {shown.map((l, i) => (
        <div key={i}>{prefix}{l}{i === shown.length - 1 && !done && <Cursor />}</div>
      ))}
    </div>
  )
}

function Corners({ color = G, size = 10 }: { color?: string; size?: number }) {
  const base = { position: 'absolute' as const, width: size, height: size, borderColor: color }
  return (
    <>
      <span style={{ ...base, top: -1, left: -1, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span style={{ ...base, top: -1, right: -1, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <span style={{ ...base, bottom: -1, left: -1, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span style={{ ...base, bottom: -1, right: -1, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    </>
  )
}

function Frame({ children, title, accent = G, padding = 24, style = {}, corners = true }: {
  children: React.ReactNode; title?: string; accent?: string; padding?: number; style?: React.CSSProperties; corners?: boolean
}) {
  return (
    <div style={{
      position: 'relative', border: `1px solid ${accent}`,
      background: 'rgba(0,12,4,0.55)', backdropFilter: 'blur(2px)',
      boxShadow: `0 0 0 1px rgba(0,0,0,0.6) inset, 0 0 40px -10px ${accent}55`,
      padding, ...style,
    }}>
      {corners && <Corners color={accent} />}
      {title && (
        <div style={{
          position: 'absolute', top: -10, left: 16, padding: '0 10px',
          background: '#000', color: accent, fontFamily: MONO, fontSize: 11,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

function SectionLabel({ num, title }: { num: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: G_DIM, fontFamily: MONO, fontSize: 12, letterSpacing: '0.3em' }}>
      <span style={{ color: G }}>{num}</span>
      <span style={{ flex: 1, height: 1, background: G_LINE }} />
      <span>{title}</span>
    </div>
  )
}

function Logo({ size = 22 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <rect x="2" y="2" width="28" height="28" stroke={G} strokeWidth="1.5" />
        <path d="M6 22 L12 10 L16 18 L20 10 L26 22" stroke={G} strokeWidth="1.8" fill="none" />
        <circle cx="16" cy="22" r="1.5" fill={G} />
      </svg>
      <span style={{ fontFamily: MONO, color: G, fontSize: 16, fontWeight: 700, letterSpacing: '0.32em' }}>AGENTS_WITH_MIST</span>
    </div>
  )
}

function CTA({ children, small, onClick }: { children: React.ReactNode; small?: boolean; onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  const padX = small ? 18 : 32
  const padY = small ? 10 : 18
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: `${padY}px ${padX}px`,
        fontFamily: MONO, fontSize: small ? 12 : 14,
        letterSpacing: '0.24em', textTransform: 'uppercase',
        color: hover ? '#000' : G, background: hover ? G : 'transparent',
        border: `1px solid ${G}`, textDecoration: 'none', cursor: 'pointer',
        boxShadow: hover ? `0 0 30px ${G}, 0 0 60px ${G}66` : `0 0 0 ${G}`,
        transition: 'all 0.18s ease', fontWeight: 600,
      }}
    >
      <span style={{ opacity: 0.7 }}>{'>'}</span>
      <span>{children}</span>
      <span style={{ opacity: hover ? 1 : 0, transition: 'opacity 0.2s' }}>_</span>
    </button>
  )
}

function Nav({ onLaunchApp }: { onLaunchApp: () => void }) {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: MONO, fontSize: 13, borderBottom: `1px solid ${G_LINE}`,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo />
        <span style={{ color: G_DIM, letterSpacing: '0.3em', fontSize: 11 }}>v1.0.0-MAINNET</span>
      </div>
      <div style={{ display: 'flex', gap: 28, color: G_DIM, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>
        <a href="#problem" style={{ color: 'inherit', textDecoration: 'none' }}>The Problem</a>
        <a href="#protocol" style={{ color: 'inherit', textDecoration: 'none' }}>Protocol</a>
        <a href="#agents" style={{ color: 'inherit', textDecoration: 'none' }}>Agents</a>
        <a href="#stack" style={{ color: 'inherit', textDecoration: 'none' }}>Stack</a>
      </div>
      <CTA small onClick={onLaunchApp}>LAUNCH_APP</CTA>
    </nav>
  )
}

function LiveTicker({ style = {} }: { style?: React.CSSProperties }) {
  type Row = { id: number; ts: Date; pair: string; size: string; slip: string; status: string }
  const pairs = ['ETH→USDC', 'WBTC→USDT', 'SOL→USDC', 'ETH→DAI', 'ARB→USDC', 'wstETH→ETH']

  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: Math.random(), ts: new Date(Date.now() - i * 8400),
      pair: pairs[Math.floor(Math.random() * pairs.length)],
      size: (Math.random() * 900 + 50).toFixed(2),
      slip: (Math.random() * 0.08).toFixed(4),
      status: i === 0 ? 'NEGOTIATING' : 'SETTLED',
    }))
  )

  useEffect(() => {
    const t = setInterval(() => {
      setRows(r => [{
        id: Math.random(), ts: new Date(),
        pair: pairs[Math.floor(Math.random() * pairs.length)],
        size: (Math.random() * 900 + 50).toFixed(2),
        slip: (Math.random() * 0.08).toFixed(4),
        status: Math.random() > 0.7 ? 'NEGOTIATING' : 'SETTLED',
      }, ...r.slice(0, 5)])
    }, 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <Frame title="// LIVE_DARKPOOL_FEED" style={{ ...style, maxWidth: 760 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: G_DIM }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 130px 100px 110px 1fr', gap: 14, paddingBottom: 8, borderBottom: `1px dashed ${G_LINE}`, color: G_DEEP, letterSpacing: '0.15em' }}>
          <div>TIME</div><div>PAIR</div><div>SIZE</div><div>SLIPPAGE</div><div>STATE</div>
        </div>
        {rows.map(r => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '90px 130px 100px 110px 1fr', gap: 14, padding: '8px 0', borderBottom: `1px dashed ${G_LINE}`, animation: 'mist-fadein 0.5s ease' }}>
            <div>{r.ts.toTimeString().slice(0, 8)}</div>
            <div style={{ color: G }}>{r.pair}</div>
            <div>{r.size}</div>
            <div>{r.slip}%</div>
            <div style={{ color: r.status === 'NEGOTIATING' ? AMBER : G }}>
              {r.status === 'NEGOTIATING' ? '◐ ' : '● '}{r.status}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function Hero({ onLaunchApp }: { onLaunchApp: () => void }) {
  return (
    <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '120px 40px 80px', overflow: 'hidden' }}>
      <MatrixRain density={1} speed={1.1} opacity={0.5} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center,rgba(0,0,0,0.35) 0%,rgba(0,0,0,0.85) 60%,#000 100%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        <div style={{ color: G_DIM, fontFamily: MONO, fontSize: 12, marginBottom: 32, lineHeight: 1.7 }}>
          <Typing speed={18} startDelay={300} lines={[
            '> ssh broker@agents.mist -p 443 --zk',
            '> establishing AXL mesh ......... [OK]',
            '> 0G memory primed .............. [OK]',
            '> KeeperHub relay armed ......... [OK]',
            '> dark pool unlocked',
          ]} />
        </div>

        <h1 style={{ fontFamily: MONO, color: G, fontSize: 'clamp(48px,8vw,128px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 0.92, margin: 0, textShadow: `0 0 40px ${G}88, 0 0 80px ${G}44` }}>
          THERE IS<br />
          NO <span style={{ color: WHITE, position: 'relative' }}>
            SPREAD
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: '-0.05em', height: 6, background: G, opacity: 0.3 }} />
          </span>.
        </h1>

        <div style={{ marginTop: 36, maxWidth: 640, color: WHITE, fontFamily: MONO, fontSize: 18, lineHeight: 1.7, opacity: 0.85 }}>
          <p style={{ margin: 0 }}>
            <span style={{ color: G }}>{'> '}</span>
            A peer-to-peer dark pool where autonomous agents negotiate your trades in private, settle through zero-knowledge escrow, and leave the mempool starving.
          </p>
          <p style={{ margin: '18px 0 0 0', color: G_DIM, fontSize: 15 }}>
            No frontrunning. No MEV. No leaks. The trade you intended is the trade you get.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 18, marginTop: 48, alignItems: 'center', flexWrap: 'wrap' }}>
          <CTA onClick={onLaunchApp}>ENTER_THE_POOL</CTA>
          <a href="#protocol" style={{ color: G_DIM, fontFamily: MONO, fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', textDecoration: 'none', borderBottom: `1px solid ${G_DEEP}`, paddingBottom: 4 }}>
            read.protocol(--whitepaper)
          </a>
        </div>

        <LiveTicker style={{ marginTop: 80 }} />

        <div style={{ position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)', color: G_DIM, fontFamily: MONO, fontSize: 11, letterSpacing: '0.4em', textAlign: 'center' }}>
          SCROLL<br />▼
        </div>
      </div>
    </section>
  )
}

function Problem() {
  const probs = [
    { t: 'FRONT-RUNNING', n: '$1.38B', s: 'extracted from public swaps in 2025', d: 'Every order you broadcast is a memo to predators. Bots reorder blocks around you.' },
    { t: 'SANDWICH MEV', s: 'on every tx > $10k', n: '~73%', d: 'Your slippage tolerance is their guaranteed profit. You quote a price; you receive a worse one.' },
    { t: 'POSITION LEAKAGE', n: 'PUBLIC', s: 'every wallet, every move', d: 'Your treasury, salary, P&L — broadcast forever. Competitors index your every rebalance.' },
    { t: 'CEX COUNTERPARTY', n: 'TRUST', s: 'required by default', d: 'OTC desks see your hand. KYC, IM chats, custodian risk. You become their data.' },
  ]

  return (
    <section id="problem" style={{ padding: '160px 40px 120px', position: 'relative', borderTop: `1px solid ${G_LINE}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionLabel num="01" title="THE_PUBLIC_LEDGER_IS_A_LEAK" />

        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'start' }}>
          <h2 style={{ fontFamily: MONO, color: G, fontSize: 'clamp(36px,4.4vw,64px)', fontWeight: 700, lineHeight: 1.05, margin: 0, letterSpacing: '-0.01em' }}>
            You think you're trading.<br />
            <span style={{ color: RED, textShadow: `0 0 30px ${RED}66` }}>You're being traded.</span>
          </h2>
          <div style={{ color: WHITE, fontFamily: MONO, fontSize: 16, lineHeight: 1.7, opacity: 0.78 }}>
            <p>Public chains were a revolution. They were also a confession booth. Every transaction you ever signed lives forever, in plaintext, indexed by adversaries who optimize against you in real time.</p>
            <p style={{ color: G_DIM }}>The mempool is not a marketplace. It is a hunting ground.</p>
          </div>
        </div>

        <div style={{ marginTop: 80, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {probs.map((p, i) => (
            <Frame key={i} accent={i === 1 ? RED : G} padding={24}>
              <div style={{ fontFamily: MONO, color: i === 1 ? RED : G, fontSize: 12, letterSpacing: '0.2em', opacity: 0.85 }}>ERR_{String(i + 1).padStart(2, '0')}</div>
              <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 36, fontWeight: 700, color: i === 1 ? RED : G, letterSpacing: '-0.02em' }}>{p.n}</div>
              <div style={{ fontFamily: MONO, color: G_DIM, fontSize: 12, marginTop: 6, letterSpacing: '0.08em' }}>{p.s}</div>
              <div style={{ marginTop: 18, fontFamily: MONO, color: G, fontSize: 13, letterSpacing: '0.18em', borderTop: `1px dashed ${G_LINE}`, paddingTop: 14 }}>{p.t}</div>
              <div style={{ marginTop: 10, color: WHITE, fontFamily: MONO, fontSize: 13, lineHeight: 1.6, opacity: 0.78 }}>{p.d}</div>
            </Frame>
          ))}
        </div>

        <Frame accent={G} padding={36} style={{ marginTop: 80 }} title="// MORPHEUS.LOG">
          <div style={{ fontFamily: MONO, color: WHITE, fontSize: 22, lineHeight: 1.55, maxWidth: 900 }}>
            <span style={{ color: G }}>{'> '}</span>
            You take the <span style={{ color: AMBER }}>blue pill</span> — you keep broadcasting your trades to the mempool, and you wake up believing the spread you got was the spread you wanted.
            <br /><br />
            <span style={{ color: G }}>{'> '}</span>
            You take the <span style={{ color: G, textShadow: `0 0 20px ${G}` }}>green pill</span> — you stay in the dark pool, and I show you how deep the order book goes.
          </div>
        </Frame>
      </div>
    </section>
  )
}

function ProtocolStep({ step, last }: { step: { n: string; t: string; sub: string; d: string; code: string[] }; last: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1.1fr', gap: 32, padding: '32px 28px', position: 'relative', border: `1px solid ${G_LINE}`, background: `linear-gradient(90deg,rgba(0,255,65,0.04),transparent)` }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 56, color: G, fontWeight: 700, lineHeight: 1, textShadow: `0 0 24px ${G}66` }}>{step.n}</div>
        {!last && <div style={{ marginTop: 14, fontFamily: MONO, color: G_DEEP, fontSize: 18, lineHeight: 1 }}>│<br />│<br />▼</div>}
      </div>
      <div>
        <div style={{ fontFamily: MONO, color: G, fontSize: 28, fontWeight: 700, letterSpacing: '0.04em' }}>{step.t}</div>
        <div style={{ fontFamily: MONO, color: G_DIM, fontSize: 13, marginTop: 4, letterSpacing: '0.1em' }}>{step.sub}</div>
        <div style={{ marginTop: 18, color: WHITE, fontFamily: MONO, fontSize: 15, lineHeight: 1.7, opacity: 0.82, maxWidth: 460 }}>{step.d}</div>
      </div>
      <Frame padding={20} title="// trace" corners={false}>
        <pre style={{ margin: 0, fontFamily: MONO, fontSize: 13, color: G, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {step.code.map((l, i) => (
            <div key={i} style={{ color: l.includes('✓') || l.includes('AGREE') ? WHITE : (l.includes('counter') ? AMBER : G) }}>
              <span style={{ color: G_DEEP }}>{String(i + 1).padStart(2, '0')}  </span>{l}
            </div>
          ))}
        </pre>
      </Frame>
    </div>
  )
}

function Protocol() {
  const steps = [
    { n: '01', t: 'INTENT', sub: 'broker.intent()', d: 'You declare the swap you want. Sell 500 ETH for USDC, max slip 0.5%. Your Broker agent is the only one who hears it.', code: ['intent: {', '  sell: 500 ETH,', '  buy: USDC,', '  maxSlip: 0.005,', '  ttl: 30s', '}'] },
    { n: '02', t: 'NEGOTIATE', sub: 'p2p.gossip()', d: 'Your Broker discovers LP agents through the AXL mesh. They quote, counter, settle on a price. Off-chain. Encrypted. No mempool.', code: ['quote   ETH/USDC  3,841.72', 'counter ETH/USDC  3,842.10', 'counter ETH/USDC  3,842.06', 'AGREE   3,842.06   ✓'] },
    { n: '03', t: 'ESCROW', sub: 'mist.lock()', d: 'LP agent locks USDC into a MIST zero-knowledge escrow via KeeperHub. The chain sees a deposit. The chain sees nothing else.', code: ['mist.deposit(', '  amount: 1_921_030,', '  commitment: 0x4f...', ')   tx: 0xab12...d901'] },
    { n: '04', t: 'CLAIM', sub: 'mist.swap()', d: "You deposit ETH and atomically claim the LP's commitment. One trustless transaction. No counterparty risk. No slippage. No witness.", code: ['mist.swap({', '  give: 500 ETH,', '  take: commitment(0x4f...)', '})   ✓ SETTLED'] },
  ]

  return (
    <section id="protocol" style={{ padding: '160px 40px 120px', borderTop: `1px solid ${G_LINE}`, position: 'relative' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionLabel num="02" title="THE_PROTOCOL" />
        <h2 style={{ marginTop: 32, fontFamily: MONO, color: G, fontSize: 'clamp(36px,4.4vw,64px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.01em', maxWidth: 1100 }}>
          Four steps. Zero leakage.<span style={{ color: G_DIM }}> One trade no one sees but you.</span>
        </h2>
        <div style={{ marginTop: 70, display: 'grid', gap: 24 }}>
          {steps.map((s, i) => <ProtocolStep key={s.n} step={s} last={i === steps.length - 1} />)}
        </div>
      </div>
    </section>
  )
}

function Pulse({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color},0 0 20px ${color}`, animation: 'mist-pulse 1.4s ease-in-out infinite', display: 'inline-block' }} />
}

function AgentCard({ role, sub, color, stats, desc, log }: { role: string; sub: string; color: string; stats: [string, string][]; desc: string; log: string[] }) {
  const [logShown, setLogShown] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setLogShown(s => (s + 1) % (log.length + 4)), 1100)
    return () => clearInterval(t)
  }, [log.length])

  return (
    <Frame accent={color} padding={28}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: MONO, color, fontSize: 26, fontWeight: 700, letterSpacing: '0.05em' }}>{role}</div>
          <div style={{ fontFamily: MONO, color: G_DIM, fontSize: 12, marginTop: 4 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em' }}>
          <Pulse color={color} /> ONLINE
        </div>
      </div>
      <div style={{ marginTop: 22, color: WHITE, fontFamily: MONO, fontSize: 14, lineHeight: 1.7, opacity: 0.82 }}>{desc}</div>
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, fontFamily: MONO }}>
        {stats.map(([k, v]) => (
          <div key={k} style={{ borderTop: `1px dashed ${G_LINE}`, paddingTop: 10 }}>
            <div style={{ color: G_DEEP, fontSize: 10, letterSpacing: '0.15em' }}>{k.toUpperCase()}</div>
            <div style={{ color, fontSize: 14, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, padding: 14, background: 'rgba(0,0,0,0.5)', border: `1px solid ${G_LINE}`, fontFamily: MONO, fontSize: 12, height: 158, overflow: 'hidden' }}>
        {log.slice(0, Math.min(logShown, log.length)).map((l, i) => (
          <div key={i} style={{ color: i === logShown - 1 ? WHITE : G, opacity: 1 - (logShown - 1 - i) * 0.12 }}>{l}</div>
        ))}
        {logShown >= log.length && <div style={{ color: G_DIM, marginTop: 6 }}>[ idle ]<Cursor /></div>}
      </div>
    </Frame>
  )
}

function MeshDiagram() {
  const nodes = useMemo(() => {
    const n: { id: string; x: number; y: number; kind: string; label: string }[] = []
    n.push({ id: 'BROKER', x: 50, y: 50, kind: 'broker', label: 'BROKER' })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3
      n.push({ id: 'LP' + i, x: 50 + Math.cos(a) * 32, y: 50 + Math.sin(a) * 36, kind: 'lp', label: 'LP.' + String(i).padStart(2, '0') })
    }
    return n
  }, [])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 700)
    return () => clearInterval(t)
  }, [])

  const broker = nodes[0]
  const activeLP = nodes[1 + (tick % 8)]

  return (
    <div style={{ position: 'relative', height: 380, background: `radial-gradient(ellipse at center,rgba(0,255,65,0.06),transparent 70%)` }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        {nodes.slice(1).map(n => <line key={n.id} x1={broker.x} y1={broker.y} x2={n.x} y2={n.y} stroke={G_DEEP} strokeWidth="0.15" strokeDasharray="0.6 0.4" />)}
        <line x1={broker.x} y1={broker.y} x2={activeLP.x} y2={activeLP.y} stroke={G} strokeWidth="0.35" />
        {nodes.slice(1).map((n, i) => {
          const next = nodes[1 + ((i + 1) % 8)]
          return <line key={'gg' + i} x1={n.x} y1={n.y} x2={next.x} y2={next.y} stroke={G_DEEP} strokeWidth="0.08" />
        })}
      </svg>
      {nodes.map(n => (
        <div key={n.id} style={{ position: 'absolute', left: `${n.x}%`, top: `${n.y}%`, transform: 'translate(-50%,-50%)', fontFamily: MONO, fontSize: 10, color: n.kind === 'broker' ? G : (n.id === activeLP.id ? WHITE : G_DIM), textAlign: 'center' }}>
          <div style={{ width: n.kind === 'broker' ? 24 : 16, height: n.kind === 'broker' ? 24 : 16, margin: '0 auto', border: `1px solid ${n.kind === 'broker' ? G : (n.id === activeLP.id ? WHITE : G_DIM)}`, background: n.kind === 'broker' ? G_GHOST : 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: n.id === activeLP.id ? `0 0 20px ${G}` : 'none', transform: 'rotate(45deg)' }}>
            <div style={{ width: n.kind === 'broker' ? 6 : 4, height: n.kind === 'broker' ? 6 : 4, background: n.kind === 'broker' ? G : (n.id === activeLP.id ? WHITE : G_DIM) }} />
          </div>
          <div style={{ marginTop: 6, letterSpacing: '0.1em' }}>{n.label}</div>
        </div>
      ))}
      <div style={{ position: 'absolute', top: 14, left: 14, fontFamily: MONO, fontSize: 10, color: G_DEEP, letterSpacing: '0.2em' }}>AXL://encrypted-mesh</div>
      <div style={{ position: 'absolute', bottom: 14, right: 14, fontFamily: MONO, fontSize: 10, color: G_DEEP, letterSpacing: '0.2em' }}>latency: 84ms · drift: 0.001</div>
    </div>
  )
}

function Agents() {
  return (
    <section id="agents" style={{ padding: '160px 40px 120px', borderTop: `1px solid ${G_LINE}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <SectionLabel num="03" title="THE_AGENT_MESH" />
        <h2 style={{ marginTop: 32, fontFamily: MONO, color: G, fontSize: 'clamp(36px,4.4vw,64px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.01em', maxWidth: 1100 }}>
          You don't trade.<br /><span style={{ color: WHITE }}>Your agent does.</span>
        </h2>
        <p style={{ marginTop: 24, color: G_DIM, fontFamily: MONO, fontSize: 16, maxWidth: 720, lineHeight: 1.7 }}>
          A swarm of autonomous brokers and market makers, talking to each other through encrypted peer-to-peer channels. They negotiate while you sleep. They learn from every fill. They never tell.
        </p>
        <div style={{ marginTop: 60, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          <AgentCard
            role="THE_BROKER" sub="// your representative" color={G}
            stats={[['negotiations', '∞ concurrent'], ['memory', 'ephemeral'], ['loyalty', 'you, only you']]}
            desc="Receives your intent. Hunts every LP in the mesh. Returns with the best price or none at all. Your hand is never shown."
            log={['[broker] discovered 14 LP nodes', '[broker] open: 7 negotiations', '[broker] best quote: 3,842.06 USDC', '[broker] requesting MIST commitment...', '[broker] payload received', '[broker] handing off to UI ✓']}
          />
          <AgentCard
            role="THE_MARKET_MAKER" sub="// the liquidity provider" color={AMBER}
            stats={[['inventory', '$48.2M'], ['memory', '0G persistent'], ['fills', '127,408']]}
            desc="Quotes spreads. Calculates risk. Remembers every counterparty through 0G storage. Locks funds via MIST escrow when terms are met."
            log={['[lp.04] incoming intent: ETH/USDC 500', '[lp.04] 0G recall: counterparty=trusted', '[lp.04] quote: 3,842.10', '[lp.04] counter received', '[lp.04] keeperhub.relay → MIST.lock', '[lp.04] escrow active. tx 0xab12...']}
          />
        </div>
        <Frame style={{ marginTop: 60, padding: 0 }} title="// AXL_MESH_VIEWPORT — 14_NODES_LIVE">
          <MeshDiagram />
        </Frame>
      </div>
    </section>
  )
}

function Stack() {
  const layers = [
    { name: 'MIST', tag: 'SETTLEMENT', desc: 'Zero-knowledge escrow. Cryptographic atomic swaps. The chain sees commitments, not amounts. Not parties. Not pairs.', glyph: '◇' },
    { name: 'GENSYN AXL', tag: 'COMMS', desc: 'Encrypted peer-to-peer mesh. Agents discover and negotiate without a broker, without a server, without a leak.', glyph: '⌬' },
    { name: '0G', tag: 'MEMORY', desc: 'Persistent memory and verifiable inference. LP agents remember every counterparty, every fill, every misquote.', glyph: '◉' },
    { name: 'KEEPERHUB', tag: 'EXECUTION', desc: 'Transaction relayer with retry logic and gas optimization. The on-chain step never fumbles, even when the chain does.', glyph: '⊞' },
  ]

  return (
    <section id="stack" style={{ padding: '160px 40px 120px', borderTop: `1px solid ${G_LINE}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionLabel num="04" title="THE_STACK" />
        <h2 style={{ marginTop: 32, fontFamily: MONO, color: G, fontSize: 'clamp(36px,4.4vw,64px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.01em', maxWidth: 1100 }}>
          Every layer is sovereign.<span style={{ color: G_DIM }}> No one of them sees the trade.</span>
        </h2>
        <div style={{ marginTop: 70, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 24 }}>
          {layers.map(l => (
            <Frame key={l.name} padding={32}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ fontFamily: MONO, color: G_DIM, fontSize: 11, letterSpacing: '0.3em' }}>{l.tag}</div>
                  <div style={{ fontFamily: MONO, color: G, fontSize: 32, fontWeight: 700, marginTop: 8, letterSpacing: '0.04em' }}>{l.name}</div>
                </div>
                <div style={{ fontFamily: MONO, color: G, fontSize: 56, lineHeight: 1, textShadow: `0 0 30px ${G}88` }}>{l.glyph}</div>
              </div>
              <div style={{ marginTop: 22, color: WHITE, fontFamily: MONO, fontSize: 14, lineHeight: 1.7, opacity: 0.82 }}>{l.desc}</div>
            </Frame>
          ))}
        </div>
      </div>
    </section>
  )
}

function Constitution() {
  const lines = [
    'THE TRADER IS SOVEREIGN.',
    'INTENT IS NOT BROADCAST.',
    'PRICE IS NEGOTIATED, NEVER ANNOUNCED.',
    'EVERY AGENT WORKS FOR YOU OR AGAINST YOU. NEVER BOTH.',
    'THE LEDGER REMEMBERS NOTHING IT WAS NOT TOLD.',
  ]

  return (
    <section style={{ padding: '160px 40px', borderTop: `1px solid ${G_LINE}`, position: 'relative', overflow: 'hidden' }}>
      <MatrixRain density={0.5} speed={0.6} opacity={0.18} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center,transparent,#000 70%)' }} />
      <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <SectionLabel num="05" title="THE_FIVE_AXIOMS" />
        <div style={{ marginTop: 60, display: 'grid', gap: 22 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontFamily: MONO, color: G, fontSize: 'clamp(22px,2.6vw,38px)', fontWeight: 700, letterSpacing: '0.04em', textShadow: `0 0 30px ${G}66` }}>
              <span style={{ color: G_DEEP, marginRight: 18 }}>0{i + 1}.</span>{l}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA({ onLaunchApp }: { onLaunchApp: () => void }) {
  return (
    <section style={{ padding: '180px 40px', borderTop: `1px solid ${G_LINE}`, position: 'relative', overflow: 'hidden' }}>
      <MatrixRain density={1.2} speed={1.3} opacity={0.32} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center,rgba(0,0,0,0.4),#000 80%)' }} />
      <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, color: G_DIM, fontSize: 13, letterSpacing: '0.4em' }}>// FOLLOW_THE_GREEN_WALLET</div>
        <h2 style={{ marginTop: 30, fontFamily: MONO, color: G, fontSize: 'clamp(48px,9vw,140px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 0.92, margin: '30px 0 0 0', textShadow: `0 0 50px ${G}88,0 0 100px ${G}44` }}>
          WAKE UP,<br />TRADER.
        </h2>
        <p style={{ marginTop: 30, color: WHITE, fontFamily: MONO, fontSize: 18, maxWidth: 640, margin: '30px auto 0', lineHeight: 1.7, opacity: 0.86 }}>
          The mempool is a movie set. The pool you've been swapping in was built for someone else's profit. There is another market. We are already in it.
        </p>
        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
          <CTA onClick={onLaunchApp}>UNPLUG · LAUNCH_APP</CTA>
        </div>
        <div style={{ marginTop: 28, color: G_DIM, fontFamily: MONO, fontSize: 12, letterSpacing: '0.2em' }}>
          NON_CUSTODIAL · ZK_VERIFIED · MAINNET_LIVE
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ padding: '60px 40px 40px', borderTop: `1px solid ${G_LINE}`, fontFamily: MONO, color: G_DIM, fontSize: 12 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 40 }}>
        <div>
          <Logo />
          <div style={{ marginTop: 18, maxWidth: 320, lineHeight: 1.6 }}>A peer-to-peer dark pool for the post-public-chain era. No mempool, no spread, no witness.</div>
          <div style={{ marginTop: 24, color: G_DEEP, fontSize: 11 }}>© 2026 AGENTS_WITH_MIST.PROTOCOL — distributed under MIT</div>
        </div>
        {([
          ['PROTOCOL', ['Whitepaper', 'Audits', 'Bug Bounty', 'Mainnet Status']],
          ['BUILD', ['Docs', 'SDK', 'Agent Kit', 'Github']],
          ['NETWORK', ['Become an LP', 'Run a Node', 'Validators', 'Discord']],
          ['LEGAL', ['Privacy', 'Terms', 'Disclosures', 'Risk']],
        ] as [string, string[]][]).map(([h, items]) => (
          <div key={h}>
            <div style={{ color: G, letterSpacing: '0.2em' }}>{h}</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              {items.map(it => <a key={it} href="#" style={{ color: 'inherit', textDecoration: 'none' }}>{it}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1280, margin: '40px auto 0', paddingTop: 20, borderTop: `1px dashed ${G_LINE}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>session: 0x4f8a...e102 · uptime: 99.998% · gas: 12.4 gwei</div>
        <div>// you should not be here. and yet.</div>
      </div>
    </footer>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const goToApp = () => navigate('/app')

  return (
    <div style={{ background: '#000', color: G, minHeight: '100vh', fontFamily: MONO }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::selection { background: #00ff41; color: #000; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #005c17; border: 2px solid #000; }
        ::-webkit-scrollbar-thumb:hover { background: #00ff41; }
        @keyframes mist-blink { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
        @keyframes mist-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.3; transform:scale(0.85); } }
        @keyframes mist-fadein { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
        @keyframes mist-flicker { 0%,100% { opacity:1; } 97% { opacity:1; } 98% { opacity:0.85; } 99% { opacity:1; } }
        @media (max-width:900px) { .hero-side { display:none !important; } }
      `}</style>
      <CRTOverlay />
      <Nav onLaunchApp={goToApp} />
      <Hero onLaunchApp={goToApp} />
      <Problem />
      <Protocol />
      <Agents />
      <Stack />
      <Constitution />
      <FinalCTA onLaunchApp={goToApp} />
      <Footer />
    </div>
  )
}
