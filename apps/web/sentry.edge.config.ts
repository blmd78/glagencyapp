import * as Sentry from '@sentry/nextjs'

// Errors-only : ni tracesSampleRate ni tracesSampler → tracing désactivé (doc Sentry).
// Pas de PII : ne passer NI sendDefaultPii NI dataCollection (dataCollection, même
// partiel, opte dans des défauts plus permissifs — cookies/headers/userInfo collectés).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    (process.env.NODE_ENV === 'development' ? 'development' : 'production'),
})
