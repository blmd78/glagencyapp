import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

// Erreurs serveur (RSC, proxy, Route Handlers, Server Actions) → Sentry.
export const onRequestError = Sentry.captureRequestError
