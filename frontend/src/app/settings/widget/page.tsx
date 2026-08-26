'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button, Card, Input } from '@/components/ui'
import { Settings, Copy, Check } from 'lucide-react'

export default function WidgetSettingsPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const [config, setConfig] = useState({
    primaryColor: '#6d5cff',
    greeting: 'Hola, soy DAYA. ¿En qué te puedo ayudar?',
    position: 'bottom-right',
    title: 'DAYA Assistant',
    model: 'claude-3.5-sonnet',
  })
  const [widgetToken, setWidgetToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (hasHydrated && isAuthenticated()) {
      api.get('/widget/config').then(res => {
        if (res.data.config) setConfig(res.data.config)
        if (res.data.token) setWidgetToken(res.data.token)
      }).catch(() => {})
    }
  }, [hasHydrated, isAuthenticated])

  const saveConfig = async () => {
    setSaving(true)
    try {
      await api.put('/widget/config', config)
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error guardando')
    } finally { setSaving(false) }
  }

  const embedCode = `<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://daya.ai'}/api/widget/embed/${widgetToken}"></script>`

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    toast.success('Código copiado')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!hasHydrated) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
          <Settings size={24} style={{ color: 'var(--accent-500)' }} />
          Widget Settings
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Config */}
          <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Configuración</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Color principal</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={config.primaryColor}
                  onChange={e => setConfig({ ...config, primaryColor: e.target.value })}
                  style={{ width: 40, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                />
                <Input value={config.primaryColor}
                  onChange={e => setConfig({ ...config, primaryColor: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Título</label>
              <Input value={config.title}
                onChange={e => setConfig({ ...config, title: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Mensaje de bienvenida</label>
              <textarea value={config.greeting}
                onChange={e => setConfig({ ...config, greeting: e.target.value })}
                style={{
                  width: '100%', minHeight: 80, padding: 10, borderRadius: 10,
                  border: '1px solid var(--border-default)', background: 'var(--bg-base)',
                  color: 'var(--text-primary)', fontSize: 13, resize: 'vertical',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Posición</label>
              <select value={config.position}
                onChange={e => setConfig({ ...config, position: e.target.value })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border-default)', background: 'var(--bg-base)',
                  color: 'var(--text-primary)', fontSize: 13,
                }}>
                <option value="bottom-right">Abajo derecha</option>
                <option value="bottom-left">Abajo izquierda</option>
              </select>
            </div>

            <Button onClick={saveConfig} loading={saving} style={{ width: '100%' }}>
              Guardar configuración
            </Button>
          </Card>

          {/* Embed code + Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Código de integración</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
                Copia este código y pégalo en tu sitio web antes del cierre de {'</body>'}
              </p>
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 10, padding: 12,
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                wordBreak: 'break-all', marginBottom: 12, lineHeight: 1.5,
              }}>
                {embedCode}
              </div>
              <Button variant="secondary" onClick={copyEmbed} style={{ width: '100%' }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar código'}
              </Button>
            </Card>

            {/* Preview */}
            <Card style={{ padding: '1.5rem', border: '1px solid var(--border-default)' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Vista previa</h2>
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 12, padding: 20,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: config.primaryColor, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, boxShadow: `0 4px 20px ${config.primaryColor}40`,
                }}>💬</div>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Botón del widget</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
