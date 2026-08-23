/**
 * XP, niveaux et rangs de la formation — la couche « jeu » par-dessus les notes. PURE, testée,
 * transposée à l'identique de l'app Good Luck Agency d'origine (`index.html`, `xpInfo` / `rangFor`
 * / `nextObjective`) pour que les chatteurs retrouvent EXACTEMENT les repères qu'ils connaissent :
 * mêmes formules, mêmes seuils, mêmes noms de rangs.
 *
 * Rien de tout ça n'est stocké : `points` et `boss_best` (calculés en base, `0113_formation`) sont
 * les seules entrées — l'XP et le niveau s'en déduisent, donc aucune migration et aucun risque de
 * désynchronisation entre le classement et la barre d'XP.
 *
 * Deux échelles distinctes, à ne pas confondre :
 *  - le **niveau** mesure le VOLUME de travail (XP cumulé) — il ne redescend jamais ;
 *  - le **rang** mesure la QUALITÉ (moyenne sur les meilleurs totaux) — il peut bouger.
 */

/** Palier fixe (GLA `var L=500`) : ~1 niveau tous les 6-7 cas, sans ralentir en fin de parcours. */
export const LEVEL_XP = 500

export type LevelInfo = {
  /** XP total accumulé. */
  xp: number
  /** Niveau atteint, à partir de 1. */
  level: number
  /** XP acquis DANS le niveau courant. */
  inLevel: number
  /** XP nécessaires pour passer le niveau suivant (= `LEVEL_XP`). */
  need: number
  /** Avancement dans le niveau courant, 0-100 (barre d'XP). */
  pct: number
}

/**
 * XP = somme des meilleures notes par cas (`training_profile_stats.points`, hors boss) + la note du
 * boss comptée DOUBLE — le boss vaut plus cher parce qu'il fait tenir 5 conversations de front.
 */
export function xpOf({ points, bossBest }: { points: number; bossBest: number | null | undefined }): number {
  return Math.max(0, points) + (bossBest ?? 0) * 2
}

/**
 * XP réellement gagnés par une session notée. Les points sont la somme des MEILLEURS totaux : une
 * session ne rapporte donc que ce qu'elle ajoute au record du cas — rejouer un cas déjà noté 80 et
 * refaire 80 ne rapporte rien, refaire 92 rapporte 12. Le boss compte double, comme dans `xpOf`.
 *
 * C'est cette valeur qu'affiche l'écran de résultat (« +12 XP ») : elle DOIT coller à ce que la
 * barre d'XP de Ma formation montrera ensuite, sinon le chiffre ment.
 */
export function xpGain({
  total,
  previousBest,
  isBoss,
}: {
  total: number | null | undefined
  /** Meilleur total des AUTRES sessions du chatter sur ce cas, `null` la première fois. */
  previousBest: number | null | undefined
  isBoss: boolean
}): number {
  if (total == null) return 0
  const delta = Math.max(0, total - (previousBest ?? 0))
  return isBoss ? delta * 2 : delta
}

export function xpLevelOf(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp))
  const inLevel = safe % LEVEL_XP
  return {
    xp: safe,
    level: Math.floor(safe / LEVEL_XP) + 1,
    inLevel,
    need: LEVEL_XP,
    pct: Math.round((inLevel / LEVEL_XP) * 100),
  }
}

export type Rank = { key: string; name: string; emoji: string; min: number }

/** Rang plancher — nommé à part pour être le repli typé de `rankOf` (jamais `RANKS[0]` indexé). */
const RECRUE: Rank = { key: 'recrue', name: 'Recrue', emoji: '🐣', min: 0 }

/** Les 5 rangs GLA, du plus bas au plus haut — `min` = moyenne requise sur les meilleurs totaux. */
export const RANKS: Rank[] = [
  RECRUE,
  { key: 'debutant', name: 'Débutant', emoji: '🎯', min: 50 },
  { key: 'confirme', name: 'Confirmé', emoji: '💪', min: 65 },
  { key: 'closer', name: 'Closer', emoji: '🔥', min: 75 },
  { key: 'elite', name: 'Closer d’élite', emoji: '👑', min: 85 },
]

