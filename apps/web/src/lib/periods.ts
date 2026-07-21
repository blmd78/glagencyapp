import { addDays, addMonths, frMonthLong, frWeekdayLong, startOfMonth } from '@glagency/core'

/**
 * Fenêtres de périodes PARTAGÉES par les sélecteurs (Tracker `get-police.ts` + Rapport
 * `rapport-police/page.tsx`) — source unique pour que le sélecteur PARTAGÉ (`UrlSelect`) affiche les
 * mêmes libellés des deux côtés. `addDays`/`addMonths` parsent en UTC-midi (pas de décalage de
 * fuseau) ; `frWeekdayLong`/`frMonthLong` produisent les libellés fr.
 */

/** Fenêtre de jours récents (aujourd'hui → n-1 en arrière) pour un sélecteur. */
export const recentDays = (today: string, n = 14) =>
  Array.from({ length: n }, (_, i) => {
    const d = addDays(today, -i)
    return { day: d, label: frWeekdayLong(d) }
  })

/** Fenêtre de mois récents (mois courant → n-1 en arrière). */
export const recentMonths = (today: string, n = 12) =>
  Array.from({ length: n }, (_, i) => {
    const m = addMonths(startOfMonth(today), -i)
    return { month: m, label: frMonthLong(m) }
  })
