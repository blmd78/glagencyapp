/**
 * Prix LISTE Anthropic en $ par million de tokens, et le calcul de coût d'un lot d'appels.
 *
 * Remonté de `features/training-overview/services/get-overview.ts` le 2026-09-12 : la page
 * Analytics IA fait le même calcul, et la frontière ESLint interdit à une feature d'importer
 * une autre feature. Une seule table de prix pour toute l'app — deux copies auraient dérivé au
 * premier changement de tarif.
 *
 * Le coût affiché est une ESTIMATION : la facture réelle peut être plus basse (remises) et ces
 * prix bougent. Un modèle inconnu de la table compte 0 — mieux qu'un chiffre faux — mais il
 * apparaît quand même dans le détail par modèle, donc l'écart se voit.
 */
export const AI_PRICES: Record<string, [input: number, output: number]> = {
  'claude-haiku-4-5': [1, 5],
  // Sonnet 5 = 2/10. Le 3/15 qui traînait ici est le tarif de Sonnet 4.6 : le coût de la
  // notation était surestimé de 50 %. Ne pas recopier le prix d'une génération sur la suivante.
  'claude-sonnet-5': [2, 10],
}

/** Lecture de cache facturée ~10 % du prix d'entrée. */
export const CACHE_READ_RATIO = 0.1

/**
 * ÉCRITURE de cache, PAR SORTE D'APPEL — le tarif dépend du TTL, et les deux coexistent :
 *  - notation (`score`) : TTL 1 h posé explicitement dans `score.ts` → 2× le prix d'entrée ;
 *  - fan (`fan`) : marqueur `cache_control` sans TTL → 5 minutes, 1,25×.
 * Une sorte inconnue tombe sur 2 : mieux vaut surestimer qu'ignorer.
 */
const CACHE_WRITE_RATIO: Record<string, number> = { score: 2, fan: 1.25 }
export const cacheWriteRatio = (kind: string): number => CACHE_WRITE_RATIO[kind] ?? 2

/**
 * SEUIL MINIMAL DE MISE EN CACHE, en tokens, par modèle — et la raison d'être de cette page.
 *
 * Un prompt plus court que ce seuil n'est JAMAIS mis en cache, et l'API ne le signale pas :
 * `cache_control` est simplement ignoré, on paie tout plein tarif. Relevé le 2026-09-12 sur la
 * production : le fan envoie 1 882 tokens en moyenne contre 4 096 exigés par Haiku 4.5, d'où
 * 1,4 % de lecture en cache sur 264 millions de tokens d'entrée — l'essentiel de la facture.
 *
 * Le seuil n'est PAS monotone entre générations (512 sur les plus récents, 4 096 sur Haiku 4.5) :
 * changer de modèle peut donc activer ou désactiver le cache sans rien changer d'autre.
 */
export const CACHE_MIN_TOKENS: Record<string, number> = {
  'claude-haiku-4-5': 4096,
  'claude-sonnet-5': 1024,
}

/** Le seuil du modèle, par préfixe (les ids portent un suffixe de date). `null` si inconnu. */
export function cacheMinTokens(model: string): number | null {
  const hit = Object.entries(CACHE_MIN_TOKENS).find(([k]) => model.startsWith(k))
  return hit ? hit[1] : null
}

/** Un lot d'appels agrégé, tel que le rendent `training_ai_cost` / `training_ai_daily`. */
export interface AiUsageLot {
  model: string
  kind: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Coût estimé d'un lot, en dollars. Modèle hors table → 0 (cf. `AI_PRICES`). */
export function usdOf(lots: AiUsageLot[]): number {
  let usd = 0
  for (const r of lots) {
    const price = Object.entries(AI_PRICES).find(([k]) => r.model.startsWith(k))?.[1]
    if (!price) continue
    const [pIn, pOut] = price
    usd +=
      (r.inputTokens * pIn +
        r.outputTokens * pOut +
        r.cacheReadTokens * pIn * CACHE_READ_RATIO +
        r.cacheWriteTokens * pIn * cacheWriteRatio(r.kind)) /
      1e6
  }
  return usd
}
