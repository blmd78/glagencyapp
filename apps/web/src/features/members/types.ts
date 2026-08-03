/** Contrat de la page Membres (admin) : comptes + droits pages/modèles. */

import type { DepartureReason, EventKind, RateChange } from '@glagency/core'
import type { CrmRole, CrmShift, CrmTeam } from '@/lib/types/chatters'

/**
 * Réglages de paie d'un membre (`compta_settings` + `compta_rates` + `compta_primes`) — onglet
 * « Compta » du dialog. Les valeurs sont celles de la base, avec les DÉFAUTS quand aucune ligne
 * n'existe encore (10 %, fixe 0) : c'est exactement ce que la Compta applique de son côté
 * (`loadComptaRows`), donc l'écran ne peut pas annoncer un taux que le calcul n'utilise pas.
 */
export interface MemberPay {
  /** Le taux EN VIGUEUR AUJOURD'HUI. `fallback` = aucune ligne d'historique ne le couvre, c'est
   *  le défaut de 10 % qui s'applique — l'écran le dit, parce qu'un taux de paie que personne
   *  n'a choisi est un piège. */
  currentRate: { rate: number; fallback: boolean }
  /** Toutes les décisions de taux prises pour ce membre (`compta_rates`, 0093), par date d'effet
   *  croissante. Une augmentation passée est une information de paie : elle reste consultable. */
  rateHistory: RateChange[]
  /** Date d'effet PROPOSÉE par le formulaire — le lundi de la semaine en cours, calculé côté
   *  serveur (cf. `get-members.ts`). Proposition, jamais contrainte. */
  defaultEffectiveFrom: string
  fixedAmount: number
  /** `null` = aucune ligne `compta_primes` : le montant n'a JAMAIS été décidé. Distinct d'un
   *  montant volontairement mis à 0 (= pas de prime) — c'est la distinction que l'onglet Suivi
   *  de la Compta affiche sous « montant jamais décidé ». */
  prime: { amount: number; status: string; paidAt: string | null } | null
}

export interface Member {
  id: string
  email: string
  displayName: string
  role: 'superadmin' | 'admin' | 'manager' | 'sous-manager' | 'police' | 'chatteur'
  /** Slugs des pages autorisées (cf. PAGE_CHOICES) — vide pour un admin = tout. */
  pages: string[]
  /** Modèles assignés (profile_creators). */
  creatorIds: string[]
  /** Manager de rattachement ('' = aucun) — filtre la vue Membres d'un manager. */
  managerIds: string[]
  /** Lien « outil de travail » ('' = aucun) — affiché dans le menu utilisateur du membre. */
  workLink: string
  /** Désignation « closing » du membre (chatteur) — null = pas dans le dispositif. */
  closingRole: CrmRole | null
  closingTeam: CrmTeam | null
  /** Shift de la fiche chatteur LIÉE (chatters.shift) — null : non lié ou non renseigné. */
  shift: CrmShift | null
  /** Drapeau MANUEL « nouvel arrivant » (0101) — chatteurs uniquement, `false` pour les autres
   *  rôles (le serveur le force, comme `closing_role` et `shift`). */
  isNew: boolean
  /** Date d'arrivée réelle dans l'agence ('YYYY-MM-DD'). CONSERVÉE après retrait du drapeau :
   *  c'est la base du calcul d'ancienneté, pas un simple attribut d'affichage. */
  arrivedAt: string | null
  /** Date de sortie (0102). null = en poste. Un membre parti garde son profil, son rôle et ses
   *  assignations — seul son ACCÈS est coupé (ban GoTrue). */
  leftAt: string | null
  leftReason: DepartureReason | null
  leftNote: string | null
  /** Nom du profil qui a acté le départ — null si posé en SQL direct : l'écran affiche « — ». */
  leftByName: string | null
  /** Chatteur MyPuls lié ('' = aucun) — permet de lire le closing du membre côté Chatteurs/Spenders. */
  chatterId: string
  createdAt: string
  /** Nom du profil qui a créé le membre (0098) — null : compte trigger/antérieur → « — ». */
  createdByName: string | null
  /** L'appelant peut-il MODIFIER/SUPPRIMER cette ligne ? Calqué sur `requireEditableTarget`
   *  (`authz.ts`), calculé côté serveur dans `get-members.ts` : admin → tout ; manager →
   *  n'importe quel compte `chatteur` (0095, plus d'assignation).
   *  **Optimiste UI seulement** : la garde réelle reste `authz.ts` + la RLS. */
  editable: boolean
  /** Réglages de paie — **`undefined` pour un non-admin**, et c'est délibéré : la RLS
   *  `compta_settings_admin_write` / `compta_primes_admin_write` (0085) réserve l'écriture à
   *  l'admin. Un manager peut ouvrir ce dialog dans son périmètre : lui envoyer ces valeurs
   *  reviendrait à monter un onglet dont l'enregistrement serait refusé en base, tard et mal. */
  pay?: MemberPay
}

