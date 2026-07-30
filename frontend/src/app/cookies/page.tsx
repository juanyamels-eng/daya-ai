import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function CookiesPage() {
  const t = await getTranslations('cookies')
  const c = await getTranslations('common')

  const sections = [
    { title: t('s0Title'), content: t('s0Content') },
    { title: t('s1Title'), content: t('s1Content') },
    { title: t('s2Title'), content: t('s2Content') },
    { title: t('s3Title'), content: t('s3Content') },
    { title: t('s4Title'), content: t('s4Content') },
    { title: t('s5Title'), content: t('s5Content') },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'var(--font-body)' }}>
      <nav style={{ borderBottom: '1px solid var(--border-default)', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <img src="/logo.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Daya</span>
        </Link>
        <Link href="/auth/register" style={{ fontSize: '0.82rem', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}>{c('createAccount')}</Link>
      </nav>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '72px 24px 96px' }}>
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>{t('tag')}</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.12, marginBottom: 12 }}>
            {t('title')}
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{t('date')}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {sections.map((s, i) => (
            <div key={i} style={{ paddingBottom: 32, marginBottom: 32, borderBottom: i < sections.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.85, fontSize: '0.875rem', margin: 0 }}>{s.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
