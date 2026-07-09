'use client'

import { usePathname } from 'next/navigation'
import { DateRangePicker } from '@/components/date-range-picker'

// Pages « ever » : elles agrègent tout ce qui est scrapé, pas une période → pas de datepicker
// (il induirait de faux calculs). Le préfixe couvre les sous-routes éventuelles.
const NO_PERIOD_PREFIXES = ['/chatter/spenders']

/** Affiche le sélecteur de période, sauf sur les pages qui ne raisonnent pas par période. */
export function HeaderPeriod() {
  const pathname = usePathname()
  if (NO_PERIOD_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null
  return <DateRangePicker />
}
