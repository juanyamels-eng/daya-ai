import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function AboutPage() {
  const t = await getTranslations('about')
  const c = await getTranslations('common')

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
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>{t('tag')}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.12, marginBottom: 32 }}>
          {t('title')}
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.8 }}>
          <p>{t('p1')}</p>
          <p>{t('p2')}</p>
          <p>{t('p3')}</p>
          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 32, marginTop: 8 }}>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
              {t('contactPrompt')}{' '}
              <Link href="/contact" style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>{t('contactLink')}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
