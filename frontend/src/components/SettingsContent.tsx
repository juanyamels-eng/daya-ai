'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../store'
import { api, userAPI, chatAPI } from '../lib/api'
import { memorySkillsAPI, whatsappAPI } from '../lib/toolsApi'
import { useI18n, useT } from '../lib/i18n'
import { toast } from '../lib/toast'
import PageTitle from './PageTitle'
import PlansModal from './PlansModal'
import ApiTokensManager from './ApiTokensManager'

// Dirección del backend, la misma que usa el resto de la app. Se enseña en
// Ajustes para configurar editores externos (API compatible con OpenAI).
const API = process.env.NEXT_PUBLIC_API_URL || ''

const SECTIONS = [
  { id: 'perfil', key: 'identity', icon: <UserIcon /> },
  { id: 'plan', key: 'subscription', icon: <PlanIcon /> },
  { id: 'daya', key: 'operatingConfig', icon: <SliderIcon /> },
  { id: 'datos', key: 'security', icon: <DatabaseIcon /> },
  { id: 'uso', key: 'usageInsights', icon: <ChartIcon /> },
  { id: 'soporte', key: 'support', icon: <SupportIcon /> },
  { id: 'acerca', key: 'platform', icon: <InfoIcon /> },
] as const

export default function SettingsContent({ asModal = false, onClose }: { asModal?: boolean; onClose?: () => void }) {
  const t = useT()
  const [showPlans, setShowPlans] = useState(false)
  const router = useRouter()
  const { user, setUser, logout, theme, themePref, setThemePref } = useAuthStore()
  const [active, setActive] = useState('perfil')
  const [memoryList, setMemoryList] = useState<any[]>([])
  const [memLoading, setMemLoading] = useState(false)
  const [skillsList, setSkillsList] = useState<any[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [waStatus, setWaStatus] = useState<{ configured: boolean; linked: boolean; phone: string | null; number: string } | null>(null)
  const [waCode, setWaCode] = useState<string | null>(null)
  const [waBusy, setWaBusy] = useState(false)
  const [usageData, setUsageData] = useState<any>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [name, setName] = useState(user?.name || '')
  // El store puede hidratar DESPUÉS del primer render: sincroniza el nombre
  // cuando llegue (solo si el usuario aún no ha escrito nada en el campo).
  useEffect(() => { if (user?.name) setName(prev => prev || user.name) }, [user?.name])
  const [avatar, setAvatar] = useState<string | null>(null)
  const [tone, setTone] = useState('amigable')

  // Cerrar: si es modal, ejecuta onClose; si es página, vuelve al dashboard
  const closeSettings = () => { if (asModal && onClose) onClose(); else router.push('/dashboard') }
  const [length, setLength] = useState('normal')
  const [language, setLanguage] = useState('es')
  const [profession, setProfession] = useState('')
  const [supportText, setSupportText] = useState('')
  const [supportSent, setSupportSent] = useState(false)
  const [supportSending, setSupportSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Refresca los datos del usuario (incluido el contador de mensajes) al abrir Ajustes
  useEffect(() => {
    api.get('/auth/me')
      .then(r => {
        setUser({ ...user!, ...r.data })
        if (r.data.avatarUrl) setAvatar(r.data.avatarUrl)
        // Cargar las preferencias guardadas (antes Ajustes siempre mostraba
        // los valores por defecto aunque el usuario ya hubiera guardado otros)
        const p = r.data.profile
        if (p) {
          if (p.tone) setTone(p.tone)
          if (p.responseLength) setLength(p.responseLength)
          if (p.language) setLanguage(p.language)
          if (p.profession) setProfession(p.profession)
        }
      })
      .catch(() => {})
  }, [])



  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      await api.patch('/user/profile', { name, language })
      setUser({ ...user!, name })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch { toast('No se pudo guardar el perfil. Intenta de nuevo.', 'error') }
    setSaving(false)
  }

  const handleSavePreferences = async () => {
    setSaving(true)
    try {
      await userAPI.updateProfile({ tone, length, language, profession: profession.trim() })
      setSaved(true)
      toast('Configuración aplicada. Daya la usará en tus próximas respuestas.', 'success')
      setTimeout(() => setSaved(false), 2500)
    } catch { toast('No se pudo guardar la configuración.', 'error') }
    setSaving(false)
  }

  const handleSendSupport = async () => {
    if (!supportText.trim()) return
    setSupportSending(true)
    try {
      await userAPI.sendSupport(supportText.trim())
      setSupportSent(true)
      setSupportText('')
      setTimeout(() => setSupportSent(false), 4000)
    } catch {
      toast('No se pudo enviar el mensaje. Intenta de nuevo.', 'error')
    } finally {
      setSupportSending(false)
    }
  }

  const handleDeleteMemories = async () => {
    try {
      const mems = await userAPI.getMemories()
      for (const m of mems.data) await userAPI.deleteMemory(m.id)
      setConfirmDelete(null)
      setMemoryList([])
      toast('Memoria eliminada.', 'success')
    } catch { toast('No se pudo eliminar la memoria.', 'error') }
  }

  // Carga la lista de recuerdos para mostrarlos uno por uno.
  const loadMemories = async () => {
    setMemLoading(true)
    try {
      const r = await userAPI.getMemories()
      setMemoryList(Array.isArray(r.data) ? r.data : [])
    } catch { /* sin memorias o error: lista vacía */ }
    finally { setMemLoading(false) }
  }

  // Borra un recuerdo concreto.
  const deleteOneMemory = async (id: string) => {
    try {
      await userAPI.deleteMemory(id)
      setMemoryList(prev => prev.filter(m => m.id !== id))
    } catch { toast('No se pudo borrar ese recuerdo.', 'error') }
  }

  // Carga las "skills" que Daya aprendió (patrones de cómo trabaja el usuario).
  const loadSkills = async () => {
    setSkillsLoading(true)
    try {
      const r = await memorySkillsAPI.listSkills()
      setSkillsList(Array.isArray(r.data?.skills) ? r.data.skills : [])
    } catch { /* sin skills o error: lista vacía */ }
    finally { setSkillsLoading(false) }
  }

  // Activa/desactiva una skill (optimista: refleja el cambio al instante).
  const toggleSkill = async (id: string, enabled: boolean) => {
    setSkillsList(prev => prev.map(s => s.id === id ? { ...s, enabled } : s))
    try {
      await memorySkillsAPI.setSkillEnabled(id, enabled)
    } catch {
      setSkillsList(prev => prev.map(s => s.id === id ? { ...s, enabled: !enabled } : s))
      toast('No se pudo actualizar.', 'error')
    }
  }

  // Olvida una skill aprendida.
  const deleteOneSkill = async (id: string) => {
    try {
      await memorySkillsAPI.deleteSkill(id)
      setSkillsList(prev => prev.filter(s => s.id !== id))
    } catch { toast('No se pudo borrar.', 'error') }
  }

  // Carga el estado del vínculo de WhatsApp.
  const loadWaStatus = async () => {
    try {
      const r = await whatsappAPI.status()
      setWaStatus(r.data)
    } catch { /* no disponible: se muestra como desconectado */ }
  }

  // Genera un código para conectar WhatsApp (lo muestra para enviarlo al número de Daya).
  const connectWhatsApp = async () => {
    setWaBusy(true)
    try {
      const r = await whatsappAPI.connect()
      setWaCode(r.data?.code || null)
    } catch { toast('No se pudo generar el código.', 'error') }
    finally { setWaBusy(false) }
  }

  // Desvincula WhatsApp.
  const disconnectWhatsApp = async () => {
    setWaBusy(true)
    try {
      await whatsappAPI.disconnect()
      setWaCode(null)
      await loadWaStatus()
    } catch { toast('No se pudo desvincular.', 'error') }
    finally { setWaBusy(false) }
  }

  // Al entrar a la pestaña "Datos", carga los recuerdos, las skills y el estado de WhatsApp.
  useEffect(() => { if (active === 'datos') { loadMemories(); loadSkills(); loadWaStatus() } }, [active])

  useEffect(() => {
    if (active !== 'uso' || usageData) return
    setUsageLoading(true)
    const { token } = useAuthStore.getState()
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    fetch(`${apiUrl}/api/insights/usage?days=30`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setUsageData).catch(() => {}).finally(() => setUsageLoading(false))
  }, [active])

  const handleDeleteHistory = async () => {
    try {
      const convs = await chatAPI.getConversations()
      for (const c of convs.data) await chatAPI.deleteConversation(c.id)
      setConfirmDelete(null)
      toast('Historial de conversaciones eliminado.', 'success')
    } catch { toast('No se pudo eliminar el historial.', 'error') }
  }

  const handleExportData = async () => {
    try {
      const res = await userAPI.exportData()
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mis-datos-daya.json'
      a.click()
      URL.revokeObjectURL(url)
      toast('Descargando tus datos…', 'success')
    } catch { toast('No se pudieron exportar los datos.', 'error') }
  }

  const handleDeleteAccount = async () => {
    try {
      await userAPI.deleteAccount()
      logout()
      router.push('/auth/register')
    } catch {}
  }

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Solo se permiten imágenes (JPG, PNG, WebP, etc.)', 'error'); return }
    if (file.size > 1_500_000) { toast('La imagen es muy grande (máx. 1.5MB)', 'error'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUri = reader.result as string
      setAvatar(dataUri)
      try {
        await userAPI.uploadAvatar(dataUri)
        // Actualiza el store para que el avatar se vea al instante en el sidebar
        if (user) setUser({ ...user, avatarUrl: dataUri })
      } catch {}
    }
    reader.readAsDataURL(file)
  }

  const planLabel = (p?: string) => ({ FREE: 'Gratis', PRO: 'Pro' }[p || 'FREE'] || 'Gratis')
  const planColors: Record<string, string> = {
    FREE: '#6b7280', PRO: '#6d5cff'
  }

  return (
    <div style={asModal
      ? { position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'fadeIn 0.2s ease' }
      : { minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column' }}
      onMouseDown={asModal ? (e) => { if (e.target === e.currentTarget) closeSettings() } : undefined}>
      <div style={asModal
        ? { width: '100%', maxWidth: 1000, height: '88vh', background: 'var(--bg-base)', borderRadius: 18, border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font-body)', animation: 'modalPop 0.22s cubic-bezier(0.16,1,0.3,1)' }
        : { display: 'contents' }}>
      <PageTitle title={t('settings')} />
      {showPlans && <PlansModal onClose={() => setShowPlans(false)} />}

      {/* Top bar */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)', padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={closeSettings} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '6px 10px', borderRadius: 8, transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
            {asModal
              ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cerrar</>
              : <><ChevronLeftIcon /> Volver</>
            }
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border-default)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              <DayaIcon size={13} />
            </div>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem', letterSpacing: '-0.02em' }}>{t('settings')}</span>
          </div>
        </div>
        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '5px 14px', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, animation: 'fadeIn 0.2s ease' }}>
            <CheckIcon size={12} />
            Configuración aplicada
          </div>
        )}
      </div>

      <div className="settings-outer" style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', justifyContent: 'center', gap: 48, padding: '44px 28px' }}>
        <div className="settings-body" style={{ display: 'flex', maxWidth: 1000, width: '100%', gap: 48, alignItems: 'flex-start' }}>

        {/* Sidebar */}
        <div className="settings-nav" style={{ width: 220, flexShrink: 0 }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'sticky', top: 44 }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setActive(s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.83rem', fontWeight: active === s.id ? 600 : 400, background: active === s.id ? 'var(--bg-elevated)' : 'transparent', color: active === s.id ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'all 0.15s', fontFamily: 'var(--font-body)', borderLeft: `2px solid ${active === s.id ? 'var(--border-strong)' : 'transparent'}` }}>
                <span style={{ color: active === s.id ? 'var(--accent-400)' : 'var(--text-tertiary)', display: 'flex' }}>{s.icon}</span>
                {t(s.key as any)}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border-default)', margin: '8px 0' }} />
            <button onClick={() => { logout(); router.push('/auth/login') }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: '0.83rem', background: 'transparent', color: 'var(--red)', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <LogoutIcon />
              Cerrar sesión
            </button>
          </nav>
        </div>

        {/* Content */}
        <div key={active} style={{ flex: 1, minWidth: 0, animation: 'settingsTabIn 0.22s cubic-bezier(0.16,1,0.3,1) both' }}>
          <style>{`@keyframes settingsTabIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

          {/* PERFIL */}
          {active === 'perfil' && (
            <Section title="Tu perfil" desc="Tu nombre y tu foto. Es lo que Daya usa para dirigirse a ti y personalizar tus respuestas.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px', background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border-default)', marginBottom: 24 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 68, height: 68, borderRadius: 18, background: avatar ? 'transparent' : `hsl(${(user?.name?.charCodeAt(0) || 200) * 5}, 55%, 48%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: 700, color: 'white', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                    {avatar ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <button onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-500)', border: '2px solid var(--bg-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <EditIcon size={10} color="white" />
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} style={{ display: 'none' }} />
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem', marginBottom: 3 }}>{user?.name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginBottom: 10 }}>{user?.email}</div>
                  <button onClick={() => fileRef.current?.click()} style={{ fontSize: '0.78rem', padding: '5px 12px', borderRadius: 7, background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}>
                    Cambiar foto
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="Nombre para mostrar">
                  <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
                </Field>
                <Field label="Correo electrónico" hint="Es el identificador de tu cuenta y no se puede cambiar.">
                  <input style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} value={user?.email || ''} disabled />
                </Field>
                <button onClick={handleSaveProfile} disabled={saving} style={primaryBtn}>
                  {saving ? 'Aplicando...' : 'Aplicar cambios'}
                </button>
              </div>
            </Section>
          )}

          {/* PLAN */}
          {active === 'plan' && (
            <Section title="Tu plan" desc="Tu plan actual, lo que llevas consumido este período y lo que incluye cada nivel.">
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{t('currentPlan')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{planLabel(user?.plan)}</span>
                      <span style={{ background: planColors[user?.plan || 'FREE'] + '18', color: planColors[user?.plan || 'FREE'], fontSize: '0.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, border: `1px solid ${planColors[user?.plan || 'FREE']}30` }}>{planLabel(user?.plan)}</span>
                    </div>
                  </div>
                  {user?.plan === 'FREE' && (
                    <button style={primaryBtn} onClick={() => setShowPlans(true)}>{t('expandCapabilities')}</button>
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 8 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Consumo del período{user?.plan === 'FREE' ? ' (diario)' : ' (mensual)'}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{user?.messagesUsed || 0} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>/ {user?.messagesLimit || 20}</span></span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, var(--accent-400), var(--accent-500))', width: `${Math.min(100, ((user?.messagesUsed || 0) / (user?.messagesLimit || 20)) * 100)}%`, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, padding: 20, background: 'var(--bg-elevated)', borderRadius: 14, border: '1px solid var(--border-default)', textAlign: 'center' }}>
                <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
                  Descubre todos los planes y mejora tu experiencia con Daya.
                </p>
                <button style={{ ...primaryBtn, margin: '0 auto' }} onClick={() => setShowPlans(true)}>
                  Explorar niveles de suscripción
                </button>
              </div>
            </Section>
          )}

          {/* PREFERENCIAS */}
          {active === 'daya' && (<>
            <Section title="Preferencias de Daya" desc="Ajusta cómo te responde Daya: idioma, tono y longitud. Se aplica a tus próximas conversaciones.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Field label={t('operatingLanguage')}>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={language} onChange={e => { setLanguage(e.target.value); if (e.target.value === 'es' || e.target.value === 'en') useI18n.getState().setLang(e.target.value as any) }}>
                    <option value="es">Español</option>
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                    <option value="fr">Français</option>
                  </select>
                </Field>

                <Field label="Tu profesión u ocupación" hint="Daya adapta sus ejemplos y respuestas a tu campo.">
                  <input style={inputStyle} value={profession} onChange={e => setProfession(e.target.value)} placeholder="Ej. abogada, estudiante de medicina, desarrollador…" maxLength={60} />
                </Field>

                <Field label="Tono" hint="El estilo con el que Daya se comunica.">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                      { value: 'formal', label: 'Formal', desc: 'Profesional y preciso' },
                      { value: 'amigable', label: 'Amigable', desc: 'Cercano y natural' },
                      { value: 'tecnico', label: 'Técnico', desc: 'Detallado y exacto' },
                    ].map(t => (
                      <button key={t.value} onClick={() => setTone(t.value)}
                        style={{ position: 'relative', padding: '14px 12px', borderRadius: 10, border: `${tone === t.value ? '2px' : '1px'} solid ${tone === t.value ? 'var(--text-primary)' : 'var(--border-default)'}`, background: tone === t.value ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}>
                        {tone === t.value && <span style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>✓</span>}
                        <div style={{ fontWeight: tone === t.value ? 700 : 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 4 }}>{t.label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Longitud de respuesta">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                      { value: 'corta', label: 'Corta', desc: 'Breve y directa' },
                      { value: 'normal', label: 'Normal', desc: 'Balance ideal' },
                      { value: 'detallada', label: 'Detallada', desc: 'Explicación completa' },
                    ].map(l => (
                      <button key={l.value} onClick={() => setLength(l.value)}
                        style={{ position: 'relative', padding: '14px 12px', borderRadius: 10, border: `${length === l.value ? '2px' : '1px'} solid ${length === l.value ? 'var(--text-primary)' : 'var(--border-default)'}`, background: length === l.value ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}>
                        {length === l.value && <span style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>✓</span>}
                        <div style={{ fontWeight: length === l.value ? 700 : 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 4 }}>{l.label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{l.desc}</div>
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Apariencia" hint={themePref === 'system' ? `Siguiendo al sistema: ahora en ${theme === 'dark' ? 'oscuro' : 'claro'}. Cambia solo si tu equipo cambia.` : 'Se guarda automáticamente y aplica en toda la plataforma.'}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {([
                      { value: 'light', label: 'Claro', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> },
                      { value: 'dark', label: 'Oscuro', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> },
                      { value: 'system', label: 'Sistema', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
                    ] as const).map(opt => (
                      <button key={opt.value} onClick={() => setThemePref(opt.value)}
                        style={{ position: 'relative', padding: '14px 12px', borderRadius: 10, border: `${themePref === opt.value ? '2px' : '1px'} solid ${themePref === opt.value ? 'var(--text-primary)' : 'var(--border-default)'}`, background: themePref === opt.value ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        {themePref === opt.value && <span style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>✓</span>}
                        <span style={{ color: 'var(--text-secondary)' }}>{opt.icon}</span>
                        <span style={{ fontWeight: themePref === opt.value ? 700 : 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </Field>

                <button onClick={handleSavePreferences} disabled={saving} style={{ ...primaryBtn, alignSelf: 'flex-start' }}>
                  {saving ? 'Aplicando...' : 'Aplicar configuración'}
                </button>
              </div>
            </Section>
          </>)}

          {/* DATOS */}
          {active === 'datos' && (<>
            {waStatus?.configured && (
            <Section title="Conectar WhatsApp" desc="Usa Daya desde tu WhatsApp: escríbele como a un contacto y te responde con tu misma memoria, documentos y preferencias.">
              {waStatus?.linked ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#25d366', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>WhatsApp conectado</div>
                      {waStatus.phone && <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>+{waStatus.phone}</div>}
                    </div>
                  </div>
                  <button onClick={disconnectWhatsApp} disabled={waBusy}
                    style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: waBusy ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600, opacity: waBusy ? 0.6 : 1 }}>
                    Desvincular
                  </button>
                </div>
              ) : waCode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Envía este código por WhatsApp {waStatus?.number ? <>al número <b style={{ color: 'var(--text-primary)' }}>+{waStatus.number}</b></> : 'al número de Daya'} para vincular tu cuenta:
                  </div>
                  <div style={{ alignSelf: 'flex-start', fontFamily: 'var(--font-mono, monospace)', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent-500)', background: 'var(--bg-surface)', border: '1px dashed var(--accent-500)', borderRadius: 12, padding: '12px 22px' }}>
                    {waCode}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                    Válido 15 minutos. Cuando lo envíes, Daya te confirmará por WhatsApp y aquí aparecerá como conectado.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={connectWhatsApp} disabled={waBusy}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 18px', borderRadius: 12, border: 'none', background: '#25d366', color: '#fff', cursor: waBusy ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.86rem', fontWeight: 700, opacity: waBusy ? 0.7 : 1 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2z"/></svg>
                    Conectar WhatsApp
                  </button>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Generamos un código para vincular tu número.</span>
                </div>
              )}
            </Section>
            )}
            <Section title="Privacidad y datos" desc="Controla tu información: descarga una copia, borra tu memoria o tu historial, o elimina tu cuenta.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { key: 'exportar', title: 'Descargar mis datos', desc: 'Obtén una copia de tu información (perfil, conversaciones y memoria) en formato JSON.', action: handleExportData, danger: false },
                  { key: 'memoria', title: 'Borrar memoria', desc: 'Elimina lo que Daya recuerda de ti. Las próximas conversaciones empiezan sin contexto previo.', action: handleDeleteMemories, danger: false },
                  { key: 'historial', title: 'Borrar historial de conversaciones', desc: 'Elimina todas tus conversaciones. Esta acción no se puede deshacer.', action: handleDeleteHistory, danger: false },
                  { key: 'todo', title: 'Borrar memoria e historial', desc: 'Elimina memoria y conversaciones de una vez. Tu cuenta sigue activa.', action: async () => { await handleDeleteMemories(); await handleDeleteHistory() }, danger: true },
                  { key: 'cuenta', title: 'Eliminar mi cuenta', desc: 'Borra permanentemente tu cuenta y TODOS tus datos. Esta acción no se puede deshacer.', action: handleDeleteAccount, danger: true },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 18px', background: 'var(--bg-elevated)', border: `1px solid ${item.danger ? 'rgba(239,68,68,0.2)' : 'var(--border-default)'}`, borderRadius: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: 3 }}>{item.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                    {confirmDelete === item.key ? (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => setConfirmDelete(null)} style={ghostBtn}>{t('cancel')}</button>
                        <button onClick={() => { item.action(); setConfirmDelete(null) }} style={{ ...ghostBtn, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>{t('confirm')}</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(item.key)} style={{ ...ghostBtn, flexShrink: 0, color: item.danger ? 'var(--red)' : 'var(--text-secondary)', borderColor: item.danger ? 'rgba(239,68,68,0.25)' : 'var(--border-default)', background: item.danger ? 'rgba(239,68,68,0.06)' : 'transparent' }}>{t('execute')}</button>
                    )}
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Memoria de Daya" desc="Esto es lo que Daya recuerda de ti para personalizar sus respuestas. Puedes borrar cualquier recuerdo individualmente.">
              {memLoading ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', padding: '8px 2px' }}>Cargando…</div>
              ) : memoryList.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', padding: '14px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
                  Daya todavía no recuerda nada de ti. A medida que converses, irá guardando solo lo importante.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {memoryList.map((m: any) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>{m.content}</div>
                        {m.category && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 3, textTransform: 'capitalize' }}>{m.category}</div>}
                      </div>
                      <button onClick={() => deleteOneMemory(m.id)} title="Borrar este recuerdo"
                        style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.14s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'transparent' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <Section title="Cómo trabajas" desc="Patrones que Daya ha aprendido sobre cómo te gusta que haga las cosas. Los activos guían sus respuestas; puedes desactivar cualquiera sin borrarlo, o eliminarlo del todo.">
              {skillsLoading ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', padding: '8px 2px' }}>Cargando…</div>
              ) : skillsList.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', padding: '14px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
                  Daya todavía no ha aprendido ningún patrón de trabajo. A medida que converses, detectará cómo prefieres las cosas (formato, tono, rutinas) y aparecerán aquí.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {skillsList.map((s: any) => {
                    const on = s.enabled !== false
                    return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
                      <div style={{ minWidth: 0, opacity: on ? 1 : 0.5, transition: 'opacity 0.15s' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>{s.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 2 }}>{s.guidance}</div>
                        {s.trigger && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 3 }}>Cuándo: {s.trigger}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <button onClick={() => toggleSkill(s.id, !on)} role="switch" aria-checked={on} title={on ? 'Desactivar' : 'Activar'}
                          style={{ position: 'relative', width: 38, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, background: on ? 'var(--accent-500)' : 'var(--border-strong)', transition: 'background 0.15s' }}>
                          <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
                        </button>
                        <button onClick={() => deleteOneSkill(s.id)} title="Olvidar este patrón"
                          style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.14s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'transparent' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </Section>
            <Section title="Tokens de API" desc="Crea tokens para usar la API de Daya desde tus propias aplicaciones o scripts. Cada token se muestra una sola vez al crearlo; guárdalo en un lugar seguro.">
              <ApiTokensManager />
            </Section>
            <Section title="Daya Code — el agente en tu terminal" desc="Exclusivo del plan Pro. Un agente de programación con modelos de frontera que corre en tu computadora, dentro de tu proyecto: lee, busca, edita y escribe archivos y ejecuta comandos reales. Entiende tu proyecto (estructura, git, package.json) desde el primer mensaje. Necesita un token de API (créalo arriba); cada tarea consume 1 mensaje de tu plan.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '14px 16px', borderRadius: 12, background: '#0b0a12', border: '1px solid var(--border-default)', fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: '0.8rem', lineHeight: 2, color: '#a8a3c4', overflowX: 'auto' }}>
                  <div><span style={{ color: '#34d399', fontWeight: 700 }}>$</span> curl -O {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/daya-code.mjs</div>
                  <div><span style={{ color: '#34d399', fontWeight: 700 }}>$</span> node daya-code.mjs login <span style={{ color: '#6e6e7a' }}># una sola vez: pega tu token y queda guardado</span></div>
                  <div><span style={{ color: '#34d399', fontWeight: 700 }}>$</span> node daya-code.mjs <span style={{ color: '#b9adff' }}>"crea un endpoint /health y pruébalo"</span></div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href="/daya-code.mjs" download
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, background: 'var(--text-primary)', color: 'var(--bg-base)', textDecoration: 'none', fontSize: '0.84rem', fontWeight: 600, boxShadow: 'none' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Descargar Daya Code
                  </a>
                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>Un solo archivo · sin dependencias · Node 18+ · pide confirmación y muestra el cambio antes de escribir o ejecutar</span>
                </div>
              </div>
            </Section>
            <Section title="Daya en tu editor — API compatible con OpenAI" desc="Tu cuenta de Daya funciona dentro de las herramientas que ya usas: OpenCode, Cline, Continue, Zed, Aider y cualquier otra que hable el dialecto de OpenAI. Solo necesitas la dirección de abajo y un token de API. Exclusivo del plan Pro; la cuota se descuenta según lo que cuesta cada llamada, no por llamada.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '14px 16px', borderRadius: 12, background: '#0b0a12', border: '1px solid var(--border-default)', fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: '0.8rem', lineHeight: 2, color: '#a8a3c4', overflowX: 'auto' }}>
                  <div><span style={{ color: '#6e6e7a' }}># Dirección base (Base URL)</span></div>
                  <div style={{ color: '#b9adff' }}>{API}/v1</div>
                  <div style={{ marginTop: 8 }}><span style={{ color: '#6e6e7a' }}># API key: tu token de arriba (dy_...)</span></div>
                  <div style={{ marginTop: 8 }}><span style={{ color: '#6e6e7a' }}># Para OpenCode, en un solo paso:</span></div>
                  <div><span style={{ color: '#34d399', fontWeight: 700 }}>$</span> node daya-code.mjs opencode</div>
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                  12 modelos de los cinco laboratorios chinos, elegibles desde tu editor: por lo que necesitas (<code>daya</code>, <code>daya-max</code>, <code>daya-fast</code>, <code>daya-code</code>, <code>daya-code-pro</code>, <code>daya-vision</code>, <code>daya-reasoning</code>, <code>daya-long</code>) o por marca (<code>daya-deepseek</code>, <code>daya-glm</code>, <code>daya-minimax</code>, <code>daya-qwen</code>). Un modelo caro consume más cuota que uno barato.
                  OpenCode es un proyecto independiente (MIT, opencode.ai); Daya solo actúa como proveedor de modelos.
                </span>
              </div>
            </Section>
          </>)}
          {/* USO E INSIGHTS */}
          {active === 'uso' && (
            <Section title="Uso e Insights" desc="Transparencia total sobre qué modelos de IA se han usado, cuántos tokens y el costo estimado en los últimos 30 días.">
              {usageLoading && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Cargando datos...</div>}
              {!usageLoading && usageData && (<>
                {/* Totales */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Llamadas', value: usageData.totals?.calls ?? 0 },
                    { label: 'Tokens entrada', value: (usageData.totals?.inputTokens ?? 0).toLocaleString() },
                    { label: 'Tokens salida', value: (usageData.totals?.outputTokens ?? 0).toLocaleString() },
                    { label: 'Costo estimado', value: `$${(usageData.totals?.costUsd ?? 0).toFixed(4)}` },
                  ].map(m => (
                    <div key={m.label} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{m.value}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 3, fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Por modelo */}
                {usageData.byModel && Object.keys(usageData.byModel).length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: 10 }}>POR MODELO</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries<any>(usageData.byModel).map(([model, data]) => (
                        <div key={model} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{model}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 1 }}>{data.calls} llamadas · {(data.inputTokens + data.outputTokens).toLocaleString()} tokens</div>
                          </div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>${(data.costUsd || 0).toFixed(4)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Últimos días */}
                {usageData.byDay && usageData.byDay.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: 10 }}>ACTIVIDAD (30 DÍAS)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[...usageData.byDay].reverse().slice(0, 14).map((d: any) => (
                        <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <span style={{ width: 72, flexShrink: 0, color: 'var(--text-tertiary)' }}>{d.date}</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, ((d.calls || 0) / Math.max(...usageData.byDay.map((x: any) => x.calls || 0), 1)) * 100)}%`, height: '100%', background: 'var(--accent-500)', borderRadius: 3 }} />
                          </div>
                          <span style={{ width: 24, textAlign: 'right', flexShrink: 0 }}>{d.calls}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {usageData.totals?.calls === 0 && (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Sin actividad en los últimos 30 días. Los datos se registran a partir de ahora.</div>
                )}
              </>)}
              {!usageLoading && !usageData && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No se pudieron cargar los datos.</div>}
            </Section>
          )}

          {active === 'soporte' && (
            <Section title="Soporte" desc="¿Algo no funciona o tienes una idea para mejorar Daya? Cuéntanoslo — llega directo al equipo de DAYA AI.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>¿Qué ha pasado?</label>
                  <textarea
                    value={supportText}
                    onChange={e => setSupportText(e.target.value)}
                    placeholder="Cuéntanos qué falló, qué esperabas que pasara o qué mejorarías. Lo revisamos con prioridad."
                    rows={6}
                    style={{ width: '100%', padding: '14px 16px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', minHeight: 120 }}
                  />
                </div>

                {supportSent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>¡Recibido!</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Tu mensaje ya está con el equipo de DAYA AI. Gracias por ayudarnos a mejorar Daya.</div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleSendSupport}
                    disabled={!supportText.trim() || supportSending}
                    style={{ ...primaryBtn, alignSelf: 'flex-start', opacity: (!supportText.trim() || supportSending) ? 0.5 : 1, cursor: (!supportText.trim() || supportSending) ? 'not-allowed' : 'pointer' }}>
                    {supportSending ? 'Enviando…' : 'Enviar'}
                  </button>
                )}

                <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    También puedes usar el <strong style={{ color: 'var(--text-primary)' }}>pulgar abajo</strong> de cualquier respuesta para avisarnos de un fallo puntual en esa conversación.
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* ACERCA DE Daya */}
          {active === 'acerca' && (
            <Section title="Acerca de Daya" desc="Versión, tecnología y el equipo detrás de la plataforma, desarrollada por DAYA AI.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Tarjeta principal de marca */}
                <div style={{ padding: '28px', borderRadius: 16, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                    <img src="/logo.png" alt="Daya" style={{ width: 44, height: 44, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
                    <div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Daya AI</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>por DAYA AI</div>
                    </div>
                  </div>
                  <div style={{ width: 48, height: 3, background: 'var(--text-primary)', borderRadius: 2, marginBottom: 18 }} />
                  <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                    Daya es una plataforma de inteligencia artificial desarrollada por DAYA AI, concebida para transformar la manera en que las personas y las organizaciones trabajan con información. Combina conversación natural, generación de documentos profesionales y análisis de archivos en una sola experiencia fluida, privada y diseñada con estándares de alta gama.
                  </p>
                </div>

                {/* Capacidades */}
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Capacidades principales</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { t: 'Conversación inteligente', d: 'Respuestas en tiempo real con comprensión profunda del contexto, adaptadas al tono y la extensión que prefieras.' },
                      { t: 'Generación de documentos', d: 'Creación de informes en PDF, documentos de Word, hojas de cálculo de Excel y presentaciones, con un diseño ejecutivo coherente.' },
                      { t: 'Análisis de archivos', d: 'Lectura y comprensión de PDF, Word, Excel y más, para extraer, resumir y reorganizar información en segundos.' },
                      { t: 'Transcripción de voz', d: 'Dictado por voz integrado directamente en la conversación, para trabajar sin escribir.' },
                    ].map(c => (
                      <div key={c.t} style={{ display: 'flex', gap: 13, padding: '14px 16px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                        <div style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--text-primary)', marginTop: 7, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{c.t}</div>
                          <div style={{ fontSize: '0.83rem', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{c.d}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compromiso */}
                <div style={{ padding: '20px 22px', borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderLeft: '3px solid var(--text-primary)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Nuestro compromiso</div>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                    En DAYA AI creemos que la tecnología debe ser una herramienta de elevación profesional. Daya está construida sobre una arquitectura propia, diseñada para ofrecer máxima calidad, velocidad y privacidad. Tu información es tuya, y cada conversación está pensada para ayudarte a lograr más, con la solidez y la confianza que distingue a DAYA AI.
                  </p>
                </div>

                {/* Footer de versión */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Daya AI · Versión 1.0</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>DAYA AI</span>
                </div>
              </div>
            </Section>
          )}

        </div>
        </div>
      </div>
      </div>
    </div>
  )
}

// Shared styles — calidad empresarial (Vercel/Stripe)
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  background: 'var(--bg-base)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
  fontFamily: 'var(--font-body)', transition: 'border-color 0.18s, box-shadow 0.18s',
  boxSizing: 'border-box',
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 22px', borderRadius: 999,
  background: 'var(--text-primary)', color: 'var(--bg-base)', border: '1px solid transparent', cursor: 'pointer',
  fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-body)',
  letterSpacing: '-0.01em', transition: 'opacity 0.18s, transform 0.1s',
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 999,
  background: 'transparent', border: '1px solid var(--border-default)',
  color: 'var(--text-secondary)', cursor: 'pointer',
  fontSize: '0.82rem', fontWeight: 500, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: '1px solid var(--border-default)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 400, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.01em' }}>{title}</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', lineHeight: 1.6, maxWidth: 560 }}>{desc}</p>
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '0.01em' }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 6 }}>{hint}</p>}
    </div>
  )
}

// SVG Icons — no emojis
function DayaIcon({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6.5V14.5L12 19L20 14.5V6.5L12 2Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 2V19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
}
function UserIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function PlanIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function SliderIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/></svg> }
function DatabaseIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> }
function SupportIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> }
function InfoIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> }
function ChartIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg> }
function PaletteIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg> }
function LogoutIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg> }
function ChevronLeftIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg> }
function CheckIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg> }
function EditIcon({ size = 10, color = 'currentColor' }: { size?: number; color?: string }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
