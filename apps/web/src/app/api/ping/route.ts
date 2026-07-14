// Endpoint de vie minimal. Sous Cache Components il est PRÉ-RENDU statiquement (servi
// par le CDN, coût nul). Conservé pour les clients encore sur l'ancien bundle (worker
// Cloudflare gelé) qui le pingent — le keep-alive côté client a été retiré : sur Vercel,
// les instances restent chaudes d'elles-mêmes (Fluid compute).
export function GET() {
  return new Response('ok', { status: 200 })
}
