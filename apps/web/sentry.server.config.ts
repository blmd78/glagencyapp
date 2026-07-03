import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // DSN vide → SDK inactif (aucun envoi). Inliné au build (NEXT_PUBLIC_*).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Envoi actif partout (prod, préprod, dev local) — choix assumé : rien ne doit passer
  // sous le radar. Le tag environment permet de filtrer dans le dashboard.
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    (process.env.NODE_ENV === 'development' ? 'development' : 'production'),
  // Erreurs uniquement, pas de tracing : budget 10 ms CPU/req du plan Workers Free.
  tracesSampleRate: 0,
})