/** Une ligne de la timeline. `label` est déjà rédigé côté serveur : la vue ne fait que l'afficher. */
export interface MemberEvent {
  id: number
  /** ISO complet — l'affichage le formate en fuseau Paris. */
  at: string
  kind: EventKind
  /** Phrase prête à lire, ex. « Shift : Matin → Soir ». */
  label: string
  /** Nom de l'auteur, ou `null` → l'écran affiche « système » (écriture SQL directe). */
  actorName: string | null
  /** Nom du membre concerné — sert le flux global, où la liste mélange tout le monde. */
  memberName: string
  /** Rôle BRUT du membre (`profiles.role`) — rendu en badge, comme dans la table des comptes. */
  memberRole: string
}

/** Contrat de l'onglet « Turnover » (0103). Tout est déjà agrégé côté service. */
export interface TurnoverData {
  /** Bornes réelles de la fenêtre — affichées, parce qu'elles ne sont PAS « 12 derniers mois »
   *  par défaut : elles démarrent au premier mouvement connu (cf. `get-turnover.ts`). */
  from: string
  to: string
  /** Un point PAR JOUR de la période, y compris les jours sans mouvement — un jour manquant
   *  resserrerait le graphe sur les seules dates actives et ferait lire une activité continue. */
  days: { jour: string; entrees: number; sorties: number; effectif: number }[]
  reasons: { reason: string; n: number }[]
  /** Totaux de la fenêtre. */
  entries: number
  exits: number
  /** Effectif CHATTEUR à cet instant (0107) : ni les encadrants ni les partis. */
  headcount: number
  /** Sorties ÷ effectif moyen. null = effectif nul (jamais une division par zéro). */
  rate: number | null
  /** Ancienneté moyenne à la sortie, en jours — calculée sur les SEULS départs dont l'arrivée
   *  est connue. null = aucun départ mesurable. */
  tenureAvgDays: number | null
  /** Le dénominateur de la moyenne ci-dessus : combien de départs elle a réellement pu compter.
   *  Affiché À CÔTÉ d'elle — une moyenne partielle muette est un chiffre faux. */
  tenureKnown: number
}

export interface MembersData {
  members: Member[]
  /** Modèles assignables (non exclus), pour les cases à cocher. */
  creators: { id: string; name: string }[]
  /** Chatteurs MyPuls sélectionnables pour le lien (admin/superadmin). */
  chatters: { id: string; name: string }[]
}

/** Rôle posable via le dialog Membres (miroir du schéma Zod — `superadmin` jamais posé ici). */
export type Role = 'chatteur' | 'police' | 'sous-manager' | 'manager' | 'admin'

/**
 * SOURCE UNIQUE « qui est rattachable à qui » (0092 ; les ADMINS ouverts aux sous-managers le
 * 2026-07-29 : Axel et Dorian dirigent des équipes tout en étant admins — sans ça leurs
 * équipes n'avaient aucune tête de section sur le board Organisation) — la règle ne se définit qu'ici, les
 * trois couches ne font que la LIRE : le sélecteur du dialog (affichage du champ + options),
 * la validation serveur (`requireManagerTargets`) et le patch d'écriture (`managerIdsPatch`).
 * Tableau vide = ce rôle ne porte JAMAIS de rattachement.
 *
 * Depuis 0095 (décision Benoit 2026-07-29) : les CHATTEURS/police ne s'assignent plus à
 * personne — tout encadrant a accès à tous les chatteurs, selon ses pages. Seul reste le
 * rattachement sous-manager → managers (planning journalier + to-do).
 */
export const ATTACHABLE_ROLES: Record<Role, readonly string[]> = {
  chatteur: [],
  police: [],
  'sous-manager': ['manager', 'admin'],
  manager: [],
  admin: [],
}

/** Ce rôle peut-il porter un rattachement ? (dérivé de la source unique ci-dessus) */
export const canBeAttached = (role: Role) => ATTACHABLE_ROLES[role].length > 0
