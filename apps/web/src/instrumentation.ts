import * as Sentry from '@sentry/nextjs'

// Sentry SERVEUR (réactivé depuis le passage Vercel — la limite 3 MiB Workers est caduque).
// `onRequestError` capture toutes les erreurs serveur non catchées : RSC (routeType
// 'render'), Route Handlers ('route'), Server Actions ('action'), proxy ('proxy').
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config')
}

export const onRequestError = Sentry.captureRequestError
