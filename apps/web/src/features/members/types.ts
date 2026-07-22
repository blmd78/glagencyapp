/** Contrat de la page Membres (admin) : comptes + droits pages/modèles. */

import type { CrmRole, CrmTeam } from '@/lib/types/chatters'

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
}

export interface MembersData {
  members: Member[]
  /** Modèles assignables (non exclus), pour les cases à cocher. */
  creators: { id: string; name: string }[]
  /** Chatteurs MyPuls sélectionnables pour le lien (admin/superadmin). */
  chatters: { id: string; name: string }[]
}
