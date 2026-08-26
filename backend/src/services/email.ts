import { Resend } from 'resend'

// ============================================
// DAYA IA — Servicio de Emails (Resend)
// Plantillas con la estética neutra de DAYA AI
// ============================================

import { childLogger } from './logger'
import { withRetry } from './retry'
import { CircuitBreaker } from './circuitBreaker'

const log = childLogger('email')
const emailCircuit = new CircuitBreaker('email', { failureThreshold: 3, recoveryTimeoutMs: 60000 })

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM = process.env.EMAIL_FROM || 'DAYA AI <onboarding@resend.dev>'
// FRONTEND_URL puede ser una LISTA separada por comas (la usa CORS para admitir
// varios dominios). Para los enlaces del email tomamos la PRIMERA como canónica,
// si no los links saldrían con la lista entera pegada y rotos.
const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim()

// === Paleta del sistema de diseño (inline para compatibilidad con clientes de email) ===
const C = {
  ink: '#0A0A0C', charcoal: '#1C1C1F', graphite: '#3F3F46',
  slate: '#52525B', mist: '#A1A1AA', line: '#E4E4E7',
  surface: '#FAFAFA', white: '#FFFFFF',
}

// Envoltorio base de todos los emails (header + footer consistentes)
function wrap(title: string, bodyHTML: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${C.surface};font-family:'Segoe UI',-apple-system,system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.white};border:1px solid ${C.line};border-radius:16px;overflow:hidden;">
        <!-- HEADER -->
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid ${C.line};">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.slate};">DAYA AI</div>
          <h1 style="margin:10px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${C.ink};">${title}</h1>
        </td></tr>
        <!-- BODY -->
        <tr><td style="padding:32px 40px;">
          ${bodyHTML}
        </td></tr>
        <!-- FOOTER -->
        <tr><td style="padding:24px 40px;border-top:1px solid ${C.line};">
          <div style="font-size:12px;color:${C.mist};line-height:1.6;">
            Este correo fue enviado por DAYA AI.<br>
            <span style="text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">DAYA AI</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// Botón de acción reutilizable
function button(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${C.charcoal};color:${C.white};text-decoration:none;padding:13px 28px;border-radius:10px;font-size:15px;font-weight:600;">${text}</a>`
}

// Helper: enviar email con retry + circuit breaker
async function safeSend(params: { from: string; to: string; subject: string; html: string }): Promise<boolean> {
  if (!resend) return false
  try {
    await emailCircuit.execute(() => withRetry(async () => {
      await resend!.emails.send(params)
    }, { maxRetries: 2, baseDelayMs: 1000 }))
    return true
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : String(e), to: params.to }, 'Email send failed')
    return false
  }
}

// ── Alerta operativa: modelos muertos en OpenRouter ──────────────────────────
export async function sendModelAlertEmail(dead: { id: string; sources: string[] }[]): Promise<boolean> {
  const to = process.env.ADMIN_ALERT_EMAIL
  if (!resend || !to || dead.length === 0) return false
  const rows = dead.map(d => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${C.line};font-family:monospace;font-size:13px;color:${C.ink};">${d.id}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${C.line};font-size:12px;color:${C.slate};">${d.sources.join(', ')}</td>
    </tr>`).join('')
  const html = wrap('Modelos muertos en OpenRouter', `
    <p style="margin:0 0 16px;font-size:15px;color:${C.graphite};line-height:1.6;">
      El chequeo diario detectó <strong style="color:${C.ink};">${dead.length} modelo${dead.length > 1 ? 's' : ''}</strong> en uso que ya no existe${dead.length > 1 ? 'n' : ''} en OpenRouter.
      Mientras no se reemplacen, el fallback puede estar degradando <strong>en silencio</strong> a modelos más caros o peores.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px;overflow:hidden;margin-bottom:16px;">
      <tr style="background:${C.surface};">
        <td style="padding:8px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.slate};">Modelo</td>
        <td style="padding:8px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.slate};">Usado en</td>
      </tr>
      ${rows}
    </table>
    <p style="margin:0;font-size:13px;color:${C.slate};line-height:1.6;">
      Reemplázalos en <span style="font-family:monospace;">backend/src</span> (openrouter.ts / modelSelector.ts) y verifica el nuevo ID con una petición real.
    </p>
  `)
  return safeSend({ from: FROM, to, subject: `Alerta DAYA: ${dead.length} modelo${dead.length > 1 ? 's' : ''} muerto${dead.length > 1 ? 's' : ''} en OpenRouter`, html })
}

// ── Aviso: DAYA cambió de modelo ella sola ───────────────────────────────────
export async function sendModelChangeEmail(
  changes: { source: string; role: string; from: string; to: string; reason: 'muerto' | 'version-nueva'; priceFrom?: number; priceTo?: number }[],
): Promise<boolean> {
  const to = process.env.ADMIN_ALERT_EMAIL
  if (!resend || !to || changes.length === 0) return false

  const money = (v?: number) => (typeof v === 'number' ? `$${v.toFixed(2)}` : '—')
  const rows = changes.map(c => {
    const subida = typeof c.priceFrom === 'number' && typeof c.priceTo === 'number' && c.priceTo > c.priceFrom
    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${C.line};font-size:12px;color:${C.slate};">
        ${c.reason === 'muerto' ? 'Desapareció' : 'Versión nueva'}<br>
        <span style="font-size:11px;color:${C.mist};">${c.source}.${c.role}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid ${C.line};font-family:monospace;font-size:12px;color:${C.ink};">
        ${c.from}<br>→ <strong>${c.to}</strong>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid ${C.line};font-size:12px;color:${subida ? C.ink : C.slate};white-space:nowrap;">
        ${money(c.priceFrom)} → ${money(c.priceTo)}${subida ? ' ↑' : ''}
      </td>
    </tr>`
  }).join('')

  const html = wrap('DAYA cambió de modelo', `
    <p style="margin:0 0 16px;font-size:15px;color:${C.graphite};line-height:1.6;">
      El chequeo diario aplicó <strong style="color:${C.ink};">${changes.length} cambio${changes.length > 1 ? 's' : ''}</strong> de modelo automáticamente.
      Los precios son por millón de tokens de salida.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px;overflow:hidden;margin-bottom:16px;">
      <tr style="background:${C.surface};">
        <td style="padding:8px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.slate};">Motivo</td>
        <td style="padding:8px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.slate};">Cambio</td>
        <td style="padding:8px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.slate};">Precio</td>
      </tr>
      ${rows}
    </table>
    <p style="margin:0;font-size:13px;color:${C.slate};line-height:1.6;">
      Ningún cambio pierde visión, herramientas ni contexto, y ninguno encarece más de lo permitido.
      Si prefieres decidirlos a mano, pon <span style="font-family:monospace;">MODEL_AUTO_UPDATE=off</span> en Railway:
      seguirán sustituyéndose solo los modelos que desaparezcan.
    </p>
  `)
  return safeSend({ from: FROM, to, subject: `DAYA cambió ${changes.length} modelo${changes.length > 1 ? 's' : ''} automáticamente`, html })
}

