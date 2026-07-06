// Point d'entrée du Worker Cloudflare (`main` dans wrangler.jsonc). Il réutilise le handler
// généré par OpenNext et l'enveloppe avec `@sentry/cloudflare` — le SDK Sentry conçu pour les
// Workers (léger, sans `@sentry/node` ni OpenTelemetry) → on récupère la capture d'erreurs
// SERVEUR sans crever la limite 3 MiB du plan Workers Free (contrairement à `@sentry/nextjs`
// côté serveur, retiré pour cette raison — cf. next.config.ts / src/instrumentation.ts).
// Le DSN vient d'une var wrangler (DSN Sentry = public, déjà embarqué côté client).
import * as Sentry from '@sentry/cloudflare'
// worker.js est généré par OpenNext au build (pas de types). Ce fichier est exclu du typecheck
// dans tsconfig.json (glue d'entrée wrangler, hors graphe Next), et bundlé par esbuild/wrangler.
import handler, { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js'

type SentryEnv = {
  NEXT_PUBLIC_SENTRY_DSN?: string
  NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string
}

export default Sentry.withSentry(
  (env: SentryEnv) => ({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'production',
    // Erreurs uniquement, pas de tracing — on préserve le budget 10 ms CPU/req du plan Free.
    tracesSampleRate: 0,
    // Sans DSN → SDK inactif (aucun envoi), même posture que l'ancien sentry.server.config.
    enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
  }),
  handler,
)

// Ré-export des Durable Objects exportées par le worker OpenNext (requis par le runtime).
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge }
