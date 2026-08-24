import { LIMITS } from './bounds'

/**
 * Nettoyage des `moments` — les annotations pédagogiques d'une note (`score.moments` chez GLA,
 * `training_thread_scores.moments` chez nous).
 *
 * Aucun `check` SQL ne les rejette et l'UI ne casse pas sur une clé manquante
 * (`annotated-transcript.tsx:39`, `score-panel.tsx:57` affiche 🔧 par défaut) : ce nettoyage est
 * une question de qualité, pas de survie. Sauf UN point, qui lui est vital : la colonne est lue par
 * un `.map()` — y ranger autre chose qu'un tableau casserait l'écran de score.
 *
 * Anomalies mesurées sur les 17 260 sessions et leur traitement :
 *  - `moments` en **`string`** au lieu de tableau (111 sessions) → `[]`, perte assumée (D5) ;
 *  - clé absente (2 067, dont 1 789 boss) → `[]` ;
 *  - `mieux` au lieu d'`indice` (~310) → **renommé** ;
 *  - `problème` accentué au lieu de `probleme` (~14) → **renommé** ;
 *  - `type` absent (188 à 499 selon le rapport) → laissé absent, l'UI dégrade proprement ;
 *  - `cite2`, `probleme2`, `type_field`, `cite_fan`, `probleme_detail`… (quelques unités) →
 *    **écartés**, perte assumée (D5) : aucun champ d'accueil, les retenir polluerait `momentZod`.
 */

/** Clés canoniques, conformes à `momentZod` (`lib/ai/schema.ts:38`). */
export interface LegacyMoment {
  cite?: string
  type?: 'good' | 'bad'
  probleme?: string
  indice?: string
}

const text = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!s) return undefined
  // Borne LARGE (2 000 vs 571 mesuré) et non les 500 de `momentZod` : ce 500-là est un garde-fou
  // sur la sortie d'un modèle, pas une règle de donnée — le respecter ici tronquerait une note.
  return s.length > LIMITS.momentChars ? s.slice(0, LIMITS.momentChars) : s
}

/**
 * Rend TOUJOURS un tableau (éventuellement vide) de moments aux seules clés canoniques.
 * Lecture en LISTE BLANCHE : jamais « tout ce qui reste » — 102 sessions portent `type` / `cite` /
 * `probleme` / `indice` à la RACINE de `score` (fuite d'un moment aplati), un parseur permissif les
 * prendrait pour des axes.
 */
export function cleanMoments(raw: unknown): LegacyMoment[] {
  if (!Array.isArray(raw)) return []
  const out: LegacyMoment[] = []
  for (const el of raw.slice(0, LIMITS.momentsPerScore)) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) continue
    const o = el as Record<string, unknown>
    const m: LegacyMoment = {}
    const cite = text(o.cite)
    if (cite) m.cite = cite
    // La clé canonique gagne toujours sur son alias : un objet qui porte les deux n'est pas ambigu.
    const probleme = text(o.probleme) ?? text(o['problème'])
    if (probleme) m.probleme = probleme
    const indice = text(o.indice) ?? text(o.mieux)
    if (indice) m.indice = indice
    if (o.type === 'good' || o.type === 'bad') m.type = o.type
    if (Object.keys(m).length > 0) out.push(m)
  }
  return out
}
