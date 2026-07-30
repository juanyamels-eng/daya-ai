// ============================================
// DAYA IA — Consolidación de memoria + extracción de "skills"
// --------------------------------------------------------------------------
// Capacidad NUEVA que COMPLEMENTA (no reemplaza) services/memory.ts.
//
// services/memory.ts ya: extrae hechos por intercambio, los guarda con embedding,
// evita duplicados exactos y recupera memoria híbrida. Este módulo añade dos
// cosas que le faltaban:
//
//   1) AUDITORÍA / CONSOLIDACIÓN: revisa TODOS los recuerdos de un usuario y
//      fusiona los que dicen casi lo mismo, corrige contradicciones y elimina
//      redundancias. Pensado para correr de vez en cuando (p. ej. desde el
//      scheduler), no en cada mensaje.
//
//   2) SKILLS: detecta PATRONES de uso repetidos del usuario ("siempre pide
//      resúmenes en viñetas", "trabaja en marketing para pymes") y los guarda
//      como tarjetas de "skill" reutilizables, que luego pueden inyectarse al
//      prompt del sistema para personalizar mejor las respuestas.
//
// La idea de "memoria que se autoaudita" y de "skills aprendidas" está
// sistemas de memoria de agentes de código
// abierto. Implementación propia, en TypeScript, sobre Prisma + OpenRouter.
//
// IMPORTANTE sobre el esquema:
//   - La auditoría usa el modelo Memory que YA existe → cero migraciones.
//   - Las skills se guardan en DayaSystemConfig (modelo existente) con clave
//     `skills:<userId>` como JSON. Así NO hace falta tocar schema.prisma para
//     empezar. (Más abajo dejo, comentado, el modelo Prisma opcional por si
//     prefieres una tabla dedicada en el futuro.)
// ============================================

import { prisma } from '../../lib/prisma'
import { chatJSON } from '../../services/openrouter'
import { embedText, cosineSimilarity } from '../../services/embeddings'
import { jaccard } from '../../utils/nlp'
import { loadConfig, saveConfig } from '../../services/configStore'

const db = prisma as any

// ── Utilidades de texto ─────────────────────────────────────────────────────



// ════════════════════════════════════════════════════════════════════════════
// 1) CONSOLIDACIÓN / AUDITORÍA DE MEMORIA
// ════════════════════════════════════════════════════════════════════════════

const AUDIT_SYS = `Eres el AUDITOR DE MEMORIA de un asistente. Recibes una lista de recuerdos sobre un usuario y devuelves una versión LIMPIA:
- Fusiona los que dicen lo mismo en uno solo, más completo.
- Si dos se contradicen, conserva el más reciente (van ordenados de más nuevo a más viejo).
- Elimina los triviales o vacíos.
- Mantén cada recuerdo corto, en tercera persona, concreto.
- NUNCA inventes datos nuevos: sólo reorganiza lo que ya está.
Respondes SOLO en JSON.`

export interface AuditResult {
  before: number
  after: number
  merged: number
}

/**
 * Audita y consolida la memoria de un usuario. Pensado para correr
 * ocasionalmente (no en cada mensaje). Es seguro: si algo falla, no borra nada.
 */
