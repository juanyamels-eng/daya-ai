// ============================================
// DAYA IA — Environment variable validation
// Clearly warns if something critical is missing at startup
// ============================================

interface EnvCheck {
  key: string
  critical: boolean   // si es true y falta, el server no debe arrancar
  hint: string
}

const CHECKS: EnvCheck[] = [
  { key: 'DATABASE_URL', critical: true, hint: 'PostgreSQL URL (Supabase)' },
  { key: 'JWT_SECRET', critical: true, hint: 'Secret for signing sessions' },
  { key: 'OPENROUTER_API_KEY', critical: false, hint: 'Without this, chat and documents will not work' },
  { key: 'RESEND_API_KEY', critical: false, hint: 'Without this, emails will not be sent (dev mode)' },
  { key: 'PAYPAL_CLIENT_ID', critical: false, hint: 'Without this, PayPal payments will not work' },
  { key: 'PAYPAL_SECRET', critical: false, hint: 'Without this, PayPal payments will not work' },
]

export function validateEnv(): void {
  const missingCritical: string[] = []
  const missingOptional: string[] = []

  for (const check of CHECKS) {
    const value = process.env[check.key]
    const isEmpty = !value || value.trim() === '' || value.includes('PON-TU')

    if (isEmpty) {
      if (check.critical) missingCritical.push(`  ❌ ${check.key} — ${check.hint}`)
      else missingOptional.push(`  ⚠️  ${check.key} — ${check.hint}`)
    }
  }

  if (missingOptional.length > 0) {
    console.warn('\n⚠️  Variables opcionales sin configurar:')
    missingOptional.forEach(m => console.warn(m))
    console.warn('   (El servidor arranca, pero esas funciones estarán desactivadas)\n')
  }

  if (missingCritical.length > 0) {
    console.error('\n🛑 Faltan variables CRÍTICAS — el servidor no puede arrancar:')
    missingCritical.forEach(m => console.error(m))
    console.error('   Configúralas en backend/.env y vuelve a intentar.\n')
    process.exit(1)
  }
}
