'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// ══════════════════════════════════════════════════════════════════════════════
// ProductShowcase — EL "video" de producto de Daya: una ventana de app real
// (chrome incluido) donde rotan 7 escenas recreadas en código de lo que Daya
// hace de verdad: chat multi-modelo, Modo Agente, Daya Code, imágenes, Studio,
// documentos y research. Se usa en la landing y en el login para que la marca
// sea UNA sola — mismo look ejecutivo claro en todas partes.
// Autocontenido: estilos y tokens propios (prefijo lx-), no depende del tema.
// ══════════════════════════════════════════════════════════════════════════════

const SCENE_MS = 6000
const FADE_MS = 450
const SCENE_COUNT = 7

export default function ProductShowcase() {
  const t = useTranslations('landing2')
  const [active, setActive] = useState(0)
  const [visible, setVisible] = useState(true)
  const [reduced, setReduced] = useState(false)
  const [cycle, setCycle] = useState(0)          // bump → reinicia el intervalo
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setReduced(true)
  }, [])

  // Rotación automática (pausada bajo reduced-motion)
  useEffect(() => {
    if (reduced) return
    const iv = setInterval(() => {
      setVisible(false)
      const tm = setTimeout(() => { setActive(a => (a + 1) % SCENE_COUNT); setVisible(true) }, FADE_MS)
      timers.current.push(tm)
    }, SCENE_MS)
    return () => { clearInterval(iv) }
  }, [cycle, reduced])

  // Limpieza de todos los timeouts sueltos al desmontar
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = [] }, [])

  const go = (i: number) => {
    if (i === active) return
    if (reduced) { setActive(i); return }
    setVisible(false)
    const tm = setTimeout(() => { setActive(i); setVisible(true); setCycle(c => c + 1) }, FADE_MS)
    timers.current.push(tm)
  }

  const captions = [t('cap0'), t('cap5'), t('cap6'), t('cap1'), t('cap2'), t('cap3'), t('cap4')]

  return (
    <div className="lx-stage-col">
      <div className="lx-stage-card" role="img" aria-label={t('stageAria')} style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(6px) scale(0.985)' }}>
        <div className="lx-chrome" aria-hidden="true">
          <span className="lx-chrome-dots"><i /><i /><i /></span>
          <span className="lx-chrome-url">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            daya-ai.com
          </span>
        </div>
        <div key={`${active}:${cycle}`} className="lx-stage-inner">
          {active === 0 && <SceneChat reduced={reduced} />}
          {active === 1 && <SceneCuadernos />}
          {active === 2 && <SceneCode reduced={reduced} />}
          {active === 3 && <SceneImage reduced={reduced} />}
          {active === 4 && <SceneStudio />}
          {active === 5 && <SceneDocument />}
          {active === 6 && <SceneResearch />}
        </div>
      </div>
      <div className="lx-stage-foot">
        <span className="lx-caption" style={{ opacity: visible ? 1 : 0 }}>{captions[active]}</span>
        <div className="lx-dots">
          {captions.map((name, i) => (
            <button key={i} onClick={() => go(i)} aria-label={t('dotAria', { name })} aria-current={i === active}
              className={`lx-dot${i === active ? ' lx-dot--on' : ''}`}>
              {i === active && !reduced && <span key={`${active}:${cycle}`} className="lx-dot-fill" />}
            </button>
          ))}
        </div>
      </div>
      <ShowcaseStyles />
    </div>
  )
}

// ── Chips de modelos (compartido por chat, agente y research) ─────────────────
// Las marcas que Daya usa de verdad (backend/src/services/openrouter.ts): solo
// laboratorios chinos. Si esa lista cambia, actualizar estos chips.
const MODEL_CHIPS = [
  { n: 'DeepSeek', c: '#4d6bfe' },
  { n: 'Qwen', c: '#a855f7' },
  { n: 'Kimi', c: '#14b8a6' },
]

function ModelChips() {
  return (
    <div className="lx-mchips">
      {MODEL_CHIPS.map((m, i) => (
        <span key={m.n} className="lx-mchip lx-a" style={{ animationDelay: `${i * 0.14}s` }}>
          <span className="lx-mdot" style={{ background: m.c }} />
          {m.n}
        </span>
      ))}
    </div>
  )
}