export async function auditMemories(userId: string): Promise<AuditResult> {
  const memories: { id: string; content: string; category: string }[] =
    await db.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, content: true, category: true },
    })

  const before = memories.length
  if (before < 4) return { before, after: before, merged: 0 } // poco que consolidar

  // Pre-filtro local barato: agrupa casi-duplicados por Jaccard alto para
  // ahorrarle trabajo al LLM (y para tener un fallback si el LLM falla).
  const list = memories.map((m, i) => `${i + 1}. [${m.category}] ${m.content}`).join('\n')

  let consolidated: { content: string; category: string }[] | null = null
  try {
    const parsed = await chatJSON(
      `Recuerdos actuales (de más nuevo a más viejo):\n${list}\n\nDevuelve la versión consolidada. Responde SOLO con JSON:\n{ "memories": [ { "content": "...", "category": "trabajo|personal|preferencias|proyectos|intereses|metas|general" } ] }`,
      AUDIT_SYS
    )
    if (Array.isArray(parsed?.memories)) {
      consolidated = parsed.memories
        .filter((m: any) => m && typeof m.content === 'string' && m.content.trim().length >= 4)
        .map((m: any) => ({ content: String(m.content).trim().slice(0, 280), category: String(m.category || 'general') }))
        .slice(0, 40)
    }
  } catch {
    consolidated = null
  }

  // Fallback local si el LLM no respondió: dedup por Jaccard >= 0.7.
  if (!consolidated) {
    const kept: { content: string; category: string }[] = []
    for (const m of memories) {
      if (!kept.some(k => jaccard(k.content, m.content) >= 0.7)) {
        kept.push({ content: m.content, category: m.category })
      }
    }
    consolidated = kept
  }

  // Si no reduce nada, no tocamos la base (evita reescrituras inútiles).
  if (consolidated.length >= before) return { before, after: before, merged: 0 }

  // Reemplazo transaccional: borra los viejos, inserta los consolidados con embedding.
  await db.$transaction(async (tx: any) => {
    await tx.memory.deleteMany({ where: { userId } })
    for (const m of consolidated!) {
      const embedding = await embedText(m.content).catch(() => [] as number[])
      await tx.memory.create({ data: { userId, content: m.content, category: m.category, embedding } })
    }
  })

  return { before, after: consolidated.length, merged: before - consolidated.length }
}

// ════════════════════════════════════════════════════════════════════════════
// 2) SKILLS (patrones de uso aprendidos)
// ════════════════════════════════════════════════════════════════════════════
//
// Una "skill" es una preferencia o patrón ESTABLE de cómo el usuario trabaja,
// más rico que un simple hecho de memoria. Ej.:
//   { name: "Resúmenes en viñetas", trigger: "cuando pide resúmenes",
//     guidance: "Responder en viñetas cortas, máx 5 puntos." }
// Se guardan como JSON en DayaSystemConfig (modelo existente).

export interface Skill {
  id: string
  name: string
  trigger: string      // cuándo aplica
  guidance: string     // qué debe hacer DAYA
  uses: number         // cuántas veces se ha reforzado
  enabled?: boolean    // si el usuario la desactivó en Ajustes, no se inyecta (por defecto activa)
  createdAt: number
  updatedAt: number
}

function skillsKey(userId: string): string {
  return `skills:${userId}`
}

const loadSkills = (userId: string): Promise<Skill[]> => loadConfig<Skill>(skillsKey(userId))
const saveSkills = (userId: string, skills: Skill[]) => saveConfig(skillsKey(userId), skills.slice(0, 30))

const SKILL_SYS = `Detectas PATRONES DE TRABAJO estables de un usuario a partir de un intercambio. Una skill es una preferencia reutilizable sobre CÓMO quiere que el asistente le responda o sobre su contexto recurrente. Sé MUY selectivo: la mayoría de intercambios NO contienen una skill nueva.
Ejemplos válidos: "prefiere respuestas en viñetas", "escribe código en TypeScript", "trabaja en marketing para pymes", "quiere explicaciones sin tecnicismos".
NO valen: peticiones puntuales, estados de ánimo, datos de una sola vez.
Respondes SOLO en JSON.`

/**
 * Analiza un intercambio y, si detecta un patrón estable, lo guarda o refuerza.
 * Pensado para llamarse junto a extractMemories (o desde el scheduler).
 * No bloquea: si falla, no pasa nada.
 */
