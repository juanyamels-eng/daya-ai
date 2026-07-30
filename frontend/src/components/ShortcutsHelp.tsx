'use client'
import { Dialog } from './ui/Dialog'
import { SHORTCUT_HELP } from '../hooks/useKeyboardShortcuts'

// Chuleta de atajos (se abre con `?`). La lista vive en useKeyboardShortcuts
// para que no se desincronice de lo que de verdad está enganchado.
export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Atajos de teclado" maxWidth={460}
      description="Funcionan en toda la aplicación, salvo mientras escribes en un campo de texto.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {SHORTCUT_HELP.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '9px 2px', borderBottom: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '0.87rem', color: 'var(--text-secondary)' }}>{s.label}</span>
            <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {s.keys.map(k => (
                <kbd key={k} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 24, padding: '0 7px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{k}</kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