/** Rang courant. Sans moyenne (aucun cas noté), on est Recrue — jamais `null` : l'en-tête affiche toujours un rang. */
export function rankOf(avgTotal: number | null | undefined): Rank {
  if (avgTotal == null) return RECRUE
  return RANKS.reduce((best, r) => (avgTotal >= r.min ? r : best), RECRUE)
}

/**
 * Palier numérique du rang (0-4) — c'est LUI qu'on mémorise pour détecter une montée de rang, pas
 * le nom : un renommage de rang ne doit pas déclencher une fausse célébration.
 */
export function rankTier(avgTotal: number | null | undefined): number {
  return RANKS.indexOf(rankOf(avgTotal))
}

/** Le rang suivant et l'écart en points de moyenne — `null` au rang max (ou sans moyenne). */
export function nextRank(avgTotal: number | null | undefined): { rank: Rank; gap: number } | null {
  if (avgTotal == null) return null
  const next = RANKS.find((r) => avgTotal < r.min)
  return next ? { rank: next, gap: Math.round(next.min - avgTotal) } : null
}

export type ObjectiveKind = 'module' | 'boss' | 'gold' | 'done'

export type NextObjective = {
  kind: ObjectiveKind
  emoji: string
  /** Surtitre ('TON PROCHAIN OBJECTIF', 'DERNIER DÉFI', …). */
  label: string
  /** La phrase affichée, déjà formatée. */
  text: string
  /** Libellé du bouton — `null` quand il n'y a plus rien à pousser. */
  cta: string | null
  /** Module vers lequel envoyer (`kind === 'module'`), sinon `null`. */
  moduleCode: string | null
}

export type ObjectiveInput = {
  /** Modules du catalogue, DANS L'ORDRE d'affichage, boss exclu. */
  modules: { code: string; title: string; emoji: string | null; done: number; total: number }[]
  bossDone: boolean
  bossUnlocked: boolean
  /** Cas validés mais notés sous le seuil Or — ce qu'il reste à perfectionner. */
  notGoldCount: number
}

/**
 * Le « prochain objectif » : une seule phrase, toujours actionnable. Cascade GLA — finir ce qui est
 * commencé, puis le boss, puis viser l'or, puis le sacre.
 *
 * Écart assumé avec GLA : quand tous les modules sont bouclés mais que le boss est encore verrouillé
 * (moyenne < 60, propre à cette app), on renvoie vers l'or plutôt que vers un boss injouable —
 * remonter ses notes est précisément ce qui le débloque.
 */
export function nextObjective({ modules, bossDone, bossUnlocked, notGoldCount }: ObjectiveInput): NextObjective {
  const started = modules.find((m) => m.total > 0 && m.done < m.total)
  if (started) {
    const left = started.total - started.done
    return {
      kind: 'module',
      emoji: started.emoji ?? '🎯',
      label: 'Ton prochain objectif',
      text: `Continue « ${started.title} » — reste ${left} cas à faire`,
      cta: 'Continuer',
      moduleCode: started.code,
    }
  }
  if (bossUnlocked && !bossDone) {
    return {
      kind: 'boss',
      emoji: '🏆',
      label: 'Dernier défi',
      text: 'Tous tes modules sont bouclés — tente le Boss final !',
      cta: 'Boss final',
      moduleCode: null,
    }
  }
  if (notGoldCount > 0) {
    return {
      kind: 'gold',
      emoji: '🥇',
      label: 'Vise l’excellence',
      text: `Rejoue tes cas notés sous 85 pour décrocher l’or partout (${notGoldCount} à améliorer)`,
      cta: 'Voir mes modules',
      moduleCode: null,
    }
  }
  return {
    kind: 'done',
    emoji: '👑',
    label: 'Légende',
    text: 'Tout est en or. Tu es au sommet 🔥',
    cta: null,
    moduleCode: null,
  }
}

/**
 * « Combo » : cas réussis d'affilée (objectif atteint) — le compteur GLA (`COMBO`), remis à zéro au
 * premier échec. Entrée : les objectifs des sessions notées du PLUS RÉCENT au plus ancien.
 *
 * Affiché à partir de 2 (`COMBO_MIN`) : annoncer « combo ×1 » à quelqu'un qui vient de réussir un
 * cas ne veut rien dire.
 */
export const COMBO_MIN = 2

export function comboOf(recentObjectives: boolean[]): number {
  let n = 0
  for (const reached of recentObjectives) {
    if (!reached) break
    n++
  }
  return n
}
