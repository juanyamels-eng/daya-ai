'use client'
import { useState, useEffect } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/cjs/styles/prism'

export interface Artifact {
  lang: string
  code: string
  title?: string
}

const PREVIEWABLE = new Set(['html', 'css', 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx', 'svg'])

const LANG_LABELS: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  jsx: 'JSX', tsx: 'TSX', py: 'Python', python: 'Python', rs: 'Rust', rust: 'Rust',
  go: 'Go', java: 'Java', cs: 'C#', cpp: 'C++', c: 'C', php: 'PHP', rb: 'Ruby',
  swift: 'Swift', kt: 'Kotlin', sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', md: 'Markdown', sh: 'Shell', bash: 'Bash',
  svg: 'SVG',
}

// Scripts CDN (versiones fijadas) para la vista previa en vivo.
const CDN_REACT =
  '<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>' +
  '<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>'
const CDN_BABEL = '<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>'

// Escapa </script> para poder incrustar el código del usuario dentro de un
// <script type="text/plain"> sin que cierre el bloque antes de tiempo.
function holder(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1')
}

// Vista previa para JSX/TSX: carga React + ReactDOM + Babel, transpila el código
// (JSX y tipos TS), y lo monta. Soporta tanto que el usuario monte él mismo
// (ReactDOM.createRoot/render) como auto-montar un componente `App` o el export default.
function reactPreviewSrc(code: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${CDN_REACT}${CDN_BABEL}
<style>body{margin:0;font-family:system-ui,sans-serif}#root{min-height:100vh}pre.__err{color:#c0392b;padding:16px;white-space:pre-wrap;font-size:13px;font-family:monospace}</style>
</head><body><div id="root"></div>
<script type="text/plain" id="__src">${holder(code)}</script>
<script>
(function(){
  var root=document.getElementById('root');
  function showErr(e){root.innerHTML='<pre class="__err">'+String((e&&e.stack)||e)+'</pre>';}
  window.addEventListener('error',function(ev){showErr(ev.error||ev.message);});
  try{
    var src=document.getElementById('__src').textContent;
    src=src.replace(/^\\s*import\\s+(?:[\\w*]+\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]react['"];?\\s*$/gm,'const {$1} = React;')
           .replace(/^\\s*import\\s+[\\w*]+\\s+from\\s*['"]react['"];?\\s*$/gm,'')
           .replace(/^\\s*import\\s.+?from\\s*['"][^'"]+['"];?\\s*$/gm,'')
           .replace(/^\\s*import\\s+['"][^'"]+['"];?\\s*$/gm,'')
           .replace(/^\\s*export\\s+default\\s+/gm,'var __default = ')
           .replace(/^\\s*export\\s+/gm,'');
    var userMounts=/(ReactDOM\\s*\\.\\s*(render|createRoot)|createRoot\\s*\\()/.test(src);
    var out=Babel.transform(src,{presets:[['react'],['typescript',{allExtensions:true,isTSX:true}]]}).code;
    var Comp=new Function('React','ReactDOM',out+'\\n;return (typeof __default!=="undefined"?__default:(typeof App!=="undefined"?App:null));')(React,ReactDOM);
    if(!userMounts){
      if(!Comp){throw new Error('No encontre un componente para renderizar. Define App, usa export default, o monta con ReactDOM.createRoot.');}
      if(ReactDOM.createRoot){ReactDOM.createRoot(root).render(React.createElement(Comp));}
      else{ReactDOM.render(React.createElement(Comp),root);}
    }
  }catch(e){showErr(e);}
})();
</script></body></html>`
}

// Vista previa para JS/TS sin UI: ejecuta el código y muestra lo que imprima por
// console.log. Para TS lo transpila antes con Babel (quita los tipos).
function scriptPreviewSrc(code: string, isTs: boolean): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${isTs ? CDN_BABEL : ''}
<style>body{margin:16px;font-family:system-ui;font-size:14px}pre{background:#f4f4f6;padding:12px;border-radius:8px;overflow:auto}pre.__err{color:#c0392b}</style>
</head><body><div id="root"></div>
<script type="text/plain" id="__src">${holder(code)}</script>
<script>
(function(){
  var root=document.getElementById('root');var _out=[];var _log=console.log;
  console.log=function(){var a=[].slice.call(arguments);_out.push(a.map(function(x){return typeof x==='object'?JSON.stringify(x,null,2):String(x)}).join(' '));_log.apply(console,arguments)};
  function flush(){if(_out.length){var pre=document.createElement('pre');pre.textContent=_out.join('\\n');root.appendChild(pre);}}
  function showErr(e){var pre=document.createElement('pre');pre.className='__err';pre.textContent=String((e&&e.stack)||e);root.appendChild(pre);}
  try{
    var src=document.getElementById('__src').textContent;
    src=src.replace(/^\\s*import\\s.+?from\\s*['"][^'"]+['"];?\\s*$/gm,'').replace(/^\\s*export\\s+(default\\s+)?/gm,'');
    ${isTs ? "src=Babel.transform(src,{presets:[['typescript',{allExtensions:true,isTSX:false}]]}).code;" : ''}
    new Function(src)();flush();
  }catch(e){flush();showErr(e);}
})();
</script></body></html>`
}

function buildPreviewSrc(lang: string, code: string): string {
  const l = lang.toLowerCase()
  if (l === 'html') return code
  if (l === 'svg') return `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f8f8">${code}</body></html>`
  if (l === 'css') return `<!DOCTYPE html><html><head><style>body{margin:16px;font-family:system-ui}${code}</style></head><body><p style="color:#aaa;font-size:.85rem">CSS cargado — añade HTML para ver el resultado</p></body></html>`
  if (l === 'jsx' || l === 'tsx') return reactPreviewSrc(code)
  if (l === 'ts' || l === 'typescript') return scriptPreviewSrc(code, true)
  if (l === 'js' || l === 'javascript') return scriptPreviewSrc(code, false)
  return ''
}

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => legacy(text))
  else legacy(text)
}
function legacy(text: string) {
  const el = document.createElement('textarea')
  el.value = text; el.style.cssText = 'position:fixed;top:-999px;opacity:0'
  document.body.appendChild(el); el.select()
  try { document.execCommand('copy') } catch {}
  document.body.removeChild(el)
}

const EXT_MAP_AP: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py', rust: 'rs', go: 'go',
  html: 'html', css: 'css', scss: 'scss', svg: 'svg', bash: 'sh', shell: 'sh',
  java: 'java', cpp: 'cpp', c: 'c', php: 'php', ruby: 'rb', swift: 'swift',
}

function extractArtifactTitle(code: string, lang: string): string {
  const l = lang.toLowerCase()
  if (l === 'html' || l === 'svg') {
    const m = code.match(/<title[^>]*>([^<]{2,60})<\/title>/i)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  const m2 = code.match(/^[ \t]*(?:\/\/|#|<!--)\s*([A-Za-zÀ-ÿ0-9][^*\n\r]{2,60?})(?:\s*-->|\s*\*\/)?\s*$/m)
  if (m2?.[1]?.trim()) return m2[1].trim()
  return ''
}

export default function ArtifactPanel({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [isDark, setIsDark] = useState(false)

  const lang = artifact.lang.toLowerCase()
  const canPreview = PREVIEWABLE.has(lang)
  const autoPreview = canPreview && (lang === 'html' || lang === 'svg')

  const [tab, setTab] = useState<'code' | 'preview'>(autoPreview ? 'preview' : 'code')

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Reset tab when a different artifact is loaded
  useEffect(() => {
    setTab(autoPreview ? 'preview' : 'code')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.code])

  const lines = artifact.code.split('\n').length
  const label = LANG_LABELS[lang] || artifact.lang.toUpperCase() || 'Código'
  const codeTitle = artifact.title || extractArtifactTitle(artifact.code, lang) || label

  const copy = () => {
    copyToClipboard(artifact.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const ext = EXT_MAP_AP[lang] || lang || 'txt'
    const rawTitle = artifact.title || extractArtifactTitle(artifact.code, lang) || label
    const safe = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    const blob = new Blob([artifact.code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${safe || 'codigo'}.${ext}`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ width: 'clamp(340px, 42vw, 580px)', flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface)', overflow: 'hidden', animation: 'slideInArtifact 0.3s cubic-bezier(0.16,1,0.3,1) both' }}>

      {/* Header */}
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'var(--bg-base)' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: isDark ? '#1e1e2e' : '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a6adc8" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {codeTitle}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{lines} {lines === 1 ? 'línea' : 'líneas'} · {label}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={download} title="Descargar archivo"
            style={headerBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button onClick={copy} title={copied ? 'Copiado' : 'Copiar'}
            style={{ ...headerBtn, color: copied ? 'var(--green)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: '0.74rem', fontWeight: 600, transition: 'color 0.18s, background 0.15s' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, animation: copied ? 'copyPop 0.28s cubic-bezier(0.16,1,0.3,1)' : 'none' }}>
              {copied
                ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>Copiado</>
                : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copiar</>}
            </span>
          </button>
          <button onClick={onClose} title="Cerrar" aria-label="Cerrar panel"
            style={headerBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Tabs (solo si se puede previsualizar) */}
      {canPreview && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-base)', flexShrink: 0 }}>
          <button onClick={() => setTab('preview')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-body)', color: tab === 'preview' ? 'var(--text-primary)' : 'var(--text-tertiary)', borderBottom: `2px solid ${tab === 'preview' ? 'var(--accent-500)' : 'transparent'}`, transition: 'all 0.15s', marginBottom: -1 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {lang === 'html' ? 'Ejecutar' : 'Preview'}
          </button>
          <button onClick={() => setTab('code')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-body)', color: tab === 'code' ? 'var(--text-primary)' : 'var(--text-tertiary)', borderBottom: `2px solid ${tab === 'code' ? 'var(--accent-500)' : 'transparent'}`, transition: 'all 0.15s', marginBottom: -1 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            Código
          </button>
        </div>
      )}

      {/* Contenido */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {tab === 'code' ? (
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
            <SyntaxHighlighter
              language={artifact.lang || 'text'}
              style={isDark ? vscDarkPlus : vs}
              customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.83rem', lineHeight: 1.68, background: isDark ? '#1e1e2e' : '#f8f8fa', padding: '20px 20px', minHeight: '100%' }}
              showLineNumbers
              lineNumberStyle={{ color: isDark ? '#4a4f6a' : '#b0b8c8', fontSize: '0.74rem', minWidth: '2.8em', paddingRight: '1.2em', userSelect: 'none' }}
              wrapLongLines={false}
              PreTag="div"
            >
              {artifact.code}
            </SyntaxHighlighter>
          </div>
        ) : (
          <iframe
            srcDoc={buildPreviewSrc(lang, artifact.code)}
            sandbox="allow-scripts"
            style={{ flex: 1, border: 'none', background: '#fff', minHeight: 0 }}
            title="Vista previa del código"
          />
        )}
      </div>

      <style>{`
        @keyframes slideInArtifact {
          from { opacity: 0; transform: translateX(28px) scale(0.99); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes copyPop {
          0%  { transform: scale(0.6) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.2) rotate(4deg); }
          100%{ transform: scale(1) rotate(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

const headerBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border-default)',
  background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s', flexShrink: 0,
}
