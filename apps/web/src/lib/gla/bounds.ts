/**
 * Bornes dures de l'import Good Luck Agency, et l'erreur qui arrête le lot.
 *
 * POURQUOI DES BORNES, alors que tout est mesuré. Les mesures de la spec (« total 0..98, jamais
 * hors bornes », « axes 0..25 », « 1 990 éléments, tous la même forme ») sont exactes et ne
 * prouvent RIEN sur demain : GLA écrit ce que son client lui envoie.
 * `/api/formation/boss-save` (serveur.py:1154-1176) fait confiance de bout en bout —
 * `total = int(req.get("total") or 0)` sans aucun clamp haut, `details` sans borne de taille, et
 * `history` n'est jamais bornée (d'où le message de 101 764 caractères déjà en base).
 *
 * Conséquences si on ne borne pas : `total: 999999` viole le `check` de `training_sessions.total`
 * et casse l'import ENTIER ; un `details` de 40 000 éléments déborde `position smallint` ; un `fan`
 * de 300 caractères viole `fan_name length between 1 and 30` ; une `history` de plusieurs centaines
 * de Mo fait OOM la Server Action (`transform.ts` est pur et travaille en mémoire).
 *
 * Et comme 4 mots de passe GLA sont le login lui-même, quelqu'un peut se connecter SUR GLA sous
 * l'identité d'un collègue, y poster une session poison, et faire échouer sa réclamation chez nous
 * à chaque essai, définitivement — un grief silencieux, sans aucune trace de notre côté.
 *
 * RÈGLE : un CLAMP pour ce qui est bénin (une note forgée devient une note plausible), un REJET
 * pour ce qui ne l'est pas (volume, poids, longueur absurde). Toutes les bornes sont posées TRÈS
 * au-dessus des maxima mesurés — 5 vs 5, 500 vs 64, 1 000 vs 399 : elles ne doivent jamais refuser
 * un import légitime, seulement arrêter l'absurde.
 */
export const LIMITS = {
  /** Sessions par réclamation (max mesuré : 399). */
  sessionsPerClaim: 1_000,
  /** Fils d'une session boss (mesuré : exactement 5). */
  threadsPerSession: 5,
  /** Messages d'un fil (max mesuré : 64 en boss, ~40 en solo). */
  messagesPerThread: 500,
  /** Caractères d'un corps de message — la borne SQL depuis 0123 (max mesuré : 101 764). */
  bodyChars: 200_000,
  /**
   * Poids cumulé d'un import, en caractères (≈ octets). Le relâchement de 0123 ouvre un plafond
   * PAR LIGNE sans jamais poser de plafond AGRÉGÉ : c'est ce compteur-ci qui arrête l'OOM.
   * Un import maximal réel pèse ~1,2 Mo.
   */
  importChars: 20_000_000,
  /** `training_threads.fan_name` : `check (length between 1 and 30)`. */
  fanNameChars: 30,
  /** Annotations pédagogiques par note (max mesuré : 7). */
  momentsPerScore: 50,
  /** Caractères d'un champ de moment (max mesuré : 571 sur `cite`). */
  momentChars: 2_000,
  /** `training_messages.media_price` : `check (0..10000)` depuis 0123 (max mesuré : 2 000 €). */
  mediaPriceMax: 10_000,
  /** Note d'axe de module (`training_module_axes`), barème /25. */
  axisModuleMax: 25,
  /** Note d'étape de boss (`BOSS_STEPS`), barème /100 — échelle DIFFÉRENTE de celle des axes. */
  axisBossMax: 100,
  /** `training_sessions.total` / `training_thread_scores.total` : `check (0..100)`. */
  totalMax: 100,
  /** `sessions.id` GLA : texte de 20 caractères (7 vieilles lignes en 14). */
  legacyIdChars: 64,
  /** Bornes de plausibilité de `created_ms` (epoch UTC vrai, ms). GLA a démarré le 2026-07-28. */
  minCreatedMs: Date.UTC(2020, 0, 1),
  futureToleranceMs: 24 * 3600 * 1000,
} as const

/**
 * Le lot GLA est hors bornes : l'import s'arrête AVANT la première écriture (§5.9) — une ligne hors
 * bornes découverte à la 300ᵉ session laisserait un import à moitié écrit qu'il faudrait ensuite
 * expliquer. L'appelant en fait un `BusinessError` (« Récupération impossible — un administrateur a
 * été alerté. »), une ligne dans `training_legacy_claim_attempts` et un `Sentry.captureException` :
 * jamais un 500 générique, jamais un silence.
 */
export class LegacySourceError extends Error {
  readonly code = 'LEGACY_SOURCE_INVALID'
  constructor(
    readonly reason: string,
    readonly glaId?: string,
  ) {
    super(`LEGACY_SOURCE_INVALID: ${reason}${glaId ? ` (session ${glaId})` : ''}`)
    this.name = 'LegacySourceError'
  }
}

/** Entier borné — le clamp des valeurs bénignes. Non fini / non numérique → `fallback`. */
export function clampInt(v: unknown, min: number, max: number, fallback = min): number {
  const n = typeof v === 'number' ? v : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** `number` fini, ou `null` — utilisé là où « absent » et « zéro » ne veulent PAS dire la même chose. */
export function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
