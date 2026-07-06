// Sentry serveur/edge désactivé : son init tirait `@sentry/node` + OpenTelemetry dans le
// worker (~528 KiB gzip) → dépassement de la limite 3 MiB des Workers FREE. Le Sentry CLIENT
// reste actif via `instrumentation-client.ts`. Réactiver le serveur via `@sentry/cloudflare`
// (SDK Workers) le jour où on rebranche le suivi d'erreurs serveur. Cf. next.config.ts.
export async function register() {}
