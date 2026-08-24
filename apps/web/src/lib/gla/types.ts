/**
 * Vocabulaire de la frontière Good Luck Agency (GLA) — l'ancienne plateforme d'entraînement dont
 * on reprend l'historique. Spec : docs/superpowers/specs/2026-08-24-formation-reprise-gla-design.md.
 *
 * TOUT ce qui vient de GLA est typé LARGEMENT (`unknown` sur les colonnes jsonb) : l'ancien serveur
 * ne borne rien — `/api/formation/boss-save` écrit `total`, `axes`, `commentaire` et `history` tels
 * que le navigateur les envoie (serveur.py:1154-1176), sans aucun clamp haut ni borne de taille.
 * C'est une ENTRÉE HOSTILE, pas un jeu de données : `transform.ts` valide et borne avant d'écrire.
 */

import type { Database } from '@glagency/db'
import type { CaseSnapshotRow } from '@/lib/training/case-snapshot'

type Tables = Database['public']['Tables']

/** Les cinq jeux de lignes que produit `transform.ts`, prêts pour un `insert` supabase-js. */
export interface LegacyRows {
  sessions: Tables['training_sessions']['Insert'][]
  threads: Tables['training_threads']['Insert'][]
  messages: LegacyMessageRow[]
  threadScores: Tables['training_thread_scores']['Insert'][]
  axisScores: Tables['training_thread_axis_scores']['Insert'][]
}
export type LegacyMessageRow = Tables['training_messages']['Insert']

/** Une session GLA écartée — jamais silencieusement : l'appelant la remonte. */
export interface LegacySkip {
  glaId: string
  reason: string
}

/**
 * Une session CONSERVÉE mais SUSPECTE (§9.7) — elle est importée telle quelle, et signalée à
 * l'admin. Ce n'est pas un rejet : `/api/formation/boss-save` n'impose aucun plafond sur `total`
 * côté GLA, donc un chiffre fabriqué y est indiscernable d'un chiffre légitime après coup. Tant que
 * `GLA_CUTOFF_MS` n'est pas posée (D3 fait autorité), l'alerte EST la contre-mesure.
 */
export interface LegacyAnomaly {
  glaId: string
  reason: string
}

export interface LegacyTransformResult {
  rows: LegacyRows
  stats: {
    /** Sessions LUES chez GLA (dénominateur du contrôle de comptage §3.9). */
    read: number
    /** Sessions effectivement transformées — c'est ce nombre qu'on retrouvera en base. */
    sessions: number
    threads: number
    messages: number
    /** Cas distincts, pour le message « 214 sessions, 68 cas, 3 812 messages ». */
    cases: number
    skipped: LegacySkip[]
    /** Sessions gardées mais à regarder (§9.7) — l'appelant les remonte en alerte admin. */
    anomalies: LegacyAnomaly[]
  }
}

/** Un compte GLA — `salt`/`pw_hash` sont `text` NULLABLES au schéma source (db.py:127-129). */
export interface GlaAccount {
  /** Le login DANS SA CASSE D'ORIGINE : c'est lui qui sert à lire les sessions (index utilisable). */
  login: string
  salt: string | null
  pwHash: string | null
}

/**
 * Une ligne de `sessions` côté GLA. `created_ms` est un `bigint` : `pg` le rend en `string` pour
 * ne pas perdre de précision — d'où l'union.
 */
export interface GlaSessionRow {
  id: string
  caseId: string | null
  module: string | null
  score: unknown
  history: unknown
  createdMs: string | number | null
  /**
   * PIÈGE : écrit avec `time.strftime` sur un serveur en UTC alors que nous calculons tout en
   * Europe/Paris — 774 sessions sur 17 260 changent de jour civil et 99 de semaine ISO. Conservé
   * ici pour le diagnostic UNIQUEMENT ; la date vient toujours de `createdMs` (§5.7).
   */
  dateLabel: string | null
}

/**
 * Le cas de NOTRE catalogue sur lequel une session GLA est reposée (jointure par `code`).
 * Étend la forme lue sur `training_cases` : le `case_snapshot` est reconstruit par
 * `buildCaseSnapshot`, la SEULE source du snapshot dans l'application.
 */
export interface LegacyCaseRow extends CaseSnapshotRow {
  id: string
  module_id: string
  kind: 'solo' | 'arena' | 'boss'
  fan_name: string | null
}

/**
 * Le catalogue d'AUJOURD'HUI, lu chez nous et passé au transformateur (qui reste pur, zéro I/O).
 * Le catalogue GLA ne peut pas dériver (`load_formation()` lit un fichier, aucune écriture
 * n'existe) et les deux sont identiques cas par cas : 80/80 codes joués existent chez nous.
 */
export interface LegacyCatalog {
  /** `training_cases.code` → le cas. */
  casesByCode: ReadonlyMap<string, LegacyCaseRow>
  /**
   * `training_modules.id` → ses axes, DANS L'ORDRE. C'est la LISTE BLANCHE du parseur de notes :
   * on lit les 4 axes du module, jamais « tout ce qui reste » dans `score`.
   *
   * Indexé par module et non par clé d'axe : `progression` et `personnalisation` existent dans DEUX
   * modules chacun — une jointure sur la seule clé rattacherait la note au mauvais module.
   */
  axesByModule: ReadonlyMap<string, readonly LegacyAxis[]>
  /** Nom du fan tel que GLA l'écrit (Kevin, Thomas, Julien, Marc, Alex) → `training_case_boss_fans.id`. */
  bossFanIds: ReadonlyMap<string, string>
}

/** Un axe de module : sa clé (celle de `score` côté GLA) et son libellé (`axis_name`, NOT NULL). */
export interface LegacyAxis {
  key: string
  name: string
}
