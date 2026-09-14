'use client'

import { usePathname } from 'next/navigation'
import { DateRangePicker } from '@/components/date-range-picker'

// Pages « ever » : elles agrègent tout ce qui est scrapé, pas une période → pas de datepicker
// (il induirait de faux calculs). Le préfixe couvre les sous-routes éventuelles.
// La face Formation entière (entraînement, membres) ne raisonne pas non plus par période.
const NO_PERIOD_PREFIXES = ['/chatter/spenders', '/formation']

/**
 * EXCEPTIONS à la règle ci-dessus. Analytics IA est dans la face Formation mais raisonne
 * entièrement par période : c'est une facture, elle se lit sur un intervalle qu'on choisit.
 * Une liste d'exceptions plutôt qu'un découpage plus fin des préfixes — le reste de la face
 * (entraînement, membres, catalogue) n'a toujours rien à faire d'un datepicker.
 */
const PERIOD_EXCEPTIONS = ['/formation/ia']

/** Affiche le sélecteur de période, sauf sur les pages qui ne raisonnent pas par période. */
export function HeaderPeriod() {
  const pathname = usePathname()
  const exception = PERIOD_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!exception && NO_PERIOD_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null
  }
  return <DateRangePicker />
}
