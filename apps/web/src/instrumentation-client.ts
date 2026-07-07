import * as Sentry from '@sentry/nextjs'

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
  // Erreurs uniquement : pas de tracing ni de Session Replay (quota free tier + poids bundle).
  tracesSampleRate: 0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
