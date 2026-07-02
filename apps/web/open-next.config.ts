import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Config OpenNext → Cloudflare Workers. Défauts : cache mémoire (pas d'ISR/KV pour l'instant,
// l'app est en rendu dynamique — RSC + auth par cookies). À enrichir (R2/KV incremental cache)
// si on active du cache Next plus tard.
export default defineCloudflareConfig({})
