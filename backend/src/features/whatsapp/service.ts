// ============================================
// DAYA IA — WhatsApp: lógica del canal
// --------------------------------------------------------------------------
// WhatsApp es solo una PUERTA de entrada nueva al mismo cerebro de DAYA. Un
// mensaje entrante se resuelve con la MISMA tubería del chat (buildSystemPrompt
// + chatSingle), así que memoria, RAG y memoria de procesos se aplican solos.
//
// Requiere (variables de entorno, se configuran al conectar la cuenta de Meta):
//   WHATSAPP_TOKEN           — token permanente de la app de WhatsApp (Cloud API)
//   WHATSAPP_PHONE_ID        — id del número (no el número en sí)
//   WHATSAPP_VERIFY_TOKEN    — cadena que tú eliges; Meta la usa para verificar el webhook
//   WHATSAPP_APP_SECRET      — secreto de la app; verifica la firma de cada webhook
//   WHATSAPP_DISPLAY_NUMBER  — (opcional) el número público, solo para mostrarlo en Ajustes
//
// Sin estas variables NO envía nada (queda "listo para encender"): el webhook
// responde 200 y las rutas de vínculo funcionan, pero no se llama a Meta.
// ============================================
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { buildSystemPrompt, extractMemories } from '../../services/memory'
import { chatSingle } from '../../services/openrouter'

const db = prisma as any

const CFG = {
  token: process.env.WHATSAPP_TOKEN || '',
  phoneId: process.env.WHATSAPP_PHONE_ID || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  displayNumber: process.env.WHATSAPP_DISPLAY_NUMBER || '',
}

// ¿Está configurada la cuenta de Meta? (si no, no se envía nada a WhatsApp)
export function isConfigured(): boolean {
  return !!(CFG.token && CFG.phoneId)
}

// ── Verificación del webhook (Meta) ──────────────────────────────────────────

// GET de verificación: Meta manda hub.verify_token y esperamos que coincida.
export function checkVerifyToken(token: string): boolean {
  // Si no hay verify token configurado, aceptamos (útil en desarrollo).
  return !CFG.verifyToken || token === CFG.verifyToken
}

// Firma HMAC-SHA256 de cada webhook (cabecera X-Hub-Signature-256), sobre el
// CUERPO CRUDO. Evita webhooks falsos. Sin appSecret configurado, no bloquea (dev).
export function verifySignature(rawBody: Buffer, signature?: string): boolean {
  if (!CFG.appSecret) return true
  if (!signature) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', CFG.appSecret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch { return false }
}

// ── Envío de mensajes (Cloud API) ────────────────────────────────────────────

export async function sendMessage(phone: string, text: string): Promise<boolean> {
  if (!isConfigured()) {
    console.warn('[whatsapp] no configurado (falta WHATSAPP_TOKEN/PHONE_ID); no se envía')
    return false
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${CFG.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CFG.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text.slice(0, 4096) },
      }),
    })
    if (!res.ok) {
      console.warn('[whatsapp] envío falló', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e: any) {
    console.warn('[whatsapp] envío error:', e?.message || e)
    return false
  }
}

// ── Vinculación teléfono ↔ usuario ───────────────────────────────────────────

// Código legible sin caracteres ambiguos (0/O, 1/I).
function genCode(): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let c = ''
  for (let i = 0; i < 4; i++) c += abc[Math.floor(Math.random() * abc.length)]
  return 'DAYA-' + c
}

// Crea (o renueva) un código de vinculación para el usuario. Vale 15 minutos.
export async function createLinkCode(userId: string): Promise<{ code: string; number: string }> {
  const code = genCode()
  const codeExpires = new Date(Date.now() + 15 * 60 * 1000)
  await db.whatsAppLink.upsert({
    where: { userId },
    create: { userId, code, codeExpires },
    update: { code, codeExpires },   // no toca phone/verified si ya existían
  })
  return { code, number: CFG.displayNumber }
}

// Intenta vincular un teléfono a partir de un código recibido por WhatsApp.
export async function tryLinkByCode(phone: string, text: string): Promise<boolean> {
  const m = text.toUpperCase().match(/DAYA-[A-Z0-9]{4}/)
  if (!m) return false
  const link = await db.whatsAppLink.findUnique({ where: { code: m[0] } })
  if (!link) return false
  if (link.codeExpires && new Date(link.codeExpires) < new Date()) return false
  // Libera ese número de cualquier otro vínculo previo (por si se re-vincula).
  await db.whatsAppLink.updateMany({
    where: { phone, NOT: { userId: link.userId } },
    data: { phone: null, verified: false },
  })
  await db.whatsAppLink.update({
    where: { userId: link.userId },
    data: { phone, verified: true, code: null, codeExpires: null },
  })
  return true
}

