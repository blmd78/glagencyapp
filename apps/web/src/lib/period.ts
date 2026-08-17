import { endOfMonth, format, isAfter, isSameDay, startOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { todayParis } from '@glagency/core'

/** Période résolue depuis l'URL, prête pour les requêtes Supabase (bornes incluses). */
export interface Period {
  /** `YYYY-MM-DD` inclus. */
  from: string
  /** `YYYY-MM-DD` inclus. */
  to: string
  /** Libellé humain, ex. « Juillet 2026 » ou « 3 juin – 15 juin 2026 ». */
  label: string
}

/**
 * `YYYY-MM-DD` → Date locale minuit, `null` si invalide. PARSEUR PARTAGÉ (source unique) :
 * utilisé ici, par le `DateRangePicker` du header et par le datepicker de sanction du Tracker
 * — l'audit 2026-08-17 en a trouvé trois copies, dont une sans garde Invalid Date.
 */
export function parseDay(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Résout la période depuis les searchParams (`?from=&to=`). Défaut = mois en cours.
 * Source unique lue par toutes les pages → le datepicker du header pilote tout le CRM.
 * Les URLs bricolées sont RÉPARÉES, jamais honorées telles quelles : bornes inversées remises
 * dans l'ordre (sinon « 0 résultat » plausible et mensonger), `to` plafonné à aujourd'hui.
 * PAS de plafond d'étendue (décision Benoit 2026-08-17) : une plage arbitrairement longue reste
 * permise — le picker ne borne pas le passé, et tronquer une sélection volontaire mentirait.
 */
export function resolvePeriod(searchParams: { from?: string; to?: string }): Period {
  // Jour métier Europe/Paris (pas UTC) : sur Vercel, `new Date()` bascule à minuit UTC,
  // soit 2h du matin à Paris en été — la fin de période par défaut était fausse la nuit.
  const now = new Date(`${todayParis()}T00:00:00`)
  let from = parseDay(searchParams.from) ?? startOfMonth(now)
  // Défaut = du 1er du mois à AUJOURD'HUI (pas la fin du mois). Jamais après aujourd'hui
  // (le picker l'interdit déjà ; re-borné ici côté serveur par sécurité).
  let to = parseDay(searchParams.to) ?? now
  if (isAfter(from, to)) [from, to] = [to, from]
  if (isAfter(to, now)) to = now
  if (isAfter(from, to)) from = to // les deux bornes étaient dans le futur → jour unique
  const fullMonth = isSameDay(from, startOfMonth(from)) && isSameDay(to, endOfMonth(from))
  const label = fullMonth
    ? cap(format(from, 'LLLL yyyy', { locale: fr }))
    : `${format(from, 'd MMM', { locale: fr })} – ${format(to, 'd MMM yyyy', { locale: fr })}`
  return { from: iso(from), to: iso(to), label }
}
