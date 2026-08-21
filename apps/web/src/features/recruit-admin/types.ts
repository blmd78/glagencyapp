import type { QiSlot } from '@glagency/core'

/**
 * Contrat domaine du versant ADMIN du test de recrutement (`/formation/recrutement`).
 *
 * Miroir exact de `recruit_candidates` / `recruit_attempts` / `recruit_messages` (0125-0126) en
 * camelCase — l'admin voit TOUT (contrairement aux types de `features/recruit-test`, qui expurgent
 * volontairement barème et seuils avant de descendre au candidat). Aucun secret ici : la page est
 * gardée par `requireAdmin()` et la RLS de ces tables est `is_admin()` en lecture seule.
 */

export const CANDIDATE_STATUSES = ['nouveau', 'valide', 'refuse'] as const
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  nouveau: 'Nouveau',
  valide: 'Validé',
  refuse: 'Refusé',
}

/**
 * Statut de la TENTATIVE technique, libellé avec prudence : `abandonnee` n'est jamais posé par
 * l'app (aucun job de nettoyage), donc `en_cours` ne veut PAS dire « quelqu'un est en train de
 * passer le test » — c'est le plus souvent un onglet fermé (cf. `recruit-test/shared.ts`).
 */
export const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  en_cours: 'commencée (jamais terminée — probablement abandonnée)',
  notee: 'notée, jamais envoyée',
  soumise: 'envoyée',
  abandonnee: 'abandonnée',
}

/**
 * Seuils COURANTS de la config, pour afficher les gates (✓/✗) à côté des mesures d'un dossier.
 * ⚠️ Un dossier ancien a été jugé avec les seuils DE SON ÉPOQUE : `passed`/`global`/`refusalReason`
 * sont figés à la soumission, seule la coloration des gates suit la config du jour.
 */
export interface RecruitGates {
  qiMin: number
  frappeMin: number
  connexionMin: number
  globalThreshold: number
}

/** Une ligne de la file des candidats (tout ce que la table affiche). */
export interface CandidateRow {
  id: string
  firstName: string
  lastName: string
  email: string
  discord: string | null
  createdAt: string
  /** Épreuves (gates cachés côté candidat). */
  qiScore: number
  typingWpm: number
  connectionMbps: number
  /** 4 axes de la conversation IA, sur 25 chacun. */
  orthographe: number
  coherence: number
  relance: number
  vente: number
  /** Total de la conversation sur 100 (somme des 4 axes). */
  botTotal: number
  /** Score global sur 100 figé à la soumission (`qi/5×30 + bot/100×70`). */
  global: number
  passed: boolean
  refusalStep: string | null
  refusalReason: string | null
  /** L'e-mail portait déjà un dossier à la soumission (2e passage, cf. blocklist). */
  repeat: boolean
  status: CandidateStatus
  /** `profile_id` non nul = un membre a été créé avec cet e-mail (rattachement Task 7). */
  isMember: boolean
}

/** Compteurs EXACTS de la file (requêtes `count` dédiées — pas dérivés des lignes bornées à 500). */
export interface RecruitKpis {
  total: number
  nouveau: number
  valide: number
  refuse: number
}

export interface CandidatesData {
  rows: CandidateRow[]
  gates: RecruitGates
  kpis: RecruitKpis
}

/** Un message de la transcription serveur (`recruit_messages`, ordre = `position`). */
export interface TranscriptMessage {
  id: string
  position: number
  speaker: 'candidat' | 'client'
  body: string
  /** Prix € d'un média verrouillé envoyé par le candidat (mécanique GLA). */
  mediaPrice: number | null
}

/** Télémétrie de la tentative — ce qui identifie le poste et ce que l'IA a coûté. */
export interface AttemptMeta {
  status: string
  persona: string
  device: string
  ip: string | null
  botReplies: number
  inputTokens: number
  outputTokens: number
  startedAt: string
}

/**
 * État de blocage d'un candidat — DEUX booléens, parce que `recruit_blocklist` mélange deux
 * choses très différentes :
 * - le blocage AUTOMATIQUE posé par `submitCandidate` à chaque soumission (device + e-mail +
 *   Discord, `created_by` null) : c'est l'anti-repasse « un seul essai », il existe pour 100 %
 *   des candidats du flux nominal — le signaler comme « bloqué » ne dirait rien ;
 * - le blocage ADMIN (`created_by` renseigné), qui ajoute l'IP et signifie « celui-là, plus
 *   jamais ». C'est LUI que la fiche affiche, et lui seul qui rend « Bloquer » inutile.
 */
export interface BlockState {
  /** Au moins une ligne matchante posée par un admin (`created_by` non null). */
  blockedByAdmin: boolean
  /** Au moins une ligne matchante, admin OU automatique — ce que « Débloquer » retirerait. */
  hasBlocklistLines: boolean
}

/** Dossier complet (`?dossier=<id>`) : la ligne + la tentative + la conversation. */
export interface CandidateFileData extends CandidateRow, BlockState {
  attempt: AttemptMeta
  messages: TranscriptMessage[]
  /**
   * Profil déclaré au formulaire de fin (0127) — `null` sur les dossiers soumis avant l'ajout
   * de ces questions (la fiche affiche « — »). Fiche uniquement : la file n'en a pas besoin.
   */
  age: number | null
  location: string | null
  phone: string | null
  shifts: string[] | null
  source: string | null
}

/**
 * Ce dont les COMMANDES de la fiche ont besoin, et rien de plus. `CandidateActions` est une
 * feuille cliente : lui passer le dossier entier ferait voyager la transcription, le device et
 * l'IP une seconde fois dans le payload RSC (déjà rendus par la fiche côté serveur).
 */
export interface CandidateCommand extends BlockState {
  id: string
  firstName: string
  lastName: string
  status: CandidateStatus
}

/** Config du test telle que l'éditeur la manipule (`recruit_config`, ligne unique). */
export interface RecruitConfigData {
  open: boolean
  botMessages: number
  qiTimer: number
  frappeMin: number
  connexionMin: number
  qiMin: number
  globalThreshold: number
  discordLink: string
  typingText: string
  qiBank: QiSlot[]
  updatedAt: string
}
