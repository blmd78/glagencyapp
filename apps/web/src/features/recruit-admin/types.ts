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
  /** Jour Paris de réception (`YYYY-MM-DD`), précalculé : clé de tri et de section de la file. */
  day: string
  /** Épreuves (gates cachés côté candidat). */
  qiScore: number
  /**
   * Nombre de questions de logique de SA tentative (`qi_total`, figé à la soumission). La banque
   * est réglable de 1 à 20 : sans ce dénominateur, un « 4 » ne voudrait plus rien dire une fois la
   * banque changée. Un dossier ancien garde donc son barème d'époque.
   */
  qiTotal: number
  typingWpm: number
  connectionMbps: number
  /** 4 axes de la conversation IA, sur 25 chacun. */
  orthographe: number
  coherence: number
  relance: number
  vente: number
  /** Total de la conversation sur 100 (somme des 4 axes). */
  botTotal: number
  /** Score global sur 100 figé à la soumission (`qi/qiTotal×30 + bot/100×70`). */
  global: number
  passed: boolean
  refusalStep: string | null
  refusalReason: string | null
  /** L'e-mail portait déjà un dossier à la soumission (2e passage, cf. blocklist). */
  repeat: boolean
  status: CandidateStatus
  /** `profile_id` non nul = un membre a été créé avec cet e-mail (rattachement Task 7). */
  isMember: boolean
  /**
   * Jour d'intégration à l'agence (`profiles.integrated_at`, 0129) — posé au PREMIER rattachement
   * à une modèle, jamais réécrit. `null` = compte créé mais encore en formation. Reprise du CRM
   * GLA (`serveur.py:1117-1123`), qui affichait la même date dans son journal des intégrations.
   */
  integratedAt: string | null
  /** Modèles auxquelles le membre est rattaché (`profile_creators`) — vide tant qu'il n'est pas intégré. */
  models: string[]
  /**
   * Profil déclaré au FORMULAIRE DE FIN (0127) — `null` sur les dossiers soumis avant l'ajout de
   * ces questions (l'affichage montre « — »). Dans la file depuis le 2026-08-25 : la modale « Ses
   * réponses » les montre sans quitter la liste.
   */
  phone: string | null
  age: number | null
  location: string | null
  shifts: string[] | null
  source: string | null
}

/**
 * L'ENTONNOIR du recrutement (compteurs `count` dédiés — pas dérivés des lignes bornées à 500).
 *
 * Remplace Total/Nouveau/Validé/Refusé le 2026-09-09 : les 195 dossiers de la base sont TOUS en
 * statut « nouveau », le workflow valider/refuser n'ayant jamais été utilisé — deux cartes
 * affichaient donc 0 en permanence. Les quatre chiffres ci-dessous existent vraiment et
 * répondent à la question posée : combien de monde on fait entrer.
 *
 * `passed` ≠ `members` À DESSEIN, et l'écart est l'information : 25 dossiers ont réussi le test
 * pour 77 comptes créés. Le test n'est pas ce qui décide qui entre, et la page doit le montrer
 * plutôt que de le lisser.
 */
export interface RecruitKpis {
  /** Dossiers reçus, tous statuts. */
  total: number
  /** Dossiers ayant passé les seuils du test (`passed`, figé à la soumission). */
  passed: number
  /** Dossiers rattachés à un compte membre (`profile_id` non nul). */
  members: number
  /** Membres issus du recrutement dont `integrated_at` tombe dans le mois courant. */
  integratedThisMonth: number
}

/**
 * Un mois d'entrées à l'agence : les candidats dont le compte a été rattaché à une modèle ce
 * mois-là (`profiles.integrated_at`, posé au PREMIER rattachement et jamais réécrit).
 *
 * C'est la seule date qui dise « il a fini sa formation et il a rejoint » : `in_training` ne
 * peut pas servir à ça — le backfill de la migration 0147 a re-marqué « en formation » 43
 * personnes déjà intégrées dont on avait retiré la modèle.
 */
export interface IntegrationMonth {
  /** `YYYY-MM`. */
  month: string
  /** « septembre 2026 ». */
  label: string
  /** Les entrées du mois, la plus récente en tête. */
  rows: CandidateRow[]
}

/**
 * Une journée de réception (jour Paris de `createdAt`) et ses dossiers, classés par note. C'est
 * l'unité de décision de l'encadrement : une session de test = une fournée de candidats à
 * comparer entre eux, jamais avec ceux d'une autre session.
 */
export interface CandidateDay {
  /** `YYYY-MM-DD` Paris. */
  day: string
  /** « mardi 25 août ». */
  label: string
  rows: CandidateRow[]
}

export interface CandidatesData {
  /** Journées de la plus récente à la plus ancienne, chacune classée par note (`byQueueOrder`). */
  days: CandidateDay[]
  /** Les entrées à l'agence, groupées par mois — onglet « Intégrations ». */
  integrations: IntegrationMonth[]
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
