/**
 * ÉVÉNEMENTS DE VIE D'UN MEMBRE — vocabulaire et rédaction (0101).
 *
 * Dans le domaine et pas dans `apps/web` pour une raison simple : `apps/web` n'a pas de Vitest,
 * et cette rédaction contient du PARSING (la valeur composite d'une sortie) plus une dizaine de
 * branches. Non testée, une erreur y serait invisible — le libellé serait faux à l'écran sans que
 * rien ne casse.
 *
 * Le projet met déjà ses libellés français ici (`frDayShort`, `frMonthLong`, `frWeekdayLong`) :
 * la place est cohérente.
 *
 * SOURCE UNIQUE des motifs de sortie, miroir du `check` SQL `profiles_left_reason` (0102) — toute
 * valeur ajoutée en base doit l'être ici aussi.
 */

import { ERROR_LABEL } from './police-errors'

/**
 * `initiative` — QUI a décidé du départ. C'est la lecture utile d'un turnover : un départ décidé
 * par l'agence interroge le recrutement, un départ subi interroge les conditions de travail. Sans
 * cette distinction, un taux de 20 % ne dit pas s'il faut mieux recruter ou mieux retenir.
 */
export const DEPARTURE_REASONS = [
  { value: 'vire', label: 'Viré', initiative: 'agence' },
  { value: 'demission', label: 'Démission', initiative: 'chatteur' },
  { value: 'fin_essai', label: "Fin de période d'essai", initiative: 'agence' },
  // « Abandon de poste » est un motif À PART et pas un cas de démission : le chatteur disparaît
  // sans prévenir, c'est fréquent en agence, et le confondre avec un départ annoncé fausserait la
  // lecture du turnover — c'est justement la distinction qu'on cherche à mesurer.
  { value: 'abandon', label: 'Abandon de poste', initiative: 'chatteur' },
  { value: 'autre', label: 'Autre', initiative: 'autre' },
] as const

export type DepartureReason = (typeof DEPARTURE_REASONS)[number]['value']

export const DEPARTURE_LABEL = Object.fromEntries(
  DEPARTURE_REASONS.map((r) => [r.value, r.label]),
) as Record<DepartureReason, string>

/** Qui a décidé : `agence` (viré, fin d'essai), `chatteur` (démission, abandon), ou `autre`. */
export type DepartureInitiative = (typeof DEPARTURE_REASONS)[number]['initiative']

export const DEPARTURE_INITIATIVE = Object.fromEntries(
  DEPARTURE_REASONS.map((r) => [r.value, r.initiative]),
) as Record<DepartureReason, DepartureInitiative>

export const INITIATIVE_LABEL: Record<DepartureInitiative, string> = {
  agence: 'Décidés par l’agence',
  chatteur: 'À l’initiative du chatteur',
  autre: 'Autres',
}

/** Types d'événement — miroir du `check` SQL `member_events.kind` (0101, élargi en 0107). */
export const EVENT_KINDS = [
  'creation',
  'role',
  'shift',
  'closing',
  'modele',
  'manager',
  'pages',
  'nouveau',
  'arrivee',
  'sortie',
  'lien',
  'identite',
  // Sanction du Tracker RETIRÉE (trigger delete 0106) — la pose, elle, se lit dans le Tracker.
  'sanction',
  // Rapport du soir SUPPRIMÉ par son auteur (trigger delete 0107) — posé sur SA timeline.
  'rapport',
] as const

export type EventKind = (typeof EVENT_KINDS)[number]

export const isEventKind = (v: string): v is EventKind =>
  (EVENT_KINDS as readonly string[]).includes(v)

/** Nature de l'opération d'un événement — colonne « Action » du flux d'activité. */
export type EventOp = 'ajout' | 'suppression' | 'maj'

/**
 * Déduite de la FORME (from, to), sans table de cas par kind : une valeur qui apparaît est un
 * ajout, une valeur qui disparaît une suppression, un remplacement une mise à jour. La lecture
 * tient partout — « Départ le … » est l'AJOUT d'une date de sortie, son annulation la retire,
 * une sanction journalisée (0106) n'a qu'un `from` : suppression. (from, to) tous deux vides
 * n'est produit par aucun trigger — repli sur « maj », le moins affirmatif des trois.
 */
export function memberEventOp(from: string | null, to: string | null): EventOp {
  if (from === null && to !== null) return 'ajout'
  if (from !== null && to === null) return 'suppression'
  return 'maj'
}

// DUPLICATION CONNUE ET TOLÉRÉE : `member-closing-fields.tsx` porte les mêmes trois libellés pour
// le sélecteur du formulaire. Les unifier imposerait de descendre `CrmShift`
// (`apps/web/src/lib/types/chatters.ts`) dans le domaine — un déplacement qui touche du code sans
// rapport avec l'historique. Trois libellés stables depuis 0029 : le coût d'un drift est nul
// devant celui du refactor. À reprendre le jour où un quatrième shift apparaît.
const SHIFT_LABEL: Record<string, string> = { matin: 'Matin', aprem: 'Après-midi', soir: 'Soir' }
const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Propriétaire',
  admin: 'Admin',
  manager: 'Manager',
  'sous-manager': 'Sous-manager',
  police: 'Police',
  chatteur: 'Chatteur',
}

