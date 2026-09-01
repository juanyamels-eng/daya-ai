import { Router, Request } from 'express'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'
import { chatSingle } from '../../services/openrouter'

const db = prisma as any
const router = Router()
router.use(requireAuth)

const uid = (req: Request) => (req as any).userId

// POST /api/images/prompt — arma UN prompt profesional de generación de imagen en
// inglés a partir de la petición del usuario + sus respuestas del panel (estilo,
// formato, ambiente). Paso rápido con gemini-flash. Si falla, devuelve la combinación
// simple (nunca se rompe). El tamaño/formato se mapea aparte en el frontend.
router.post('/prompt', async (req, res) => {
  const basePrompt = String(req.body?.basePrompt || '').trim()
  const answers: string[] = Array.isArray(req.body?.answers)
    ? req.body.answers.filter((a: any) => typeof a === 'string' && a.trim()).map((a: string) => a.trim())
    : []
  if (!basePrompt) return res.status(400).json({ error: 'basePrompt requerido' })

  // Fallback siempre disponible: petición + respuestas en una sola línea.
  const simple = [basePrompt, ...answers].filter(Boolean).join(', ')

  try {
    const sys = `You are an expert prompt engineer for AI image generation (Flux/Pollinations). Turn the user's request and their panel choices into ONE single, coherent image prompt.

RULES:
- Output ENGLISH only. Translate everything to natural English.
- Respect EXACTLY what the user asked and chose. NEVER add subjects, objects or concepts they didn't mention.
- Weave the choices (style, mood/ambiance, framing, etc.) into one fluid description — do NOT just list the words.
- Add professional quality cues that FIT the chosen style: lighting, composition, level of detail, lens/medium/render as appropriate. Stay coherent — never contradict the chosen mood (e.g. do NOT add "golden hour" when the mood is dark).
- The aspect ratio is handled separately, so describe framing naturally but do NOT output ratio numbers like "16:9".
- If a choice is vague ("surprise me", "whatever fits", "el que encaje"), treat it as creative freedom — do NOT write it literally.
- Output ONLY the final prompt text: no quotes, no labels, no explanation. Around 40-60 words.`
    const ask = `User request: "${basePrompt}"
Panel choices: ${answers.length ? answers.map(a => `"${a}"`).join(', ') : '(none — the user skipped; just enhance and translate the request itself)'}

Write the final English image prompt now.`

    const out = await chatSingle([{ role: 'user', content: ask }], 'flash', sys, undefined, 300)
    const cleaned = (out || '')
      .replace(/^\s*(prompt|image prompt|final prompt)\s*:?\s*/i, '')
      .replace(/^["'`\s]+|["'`\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned && cleaned.length >= 3) return res.json({ prompt: cleaned.slice(0, 700) })
    return res.json({ prompt: simple })
  } catch (e: unknown) {
    console.warn('[genimages/prompt] gemini-flash falló, uso fallback:', (e instanceof Error && e.message) || String(e))
    return res.json({ prompt: simple })
  }
})

// GET /api/images — lista de imágenes del usuario (más reciente primero)
router.get('/', async (req, res) => {
  try {
    const images = await db.generatedImage.findMany({
      where: { userId: uid(req) },
      orderBy: { createdAt: 'desc' },
    })
    res.json(images)
  } catch (e: unknown) {
    console.error('[genimages GET] error al listar imágenes:', (e instanceof Error && e.message) || String(e))
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// (Las preguntas previas a generar se retiraron: la imagen se genera directa.)

// POST /api/images — persistir una imagen generada.
//  - Modo completo (por defecto): asegura la conversación, crea el mensaje del
//    usuario y el mensaje assistant con la imagen embebida en el content
//    (__IMGGEN__|prompt|model|url) y crea la fila GeneratedImage enganchada a ese
//    mensaje real. Así la imagen sobrevive a la recarga Y queda en la Biblioteca.
//  - Modo imageOnly (regenerar/variante): solo crea la fila GeneratedImage.
router.post('/', async (req, res) => {
  const { prompt, model, url, conversationId, userText, messageId, imageOnly } = req.body
  if (!url || !prompt) return res.status(400).json({ error: 'url y prompt son requeridos' })
  const userId = uid(req)
  const mdl = model || 'flux'

  // Cuota de imágenes por plan (incluye variantes/regenerar: cada una es una
  // generación nueva). Si se alcanzó el límite, no se guarda.
  const { consumeQuota } = await import('../../services/quota')
  const quota = await consumeQuota(userId, 'image')
  if (!quota.ok) return res.status(429).json({ error: quota.error })

  try {
    // Modo ligero: solo guardar la imagen en la Biblioteca (variante/regenerar).
    if (imageOnly) {
      const image = await db.generatedImage.create({
        data: { userId, prompt, model: mdl, url, messageId: messageId || null },
      })
      return res.status(201).json({ image })
    }

    // 1) Asegurar la conversación (crearla si no existe o no es del usuario).
    let conversation = conversationId
      ? await db.conversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } })
      : null
    if (!conversation) {
      conversation = await db.conversation.create({
        data: { userId, title: String(userText || prompt).slice(0, 60), model: 'claude', mode: 'SINGLE' },
        select: { id: true },
      })
    }
    const convId = conversation.id

    // 2) Mensaje del usuario (su petición), si se proporcionó.
    if (userText && String(userText).trim()) {
      await db.message.create({ data: { conversationId: convId, role: 'user', content: String(userText).slice(0, 4000) } })
    }

    // 3) Mensaje assistant con la imagen embebida en el content (sobrevive recarga).
    const assistantMsg = await db.message.create({
      data: { conversationId: convId, role: 'assistant', content: `__IMGGEN__|${prompt}|${mdl}|${url}` },
    })

    // 4) Fila GeneratedImage enganchada al mensaje real.
    const image = await db.generatedImage.create({
      data: { userId, prompt, model: mdl, url, messageId: assistantMsg.id },
    })

    // 5) Tocar updatedAt para que el chat suba en el sidebar.
    await db.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } }).catch(() => {})

    res.status(201).json({ image, conversationId: convId, messageId: assistantMsg.id })
  } catch (e: unknown) {
    console.error('[genimages POST] error al guardar imagen:', (e instanceof Error && e.message) || String(e))
    // Se consumió la cuota arriba pero la imagen no se llegó a guardar: devolverla
    // (si no, cada fallo —y cada reintento del frontend ante 5xx— descontaría una).
    const { refundQuota } = await import('../../services/quota')
    await refundQuota(userId, 'image')
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// DELETE /api/images/:id — eliminar una imagen
router.delete('/:id', async (req, res) => {
  try {
    await db.generatedImage.deleteMany({ where: { id: req.params.id, userId: uid(req) } })
    res.json({ success: true })
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }) }
})

export default router
