import { addDays, addMonths, frMonthLong, frWeekdayLong, startOfMonth, todayParis } from '@glagency/core'

/**
 * Fenêtres de périodes PARTAGÉES par les sélecteurs (Tracker `get-police.ts` + Rapport
 * `rapport-police/page.tsx`) — source unique pour que le sélecteur PARTAGÉ (`UrlSelect`) affiche les
 * mêmes libellés des deux côtés. `addDays`/`addMonths` parsent en UTC-midi (pas de décalage de
 * fuseau) ; `frWeekdayLong`/`frMonthLong` produisent les libellés fr.
 */

/** Taille de la fenêtre de jours (sélecteur ET bornage serveur des saisies). */
export const DAY_WINDOW = 14

/**
 * Le jour est-il dans la fenêtre de saisie autorisée [aujourd'hui-13 … aujourd'hui] ? Bornage
 * SERVEUR des dates de saisie (les sélecteurs n'offrent déjà que cette fenêtre → défense en
 * profondeur contre un appel direct d'action avec une date arbitraire). Comparaison lexicographique
 * = chronologique pour des `YYYY-MM-DD`. `todayParis` = jour métier (Europe/Paris), cohérent
 * client (navigateur) et serveur.
 */
export const isDayInWindow = (day: string, n = DAY_WINDOW): boolean => {
  const today = todayParis()
  return day <= today && day >= addDays(today, -(n - 1))
}

/** Fenêtre de jours récents (aujourd'hui → n-1 en arrière) pour un sélecteur. */
export const recentDays = (today: string, n = DAY_WINDOW) =>
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
