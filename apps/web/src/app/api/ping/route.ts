// Endpoint de vie + MARQUEUR DE VERSION : renvoie le sha du commit construit — un curl
// suffit pour savoir quelle version est réellement en ligne (les déploiements Vercel sont
// silencieux ; un échec laisserait une vieille version servir sans le dire). Statique
// (pré-rendu au build, servi par le CDN, coût nul).
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'
  return new Response(`ok ${sha}`, { status: 200 })
}
