'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export default function ContactPage() {
  const t = useTranslations('contact')
  const c = useTranslations('common')
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', message: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const subject = encodeURIComponent(`Contacto Daya AI — ${form.name}`)
    const body = encodeURIComponent(`Nombre: ${form.name}\nEmail: ${form.email}\n\n${form.message}`)
    // Buzón de destino. Era hola@daya-ai.com y NO recibía nada: el dominio no
    // tiene registros MX, así que cada mensaje de este formulario rebotaba sin
    // que nadie se enterara. El día que daya-ai.com acepte correo, esto vuelve a
    // una dirección de marca — pero no antes de comprobar el DNS.
    window.location.href = `mailto:support@daya-ai.com?subject=${subject}&body=${body}`
    setSent(true)
  }

  const field: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1px solid var(--border-default)', background: 'var(--bg-base)',
    fontSize: '0.9rem', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'var(--font-body)' }}>
      <nav style={{ borderBottom: '1px solid var(--border-default)', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <img src="/logo.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Daya</span>
        </Link>
        <Link href="/auth/register" style={{ fontSize: '0.82rem', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}>{c('createAccount')}</Link>
      </nav>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '72px 24px 96px' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>{t('tag')}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.12, marginBottom: 12 }}>
          {t('title')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: 40 }}>
          {t('subtitle')}
        </p>
        {sent ? (
          <div style={{ padding: '24px 28px', borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', textAlign: 'center' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>✓</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {t('sentText')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="contact-name" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('nameLabel')}</label>
              <input
                id="contact-name"
                type="text"
                required
                placeholder={t('namePh')}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={field}
              />
            </div>
            <div>
              <label htmlFor="contact-email" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('emailLabel')}</label>
              {/* El ejemplo del campo es el correo DE QUIEN ESCRIBE, así que
                  tiene que parecer suyo. Ponía hola@daya-ai.com, la dirección de
                  la casa, e invitaba a copiarla. */}
              <input
                id="contact-email"
                type="email"
                required
                placeholder="tu@email.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                style={field}
              />
            </div>
            <div>
              <label htmlFor="contact-message" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('messageLabel')}</label>
              <textarea
                id="contact-message"
                required
                rows={5}
                placeholder={t('messagePh')}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                style={{ ...field, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>
            <button
              type="submit"
              style={{ padding: '13px 26px', borderRadius: 999, background: 'var(--text-primary)', color: 'var(--bg-base)', fontSize: '0.9rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'filter 0.15s' }}
            >
              {t('submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
