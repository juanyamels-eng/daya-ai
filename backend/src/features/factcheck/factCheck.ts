// ============================================
// DAYA IA — Fact-check (verificación de afirmaciones)
// --------------------------------------------------------------------------
// Capacidad NUEVA: toma una respuesta (de DAYA o un texto cualquiera) y verifica
// sus AFIRMACIONES contrastándolas con búsqueda web. Marca cada una como
// respaldada / refutada / no concluyente, con las fuentes. Casi ninguna IA de
// consumo ofrece esto nativo, y es enorme para la confianza (anti-alucinación).
//
// Flujo:
//   1) Extrae las afirmaciones VERIFICABLES del texto (hechos concretos, no
//      opiniones ni generalidades).
//   2) Para cada una, busca evidencia en la web (usa searchrank).
//   3) Un LLM juzga si la evidencia la APOYA, la CONTRADICE o es insuficiente.
//   4) Devuelve un veredicto por afirmación + un puntaje global de fiabilidad.
//
// Se apoya en features/searchrank. Código propio en TypeScript.
// ============================================

import { chatJSON } from '../../services/openrouter'
import { searchAndRank } from '../searchrank/ranking'

export type Verdict = 'respaldada' | 'refutada' | 'no_concluyente' | 'sin_verificar'

export interface ClaimResult {
  claim: string
  verdict: Verdict
  confidence: number          // 0..1
  explanation: string
  sources: { title: string; url: string }[]
}

export interface FactCheckResult {
  claims: ClaimResult[]
  reliabilityScore: number    // 0..100 (proporción de afirmaciones respaldadas)
  summary: string
  checkedCount: number
}

// ── 1) Extraer afirmaciones verificables ─────────────────────────────────────

const EXTRACT_SYS = `Extraes AFIRMACIONES VERIFICABLES de un texto: hechos concretos y comprobables (fechas, cifras, eventos, relaciones causa-efecto, atribuciones). IGNORA opiniones, juicios de valor, generalidades vagas y afirmaciones triviales. Respondes SOLO en JSON.`

async function extractClaims(text: string, max = 6): Promise<string[]> {
  try {
    const parsed = await chatJSON(
      `Extrae hasta ${max} afirmaciones verificables de este texto:\n"""${text.slice(0, 6000)}"""\n\n` +
      `Responde SOLO con JSON: { "claims": ["afirmación concreta y autocontenida", ...] }\n` +
      `Cada afirmación debe entenderse sola (sin pronombres ambiguos). Si no hay afirmaciones verificables, devuelve lista vacía.`,
      EXTRACT_SYS
    )
    const claims = Array.isArray(parsed?.claims) ? parsed.claims : []
    return claims.filter((c: any) => typeof c === 'string' && c.trim().length > 10).slice(0, max)
  } catch {
    return []
  }
}

// ── 2-3) Verificar una afirmación contra la web ──────────────────────────────

const JUDGE_SYS = `Eres un verificador de hechos riguroso e imparcial. Dada una AFIRMACIÓN y EVIDENCIA de búsqueda web, juzgas si la evidencia la APOYA, la CONTRADICE o es insuficiente. Te basas SOLO en la evidencia dada, no en tu conocimiento previo. Si la evidencia no es clara, dices "no_concluyente". Respondes SOLO en JSON.`

async function verifyClaim(claim: string): Promise<ClaimResult> {
  // Busca evidencia con el ranking de DAYA.
  let evidence: { title: string; url: string; content: string }[] = []
  try {
    const results = await searchAndRank(claim, 4)
    evidence = results.map(r => ({ title: r.title, url: r.url, content: (r.content || '').slice(0, 600) }))
  } catch {
    evidence = []
  }

  if (!evidence.length) {
    return { claim, verdict: 'sin_verificar', confidence: 0, explanation: 'No se encontró evidencia web.', sources: [] }
  }

  try {
    const evidenceText = evidence.map((e, i) => `[${i + 1}] ${e.title}\n${e.content}\n${e.url}`).join('\n\n')
    const parsed = await chatJSON(
      `AFIRMACIÓN: "${claim}"\n\nEVIDENCIA (resultados de búsqueda):\n${evidenceText}\n\n` +
      `¿La evidencia apoya, contradice o no resuelve la afirmación? Responde SOLO con JSON:\n` +
      `{ "verdict": "respaldada|refutada|no_concluyente", "confidence": 0..1, "explanation": "breve, citando [N] si aplica" }`,
      JUDGE_SYS
    )
    const verdict: Verdict = ['respaldada', 'refutada', 'no_concluyente'].includes(parsed?.verdict) ? parsed.verdict : 'no_concluyente'
    return {
      claim, verdict,
      confidence: typeof parsed?.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      explanation: String(parsed?.explanation || '').slice(0, 400),
      sources: evidence.slice(0, 3).map(e => ({ title: e.title, url: e.url })),
    }
  } catch {
    return { claim, verdict: 'no_concluyente', confidence: 0, explanation: 'No se pudo evaluar la evidencia.', sources: evidence.slice(0, 3).map(e => ({ title: e.title, url: e.url })) }
  }
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Verifica las afirmaciones de un texto. `maxClaims` acota cuántas comprobar
 * (cada una hace una búsqueda + un juicio, así que tiene costo).
 */
export async function factCheck(text: string, maxClaims = 5): Promise<FactCheckResult> {
  if (!text || text.trim().length < 20) {
    return { claims: [], reliabilityScore: 0, summary: 'Texto demasiado corto para verificar.', checkedCount: 0 }
  }

  const claims = await extractClaims(text, maxClaims)
  if (!claims.length) {
    return { claims: [], reliabilityScore: 0, summary: 'No se encontraron afirmaciones verificables (puede ser opinión o contenido general).', checkedCount: 0 }
  }

  // Verifica en paralelo (con tope para no saturar).
  const results = await Promise.all(claims.map(c => verifyClaim(c)))

  const verifiable = results.filter(r => r.verdict !== 'sin_verificar')
  const supported = results.filter(r => r.verdict === 'respaldada').length
  const refuted = results.filter(r => r.verdict === 'refutada').length
  const reliabilityScore = verifiable.length ? Math.round((supported / verifiable.length) * 100) : 0

  let summary: string
  if (refuted > 0) summary = `⚠️ ${refuted} afirmación(es) parecen contradecirse con las fuentes. Revisa con cuidado.`
  else if (reliabilityScore >= 80) summary = `La mayoría de las afirmaciones verificables están respaldadas por fuentes.`
  else if (reliabilityScore === 0 && verifiable.length === 0) summary = `No se pudo verificar ninguna afirmación con la web.`
  else summary = `Verificación mixta: algunas afirmaciones no tienen respaldo claro.`

  return { claims: results, reliabilityScore, summary, checkedCount: results.length }
}
