/** Contrat de la page Membres (admin) : comptes + droits pages/modèles. */

export interface Member {
  id: string
  email: string
  displayName: string
  role: 'superadmin' | 'admin' | 'manager' | 'user'
  /** Slugs des pages autorisées (cf. PAGE_CHOICES) — vide pour un admin = tout. */
  pages: string[]
  /** Modèles assignés (profile_creators). */
  creatorIds: string[]
  /** Manager de rattachement ('' = aucun) — filtre la vue Membres d'un manager. */
  managerId: string
  /** Lien « outil de travail » ('' = aucun) — affiché dans le menu utilisateur du membre. */
  workLink: string
  createdAt: string
}

export interface MembersData {
  members: Member[]
  /** Modèles assignables (non exclus), pour les cases à cocher. */
  creators: { id: string; name: string }[]
}
