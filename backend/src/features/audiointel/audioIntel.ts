// ============================================
// DAYA IA — Audio Intelligence
// --------------------------------------------------------------------------
// Tu services/transcription.ts ya convierte audio → texto (Groq/OpenAI Whisper).
// Lo que falta es lo que hace ÚTIL esa transcripción: convertir el "muro de
// texto" en INTELIGENCIA estructurada.
//
// Este módulo NO transcribe (no reimplementa whisper.cpp, que es C++ de bajo
// nivel). Toma la transcripción y produce, con IA:
//   • resumen ejecutivo
//   • capítulos / secciones con marca de tiempo aproximada
//   • puntos de acción (tareas) con responsable si se menciona
//   • decisiones tomadas
//   • preguntas que quedaron abiertas
//   • hablantes detectados (si el texto trae pistas)
//
// La inspiración es la filosofía de whisper.cpp (procesar voz de forma útil y
// privada); aquí aportamos la capa de comprensión que tu pipeline no tenía.
// Inspiración: whisper.cpp (MIT); código propio en TypeScript.
//
// Bonus: si conectas un servidor whisper.cpp propio (autoalojado, privado), este
// módulo lo soporta como proveedor opcional vía WHISPER_CPP_URL (ver más abajo),
// con fallback automático a tu transcripción actual.
// ============================================

import { chatJSON } from '../../services/openrouter'

// ── Tipos de salida ──────────────────────────────────────────────────────────

export interface Chapter {
  title: string
  startApprox?: string   // "00:03:20" si se puede inferir; si no, índice relativo
  summary: string
}

export interface ActionItem {
  task: string
  owner?: string         // responsable si se menciona
  due?: string           // fecha/plazo si se menciona
}

export interface AudioInsight {
  summary: string
  chapters: Chapter[]
  actionItems: ActionItem[]
  decisions: string[]
  openQuestions: string[]
  speakers: string[]
  wordCount: number
}

// ── Análisis principal ───────────────────────────────────────────────────────

const ANALYZER_SYS = `Eres un analista de reuniones y notas de voz. A partir de una transcripción, extraes inteligencia estructurada y ÚTIL. Eres fiel al contenido: no inventas datos, responsables ni fechas que no aparezcan. Respondes SOLO en JSON válido.`

/**
 * Analiza una transcripción y devuelve inteligencia estructurada.
 * `hints` opcional ayuda al modelo (p. ej. tipo de audio, idioma esperado).
 */
export async function analyzeTranscript(
  transcript: string,
  hints: { kind?: 'reunión' | 'nota' | 'entrevista' | 'clase' | 'otro'; language?: string } = {}
): Promise<AudioInsight> {
  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0

  // Para transcripciones muy cortas, no merece un análisis pesado.
  if (wordCount < 25) {
    return {
      summary: transcript.trim(),
      chapters: [], actionItems: [], decisions: [], openQuestions: [], speakers: [],
      wordCount,
    }
  }

  const kind = hints.kind || 'otro'
  try {
    const parsed = await chatJSON(
      `Analiza esta transcripción (tipo: ${kind}).\n\n` +
      `Transcripción:\n"""${transcript.slice(0, 12000)}"""\n\n` +
      `Extrae y responde SOLO con este JSON:\n` +
      `{\n` +
      `  "summary": "resumen ejecutivo de 3-5 frases",\n` +
      `  "chapters": [ { "title": "tema", "startApprox": "marca de tiempo si se infiere, o ''", "summary": "1-2 frases" } ],\n` +
      `  "actionItems": [ { "task": "acción concreta", "owner": "responsable o ''", "due": "plazo o ''" } ],\n` +
      `  "decisions": ["decisiones tomadas"],\n` +
      `  "openQuestions": ["preguntas sin resolver"],\n` +
      `  "speakers": ["nombres o roles de hablantes detectados"]\n` +
      `}\n` +
      `Si una sección no aplica, devuélvela como lista vacía. No inventes.`,
      ANALYZER_SYS,
      undefined,
      6000
    )

    return {
      summary: String(parsed?.summary || '').trim(),
      chapters: normalizeChapters(parsed?.chapters),
      actionItems: normalizeActions(parsed?.actionItems),
      decisions: toStringArray(parsed?.decisions),
      openQuestions: toStringArray(parsed?.openQuestions),
      speakers: toStringArray(parsed?.speakers),
      wordCount,
    }
  } catch {
    // Degradación: al menos devolvemos el conteo y un resumen vacío en vez de romper.
    return { summary: '', chapters: [], actionItems: [], decisions: [], openQuestions: [], speakers: [], wordCount }
  }
}

// ── Normalizadores defensivos (la IA a veces devuelve formas raras) ──────────

function toStringArray(v: any): string[] {
  if (!Array.isArray(v)) return []
  return v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 30)
}

