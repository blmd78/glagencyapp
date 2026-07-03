import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // DSN vide → SDK inactif (aucun envoi). Inliné au build (NEXT_PUBLIC_*).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Envoi actif partout (prod, préprod, dev local) — tag environment pour filtrer.
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    (process.env.NODE_ENV === 'development' ? 'development' : 'production'),
  tracesSampleRate: 0,
})
