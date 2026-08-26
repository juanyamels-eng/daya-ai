import { Request, Response } from 'express'
import { searchAndRank } from '../../features/searchrank/ranking'

export interface WebSearchResult {
  triggered: boolean
  succeeded: boolean
  sources: { title: string; url: string }[]
  context: string
  quotaExhausted: boolean
}

export function needsWebSearch(message: string): boolean {
  const m = message.toLowerCase().trim()
  if (/^(escribe|crea|genera|redacta|arma|hazme|ayúdame a|resume|explica|define|calcula|resuelve|traduce|escríbeme)/i.test(message.trim())) return false
  if (/\b(código|programa|función|script|algoritmo|pseudocódigo)\b/i.test(m)) return false
  if (/\b(qué es|qué son|cómo funciona|cómo se hace|para qué sirve|en qué consiste)\b/i.test(m)) return false
  if (/\b(precio|cotización|dólar|euro|tipo de cambio|bolsa|acciones?)\b/i.test(m)) return true
  if (/\b(noticias?|últimas? (noticias?|hora|día|semana)|qué (pasó|ocurrió|hay de nuevo))\b/i.test(m)) return true
  if (/\b(ganó|perdió|murió|fue elegido|fue nombrado|lanzó|anunció|estrena)\b/i.test(m)) return true
  if (/\b(hoy|ayer|esta semana|este (mes|año)|2025|2026|recientemente|actualmente|ahora mismo|últimamente)\b/i.test(m) && message.trim().split(/\s+/).length > 4) return true
  if (/\b(estreno|lanzamiento|debut|nuevo álbum|nueva película|nueva serie|nuevo modelo)\b/i.test(m)) return true
  if (/\b(quién (es|fue|ganó)|cuándo (es|fue|sale)|dónde (es|fue|ocurrió))\b/i.test(m) && /\b(2025|2026|actual|nuevo|hoy)\b/i.test(m)) return true
  return false
}

export function buildWebContext(results: { title: string; url: string; content: string }[]): string {
  if (!results.length) return ''
  const lines = results.slice(0, 5).map((r, i) => {
    const domain = (() => { try { return new URL(r.url).hostname.replace('www.', '') } catch { return r.url } })()
    const snippet = (r.content || '').trim().slice(0, 220)
    return `${i + 1}. **${r.title}** (${domain})\n   ${snippet}`
  })
  return `\n\n---\nCONTEXTO WEB — Busqué información actualizada sobre esta pregunta. Úsala como referencia y cita las fuentes cuando sea relevante:\n\n${lines.join('\n\n')}\n---`
}

export async function executeWebSearch(
  message: string,
  webMode: boolean,
  systemPrompt: string,
  userId: string,
  res: Response,
  clientGoneRef: { current: boolean }
): Promise<WebSearchResult> {
  const webSearchTriggered = !webMode && needsWebSearch(message)
  const forced = webMode === true
  const shouldSearch = forced || webSearchTriggered

  let webSearchSucceeded = false
  let webSources: { title: string; url: string }[] = []
  let searchQuotaExhausted = false
  let finalSystemPrompt = systemPrompt

  if (shouldSearch) {
    const { consumeQuota } = await import('../../services/quota')
    const q = await consumeQuota(userId, 'search')
    if (!q.ok) {
      searchQuotaExhausted = true
      finalSystemPrompt += '\n\n[NOTA INTERNA: El usuario alcanzó su límite de búsquedas web del período de su plan. Responde con tu conocimiento e indícale brevemente que agotó sus búsquedas y que puede mejorar su plan para tener más.]'
      return { triggered: true, succeeded: false, sources: [], context: '', quotaExhausted: true }
    }

    try {
      const results = await Promise.race([
        searchAndRank(message, forced ? 6 : 5),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
      ]).catch(() => [])

      const webCtx = buildWebContext(results)
      if (webCtx) {
        finalSystemPrompt += webCtx
        webSearchSucceeded = true
        webSources = results
          .filter(r => r?.url && r?.title)
          .slice(0, 6)
          .map(r => ({ title: String(r.title), url: String(r.url) }))
      }
    } catch { /* búsqueda fallida */ }

    if (!webSearchSucceeded) {
      finalSystemPrompt += '\n\n[NOTA INTERNA: El usuario preguntó algo que requería información actualizada pero la búsqueda web no estuvo disponible. Avísale brevemente que tu respuesta se basa en tu conocimiento hasta tu fecha de corte y sugiere que use el Agente para búsquedas en tiempo real.]'
      const { refundQuota } = await import('../../services/quota')
      await refundQuota(userId, 'search')
    }
  } else if (searchQuotaExhausted) {
    finalSystemPrompt += '\n\n[NOTA INTERNA: El usuario alcanzó su límite de búsquedas web del período de su plan. Responde con tu conocimiento e indícale brevemente que agotó sus búsquedas y que puede mejorar su plan para tener más.]'
  }

  return {
    triggered: shouldSearch,
    succeeded: webSearchSucceeded,
    sources: webSources,
    context: finalSystemPrompt,
    quotaExhausted: searchQuotaExhausted
  }
}

export function formatSourcesBlock(sources: { title: string; url: string }[]): string {
  if (!sources.length) return ''
  const seen = new Set<string>()
  const items = sources.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true })
  if (!items.length) return ''
  return `\n\n---\n**Fuentes consultadas:**\n` + items.map(s => `- [${s.title}](${s.url})`).join('\n')
}