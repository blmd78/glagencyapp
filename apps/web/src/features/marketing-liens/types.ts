// Types / forme des props de la feature marketing-liens.

import type { MktLinkRow } from '@/lib/types/marketing'

export interface MktLinksData {
  period: string
  links: MktLinkRow[]
  totals: { clicks: number; conversions: number; revenueEur: number }
}