function normalizeChapters(v: any): Chapter[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(c => c && typeof c.title === 'string')
    .map(c => ({
      title: String(c.title).slice(0, 120),
      startApprox: c.startApprox ? String(c.startApprox).slice(0, 12) : undefined,
      summary: String(c.summary || '').slice(0, 400),
    }))
    .slice(0, 20)
}

function normalizeActions(v: any): ActionItem[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(a => a && typeof a.task === 'string' && a.task.trim())
    .map(a => ({
      task: String(a.task).slice(0, 240),
      owner: a.owner ? String(a.owner).slice(0, 80) : undefined,
      due: a.due ? String(a.due).slice(0, 80) : undefined,
    }))
    .slice(0, 30)
}

// ── Transcripción + análisis en un solo paso ─────────────────────────────────

export interface TranscribeAndAnalyzeResult {
  success: boolean
  error?: string
  transcript?: string
  insight?: AudioInsight
  provider?: string
}

/**
 * Pipeline completo: transcribe el audio (con tu servicio existente o con un
 * servidor whisper.cpp autoalojado si está configurado) y luego lo analiza.
 */
export async function transcribeAndAnalyze(
  audioBuffer: Buffer,
  fileName = 'audio.webm',
  hints: { kind?: 'reunión' | 'nota' | 'entrevista' | 'clase' | 'otro' } = {}
): Promise<TranscribeAndAnalyzeResult> {
  // 1) Transcripción. Preferimos whisper.cpp autoalojado si está configurado
  //    (privacidad/costo); si no, caemos a tu servicio actual.
  let transcript = ''
  let provider = ''

  const selfHosted = await tryWhisperCpp(audioBuffer, fileName).catch(() => null)
  if (selfHosted) {
    transcript = selfHosted
    provider = 'whisper.cpp (autoalojado)'
  } else {
    try {
      const { transcribeAudio } = await import('../../services/transcription')
      const r = await transcribeAudio(audioBuffer, fileName)
      if (!r.success || !r.text) return { success: false, error: r.error || 'No se pudo transcribir.' }
      transcript = r.text
      provider = 'API (Groq/OpenAI)'
    } catch (e: any) {
      return { success: false, error: 'Transcripción no disponible: ' + (e?.message || '') }
    }
  }

  // 2) Análisis
  const insight = await analyzeTranscript(transcript, hints)
  return { success: true, transcript, insight, provider }
}

/**
 * Soporte OPCIONAL para un servidor whisper.cpp autoalojado.
 * whisper.cpp trae un binario `server` con endpoint /inference compatible.
 * Defínelo con WHISPER_CPP_URL (p. ej. http://localhost:8080/inference).
 * Si no está, devuelve null y se usa el proveedor por defecto.
 */
async function tryWhisperCpp(audioBuffer: Buffer, fileName: string): Promise<string | null> {
  const url = process.env.WHISPER_CPP_URL
  if (!url) return null
  try {
    const form = new FormData()
    // El servidor de whisper.cpp espera el campo "file" y "response_format".
    const blob = new Blob([new Uint8Array(audioBuffer)])
    form.append('file', blob, fileName)
    form.append('response_format', 'json')
    const res = await fetch(url, { method: 'POST', body: form as any })
    if (!res.ok) return null
    const data: any = await res.json()
    // El servidor devuelve { text: "..." } (o segmentos).
    return typeof data?.text === 'string' ? data.text : null
  } catch {
    return null
  }
}

// ── Exportar el análisis a formatos útiles ───────────────────────────────────

/** Convierte la inteligencia en un markdown limpio (acta de reunión). */
export function insightToMarkdown(insight: AudioInsight, title = 'Resumen de audio'): string {
  const lines: string[] = [`# ${title}`, '']
  if (insight.summary) lines.push('## Resumen', insight.summary, '')
  if (insight.speakers.length) lines.push('## Participantes', insight.speakers.map(s => `- ${s}`).join('\n'), '')
  if (insight.chapters.length) {
    lines.push('## Temas')
    for (const c of insight.chapters) {
      lines.push(`### ${c.startApprox ? `[${c.startApprox}] ` : ''}${c.title}`, c.summary, '')
    }
  }
  if (insight.decisions.length) lines.push('## Decisiones', insight.decisions.map(d => `- ${d}`).join('\n'), '')
  if (insight.actionItems.length) {
    lines.push('## Acciones')
    for (const a of insight.actionItems) {
      lines.push(`- [ ] ${a.task}${a.owner ? ` — *${a.owner}*` : ''}${a.due ? ` (${a.due})` : ''}`)
    }
    lines.push('')
  }
  if (insight.openQuestions.length) lines.push('## Preguntas abiertas', insight.openQuestions.map(q => `- ${q}`).join('\n'), '')
  return lines.join('\n')
}
