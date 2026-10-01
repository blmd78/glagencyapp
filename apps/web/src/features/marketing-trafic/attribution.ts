import type { LsPlatform } from '@glagency/core'

/**
 * La ligne `mkt_ls_links` écrite par une correction manuelle. Un compte n'a de sens que pour
 * Instagram, un opérateur que pour X (en majuscules, comme le relevé les écrit) ; `manual` fige la
 * ligne contre le recalcul nocturne.
 */
export function toAttributionUpdate(v: {
  creatorId: string | null
  platform: LsPlatform
  socialAccountId: string | null
  operator: string | null
}) {
  const operator = v.operator?.trim()
  return {
    creator_id: v.creatorId,
    platform: v.platform,
    social_account_id: v.platform === 'instagram' ? v.socialAccountId : null,
    operator: v.platform === 'x' && operator ? operator.toUpperCase() : null,
    manual: true,
  }
}
