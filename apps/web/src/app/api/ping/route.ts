// Endpoint de vie + MARQUEUR DE VERSION : renvoie le sha du commit construit — un curl
// suffit pour savoir quelle version est réellement en ligne (les déploiements Vercel sont
// silencieux ; un échec laisserait une vieille version servir sans le dire). Statique
// (pré-rendu au build, servi par le CDN, coût nul).
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'
  // État de la clé de chiffrement snap SANS l'exposer : ok / invalid (pas 32 octets) / absent.
  const raw = process.env.SNAP_CODES_SECRET
  const snapkey = !raw ? 'absent' : Buffer.from(raw, 'base64').length === 32 ? 'ok' : 'invalid'
  return new Response(`ok ${sha} snapkey:${snapkey}`, { status: 200 })
}
