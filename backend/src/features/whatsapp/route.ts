// ============================================
// DAYA IA — WhatsApp: rutas
//   GET    /api/whatsapp/webhook   → verificación del webhook (Meta)
//   POST   /api/whatsapp/webhook   → recepción de mensajes (montado con raw en index.ts)
//   POST   /api/whatsapp/link      → genera código de vinculación (autenticado)
//   GET    /api/whatsapp/link      → estado del vínculo (autenticado)
//   DELETE /api/whatsapp/link      → desvincula (autenticado)
// ============================================
import { Router, Request, Response } from 'express'
import { requireAuth } from '../../middleware/auth'
import * as wa from './service'

const router = Router()

// Verificación del webhook: Meta hace un GET con hub.challenge al configurarlo.
router.get('/webhook', (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '')
  const token = String(req.query['hub.verify_token'] || '')
  const challenge = String(req.query['hub.challenge'] || '')
  if (mode === 'subscribe' && wa.checkVerifyToken(token)) return res.status(200).send(challenge)
  return res.sendStatus(403)
})

// Rutas para la UI de "Conectar WhatsApp" (Ajustes). Autenticadas.
router.post('/link', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = await wa.createLinkCode(req.userId)
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'No se pudo generar el código.' })
  }
})

router.get('/link', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(await wa.getLinkStatus(req.userId))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'No se pudo consultar el vínculo.' })
  }
})

router.delete('/link', requireAuth, async (req: Request, res: Response) => {
  try {
    await wa.unlink(req.userId)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'No se pudo desvincular.' })
  }
})

export default router

// Handler del POST /webhook. Se monta en index.ts ANTES de express.json con
// express.raw, para poder verificar la firma sobre el cuerpo CRUDO (igual que
// el webhook de payments). Responde 200 de inmediato y procesa en segundo plano.
export function whatsappWebhook(req: Request, res: Response) {
  const raw: Buffer = req.body instanceof Buffer ? req.body : Buffer.from(req.body || '')
  const sig = req.header('x-hub-signature-256')
  if (!wa.verifySignature(raw, sig)) return res.sendStatus(401)

  res.sendStatus(200)   // Meta exige un 200 rápido; el trabajo va aparte.

  try {
    const body = JSON.parse(raw.toString('utf8'))
    wa.processWebhook(body).catch((e: unknown) => console.warn('[whatsapp] proceso webhook error:', e instanceof Error ? e.message : e))
  } catch (e) {
    console.warn('[whatsapp] webhook JSON inválido:', e instanceof Error ? e.message : e)
  }
}
