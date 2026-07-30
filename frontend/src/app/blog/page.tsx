import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function BlogPage() {
  const t = await getTranslations('blog')
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
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '72px 24px 96px', textAlign: 'center' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>{t('tag')}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.12, marginBottom: 20 }}>
          {t('title')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.75, maxWidth: 420, margin: '0 auto 40px' }}>
          {t('subtitle')}
        </p>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border-default)', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.15s' }}>
          {c('backHome')}
        </Link>
      </div>
    </div>
  )
}
