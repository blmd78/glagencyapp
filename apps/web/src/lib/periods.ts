import { addDays, todayParis } from '@glagency/core'

/**
 * Fenêtre de SAISIE partagée par le Tracker sanctions (`features/police`) et le Rapport du soir
 * (`features/police-reports`) : le datepicker mono-date (`components/day-picker.tsx`) n'offre
 * qu'elle, et les schémas/actions serveur la re-vérifient (défense en profondeur). Les anciens
 * sélecteurs jour/mois (`recentDays`/`recentMonths`) ont disparu avec le passage des deux pages
 * au datepicker global (2026-08-17).
 */

/** Taille de la fenêtre de jours (datepicker de saisie ET bornage serveur des saisies). */
export const DAY_WINDOW = 14

/**
 * Le jour est-il dans la fenêtre de saisie autorisée [aujourd'hui-13 … aujourd'hui] ? Bornage
 * SERVEUR des dates de saisie (le datepicker n'offre déjà que cette fenêtre → défense en
 * profondeur contre un appel direct d'action avec une date arbitraire). Comparaison lexicographique
 * = chronologique pour des `YYYY-MM-DD`. `todayParis` = jour métier (Europe/Paris), cohérent
 * client (navigateur) et serveur.
 */
export const isDayInWindow = (day: string, n = DAY_WINDOW): boolean => {
  const today = todayParis()
  return day <= today && day >= addDays(today, -(n - 1))
}
