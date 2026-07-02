/**
 * Reporte la période courante du header (`?from&to`) sur un href de navigation.
 * Utilisé par la sidebar et le switcher de face → la plage sélectionnée au datepicker
 * survit au changement d'onglet / de face. Sans sélection, aucun param n'est ajouté.
 */
export function withPeriod(
  href: string,
  searchParams: { get(name: string): string | null },
): string {
  const period = new URLSearchParams()
  for (const key of ['from', 'to']) {
    const v = searchParams.get(key)
    if (v) period.set(key, v)
  }
  const qs = period.toString()
  return qs ? `${href}?${qs}` : href
}
