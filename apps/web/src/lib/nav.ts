import type { Route } from 'next'

/**
 * Reporte la période courante du header (`?from&to`) sur un href de navigation.
 * Utilisé par la sidebar et le switcher de face → la plage sélectionnée au datepicker
 * survit au changement d'onglet / de face. Sans sélection, aucun param n'est ajouté.
 */
export function withPeriod(
  href: Route,
  searchParams: { get(name: string): string | null },
): Route {
  const period = new URLSearchParams()
  for (const key of ['from', 'to']) {
    const v = searchParams.get(key)
    if (v) period.set(key, v)
  }
  const qs = period.toString()
  // `?from&to` n'est pas un href statique connu de typedRoutes → cast au point de
  // construction (le href de base, lui, reste validé en amont).
  return (qs ? `${href}?${qs}` : href) as Route
}

/**
 * Prefetch COMPLET d'une route (contenu inclus) : le prefetch par défaut de Next ne
 * précharge que la coquille (loading.tsx) des routes dynamiques — le clic repartirait au
 * serveur. `kind:'full'` + staleTimes → clic servi 100 % du cache client. L'option est
 * absente du type public d'AppRouterInstance (API interne stable), d'où le cast local.
 */
export function prefetchFull(router: { prefetch(href: string): void }, href: string): void {
  ;(router.prefetch as (href: string, opts?: { kind: 'auto' | 'full' | 'temporary' }) => void)(
    href,
    { kind: 'full' },
  )
}