// ============================================
// PLANTILLAS
// ============================================

export async function sendVerificationEmail(to: string, name: string, verifyToken: string) {
  const verifyUrl = `${FRONTEND}/auth/verify?token=${verifyToken}`
  if (!resend) { log.info({ to }, '[DEV] Verification email'); return }
  const html = wrap('Confirma tu correo', `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${C.graphite};">Hola ${name},</p>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:${C.graphite};">
      Gracias por crear tu cuenta en DAYA AI. Confirma tu correo para activar todas las funciones. Este enlace expira en 24 horas.
    </p>
    <div style="margin:28px 0;">${button('Confirmar mi correo', verifyUrl)}</div>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${C.mist};">Si no creaste esta cuenta, ignora este correo.</p>
  `)
  await safeSend({ from: FROM, to, subject: 'Confirma tu correo — DAYA AI', html })
}

export async function sendWelcomeEmail(to: string, name: string) {
  if (!resend) { log.info({ to }, '[DEV] Welcome email'); return }
  const html = wrap('Bienvenido a DAYA AI', `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${C.graphite};">Hola ${name},</p>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:${C.graphite};">
      Tu cuenta está lista. Ya puedes chatear, generar documentos profesionales (PDF, Word, Excel, presentaciones) y analizar archivos con inteligencia artificial.
    </p>
    <div style="margin:28px 0;">${button('Comenzar ahora', FRONTEND + '/dashboard')}</div>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${C.mist};">Si tienes dudas, simplemente responde a este correo.</p>
  `)
  await safeSend({ from: FROM, to, subject: 'Bienvenido a DAYA AI', html })
}

export async function sendPasswordResetEmail(to: string, name: string, resetToken: string) {
  if (!resend) { log.info({ to }, '[DEV] Password reset email'); return }
  const resetUrl = `${FRONTEND}/auth/reset?token=${resetToken}`
  const html = wrap('Recupera tu contraseña', `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${C.graphite};">Hola ${name},</p>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:${C.graphite};">
      Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva. Este enlace expira en 1 hora.
    </p>
    <div style="margin:28px 0;">${button('Restablecer contraseña', resetUrl)}</div>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${C.mist};">Si no solicitaste esto, ignora este correo. Tu cuenta sigue segura.</p>
  `)
  await safeSend({ from: FROM, to, subject: 'Restablece tu contraseña — DAYA AI', html })
}

export async function sendPlanUpgradeEmail(to: string, name: string, plan: string) {
  if (!resend) { log.info({ to, plan }, '[DEV] Plan upgrade email'); return }
  const html = wrap('Plan actualizado', `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${C.graphite};">Hola ${name},</p>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:${C.graphite};">
      Tu plan <strong style="color:${C.ink};">${plan}</strong> ya está activo. Gracias por confiar en DAYA AI. Ahora tienes acceso a todas las funciones de tu plan.
    </p>
    <div style="margin:28px 0;">${button('Ir a mi cuenta', FRONTEND + '/dashboard')}</div>
  `)
  await safeSend({ from: FROM, to, subject: `Tu plan ${plan} está activo — DAYA AI`, html })
}

export function isEmailConfigured(): boolean {
  return resend !== null
}
