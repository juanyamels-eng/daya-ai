// ============================================
// DAYA IA — Servicio de pagos con PayPal (Orders API v2)
// + Payoneer (link de cobro / "request a payment")
// Soporta tarjetas internacionales y pago global.
// https://developer.paypal.com/docs/api/orders/v2/
// ============================================

import { PLANS, PlanId } from '../config/plans'

// Modo: 'live' (producción) o 'sandbox' (pruebas). Por defecto sandbox.
const PAYPAL_MODE = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase()
const PAYPAL_API = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'

function getCreds(): { id: string; secret: string } | null {
  const id = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_SECRET
  if (!id || !secret || id.trim() === '' || secret.trim() === '' || id.includes('PON-TU')) return null
  return { id, secret }
}

export function isPayPalConfigured(): boolean {
  return getCreds() !== null
}

// Link de cobro de Payoneer (lo generas en tu panel: "Request a Payment").
// Si está vacío, el botón de Payoneer no se muestra.
export function getPayoneerLink(): string {
  return process.env.PAYONEER_PAYMENT_LINK || ''
}

// Obtiene un access token OAuth2 de PayPal
async function getAccessToken(): Promise<string | null> {
  const creds = getCreds()
  if (!creds) return null
  try {
    const auth = Buffer.from(`${creds.id}:${creds.secret}`).toString('base64')
    const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    const data: any = await res.json()
    return data.access_token || null
  } catch (err: any) {
    console.error('❌ PayPal auth:', err.message)
    return null
  }
}

// Crea una orden de pago y devuelve el link de aprobación al que redirigir al usuario
export async function createOrder(params: {
  planId: PlanId
  returnUrl: string
  cancelUrl: string
}): Promise<{ success: boolean; orderId?: string; approveUrl?: string; error?: string }> {
  const token = await getAccessToken()
  if (!token) return { success: false, error: 'Pagos no configurados. Falta PAYPAL_CLIENT_ID / PAYPAL_SECRET.' }

  const plan = PLANS[params.planId]
  if (!plan || plan.priceCents <= 0) return { success: false, error: 'Plan inválido para pago.' }

  try {
    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          description: `DAYA AI - Plan ${plan.name}`,
          custom_id: params.planId,
          amount: {
            currency_code: 'USD',
            value: (plan.priceCents / 100).toFixed(2),
          },
        }],
        application_context: {
          brand_name: 'DAYA AI',
          user_action: 'PAY_NOW',
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
        },
      }),
    })
    const data: any = await res.json()
    if (res.ok && data.id) {
      const approve = (data.links || []).find((l: any) => l.rel === 'approve')
      return { success: true, orderId: data.id, approveUrl: approve?.href }
    }
    // DIAGNÓSTICO: PayPal devuelve el motivo real en name + details[].issue.
    console.error('❌ PayPal createOrder fallo HTTP', res.status, '— name:', data?.name, '— message:', data?.message)
    console.error('❌ PayPal createOrder details:', JSON.stringify(data?.details || data, null, 2))
    return { success: false, error: data.message || 'No se pudo crear la orden de pago.' }
  } catch (err: any) {
    console.error('❌ PayPal createOrder:', err.message)
    return { success: false, error: 'No se pudo iniciar el pago. Intenta de nuevo.' }
  }
}

// Captura (cobra) una orden ya aprobada por el usuario
export async function captureOrder(orderId: string): Promise<{ success: boolean; captureId?: string; planId?: string; error?: string }> {
  const token = await getAccessToken()
  if (!token) return { success: false, error: 'Pagos no configurados.' }

  try {
    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
    const data: any = await res.json()
    if (res.ok && data.status === 'COMPLETED') {
      const unit = data.purchase_units?.[0]
      const capture = unit?.payments?.captures?.[0]
      return { success: true, captureId: capture?.id, planId: unit?.custom_id }
    }
    // DIAGNÓSTICO: motivo real de PayPal al capturar.
    console.error('❌ PayPal captureOrder fallo HTTP', res.status, '— name:', data?.name, '— details:', JSON.stringify(data?.details || data, null, 2))
    return { success: false, error: data.message || 'El pago no se pudo completar.' }
  } catch (err: any) {
    console.error('❌ PayPal captureOrder:', err.message)
    return { success: false, error: 'No se pudo confirmar el pago. Intenta de nuevo.' }
  }
}