// Devuelve el userId dueño de un número verificado (o null).
export async function getUserByPhone(phone: string): Promise<string | null> {
  const link = await db.whatsAppLink.findFirst({ where: { phone, verified: true }, select: { userId: true } })
  return link?.userId || null
}

// Estado del vínculo para la pantalla de Ajustes. `configured` indica si la cuenta
// de Meta está puesta: si no lo está, el frontend oculta la sección (queda dormida).
export async function getLinkStatus(userId: string): Promise<{ configured: boolean; linked: boolean; phone: string | null; number: string }> {
  const link = await db.whatsAppLink.findUnique({ where: { userId }, select: { phone: true, verified: true } })
  return { configured: isConfigured(), linked: !!link?.verified, phone: link?.verified ? link.phone : null, number: CFG.displayNumber }
}

// Desvincula el WhatsApp del usuario.
export async function unlink(userId: string): Promise<void> {
  await db.whatsAppLink.updateMany({ where: { userId }, data: { phone: null, verified: false, code: null, codeExpires: null } })
}

// ── Generación de la respuesta (mismo cerebro que el chat) ───────────────────

async function generateReply(userId: string, text: string): Promise<string> {
  const systemPrompt = await buildSystemPrompt(userId, text)
  const reply = await chatSingle([{ role: 'user', content: text }], 'claude', systemPrompt)

  // Aprende en segundo plano, igual que el chat (no bloquea la respuesta).
  extractMemories(userId, text, reply).catch(() => {})
  import('../memoryskills/memorySkills')
    .then(m => m.learnSkillFromExchange(userId, text, reply))
    .catch(() => {})
  // Contabiliza el uso (1 mensaje), como en la web.
  db.user.update({ where: { id: userId }, data: { messagesUsed: { increment: 1 } } }).catch(() => {})

  return reply
}

// Guarda el intercambio en una conversación "WhatsApp" para que aparezca también
// en el historial web. Best-effort: si falla, no rompe la respuesta.
async function persistExchange(userId: string, userText: string, reply: string): Promise<void> {
  try {
    let conv = await db.conversation.findFirst({
      where: { userId, title: 'WhatsApp 💬' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    if (!conv) conv = await db.conversation.create({ data: { userId, title: 'WhatsApp 💬' }, select: { id: true } })
    await db.message.createMany({
      data: [
        { conversationId: conv.id, role: 'user', content: userText },
        { conversationId: conv.id, role: 'assistant', content: reply },
      ],
    })
    await db.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } })
  } catch { /* best-effort */ }
}

// ── Orquestación de un mensaje entrante ──────────────────────────────────────

async function handleIncoming(from: string, text: string): Promise<void> {
  const userId = await getUserByPhone(from)

  if (!userId) {
    // ¿Es un código de vinculación? Si no, guía a vincular.
    if (await tryLinkByCode(from, text)) {
      await sendMessage(from, '✅ ¡Listo! Tu WhatsApp quedó vinculado a DAYA. Escríbeme lo que necesites 🙂')
    } else {
      await sendMessage(from, 'Hola 👋 Soy DAYA. Para usarme por aquí, entra a la app → Ajustes → Conectar WhatsApp y envíame el código que te muestra.')
    }
    return
  }

  const reply = await generateReply(userId, text)
  await sendMessage(from, reply)
  persistExchange(userId, text, reply).catch(() => {})
}

// Procesa el cuerpo del webhook de Meta (ya verificado). Tolera actualizaciones
// de estado (entregado/leído) que llegan sin `messages`.
export async function processWebhook(body: any): Promise<void> {
  const value = body?.entry?.[0]?.changes?.[0]?.value
  const messages = value?.messages
  if (!Array.isArray(messages) || !messages.length) return

  for (const m of messages) {
    const from: string = m.from
    if (!from) continue
    if (m.type === 'text') {
      const text = (m.text?.body || '').trim()
      if (text) await handleIncoming(from, text)
    } else {
      // Fotos y documentos por WhatsApp: siguiente iteración (descargar media +
      // pasar por parseFile/visión). Por ahora, aviso amable.
      await sendMessage(from, 'Por ahora te leo mejor por texto 🙂 Pronto podré procesar fotos y documentos por aquí también.')
    }
  }
}