// ── Escena 0 · Chat con enrutado de modelos ───────────────────────────────────
function SceneChat({ reduced }: { reduced: boolean }) {
  const m = useTranslations('mockup')
  const reply = m('sc0Reply')
  const [phase, setPhase] = useState(0)   // 0 vacío · 1 user · 2 routing · 3 respuesta
  const [typed, setTyped] = useState(0)

  useEffect(() => {
    if (reduced) { setPhase(3); setTyped(reply.length); return }
    const t1 = setTimeout(() => setPhase(1), 250)
    const t2 = setTimeout(() => setPhase(2), 1050)
    const t3 = setTimeout(() => setPhase(3), 2150)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 3 || reduced) return
    const iv = setInterval(() => {
      setTyped(n => { if (n >= reply.length) { clearInterval(iv); return n } return n + 1 })
    }, 28)
    return () => clearInterval(iv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const done = typed >= reply.length
  return (
    <div className="lx-scene lx-chat">
      <div className="lx-chat-head">
        <span className="lx-chat-av"><img src="/logo.png" alt="" /></span>
        <span className="lx-chat-name">Daya</span>
        <span className="lx-chat-status"><span className="lx-live-dot" />{m('status')}</span>
      </div>
      <div className="lx-chat-body">
        {phase >= 1 && (
          <div className="lx-row lx-row--user lx-in"><div className="lx-bub lx-bub--user">{m('sc0User')}</div></div>
        )}
        {phase >= 2 && (
          <div className="lx-route lx-in">
            <span className="lx-route-label">{m('routing')}</span>
            <ModelChips />
          </div>
        )}
        {phase >= 3 && (
          <div className="lx-row lx-in">
            <div className="lx-bub lx-bub--ai">
              {reply.slice(0, typed)}
              {!done && <span className="lx-caret" aria-hidden="true" />}
              {done && (
                <span className="lx-file-chip lx-in"><b>PDF</b>{m('sc0Chip')}</span>
              )}
            </div>
          </div>
        )}
        {phase === 2 && (
          <div className="lx-typing lx-in">{[0, 1, 2].map(i => <span key={i} style={{ animationDelay: `${i * 0.18}s` }} />)}</div>
        )}
      </div>
    </div>
  )
}

// ── Escena · Cuadernos: investiga anclado a tus fuentes, con citas ────────────
// Iconos SVG de línea por tipo de fuente (documento, web, audio).
const NB_ICONS: JSX.Element[] = [
  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><line x1="3.5" y1="12" x2="20.5" y2="12" /></>,
  <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></>,
]

function SceneCuadernos() {
  const t = useTranslations('landing2')
  const sources = [t('nbSrc0'), t('nbSrc1'), t('nbSrc2')]
  return (
    <div className="lx-scene lx-nb">
      <div className="lx-nb-head">
        <span className="lx-nb-label">{t('nbSources')}</span>
        <div className="lx-nb-srcs">
          {sources.map((name, i) => (
            <span key={name} className="lx-nb-src lx-a" style={{ animationDelay: `${0.2 + i * 0.14}s` }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{NB_ICONS[i]}</svg>
              {name}
            </span>
          ))}
        </div>
      </div>
      <div className="lx-nb-chat">
        <div className="lx-row lx-row--user lx-a" style={{ animationDelay: '0.7s' }}><div className="lx-bub lx-bub--user">{t('nbAsk')}</div></div>
        <div className="lx-row lx-a" style={{ animationDelay: '1.3s' }}>
          <div className="lx-bub lx-bub--ai">
            {t('nbAnswer')}<sup className="lx-cite">1</sup>{t('nbAnswer2')}<sup className="lx-cite">2</sup>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Escena · Daya Code: el agente en tu terminal ──────────────────────────────
function SceneCode({ reduced }: { reduced: boolean }) {
  const t = useTranslations('landing2')
  const cmd = `daya-code "${t('cliTask')}"`
  const [typed, setTyped] = useState(reduced ? cmd.length : 0)
  useEffect(() => {
    if (reduced) return
    const iv = setInterval(() => {
      setTyped(n => { if (n >= cmd.length) { clearInterval(iv); return n } return n + 1 })
    }, 34)
    return () => clearInterval(iv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const done = typed >= cmd.length
  return (
    <div className="lx-scene lx-cli">
      <div className="lx-cli-win">
        <div className="lx-cli-bar">
          <span className="lx-st-dots"><i /><i /><i /></span>
          <span className="lx-cli-title">daya-code — terminal</span>
        </div>
        <div className="lx-cli-body">
          <div className="lx-cli-line">
            <span className="lx-cli-ps">$</span> {cmd.slice(0, typed)}
            {!done && <span className="lx-caret" aria-hidden="true" />}
          </div>
          {done && (
            <>
              <div className="lx-cli-line lx-cli-tool lx-a" style={{ animationDelay: '0.4s' }}>▸ write_file <span className="lx-cli-file">server.js</span></div>
              <div className="lx-cli-line lx-cli-tool lx-a" style={{ animationDelay: '1.2s' }}>▸ run_command <span className="lx-cli-file">node server.js</span></div>
              <div className="lx-cli-line lx-cli-out lx-a" style={{ animationDelay: '2.0s' }}>{'{ "status": "ok" }'}</div>
              <div className="lx-cli-line lx-cli-ok lx-a" style={{ animationDelay: '2.7s' }}><Check /> {t('cliDone')}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Escena 1 · Imagen generándose ─────────────────────────────────────────────
function SceneImage({ reduced }: { reduced: boolean }) {
  const fv = useTranslations('featviz')
  const t = useTranslations('landing2')
  const [done, setDone] = useState(reduced)
  useEffect(() => {
    if (reduced) return
    const tm = setTimeout(() => setDone(true), 3600)
    return () => clearTimeout(tm)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="lx-scene lx-img">
      <div className="lx-img-bar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z" /></svg>
        <span>{fv('imgPrompt')}</span>
        {!done && <span className="lx-caret" aria-hidden="true" />}
      </div>
      <div className="lx-img-canvas">
        <div className="lx-img-art"><FoxArt /></div>
        <div className="lx-img-sheen" />
        {done ? <span className="lx-img-hd lx-in">HD</span> : <span className="lx-img-gen">{t('imgGenerating')}</span>}
      </div>
      <div className="lx-img-foot">
        <div className="lx-img-thumbs">
          {[0, 1, 2].map(i => <span key={i} className={`lx-img-th lx-img-th-${i}${done ? ' lx-in' : ''}`} style={{ animationDelay: `${i * 0.12}s`, opacity: done ? undefined : 0 }} />)}
        </div>
        {done && <span className="lx-done lx-in"><Check />{fv('imgDone')}</span>}
      </div>
    </div>
  )
}

// ── FoxArt: "un zorro geométrico al atardecer" — la imagen que la escena dice
//    generar, ilustrada en SVG inline (cielo atardecer + montañas + zorro low-poly).
function FoxArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="lxSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b3070" />
          <stop offset="34%" stopColor="#8b4a9e" />
          <stop offset="58%" stopColor="#e0669a" />
          <stop offset="78%" stopColor="#f78d5c" />
          <stop offset="100%" stopColor="#ffd08a" />
        </linearGradient>
        <linearGradient id="lxGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1f47" />
          <stop offset="100%" stopColor="#1c1535" />
        </linearGradient>
        <radialGradient id="lxSun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff6dd" />
          <stop offset="70%" stopColor="#ffd98a" />
          <stop offset="100%" stopColor="#ffc873" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="400" height="212" fill="url(#lxSky)" />
      {[[40, 40], [332, 30], [368, 68], [62, 88], [206, 44]].map(([x, y]) => (
        <circle key={`${x}:${y}`} cx={x} cy={y} r="1.3" fill="#fff" opacity="0.55" />
      ))}
      <circle cx="118" cy="188" r="62" fill="url(#lxSun)" opacity="0.65" />
      <circle cx="118" cy="188" r="30" fill="#fff3d0" />
      <polygon points="0,212 78,140 160,212" fill="#4a3670" opacity="0.55" />
      <polygon points="120,212 226,122 332,212" fill="#3a2a5c" opacity="0.75" />
      <polygon points="270,212 352,156 400,198 400,212" fill="#4a3670" opacity="0.5" />
      <rect x="0" y="212" width="400" height="88" fill="url(#lxGround)" />
      <ellipse cx="118" cy="213" rx="120" ry="4" fill="#ffd08a" opacity="0.16" />
      {/* Zorro low-poly (luz del sol a la izquierda) */}
      <g>
        <polygon points="220,62 250,110 206,124" fill="#f97a3c" />
        <polygon points="226,76 244,106 216,116" fill="#7c2d12" />
        <polygon points="310,62 280,110 324,124" fill="#d24e14" />
        <polygon points="304,76 286,106 314,116" fill="#6b2410" />
        <polygon points="206,124 250,110 280,110 324,124 298,170 265,206 232,170" fill="#f97a3c" />
        <polygon points="265,110 280,110 324,124 298,170 265,206" fill="#dd5c1a" />
        <polygon points="250,110 280,110 265,142" fill="#ff9a55" />
        <polygon points="265,150 300,172 265,206 230,172" fill="#fff3e4" />
        <polygon points="265,150 300,172 265,206" fill="#ffe3c4" />
        <polygon points="238,146 250,142 246,154" fill="#3b1a0c" />
        <polygon points="292,146 280,142 284,154" fill="#3b1a0c" />
        <polygon points="254,190 276,190 265,204" fill="#4a2210" />
      </g>
    </svg>
  )
}

// ── Escena 2 · Studio diseñando (100% CSS) ────────────────────────────────────
function SceneStudio() {
  const t = useTranslations('landing2')
  return (
    <div className="lx-scene lx-studio">
      <div className="lx-st-bar">
        <span className="lx-st-dots"><i /><i /><i /></span>
        <span className="lx-st-file">{t('studioFile')}</span>
      </div>
      <div className="lx-st-canvas">
        <div className="lx-st-frame lx-a" />
        <div className="lx-st-img lx-a" />
        <div className="lx-st-t1 lx-a">{t('studioText1')}</div>
        <div className="lx-st-t2 lx-a">{t('studioText2')}</div>
        <div className="lx-st-pal">
          {['#6d5cff', '#d946ef', '#22d3ee', '#fbbf24'].map((c, i) => (
            <span key={c} className="lx-a" style={{ background: c, animationDelay: `${3 + i * 0.15}s` }} />
          ))}
        </div>
        <svg className="lx-st-cursor" width="17" height="17" viewBox="0 0 24 24" fill="#0b0b12" stroke="#fff" strokeWidth="1.6" aria-hidden="true"><path d="M5 3l14 8-6.5 1.5L9 19z" /></svg>
      </div>
    </div>
  )
}

// ── Escena 3 · Documento armándose (100% CSS) ─────────────────────────────────
function SceneDocument() {
  const t = useTranslations('landing2')
  const m = useTranslations('mockup')
  return (
    <div className="lx-scene lx-doc">
      <div className="lx-doc-page">
        <div className="lx-doc-title lx-a">{t('docTitle')}</div>
        {[92, 78, 86, 64, 71].map((w, i) => (
          <div key={i} className="lx-doc-line lx-a" style={{ width: `${w}%`, animationDelay: `${0.5 + i * 0.28}s` }} />
        ))}
        <div className="lx-doc-chart">
          {[38, 66, 52, 88].map((h, i) => (
            <span key={i} className="lx-a" style={{ height: `${h}%`, animationDelay: `${2.3 + i * 0.18}s` }} />
          ))}
        </div>
        <span className="lx-doc-chip lx-a"><b>PDF</b>{m('sc0Chip')} · {t('docExported')}</span>
      </div>
    </div>
  )
}

// ── Escena 4 · Research con fuentes verificadas (100% CSS) ────────────────────
function SceneResearch() {
  const fv = useTranslations('featviz')
  const sources = ['arxiv.org', 'reuters.com', 'nature.com']
  return (
    <div className="lx-scene lx-res">
      <div className="lx-res-bar">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <span className="lx-res-q">{fv('searchQuery')}</span>
        <span className="lx-res-live"><span className="lx-live-dot" />{fv('searchLive')}</span>
      </div>
      <div className="lx-res-rows">
        {sources.map((s, i) => (
          <div key={s} className="lx-res-row lx-a" style={{ animationDelay: `${0.5 + i * 0.55}s` }}>
            <span className="lx-res-fav">{s[0].toUpperCase()}</span>
            <span className="lx-res-dom">{s}</span>
            <span className="lx-res-line" />
            <span className="lx-res-check lx-a" style={{ animationDelay: `${0.85 + i * 0.55}s` }}><Check /></span>
          </div>
        ))}
      </div>
      <div className="lx-res-foot lx-a" style={{ animationDelay: '3.4s' }}>
        <span className="lx-res-synth">{fv('reportSynth')}</span>
        <ModelChips />
        <span className="lx-done"><Check />{fv('reportSources')}</span>
      </div>
    </div>
  )
}

export function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
  )
}

// ── Estilos del showcase (autocontenidos, tema claro ejecutivo) ───────────────
// dangerouslySetInnerHTML: el CSS con interpolación (${'${SCENE_MS}'}) debe ser UN
// solo nodo de texto o la hidratación de React no coincide (server vs client).
function ShowcaseStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .lx-stage-col {
        --lx-ink: #0b0b12;
        --lx-accent: #5b4be0;
        --lx-green: #059669;
        --lx-text: #0b0b12;
        --lx-text-2: #50505c;
        --lx-text-3: #87878f;
        --lx-border: rgba(16,16,44,0.10);
        display: flex; flex-direction: column; gap: 14px;
        font-family: var(--font-inter), system-ui, sans-serif;
        animation: psUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s both;
      }
      @keyframes psUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

      /* ── Ventana de app real (chrome + escena) ── */
      .lx-stage-card { position: relative; height: 356px; border-radius: 16px; overflow: hidden;
        background: #ffffff; border: 1px solid var(--lx-border);
        box-shadow: 0 1px 2px rgba(16,16,44,0.05), 0 24px 70px -28px rgba(16,16,44,0.3);
        transition: opacity 0.45s ease, transform 0.45s ease; }
      .lx-chrome { position: absolute; top: 0; left: 0; right: 0; height: 34px; z-index: 2;
        display: flex; align-items: center; padding: 0 12px;
        background: #f7f7fa; border-bottom: 1px solid var(--lx-border); }
      .lx-chrome-dots { display: flex; gap: 6px; }
      .lx-chrome-dots i { width: 10px; height: 10px; border-radius: 50%; }
      .lx-chrome-dots i:nth-child(1) { background: #fc5753; }
      .lx-chrome-dots i:nth-child(2) { background: #fdbc40; }
      .lx-chrome-dots i:nth-child(3) { background: #33c748; }
      .lx-chrome-url { display: inline-flex; align-items: center; gap: 5px;
        position: absolute; left: 50%; transform: translateX(-50%);
        padding: 3px 14px; border-radius: 99px; background: #ffffff; border: 1px solid var(--lx-border);
        font-size: 0.66rem; font-weight: 600; color: var(--lx-text-3); }
      .lx-stage-inner { position: absolute; inset: 34px 0 0; display: flex; color: var(--lx-text); }
      .lx-stage-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 4px; }
      .lx-caption { color: var(--lx-text-2); font-size: 0.9rem; font-weight: 600; transition: opacity 0.45s ease; }
      .lx-dots { display: flex; gap: 7px; }
      .lx-dot { position: relative; width: 22px; height: 5px; border-radius: 99px; border: none; cursor: pointer;
        background: rgba(16,16,44,0.12); overflow: hidden; padding: 0; transition: background 0.2s; }
      .lx-dot:hover { background: rgba(16,16,44,0.24); }
      .lx-dot--on { background: rgba(16,16,44,0.16); }
      .lx-dot-fill { position: absolute; inset: 0; border-radius: 99px; background: var(--lx-accent);
        transform-origin: left; animation: lxFill ${SCENE_MS}ms linear both; }
      @keyframes lxFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }

      /* ── Escenas: base ── */
      .lx-scene { flex: 1; display: flex; flex-direction: column; padding: 18px 20px; min-width: 0; }
      .lx-in { animation: lxIn 0.4s cubic-bezier(0.16,1,0.3,1) both; }
      .lx-a { animation: lxIn 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      @keyframes lxIn { from { opacity: 0; transform: translateY(7px) scale(0.98); } to { opacity: 1; transform: none; } }
      .lx-caret { display: inline-block; width: 2px; height: 0.95em; background: var(--lx-accent);
        vertical-align: text-bottom; margin-left: 2px; animation: lxBlink 0.85s steps(1) infinite; }
      @keyframes lxBlink { 50% { opacity: 0; } }
      .lx-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--lx-green); display: inline-block;
        animation: lxPulse 2s ease-in-out infinite; }
      @keyframes lxPulse { 50% { opacity: 0.35; } }
      .lx-done { display: inline-flex; align-items: center; gap: 5px; color: var(--lx-green); font-size: 0.72rem; font-weight: 700; }
      .lx-mchips { display: flex; gap: 6px; flex-wrap: wrap; }
      .lx-mchip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
        background: #ffffff; border: 1px solid var(--lx-border);
        font-size: 0.68rem; font-weight: 600; color: var(--lx-text-2); }
      .lx-mdot { width: 6px; height: 6px; border-radius: 50%; animation: lxPulse 2.2s ease-in-out infinite; }

      /* ── Escena chat ── */
      .lx-chat-head { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; margin-bottom: 14px;
        border-bottom: 1px solid var(--lx-border); }
      .lx-chat-av { width: 26px; height: 26px; border-radius: 8px; background: #f4f4f8;
        border: 1px solid var(--lx-border); display: flex; align-items: center; justify-content: center; }
      .lx-chat-av img { width: 15px; height: 15px; object-fit: contain; }
      .lx-chat-name { font-weight: 700; font-size: 0.88rem; }
      .lx-chat-status { margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
        font-size: 0.68rem; font-weight: 600; color: var(--lx-text-3); }
      .lx-chat-body { flex: 1; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
      .lx-row { display: flex; }
      .lx-row--user { justify-content: flex-end; }
      .lx-bub { max-width: 84%; padding: 9px 13px; font-size: 0.8rem; line-height: 1.5; }
      .lx-bub--user { background: var(--lx-accent); color: #fff; border-radius: 13px 13px 4px 13px; }
      .lx-bub--ai { background: #f6f6f9; border: 1px solid var(--lx-border);
        color: var(--lx-text-2); border-radius: 4px 13px 13px 13px; }
      .lx-route { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .lx-route-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--lx-text-3); }
      .lx-typing { display: flex; gap: 4px; padding: 8px 12px; }
      .lx-typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--lx-text-3);
        animation: lxTyping 1.1s ease-in-out infinite; }
      @keyframes lxTyping { 30% { transform: translateY(-4px); opacity: 1; } 60% { opacity: 0.4; } }
      .lx-file-chip { display: inline-flex; align-items: center; gap: 6px; margin-top: 9px; padding: 5px 9px;
        border-radius: 8px; background: #ffffff; border: 1px solid var(--lx-border);
        font-size: 0.7rem; font-weight: 600; color: var(--lx-text); }
      .lx-file-chip b { color: #dc2626; font-size: 0.6rem; letter-spacing: 0.04em; }

      /* ── Escena agente ── */
      .lx-ag-steps { flex: 1; display: flex; flex-direction: column; gap: 10px; margin-top: 16px; min-height: 0; }
      .lx-ag-step { display: flex; align-items: center; gap: 10px; padding: 9px 13px; border-radius: 11px;
        background: #ffffff; border: 1px solid var(--lx-border); box-shadow: 0 1px 2px rgba(16,16,44,0.04); }
      .lx-ag-ico { display: flex; color: var(--lx-accent); }
      .lx-ag-name { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.74rem; font-weight: 600;
        color: #4f43c4; }
      .lx-ag-track { flex: 1; height: 6px; border-radius: 3px; background: #ececf2; }
      .lx-ag-check { color: var(--lx-green); display: flex; }
      .lx-ag-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
      .lx-ag-foot .lx-done { font-size: 0.76rem; }

      /* ── Escena Daya Code (terminal): se queda oscura — los terminales reales lo son ── */
      .lx-cli { align-items: stretch; justify-content: center; }
      .lx-cli-win { border-radius: 12px; overflow: hidden; border: 1px solid #26262f;
        background: #101016; box-shadow: 0 14px 40px -12px rgba(16,16,44,0.4); display: flex; flex-direction: column; height: 100%; }
      .lx-cli-bar { display: flex; align-items: center; gap: 10px; padding: 9px 13px;
        background: #1a1a22; border-bottom: 1px solid rgba(255,255,255,0.07); }
      .lx-cli-bar .lx-st-dots i:nth-child(1) { background: #fc5753; }
      .lx-cli-bar .lx-st-dots i:nth-child(2) { background: #fdbc40; }
      .lx-cli-bar .lx-st-dots i:nth-child(3) { background: #33c748; }
      .lx-cli-title { font-size: 0.7rem; font-weight: 600; color: #8b8b98; }
      .lx-cli-body { flex: 1; padding: 14px 16px; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 0.78rem; line-height: 1.9; color: #b8b8c6; overflow: hidden; }
      .lx-cli .lx-caret { background: #a5b4fc; }
      .lx-cli-ps { color: #34d399; font-weight: 700; margin-right: 6px; }
      .lx-cli-tool { color: #a5b4fc; }
      .lx-cli-file { color: #f2f2f8; }
      .lx-cli-out { color: #6e6e7a; padding-left: 14px; }
      .lx-cli-ok { display: flex; align-items: center; gap: 7px; color: #34d399; font-weight: 700; }

      /* ── Escena imagen ── */
      .lx-img-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 12px;
        border-radius: 10px; background: #ffffff; border: 1px solid var(--lx-border);
        font-size: 0.78rem; color: var(--lx-text-2); }
      .lx-img-bar svg { color: var(--lx-accent); flex-shrink: 0; }
      .lx-img-canvas { position: relative; flex: 1; border-radius: 12px; overflow: hidden;
        border: 1px solid var(--lx-border); background: #f6f6f9; min-height: 0; }
      .lx-img-art { position: absolute; inset: 0;
        animation: lxPaint 3.3s cubic-bezier(0.45,0,0.2,1) both; }
      @keyframes lxPaint { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0% 0); } }
      .lx-img-sheen { position: absolute; inset: 0;
        background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%);
        transform: translateX(-100%); animation: lxSheen 3.3s ease-out both; mix-blend-mode: screen; }
      @keyframes lxSheen { to { transform: translateX(100%); } }
      .lx-img-gen { position: absolute; bottom: 10px; left: 12px; padding: 3px 9px; border-radius: 7px;
        background: rgba(11,11,18,0.55); color: #fff; font-size: 0.7rem; font-weight: 700; }
      .lx-img-hd { position: absolute; top: 10px; right: 10px; padding: 3px 8px; border-radius: 7px;
        background: rgba(11,11,18,0.6); color: #fff; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.06em; }
      .lx-img-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
      .lx-img-thumbs { display: flex; gap: 7px; }
      .lx-img-th { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--lx-border); }
      .lx-img-th-0 { background: linear-gradient(135deg, #ffd08a, #f78d5c); }
      .lx-img-th-1 { background: linear-gradient(135deg, #e0669a, #8b4a9e); }
      .lx-img-th-2 { background: linear-gradient(135deg, #3b3070, #e0669a); }

      /* ── Escena studio ── */
      .lx-st-bar { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; margin-bottom: 12px;
        border-bottom: 1px solid var(--lx-border); }
      .lx-st-dots { display: flex; gap: 5px; }
      .lx-st-dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(16,16,44,0.14); }
      .lx-st-file { font-size: 0.74rem; font-weight: 600; color: var(--lx-text-3); }
      .lx-st-canvas { position: relative; flex: 1; border-radius: 12px; min-height: 0;
        background: #fafafc; border: 1px solid var(--lx-border); }
      .lx-st-frame { position: absolute; top: 8%; left: 6%; width: 55%; height: 84%;
        border: 1.5px dashed rgba(91,75,224,0.55); border-radius: 10px; animation-delay: 0.25s; }
      .lx-st-img { position: absolute; top: 15%; left: 11%; width: 44%; height: 38%;
        border-radius: 8px; background: linear-gradient(135deg, #8b4a9e, #e0669a 55%, #f78d5c);
        animation-delay: 1.05s; }
      .lx-st-t1 { position: absolute; top: 60%; left: 11%; font-weight: 800; font-size: 0.95rem;
        color: var(--lx-text); animation-delay: 1.9s; }
      .lx-st-t2 { position: absolute; top: 72%; left: 11%; font-size: 0.72rem;
        color: var(--lx-text-3); animation-delay: 2.35s; }
      .lx-st-pal { position: absolute; top: 12%; right: 7%; display: flex; flex-direction: column; gap: 7px; }
      .lx-st-pal span { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #ffffff;
        box-shadow: 0 0 0 1px var(--lx-border); }
      .lx-st-cursor { position: absolute; top: 20%; left: 30%; z-index: 2;
        filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35)); animation: lxCursor 5.4s cubic-bezier(0.5,0,0.3,1) both; }
      @keyframes lxCursor {
        0% { transform: translate(0, 0); }
        22% { transform: translate(-34px, 26px); }
        42% { transform: translate(10px, 118px); }
        66% { transform: translate(96px, 92px); }
        100% { transform: translate(150px, -6px); }
      }

      /* ── Escena documento ── */
      .lx-doc { align-items: center; justify-content: center; background: #f6f6f9; }
      .lx-doc-page { position: relative; width: min(320px, 88%); height: 92%; border-radius: 10px; padding: 18px 20px;
        background: #ffffff; border: 1px solid var(--lx-border);
        box-shadow: 0 12px 34px -10px rgba(16,16,44,0.18); display: flex; flex-direction: column; }
      .lx-doc-title { font-weight: 800; font-size: 0.86rem; color: var(--lx-ink); margin-bottom: 13px; animation-delay: 0.15s; }
      .lx-doc-line { height: 7px; border-radius: 4px; background: #e4e4ec; margin-bottom: 9px;
        transform-origin: left; }
      .lx-doc-chart { display: flex; align-items: flex-end; gap: 9px; height: 74px; margin-top: auto; padding-bottom: 6px; }
      .lx-doc-chart span { flex: 1; border-radius: 4px 4px 0 0; transform-origin: bottom;
        background: linear-gradient(180deg, #8b7cff, #5b4be0); }
      .lx-doc-chip { position: absolute; bottom: 12px; right: 12px; display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 10px; border-radius: 8px; background: var(--lx-ink); color: #fff;
        font-size: 0.66rem; font-weight: 700; animation-delay: 4.3s; }
      .lx-doc-chip b { color: #f87171; font-size: 0.58rem; }

      /* ── Escena cuadernos ── */
      .lx-nb { gap: 0; }
      .lx-nb-head { padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid var(--lx-border); }
      .lx-nb-label { display: block; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--lx-text-3); margin-bottom: 9px; }
      .lx-nb-srcs { display: flex; flex-wrap: wrap; gap: 6px; }
      .lx-nb-src { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 8px;
        background: #ffffff; border: 1px solid var(--lx-border); box-shadow: 0 1px 2px rgba(16,16,44,0.04);
        font-size: 0.72rem; font-weight: 600; color: var(--lx-text-2); }
      .lx-nb-src svg { color: var(--lx-accent); flex-shrink: 0; }
      .lx-nb-chat { flex: 1; display: flex; flex-direction: column; gap: 10px; justify-content: center; }
      .lx-cite { display: inline-flex; align-items: center; justify-content: center; min-width: 15px; height: 15px;
        padding: 0 3px; margin: 0 1px; border-radius: 5px; background: var(--lx-accent); color: #fff;
        font-size: 0.6rem; font-weight: 800; vertical-align: super; }

      /* ── Escena research ── */
      .lx-res-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 12px;
        border-radius: 10px; background: #ffffff; border: 1px solid var(--lx-border);
        font-size: 0.78rem; color: var(--lx-text-2); }
      .lx-res-q { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .lx-res-live { display: inline-flex; align-items: center; gap: 5px; font-size: 0.64rem; font-weight: 700;
        color: var(--lx-green); text-transform: uppercase; letter-spacing: 0.07em; }
      .lx-res-rows { flex: 1; display: flex; flex-direction: column; gap: 9px; min-height: 0; }
      .lx-res-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px;
        background: #ffffff; border: 1px solid var(--lx-border); box-shadow: 0 1px 2px rgba(16,16,44,0.04); }
      .lx-res-fav { width: 22px; height: 22px; border-radius: 6px; background: rgba(91,75,224,0.1);
        color: var(--lx-accent); font-size: 0.68rem; font-weight: 800; display: flex; align-items: center; justify-content: center; }
      .lx-res-dom { font-size: 0.74rem; font-weight: 700; color: var(--lx-text); }
      .lx-res-line { flex: 1; height: 6px; border-radius: 3px; background: #ececf2; }
      .lx-res-check { color: var(--lx-green); display: flex; }
      .lx-res-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
      .lx-res-synth { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--lx-text-3); }
      .lx-res-foot .lx-done { margin-left: auto; }

      /* ── Responsive ── */
      @media (max-width: 900px) {
        .lx-stage-card { height: 330px; }
      }

      /* ── Reduced motion: todo estático en su estado FINAL ── */
      @media (prefers-reduced-motion: reduce) {
        .lx-stage-col *, .lx-stage-col *::before, .lx-stage-col *::after { animation: none !important; transition: none !important; }
        .lx-st-cursor { display: none; }
        .lx-img-sheen { display: none; }
      }
    ` }} />
  )
}
