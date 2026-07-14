/**
 * Sentry client chargé PARESSEUSEMENT : en import statique, le SDK (~115 Ko bruts /
 * 38 Ko gzip) partait dans le chunk d'entrée critique de toutes les pages — téléchargé
 * et parsé AVANT l'hydratation, même DSN vide. Ici : chunk séparé, chargé après idle.
 * Trade-off assumé : une erreur dans les ~2 premières secondes peut échapper à Sentry.
 */
type SentrySdk = typeof import('@sentry/nextjs')

let sdk: Promise<SentrySdk> | null = null

function loadSentry(): Promise<SentrySdk> {
  sdk ??= import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      // Coupé hors prod : l'instrumentation Sentry sature l'async-hooks tracking du
      // serveur `next dev` (RangeError: Map maximum size exceeded à répétition).
      enabled: process.env.NODE_ENV === 'production',
      // DSN vide → SDK inactif (aucun envoi). Inliné au build (NEXT_PUBLIC_*).
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // Envoi actif partout (prod, préprod, dev local) — tag environment pour filtrer.
      environment:
        process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
        (process.env.NODE_ENV === 'development' ? 'development' : 'production'),
      // Erreurs uniquement : pas de tracing ni de Session Replay (quota + poids bundle).
      tracesSampleRate: 0,
    })
    return Sentry
  })
  return sdk
}

if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000))
  idle(() => void loadSentry())
}

/** Hook Next : relayé vers le SDK une fois chargé (no-op avant — transitions non tracées). */
export const onRouterTransitionStart = (href: string, navigationType: string): void => {
  if (!sdk) return
  void sdk.then((Sentry) => Sentry.captureRouterTransitionStart(href, navigationType))
}
