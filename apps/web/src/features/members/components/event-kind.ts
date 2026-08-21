import type { EventKind, EventOp } from '@glagency/core'
import { STATUS_COLORS } from '@/lib/status-color'

/**
 * Libellé et teinte d'un type d'événement — SOURCE UNIQUE des deux surfaces qui les affichent :
 * la table de l'onglet Activité et la timeline de la fiche membre.
 *
 * Elles vivaient en double, et l'ajout de `lien`/`identite` (0101) a dû être fait aux DEUX
 * endroits : la démonstration qu'un troisième oubli n'était qu'une question de temps.
 *
 * `Record<EventKind, …>` et non un objet libre : ajouter un `kind` sans lui donner de libellé ni
 * de teinte ne compile pas. C'est ce qui relie ce fichier au `check` SQL, via le type du domaine.
 */
export const KIND_LABEL: Record<EventKind, string> = {
  creation: 'Création',
  role: 'Rôle',
  shift: 'Shift',
  closing: 'Closing',
  modele: 'Modèle',
  manager: 'Rattachement',
  pages: 'Droits',
  nouveau: 'Nouveau',
  arrivee: 'Arrivée',
  sortie: 'Départ',
  lien: 'Lien MyPuls',
  identite: 'Fiche',
  sanction: 'Sanction',
  rapport: 'Rapport',
  recompense: 'Récompense',
}

// Code couleur de l'app, hors STATUS_COLORS : violet = modèles/lien MyPuls, orange = police —
// UNE constante par teinte (l'audit a relevé quatre littéraux bruts, deux paires identiques).
const TONE_VIOLET = 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
const TONE_ORANGE = 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'

/** Code couleur de l'app : violet pour ce qui touche aux modèles et au lien MyPuls (comme
 *  `modelColor`), orange pour la police, vert pour l'encadrement, ambre pour un départ, gris
 *  pour l'accessoire. */
export const KIND_TONE: Record<EventKind, string> = {
  creation: STATUS_COLORS.info,
  role: STATUS_COLORS.positive,
  shift: STATUS_COLORS.info,
  closing: STATUS_COLORS.info,
  modele: TONE_VIOLET,
  manager: STATUS_COLORS.positive,
  pages: STATUS_COLORS.neutral,
  nouveau: STATUS_COLORS.info,
  arrivee: STATUS_COLORS.positive,
  sortie: STATUS_COLORS.warning,
  // Le lien MyPuls décide de quel CA est attribué au membre, donc de sa paie : il mérite d'être
  // vu, pas fondu dans le gris.
  lien: TONE_VIOLET,
  identite: STATUS_COLORS.neutral,
  sanction: TONE_ORANGE,
  rapport: TONE_ORANGE,
  // Gain à la roue (0122) : une bonne nouvelle sur la fiche membre — même teinte que les autres
  // événements positifs (arrivée, rôle/rattachement).
  recompense: STATUS_COLORS.positive,
}

/** Colonne « Action » du flux d'activité — la nature de l'opération (`memberEventOp`, domaine).
 *  Vert = quelque chose apparaît, rouge = quelque chose disparaît, gris = remplacement. */
export const OP_LABEL: Record<EventOp, string> = {
  ajout: 'Ajout',
  suppression: 'Suppression',
  maj: 'Mise à jour',
}

export const OP_TONE: Record<EventOp, string> = {
  ajout: STATUS_COLORS.positive,
  suppression: STATUS_COLORS.danger,
  maj: STATUS_COLORS.neutral,
}
