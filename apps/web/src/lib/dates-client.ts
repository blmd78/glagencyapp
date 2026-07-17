/**
 * « Aujourd'hui » en TZ NAVIGATEUR (pas `toISOString()` qui bascule en UTC — même piège
 * que `isoDate()`/`new Date()` nu documenté dans `docs/guidelines-data-loading.md` §6).
 * Défendable UNIQUEMENT pour une date DE FORM/affichage éditable côté client (pas un
 * calcul métier serveur) : c'est le "jour" local à l'utilisateur — pas Europe/Paris — qui
 * est la bonne référence (bilan-dialog.tsx, social-view.tsx).
 */
export function todayLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
