import { endOfMonth, format, isAfter, isSameDay, startOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'

/** Période résolue depuis l'URL, prête pour les requêtes Supabase (bornes incluses). */
export interface Period {
  /** `YYYY-MM-DD` inclus. */
  from: string
  /** `YYYY-MM-DD` inclus. */
  to: string
  /** Libellé humain, ex. « Juillet 2026 » ou « 3 juin – 15 juin 2026 ». */
  label: string
}

function parse(value?: string): Date | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Résout la période depuis les searchParams (`?from=&to=`). Défaut = mois en cours.
 * Source unique lue par toutes les pages → le datepicker du header pilote tout le CRM.
 */
export function resolvePeriod(searchParams: { from?: string; to?: string }): Period {
  const now = new Date()
  const from = parse(searchParams.from) ?? startOfMonth(now)
  // Défaut = du 1er du mois à AUJOURD'HUI (pas la fin du mois). Jamais après aujourd'hui
  // (le picker l'interdit déjà ; re-borné ici côté serveur par sécurité).
  let to = parse(searchParams.to) ?? now
  if (isAfter(to, now)) to = now
  const fullMonth = isSameDay(from, startOfMonth(from)) && isSameDay(to, endOfMonth(from))
  const label = fullMonth
    ? cap(format(from, 'LLLL yyyy', { locale: fr }))
    : `${format(from, 'd MMM', { locale: fr })} – ${format(to, 'd MMM yyyy', { locale: fr })}`
  return { from: iso(from), to: iso(to), label }
}
