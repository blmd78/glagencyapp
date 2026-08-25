/**
 * Règles de la liste blanche. Le tracker les lisait dans `config/rules.json` ; ici elles viennent
 * de la table `tracker_rules` (une ligne). Ce module ne fait que NORMALISER et TESTER — il ne
 * charge rien.
 */

export interface RawRules {
  offTaskThresholdMinutes?: number | null
  stagnantThresholdMinutes?: number | null
  mainTool?: string | null
  toolMinMinutes?: number | null
  latenessMaxMinutes?: number | null
  apps?: readonly string[] | null
  domains?: readonly string[] | null
}

export interface TrackerRules {
  /** Au-delà, le hors-tâche déclenche un signalement. */
  offTaskThresholdMinutes: number
  /** Plage active continue sans le moindre changement de fenêtre → écran figé. */
  stagnantThresholdMinutes: number
  /** Outil de chat principal : le temps passé dessus sert de référence. */
  mainTool: string
  /** En dessous de ce temps sur l'outil principal → volet Inactivité. */
  toolMinMinutes: number
  /** Premier pointage plus tard que N min après le début du créneau → Retard. */
  latenessMaxMinutes: number
  apps: Set<string>
  domains: string[]
}

// Le type se dérive de `TrackerRules` (déjà normalisé, sans `null`) et NON de `RawRules` :
// `Required<T>` retire le `?` mais CONSERVE le `| null`, donc `Required<Omit<RawRules, …>>`
// laisserait `number | null` et `num(v, fallback: number)` ne compilerait pas.
export const DEFAULT_RULES: Omit<TrackerRules, 'apps' | 'domains'> & {
  apps: string[]
  domains: string[]
} = {
  offTaskThresholdMinutes: 30,
  stagnantThresholdMinutes: 60,
  mainTool: 'mypuls.app',
  toolMinMinutes: 330, // 5 h 30
  latenessMaxMinutes: 10,
  apps: ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'discord', 'slack', 'telegram'],
  domains: ['mypuls.app', 'onlyfans.com', 'fansly.com', 'fanvue.com', 'discord.com', 'telegram.org'],
}

const list = (arr: readonly string[] | null | undefined, fallback: string[]): string[] =>
  (Array.isArray(arr) ? arr : fallback).map((s) => String(s).toLowerCase().trim()).filter(Boolean)

const num = (v: number | null | undefined, fallback: number): number =>
  Number.isFinite(Number(v)) ? Number(v) : fallback

export function normalizeRules(raw: RawRules = {}): TrackerRules {
  return {
    offTaskThresholdMinutes: num(raw.offTaskThresholdMinutes, DEFAULT_RULES.offTaskThresholdMinutes),
    stagnantThresholdMinutes: num(raw.stagnantThresholdMinutes, DEFAULT_RULES.stagnantThresholdMinutes),
    mainTool: String(raw.mainTool ?? DEFAULT_RULES.mainTool).toLowerCase().trim(),
    toolMinMinutes: num(raw.toolMinMinutes, DEFAULT_RULES.toolMinMinutes),
    latenessMaxMinutes: num(raw.latenessMaxMinutes, DEFAULT_RULES.latenessMaxMinutes),
    // Les navigateurs sont dans la liste des apps : quand l'URL n'est pas lisible, le temps
    // navigateur est mis au CRÉDIT du chatter plutôt que compté hors tâche.
    apps: new Set(list(raw.apps, DEFAULT_RULES.apps).map((a) => a.replace(/\.exe$/, ''))),
    domains: list(raw.domains, DEFAULT_RULES.domains),
  }
}

/** Un domaine est autorisé si lui-même ou un de ses parents est en liste blanche. */
export const isAllowedDomain = (host: string, rules: TrackerRules): boolean => {
  const h = String(host).toLowerCase()
  return rules.domains.some((d) => h === d || h.endsWith(`.${d}`))
}

export const isAllowedApp = (proc: string, rules: TrackerRules): boolean =>
  rules.apps.has(String(proc).toLowerCase().replace(/\.exe$/, ''))
