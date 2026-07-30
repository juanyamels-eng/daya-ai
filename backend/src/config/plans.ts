// ============================================
// DAYA IA — Central plan configuration
// Prices, limits and anti-surprise rules
// ============================================

export type PlanId = 'FREE' | 'PRO'

export interface PlanConfig {
  id: PlanId
  name: string
  priceUSD: number        // monthly price in USD
  priceCents: number      // for PayPal (in US dollar cents)
  messageLimit: number    // message limit
  imageLimit: number      // generated images limit
  searchLimit: number     // web searches limit
  studioLimit: number     // Studio designs limit
  limitPeriod: 'day' | 'month'
  docLimit: number        // document limit (-1 = "unlimited" with anti-bot ceiling)
  matrixLevel: 'FREE' | 'PRO'  // level in the model matrix
  features: string[]
  highlight?: boolean
}

export const PLANS: Record<PlanId, PlanConfig> = {
  FREE: {
    id: 'FREE',
    name: 'Gratis',
    priceUSD: 0,
    priceCents: 0,
    messageLimit: 15,
    imageLimit: 10,
    searchLimit: 5,
    studioLimit: 5,
    limitPeriod: 'day',
    docLimit: 3,
    matrixLevel: 'FREE',
    features: [
      '15 mensajes al día',
      '10 imágenes al día',
      '5 búsquedas web al día',
      '5 diseños en Studio al día',
      'Selección automática del modelo adecuado',
      'Exporta a PDF, Word, Excel y presentaciones',
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    priceUSD: 13,
    priceCents: 1300,
    messageLimit: 3000,
    imageLimit: 1000,
    searchLimit: 400,
    studioLimit: 500,
    limitPeriod: 'month',
    docLimit: -1,          // unlimited (with internal anti-abuse ceiling)
    matrixLevel: 'PRO',
    features: [
      '3.000 mensajes al mes',
      '1.000 imágenes al mes',
      '400 búsquedas web al mes',
      '500 diseños en Studio al mes',
      'Modelos top + pensamiento profundo',
      'DAYA Code: agente de programación en tu terminal',
      'Documentos ilimitados + soporte prioritario',
    ],
    highlight: true, // this is the plan highlighted in /planes (BETA is not public)
  },
}

// Returns the message limit according to the plan
export function getMessageLimit(plan: PlanId): number {
  return PLANS[plan]?.messageLimit ?? PLANS.FREE.messageLimit
}

// Returns the limit reset period
export function getLimitPeriod(plan: PlanId): 'day' | 'month' {
  return PLANS[plan]?.limitPeriod ?? 'day'
}

// Returns the model matrix level
export function getMatrixLevel(plan: PlanId): 'FREE' | 'PRO' {
  return PLANS[plan]?.matrixLevel ?? 'FREE'
}

// Limits per resource (same pattern as getMessageLimit)
export function getImageLimit(plan: PlanId): number {
  return PLANS[plan]?.imageLimit ?? PLANS.FREE.imageLimit
}
export function getSearchLimit(plan: PlanId): number {
  return PLANS[plan]?.searchLimit ?? PLANS.FREE.searchLimit
}
export function getStudioLimit(plan: PlanId): number {
  return PLANS[plan]?.studioLimit ?? PLANS.FREE.studioLimit
}

export function getPublicPlans() {
  return Object.values(PLANS).map(p => ({
    id: p.id,
    name: p.name,
    priceUSD: p.priceUSD,
    messageLimit: p.messageLimit,
    limitPeriod: p.limitPeriod,
    features: p.features,
    highlight: p.highlight || false,
  }))
}
