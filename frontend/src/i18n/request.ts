import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

const SUPPORTED = ['es', 'en', 'pt', 'fr', 'de', 'it']

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get('daya-locale')?.value ?? 'es'
  const locale = SUPPORTED.includes(raw) ? raw : 'es'

  const messages = (await import(`../../messages/${locale}.json`)).default

  return { locale, messages }
})
