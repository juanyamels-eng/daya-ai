import { NextRequest, NextResponse } from 'next/server'

const SUPPORTED = ['es', 'en', 'pt', 'fr', 'de', 'it']
const DEFAULT_LOCALE = 'es'
const COOKIE = 'daya-locale'

function detectLocale(req: NextRequest): string {
  // 1. Preferencia guardada en cookie
  const saved = req.cookies.get(COOKIE)?.value
  if (saved && SUPPORTED.includes(saved)) return saved

  // 2. Cabecera Accept-Language del navegador
  const accept = req.headers.get('accept-language') ?? ''
  for (const seg of accept.split(',')) {
    const tag = seg.split(';')[0].trim().toLowerCase().slice(0, 2)
    if (SUPPORTED.includes(tag)) return tag
  }

  return DEFAULT_LOCALE
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Solo escribir la cookie si no existe (la primera visita)
  if (!req.cookies.has(COOKIE)) {
    res.cookies.set(COOKIE, detectLocale(req), {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }

  return res
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
}