/** '2026-07-30' → '30/07/2026'. */
const fr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/** Traduit une valeur brute si on la connaît, la rend telle quelle sinon — une valeur inconnue
 *  (contrainte élargie en base sans passer ici) doit s'afficher, pas disparaître. */
const pretty = (dict: Record<string, string>, v: string | null) => (v ? (dict[v] ?? v) : null)

const arrow = (label: string, f: string | null, t: string | null) =>
  f && t ? `${label} : ${f} → ${t}` : t ? `${label} : ${t}` : `${label} retiré${f ? ` (${f})` : ''}`

/**
 * Phrase prête à lire pour un événement. Rédigée UNE fois côté serveur : la fiche membre et le
 * flux d'activité l'affichent telle quelle, sans logique dupliquée qui divergerait au premier
 * `kind` ajouté.
 *
 * Une flèche `a → b` quand les deux bornes existent ; sinon la formulation nomme l'ajout ou le
 * retrait, parce que « Modèle : → Emma » ne se lit pas.
 */
export function memberEventLabel(kind: EventKind, from: string | null, to: string | null): string {
  switch (kind) {
    case 'creation':
      return `Compte créé${to ? ` (${pretty(ROLE_LABEL, to)})` : ''}`
    case 'role':
      return arrow('Rôle', pretty(ROLE_LABEL, from), pretty(ROLE_LABEL, to))
    case 'shift':
      return arrow('Shift', pretty(SHIFT_LABEL, from), pretty(SHIFT_LABEL, to))
    case 'closing':
      return arrow('Closing', from, to)
    // Les deux sens sont des faits distincts, et se lisent mieux nommés qu'avec une flèche vide.
    case 'modele':
      return to ? `Modèle ${to} ajouté` : `Modèle ${from} retiré`
    case 'manager':
      return arrow('Rattachement', from, to)
    case 'pages':
      return `Droits modifiés (${from ?? '0'} → ${to ?? '0'} pages)`
    case 'nouveau':
      return to === 'true' ? 'Marqué nouvel arrivant' : 'Drapeau « nouvel arrivant » retiré'
    case 'arrivee':
      return to ? `Date d’arrivée : ${fr(to)}` : 'Date d’arrivée effacée'
    // Le lien MyPuls : c'est lui qui attribue le CA, donc la paie. Le délier n'est pas un détail.
    case 'lien':
      return from && to
        ? `Lien MyPuls : ${from} → ${to}`
        : to
          ? `Lié à la fiche MyPuls ${to}`
          : `Lien MyPuls retiré${from ? ` (${from})` : ''}`
    // Nom, email ou lien de travail — un seul kind, cf. 0101 : ils décrivent la même chose.
    case 'identite':
      return arrow('Fiche', from, to)
    case 'sanction': {
      // `from` = '2026-08-06 (malus 25 € — media_argent)' ou '2026-08-06 (avertissement — clé)',
      // composé par le trigger 0107 (clé BRUTE : le SQL ne connaît pas les libellés — c'est ici
      // qu'elle devient lisible, via ERROR_LABEL). Même doctrine que `sortie` : parsing par
      // REGEX, forme inattendue → valeur brute, imparfaite mais jamais trompeuse.
      if (!from) return 'Sanction retirée'
      const m = /^(\d{4}-\d{2}-\d{2})\s+\((malus [^—)]+€|avertissement)(?:\s+—\s+(.+))?\)$/.exec(from)
      const [, date, detail, errKey] = m ?? []
      if (!date) return `Sanction retirée (${from})`
      const err = errKey ? (ERROR_LABEL[errKey] ?? errKey) : null
      return `Sanction du ${fr(date)} retirée (${detail}${err ? ` — ${err}` : ''})`
    }
    case 'rapport': {
      // `from` = '2026-08-03 (Julie)', composé par le trigger 0107 (nom du modèle résolu en
      // base au moment de la suppression). Même doctrine que `sortie` : parsing par REGEX,
      // forme inattendue → valeur brute, imparfaite mais jamais trompeuse.
      if (!from) return 'Rapport du soir supprimé'
      const m = /^(\d{4}-\d{2}-\d{2})\s+\((.+)\)$/.exec(from)
      const [, date, modele] = m ?? []
      if (!date) return `Rapport du soir supprimé (${from})`
      return `Rapport du soir du ${fr(date)} supprimé (${modele})`
    }
    case 'sortie': {
      if (!to) return 'Départ annulé (réactivé)'
      // `to` = '2026-08-15 (vire)', composé par le trigger. Parsé par REGEX et non par index : un
      // `slice(12, -1)` produirait un libellé faux et SILENCIEUX au moindre changement de format
      // côté SQL. Forme inattendue → on affiche la valeur brute, visiblement imparfaite mais
      // jamais trompeuse.
      const m = /^(\d{4}-\d{2}-\d{2})(?:\s+\((.+)\))?$/.exec(to)
      const [, date, rawMotif] = m ?? []
      if (!date) return `Départ : ${to}`
      const motif = rawMotif ? (DEPARTURE_LABEL[rawMotif as DepartureReason] ?? rawMotif) : null
      return `Départ le ${fr(date)}${motif ? ` — ${motif}` : ''}`
    }
  }
}
