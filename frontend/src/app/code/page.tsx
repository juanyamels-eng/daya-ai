'use client'
import Link from 'next/link'

export default function CodePage() {
  return (
    <div className="cx-root">
      <nav className="cx-nav">
        <Link href="/" className="cx-logo">
          <img src="/logo.png" alt="" />
          <span>Daya</span>
        </Link>
        <div className="cx-nav-right">
          <Link href="/auth/login" className="cx-nav-link">Sign in</Link>
          <Link href="/auth/register" className="cx-btn cx-btn-sm">Get started</Link>
        </div>
      </nav>

      <main className="cx-main">
        <span className="cx-eyebrow">CLI</span>
        <h1 className="cx-h1">Daya Code</h1>
        <p className="cx-sub">
          A programming agent in your terminal. Daya Code reads, writes, searches, and runs commands inside your project.
          The brain lives on Daya; you only need a token.
        </p>

        <div className="cx-terminal">
          <div className="cx-terminal-bar">
            <span className="cx-dot cx-dot--r" /><span className="cx-dot cx-dot--y" /><span className="cx-dot cx-dot--g" />
            <span className="cx-terminal-title">daya-code — terminal</span>
          </div>
          <div className="cx-terminal-body">
            <div><span className="cx-prompt">$</span> cd my-project</div>
            <div><span className="cx-prompt">$</span> daya-code &quot;refactor the login and add tests&quot;</div>
            <div className="cx-step">▸ read_file <span>src/auth/login.ts</span></div>
            <div className="cx-step">▸ write_file <span>src/auth/login.ts</span></div>
            <div className="cx-step">▸ run_command <span>npm test</span></div>
            <div className="cx-muted">{'{ "passed": 12, "failed": 0 }'}</div>
            <div className="cx-done">✓ Done. 3 files modified, tests passing.</div>
          </div>
        </div>

        <div className="cx-sections">
          <section className="cx-card">
            <h2>Installation</h2>
            <p>Download the script, make it executable, and run it from any project:</p>
            <div className="cx-code-block">
              <div><span className="cx-comment"># Option 1 — Direct download</span></div>
              <div>curl -Lo /usr/local/bin/daya-code https://daya-ai.com/daya-code.mjs</div>
              <div>chmod +x /usr/local/bin/daya-code</div>
              <div className="cx-spacer"><span className="cx-comment"># Option 2 — npm (if published)</span></div>
              <div>npm install -g daya-code</div>
            </div>
            <p className="cx-alt">
              You can also download the <a href="/daya-code.mjs" download>direct script</a> or clone the{' '}
              <a href="https://github.com/juanyamels-eng/daya-ai" target="_blank" rel="noopener">repository</a>{' '}
              and use <code>node cli/daya-code.mjs</code>.
            </p>
          </section>

          <section className="cx-card">
            <h2>Getting started</h2>
            <div className="cx-steps">
              <div className="cx-step-card">
                <span className="cx-step-n">1</span>
                <div>
                  <strong>Sign in</strong>
                  <p>Run <code>daya-code login</code> once. It will ask for your Daya token (find it in Settings → Account).</p>
                </div>
              </div>
              <div className="cx-step-card">
                <span className="cx-step-n">2</span>
                <div>
                  <strong>Open your code</strong>
                  <p>Navigate to your project root and run <code>daya-code</code> without arguments for interactive mode, or ask it directly:</p>
                  <div className="cx-code-block cx-code-block--sm">
                    <div><span className="cx-prompt">$</span> daya-code &quot;explain this project&quot;</div>
                    <div><span className="cx-prompt">$</span> daya-code &quot;find the bug in login&quot;</div>
                    <div><span className="cx-prompt">$</span> daya-code &quot;add tests for the users API&quot;</div>
                    <div><span className="cx-prompt">$</span> daya-code &quot;migrate this from JavaScript to TypeScript&quot;</div>
                  </div>
                </div>
              </div>
              <div className="cx-step-card">
                <span className="cx-step-n">3</span>
                <div>
                  <strong>Resume sessions</strong>
                  <p>Use <code>daya-code --continue</code> to pick up the last session in this folder. Daya Code remembers the previous context.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="cx-card">
            <h2>How it works</h2>
            <p>Daya Code runs on <strong>your machine</strong>, inside <strong>your project</strong>. It reads files, modifies them, searches code, runs commands, and creates new files. Each action requires your confirmation (or use <code>--yes</code> to skip it).</p>
            <div className="cx-feat-grid">
              {[
                { label: 'Read files', desc: 'Understands your code before touching it' },
                { label: 'Write & edit', desc: 'Modifies existing files or creates new ones' },
                { label: 'Search code', desc: 'Finds functions, classes, errors' },
                { label: 'Run commands', desc: 'Runs tests, linters, builds' },
              ].map(f => (
                <div className="cx-feat" key={f.label}>
                  <strong>{f.label}</strong>
                  <span>{f.desc}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="cx-cta-block">
            <p>Ready for Daya to work with your code?</p>
            <div className="cx-ctas">
              <Link href="/auth/register" className="cx-btn cx-btn-lg">Create free account</Link>
              <a href="/daya-code.mjs" download className="cx-btn-ghost cx-btn-lg">Download Daya Code</a>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .cx-root {
          --cx-bg: #0d0d0f;
          --cx-card-bg: #161618;
          --cx-border: #27272a;
          --cx-text: #e4e4e7;
          --cx-text-2: #a1a1aa;
          --cx-text-3: #71717a;
          --cx-accent: #f4f4f5;
          background: var(--cx-bg); color: var(--cx-text);
          font-family: var(--font-body, ui-sans-serif, system-ui, sans-serif);
          min-height: 100vh; display: flex; flex-direction: column;
          -webkit-font-smoothing: antialiased;
        }
        .cx-nav { display: flex; align-items: center; justify-content: space-between; padding: 14px 40px; border-bottom: 1px solid var(--cx-border); background: rgba(13,13,15,0.85); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 10; }
        .cx-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; color: var(--cx-text); }
        .cx-logo img { width: 24px; height: 24px; object-fit: contain; filter: invert(1) brightness(1.2); }
        .cx-logo span { font-size: 1rem; font-weight: 600; letter-spacing: -0.04em; }
        .cx-nav-right { display: flex; align-items: center; gap: 10px; }
        .cx-nav-link { color: var(--cx-text-2); text-decoration: none; font-size: 0.82rem; font-weight: 500; padding: 8px 14px; border-radius: 999px; transition: color 0.15s, background 0.15s; }
        .cx-nav-link:hover { color: var(--cx-text); background: rgba(255,255,255,0.06); }
        .cx-btn { display: inline-flex; align-items: center; justify-content: center; border: none; cursor: pointer; background: var(--cx-accent); color: #0d0d0f; font-weight: 600; font-family: inherit; text-decoration: none; white-space: nowrap; border-radius: 999px; transition: filter 0.15s; }
        .cx-btn:hover { filter: brightness(1.08); }
        .cx-btn-sm { padding: 9px 16px; font-size: 0.82rem; }
        .cx-btn-lg { padding: 13px 26px; font-size: 0.92rem; }
        .cx-btn-ghost { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; background: transparent; color: var(--cx-text); font-weight: 500; font-family: inherit; text-decoration: none; border: 1px solid var(--cx-border); border-radius: 999px; transition: background 0.15s, border-color 0.15s; }
        .cx-btn-ghost:hover { background: rgba(255,255,255,0.06); border-color: #52525b; }
        .cx-main { flex: 1; max-width: 760px; margin: 0 auto; padding: 80px 24px; width: 100%; }
        .cx-eyebrow { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--cx-text-3); }
        .cx-h1 { font-family: var(--font-display, ui-serif, serif); font-size: clamp(2rem, 4vw, 2.8rem); font-weight: 500; color: var(--cx-text); letter-spacing: -0.03em; line-height: 1.1; margin: 8px 0 12px; }
        .cx-sub { color: var(--cx-text-2); font-size: 0.92rem; margin-bottom: 48px; max-width: 55ch; line-height: 1.7; }
        .cx-terminal { border-radius: 12px; overflow: hidden; border: 1px solid var(--cx-border); margin-bottom: 48px; background: #0a0a0b; }
        .cx-terminal-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #18181b; border-bottom: 1px solid #27272a; }
        .cx-dot { width: 10px; height: 10px; border-radius: 50%; display: block; }
        .cx-dot--r { background: #fc5753; }
        .cx-dot--y { background: #fdbc40; }
        .cx-dot--g { background: #33c748; }
        .cx-terminal-title { font-size: 0.7rem; color: var(--cx-text-3); font-family: ui-monospace, monospace; margin-left: 4px; }
        .cx-terminal-body { padding: 16px 18px; font-family: ui-monospace, SF Mono, Menlo, monospace; font-size: 0.82rem; line-height: 1.9; color: #d4d4d8; }
        .cx-prompt { color: #34d399; font-weight: 700; margin-right: 8px; }
        .cx-step { color: #a5b4fc; }
        .cx-step span { color: #f2f2f8; }
        .cx-muted { color: var(--cx-text-3); }
        .cx-done { display: flex; align-items: center; gap: 7px; color: #34d399; font-weight: 700; margin-top: 4px; }
        .cx-comment { color: var(--cx-text-3); font-style: italic; }
        .cx-spacer { margin-top: 8px; }
        .cx-sections { display: flex; flex-direction: column; gap: 28px; }
        .cx-card { border: 1px solid var(--cx-border); border-radius: 12px; padding: 28px; background: var(--cx-card-bg); }
        .cx-card h2 { font-size: 1.1rem; font-weight: 600; color: var(--cx-text); margin: 0 0 12px; }
        .cx-card p { color: var(--cx-text-2); font-size: 0.88rem; line-height: 1.7; margin: 0 0 16px; }
        .cx-alt { font-size: 0.85rem; margin: 14px 0 0; }
        .cx-alt a { color: var(--cx-accent); text-decoration: underline; text-underline-offset: 3px; }
        .cx-alt code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
        .cx-code-block { background: #0a0a0b; border: 1px solid var(--cx-border); border-radius: 8px; padding: 14px 16px; font-family: ui-monospace, monospace; font-size: 0.8rem; line-height: 1.8; overflow-x: auto; white-space: nowrap; margin-bottom: 12px; }
        .cx-code-block--sm { padding: 10px 14px; margin: 8px 0 0; font-size: 0.78rem; }
        .cx-steps { display: flex; flex-direction: column; gap: 20px; }
        .cx-step-card { display: flex; gap: 14px; }
        .cx-step-n { width: 24px; height: 24px; border-radius: 50%; background: var(--cx-accent); color: #0d0d0f; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
        .cx-step-card strong { font-weight: 600; color: var(--cx-text); font-size: 0.9rem; }
        .cx-step-card p { color: var(--cx-text-2); font-size: 0.85rem; line-height: 1.6; margin: 4px 0 0; }
        .cx-step-card code { background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; font-size: 0.78rem; }
        .cx-feat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .cx-feat { padding: 14px 16px; border-radius: 8px; border: 1px solid var(--cx-border); background: #0a0a0b; }
        .cx-feat strong { display: block; font-weight: 600; color: var(--cx-text); font-size: 0.85rem; margin-bottom: 4px; }
        .cx-feat span { color: var(--cx-text-3); font-size: 0.78rem; }
        .cx-cta-block { padding: 28px 0; text-align: center; border-top: 1px solid var(--cx-border); }
        .cx-cta-block p { color: var(--cx-text-2); font-size: 0.85rem; margin: 0 0 16px; }
        .cx-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .cx-card a, .cx-step-card a { color: var(--cx-accent); text-decoration: underline; text-underline-offset: 2px; }
        @media (max-width: 768px) {
          .cx-nav { padding: 12px 20px; }
          .cx-main { padding: 48px 20px; }
          .cx-feat-grid { grid-template-columns: 1fr; }
        }
      ` }} />
    </div>
  )
}
