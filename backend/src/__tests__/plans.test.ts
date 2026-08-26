import { describe, it, expect } from 'vitest'
import { PLANS, getMessageLimit, getLimitPeriod, getMatrixLevel, getImageLimit, getSearchLimit, getStudioLimit, getPublicPlans } from '../config/plans'

describe('plans config', () => {
  it('has FREE and PRO plans', () => {
    expect(PLANS.FREE).toBeDefined()
    expect(PLANS.PRO).toBeDefined()
  })
  it('FREE plan has correct limits', () => {
    expect(PLANS.FREE.messageLimit).toBe(15)
    expect(PLANS.FREE.imageLimit).toBe(10)
    expect(PLANS.FREE.priceUSD).toBe(0)
  })
  it('PRO plan has correct limits', () => {
    expect(PLANS.PRO.messageLimit).toBe(3000)
    expect(PLANS.PRO.priceUSD).toBe(13)
  })
  it('getMessageLimit returns correct value', () => {
    expect(getMessageLimit('FREE')).toBe(15)
    expect(getMessageLimit('PRO')).toBe(3000)
  })
  it('getLimitPeriod returns correct period', () => {
    expect(getLimitPeriod('FREE')).toBe('day')
    expect(getLimitPeriod('PRO')).toBe('month')
  })
  it('getMatrixLevel returns correct level', () => {
    expect(getMatrixLevel('FREE')).toBe('FREE')
    expect(getMatrixLevel('PRO')).toBe('PRO')
  })
  it('getImageLimit returns correct value', () => {
    expect(getImageLimit('FREE')).toBe(10)
    expect(getImageLimit('PRO')).toBe(1000)
  })
  it('getSearchLimit returns correct value', () => {
    expect(getSearchLimit('FREE')).toBe(5)
    expect(getSearchLimit('PRO')).toBe(400)
  })
  it('getStudioLimit returns correct value', () => {
    expect(getStudioLimit('FREE')).toBe(5)
    expect(getStudioLimit('PRO')).toBe(500)
  })
  it('getPublicPlans excludes internal fields', () => {
    const plans = getPublicPlans()
    expect(plans.length).toBe(2)
    for (const plan of plans) {
      expect(plan).toHaveProperty('id')
      expect(plan).toHaveProperty('name')
      expect(plan).toHaveProperty('features')
      expect(plan).not.toHaveProperty('matrixLevel')
    }
  })
})