export async function learnSkillFromExchange(
  userId: string,
  userMessage: string,
  aiResponse: string
): Promise<Skill | null> {
  try {
    const parsed = await chatJSON(
      `Usuario dijo: "${userMessage.slice(0, 1500)}"\nAsistente respondió: "${aiResponse.slice(0, 800)}"\n\n¿Hay un patrón de trabajo ESTABLE que valga la pena recordar? Si no, devuelve null.\nResponde SOLO con JSON:\n{ "skill": null }  // o  { "skill": { "name": "...", "trigger": "...", "guidance": "..." } }`,
      SKILL_SYS,
      undefined // usa modelo por defecto; el caller puede ajustar si quiere uno barato
    )
    const s = parsed?.skill
    if (!s || typeof s !== 'object' || !s.name || !s.guidance) return null

    const skills = await loadSkills(userId)

    // ¿Ya existe una skill parecida? → refuerza (sube uses, actualiza guidance).
    const idx = skills.findIndex(k =>
      jaccard(k.name, String(s.name)) >= 0.5 || jaccard(k.guidance, String(s.guidance)) >= 0.6
    )
    if (idx >= 0) {
      skills[idx].uses += 1
      skills[idx].guidance = String(s.guidance).slice(0, 300)
      skills[idx].trigger = String(s.trigger || skills[idx].trigger).slice(0, 200)
      skills[idx].updatedAt = Date.now()
      await saveSkills(userId, skills)
      return skills[idx]
    }

    // Nueva skill
    const skill: Skill = {
      id: 'skill_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: String(s.name).slice(0, 80),
      trigger: String(s.trigger || '').slice(0, 200),
      guidance: String(s.guidance).slice(0, 300),
      uses: 1,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    skills.unshift(skill)
    await saveSkills(userId, skills)
    return skill
  } catch {
    return null
  }
}

// Devuelve las skills del usuario (para mostrarlas o editarlas en Ajustes).
export async function getSkills(userId: string): Promise<Skill[]> {
  return loadSkills(userId)
}

// Borra una skill por id.
export async function deleteSkill(userId: string, id: string): Promise<boolean> {
  const skills = await loadSkills(userId)
  const next = skills.filter(s => s.id !== id)
  if (next.length === skills.length) return false
  await saveSkills(userId, next)
  return true
}

// Activa/desactiva una skill (sin borrarla). Una desactivada deja de inyectarse
// al prompt pero se conserva por si el usuario la reactiva.
export async function setSkillEnabled(userId: string, id: string, enabled: boolean): Promise<boolean> {
  const skills = await loadSkills(userId)
  const idx = skills.findIndex(s => s.id === id)
  if (idx < 0) return false
  skills[idx].enabled = enabled
  skills[idx].updatedAt = Date.now()
  await saveSkills(userId, skills)
  return true
}

/**
 * Construye un bloque de texto con las skills más usadas, listo para AÑADIR
 * al prompt del sistema. Se puede concatenar a lo que ya produce
 * services/memory.ts → buildSystemPrompt, sin reemplazarlo.
 */
export async function buildSkillsPromptBlock(userId: string, max = 6): Promise<string> {
  const skills = (await loadSkills(userId))
    .filter(s => s.enabled !== false)   // las que el usuario desactivó en Ajustes no se inyectan
    .sort((a, b) => b.uses - a.uses)
    .slice(0, max)
  if (!skills.length) return ''
  const lines = skills.map(s => `- ${s.name}: ${s.guidance}${s.trigger ? ` (cuándo: ${s.trigger})` : ''}`)
  return `\n\nPreferencias aprendidas del usuario (respétalas cuando apliquen):\n${lines.join('\n')}`
}

// ──────────────────────────────────────────────────────────────────────────
// (OPCIONAL, futuro) Si prefieres una tabla Prisma dedicada en vez de guardar
// las skills como JSON en DayaSystemConfig, añade esto a schema.prisma y
// cambia loadSkills/saveSkills para usar db.userSkill. No es necesario ahora.
//
// model UserSkill {
//   id        String   @id @default(uuid())
//   userId    String
//   name      String
//   trigger   String   @default("")
//   guidance  String
//   uses      Int      @default(1)
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   @@index([userId])
// }
// ──────────────────────────────────────────────────────────────────────────
