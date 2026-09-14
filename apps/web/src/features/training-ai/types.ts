// Types / forme des props de la feature training-ai (Analytics IA de la Formation).

/** Fenêtre par défaut quand aucune période n'est choisie — `resolvePeriod` rend le mois en cours. */
export const AI_WINDOW_DAYS = 30

/** Une journée d'usage, telle que la rend `training_ai_daily` (0154). */
export interface AiDay {
  day: string
  /** Chatteurs DISTINCTS ayant déclenché au moins un appel ce jour-là. */
  chatters: number
  sessions: number
  fanCalls: number
  scoreCalls: number
  /** Coût estimé du jour, en dollars (prix liste). */
  usd: number
  /** Part du fan dans ce coût — l'autre part est la notation. */
  usdFan: number
  usdScore: number
  /** Appels en échec (`ok = false`). */
  failed: number
  /** 95e centile de latence : ce que vit un chatteur quand ça rame. */
  p95LatencyMs: number
}

/** Ce qu'un modèle a coûté sur la fenêtre, et s'il peut seulement utiliser le cache. */
export interface AiModelLine {
  model: string
  kind: string
  calls: number
  usd: number
  /** Tokens d'entrée moyens par appel — à comparer au seuil de cache du modèle. */
  avgInputTokens: number
  /** Part des tokens d'entrée servie par le cache, en % (0 = le cache ne prend jamais). */
  cacheHitPct: number
  /** Seuil minimal de mise en cache du modèle, en tokens. `null` = modèle inconnu. */
  cacheMinTokens: number | null
}

/** Un chatteur et ce que son entraînement a coûté sur la fenêtre. */
export interface AiChatter {
  profileId: string
  /** Pseudo Discord d'abord, nom en repli (règle 0153). */
  name: string
  activeDays: number
  sessions: number
  fanCalls: number
  scoreCalls: number
  usd: number
  /** Coût moyen d'une de ses journées d'entraînement. */
  usdPerDay: number
}

/** Un exercice et ce que son fan coûte — le grain qui dit SUR QUOI part la dépense. */
export interface AiCase {
  caseId: string
  /** Le personnage affronté (`training_cases.fan_name`). « — » pour une arène ou un boss,
   *  qui en comptent plusieurs. */
  fanName: string
  caseTitle: string
  moduleTitle: string
  kind: string
  sessions: number
  chatters: number
  fanCalls: number
  /** Tokens d'entrée du fan (facturés + lus en cache) : la TAILLE des prompts envoyés. */
  inputTokens: number
  /** Prompt moyen d'un message sur cet exercice — à comparer au seuil de cache du modèle. */
  avgPromptTokens: number
  usd: number
}

export interface AiUsageData {
  period: string
  days: AiDay[]
  models: AiModelLine[]
  /** Chatteurs triés par coût décroissant — qui dépense, et combien. */
  chatters: AiChatter[]
  /** Exercices triés par tokens consommés — la liste « par fan ». */
  cases: AiCase[]
  /** Part du coût portée par les 10 plus gros consommateurs, en %. */
  top10Pct: number
  totals: {
    usd: number
    usdPerDay: number
    fanCalls: number
    scoreCalls: number
    /** Moyenne des chatteurs actifs par jour (sur les jours où il y a eu de l'activité). */
    chattersPerDay: number
    failed: number
    /** Jours où au moins un chatteur s'est entraîné — dénominateur de `usdPerDay`. */
    activeDays: number
    /** Coût d'un mois plein au rythme des jours actifs : la trajectoire, pas le relevé. */
    projected30d: number
    /** Exercices DISTINCTS joués sur la période — « fans actifs ». */
    activeCases: number
    /** Tokens d'entrée du fan sur la période, toutes sources confondues. */
    fanInputTokens: number
  }
}
