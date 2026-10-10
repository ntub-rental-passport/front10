import { describe, expect, it } from 'vitest'
import {
  isMobileUnsupportedLandlordPath,
  isMobileUnsupportedTenantPath,
} from './mobile-surface'

describe('landlord mobile surface', () => {
  it.each([
    '/landlord/finance',
    '/landlord/contracts',
    '/landlord/finance/',
    '/landlord/contracts/',
    '/landlord/finance/details',
    '/landlord/contracts/details',
  ])('blocks %s', (path) => {
    expect(isMobileUnsupportedLandlordPath(path)).toBe(true)
  })

  it.each([
    '/landlord',
    '/landlord/properties',
    '/landlord/tenants',
    '/landlord/maintenance',
    '/landlord/settings',
    '/landlord/settings/plan',
    '/landlord/subscription',
    '/landlord/finance-other',
    '/landlord/contracts-other',
  ])('allows %s', (path) => {
    expect(isMobileUnsupportedLandlordPath(path)).toBe(false)
  })
})

describe('tenant mobile surface', () => {
  it.each([
    '/app/contract/scanner',
    '/app/contract-analysis',
    '/app/contract/editor',
    '/app/contract/combined',
    '/app/contract/document',
    '/app/subsidy',
    '/app/subsidy/housing',
    '/app/subsidy/recovery',
    '/app/subsidy/calculator',
    '/app/subsidy/apply',
    '/app/subsidy/progress',
    '/app/subsidy/upload',
  ])('blocks %s with or without a trailing slash', (path) => {
    expect(isMobileUnsupportedTenantPath(path)).toBe(true)
    expect(isMobileUnsupportedTenantPath(`${path}/`)).toBe(true)
  })

  it.each([
    '/app/contract',
    '/app/contract/air-conditioner-repair',
    '/app/contract/electricity-fee',
    '/app/tenant-guide',
    '/app/outage',
    '/app/subscription',
    '/app',
  ])('allows %s with or without a trailing slash', (path) => {
    expect(isMobileUnsupportedTenantPath(path)).toBe(false)
    expect(isMobileUnsupportedTenantPath(`${path}/`)).toBe(false)
  })

  it('allows contract teaching content while blocking the contract scanner', () => {
    expect(isMobileUnsupportedTenantPath('/app/contract')).toBe(false)
    expect(isMobileUnsupportedTenantPath('/app/contract/scanner')).toBe(true)
  })

  it('matches contract tools exactly and subsidy children by route segment', () => {
    expect(isMobileUnsupportedTenantPath('/app/contract/scanner/details')).toBe(false)
    expect(isMobileUnsupportedTenantPath('/app/contract/scanner-other')).toBe(false)
    expect(isMobileUnsupportedTenantPath('/app/subsidy/new/nested')).toBe(true)
    expect(isMobileUnsupportedTenantPath('/app/subsidy-other')).toBe(false)
  })
})
