// ============================================
// DAYA IA — Feature: Email (bandeja IMAP)
// Conecta la cuenta IMAP del usuario y muestra su bandeja. La contraseña se
// guarda CIFRADA. Incluye resumen con IA de un correo. Reusa imapflow (MIT).
//
// Degradación elegante: si falta EMAIL_ENC_KEY o no hay cuenta conectada,
// responde con un mensaje claro en vez de fallar.
//
// NOTA: requiere en tu entorno:
//   1) npx prisma generate && npx prisma db push   (crea la tabla EmailAccount)
//   2) variable EMAIL_ENC_KEY (un texto secreto cualquiera) en el backend
// ============================================
import { Router, Request } from 'express'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'
import { encryptSecret, decryptSecret, isEncryptionConfigured } from './crypto'
import { chatSingle } from '../../services/openrouter'
import { getCheapModel } from '../../services/modelCatalog'

const db = prisma as any
const router = Router()
router.use(requireAuth)
const uid = (req: Request) => (req as any).userId

// Abre una conexión IMAP con las credenciales guardadas del usuario
async function openClient(userId: string) {
  const acc = await db.emailAccount.findUnique({ where: { userId } })
  if (!acc) return { error: 'No has conectado ninguna cuenta de correo.' as string }
  let pass: string
  try { pass = decryptSecret(acc.passwordEnc) } catch { return { error: 'No se pudo descifrar la credencial. Revisa EMAIL_ENC_KEY.' } }
  const { ImapFlow } = await import('imapflow')
  const client = new ImapFlow({
    host: acc.imapHost, port: acc.imapPort, secure: acc.imapSecure,
    auth: { user: acc.username, pass }, logger: false,
  })
  return { client, acc }
}

// Estado de la conexión (sin exponer la contraseña)
router.get('/account', async (req, res) => {
  try {
    const acc = await db.emailAccount.findUnique({ where: { userId: uid(req) } })
    res.json({
      connected: !!acc,
      encryptionReady: isEncryptionConfigured(),
      account: acc ? { imapHost: acc.imapHost, username: acc.username, fromName: acc.fromName } : null,
    })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Conectar / guardar credenciales (se prueba la conexión antes de guardar)
router.post('/connect', async (req, res) => {
  if (!isEncryptionConfigured()) {
    return res.status(400).json({ error: 'El servidor no tiene configurada EMAIL_ENC_KEY, necesaria para guardar tu contraseña de forma segura.' })
  }
  const { imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure, username, password, fromName } = req.body
  if (!imapHost || !username || !password) return res.status(400).json({ error: 'Faltan host, usuario o contraseña.' })
  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: imapHost, port: imapPort || 993, secure: imapSecure !== false,
      auth: { user: username, pass: password }, logger: false,
    })
    await client.connect()
    await client.logout()
  } catch {
    return res.status(400).json({ error: 'No se pudo conectar con esas credenciales. Revisa host, usuario y contraseña (algunos correos requieren una "contraseña de aplicación").' })
  }
  try {
    const passwordEnc = encryptSecret(password)
    await db.emailAccount.upsert({
      where: { userId: uid(req) },
      update: { imapHost, imapPort: imapPort || 993, imapSecure: imapSecure !== false, smtpHost: smtpHost || '', smtpPort: smtpPort || 587, smtpSecure: !!smtpSecure, username, passwordEnc, fromName: fromName || '' },
      create: { userId: uid(req), imapHost, imapPort: imapPort || 993, imapSecure: imapSecure !== false, smtpHost: smtpHost || '', smtpPort: smtpPort || 587, smtpSecure: !!smtpSecure, username, passwordEnc, fromName: fromName || '' },
    })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.delete('/account', async (req, res) => {
  try {
    await db.emailAccount.deleteMany({ where: { userId: uid(req) } })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Bandeja: últimos correos (solo cabeceras, ligero)
router.get('/inbox', async (req, res) => {
  const conn = await openClient(uid(req))
  if ('error' in conn) return res.status(400).json({ error: conn.error })
  const { client } = conn
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    const out: any[] = []
    try {
      const status = client.mailbox && typeof client.mailbox !== 'boolean' ? client.mailbox : null
      const total = status?.exists || 0
      if (total > 0) {
        const start = Math.max(1, total - 24)
        for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, internalDate: true })) {
          const env = msg.envelope
          out.push({
            uid: msg.uid,
            seq: msg.seq,
            subject: env?.subject || '(sin asunto)',
            from: env?.from?.[0] ? (env.from[0].name || env.from[0].address) : 'Desconocido',
            fromAddress: env?.from?.[0]?.address || '',
            date: (msg.internalDate || env?.date || new Date()).toString(),
            seen: msg.flags ? msg.flags.has('\\Seen') : true,
          })
        }
      }
    } finally { lock.release() }
    await client.logout()
    res.json({ messages: out.reverse() }) // más reciente primero
  } catch (e: any) {
    try { await client.logout() } catch {}
    res.status(500).json({ error: 'No se pudo leer la bandeja: ' + (e?.message || e) })
  }
})

// Resumen con IA de un correo concreto (por uid)
router.post('/summarize', async (req, res) => {
  const { uid: msgUid } = req.body
  if (!msgUid) return res.status(400).json({ error: 'Falta el identificador del correo.' })
  const conn = await openClient(uid(req))
  if ('error' in conn) return res.status(400).json({ error: conn.error })
  const { client } = conn
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    let text = ''
    let subject = ''
    try {
      const msg = await client.fetchOne(String(msgUid), { envelope: true, bodyParts: ['text'] }, { uid: true })
      subject = (msg && msg.envelope?.subject) || ''
      const part = msg && msg.bodyParts?.get('text')
      if (part) text = part.toString('utf8')
    } finally { lock.release() }
    await client.logout()

    const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
    if (!clean) return res.json({ summary: 'No se pudo extraer el texto de este correo.' })

    const summary = await chatSingle(
      [{ role: 'user', content: `Asunto: ${subject}\n\nCorreo:\n${clean}` }],
      'claude',
      'Resume este correo en español en 2-3 frases claras y dime si requiere alguna acción o respuesta. Sé breve y directo.',
      getCheapModel()
    )
    res.json({ summary })
  } catch (e: any) {
    try { await client.logout() } catch {}
    res.status(500).json({ error: 'No se pudo resumir el correo: ' + (e?.message || e) })
  }
})

// Enviar correo por SMTP
router.post('/send', async (req, res) => {
  const { to, subject, body } = req.body
  if (!to || !subject || !body) return res.status(400).json({ error: 'Faltan destinatario, asunto o cuerpo.' })

  const acc = await db.emailAccount.findUnique({ where: { userId: uid(req) } })
  if (!acc) return res.status(400).json({ error: 'No hay cuenta de correo configurada.' })
  if (!acc.smtpHost) return res.status(400).json({ error: 'No hay servidor SMTP configurado. Edita tu cuenta de correo para añadir los datos SMTP.' })

  let pass: string
  try { pass = decryptSecret(acc.passwordEnc) } catch { return res.status(500).json({ error: 'No se pudo descifrar la credencial.' }) }

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: acc.smtpHost,
      port: acc.smtpPort || 587,
      secure: !!acc.smtpSecure,
      auth: { user: acc.username, pass },
    })
    await transporter.sendMail({
      from: acc.fromName ? `"${acc.fromName}" <${acc.username}>` : acc.username,
      to: String(to),
      subject: String(subject),
      text: String(body),
    })
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: 'No se pudo enviar el correo: ' + (e?.message || e) })
  }
})

export default router
