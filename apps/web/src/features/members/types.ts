/** Contrat de la page Membres (admin) : comptes + droits pages/modèles. */

import type { CrmRole, CrmTeam } from '@/lib/types/chatters'

/**
 * Réglages de paie d'un membre (`compta_settings` + `compta_primes`) — onglet « Compta » du
 * dialog. Les valeurs sont celles de la base, avec les DÉFAUTS DE COLONNE quand aucune ligne
 * n'existe encore (10 %, fixe 0) : c'est exactement ce que la Compta applique de son côté
 * (`loadComptaRows`), donc l'écran ne peut pas annoncer un taux que le calcul n'utilise pas.
 */
export interface MemberPay {
  rate: number
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
  managerId: string
  /** Lien « outil de travail » ('' = aucun) — affiché dans le menu utilisateur du membre. */
  workLink: string
  /** Désignation « closing » du membre (chatteur) — null = pas dans le dispositif. */
  closingRole: CrmRole | null
  closingTeam: CrmTeam | null
  /** Chatteur MyPuls lié ('' = aucun) — permet de lire le closing du membre côté Chatteurs/Spenders. */
  chatterId: string
  createdAt: string
  /** Réglages de paie — **`undefined` pour un non-admin**, et c'est délibéré : la RLS
   *  `compta_settings_admin_write` / `compta_primes_admin_write` (0085) réserve l'écriture à
   *  l'admin. Un manager peut ouvrir ce dialog dans son périmètre : lui envoyer ces valeurs
   *  reviendrait à monter un onglet dont l'enregistrement serait refusé en base, tard et mal. */
  pay?: MemberPay
}

export interface MembersData {
  members: Member[]
  /** Modèles assignables (non exclus), pour les cases à cocher. */
  creators: { id: string; name: string }[]
  /** Chatteurs MyPuls sélectionnables pour le lien (admin/superadmin). */
  chatters: { id: string; name: string }[]
}
