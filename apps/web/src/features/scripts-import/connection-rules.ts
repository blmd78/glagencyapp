/**
 * Règles des connexions Notion (0192) — pures, testées, sans `server-only` : qui voit, qui déconnecte.
 * Appliquées par `services/notion-connection.ts`. Pas de fusion par espace : Notion donne l'accès par
 * personne (chacun coche ses pages), deux connexions au même espace ne listent pas les mêmes pages.
 */
export interface NotionConnectionView {
  /** Id de la connexion (opaque — l'id de l'espace pour les connexions d'avant 0192). */
  id: string
  workspaceId: string
  workspaceName: string
  connectedAt: string
  connectedBy: string | null
  /** Connecté par un admin : partagé avec toute l'équipe. */
  shared: boolean
  /** Connecté par la personne qui regarde. */
  mine: boolean
  /** Elle peut le déconnecter (`canDisconnect`). */
  removable: boolean
}
/** `impersonating` : un admin regarde la page « en tant que » quelqu'un — il ne voit jamais son Notion perso. */
export type Viewer = { id: string; role: string; impersonating?: boolean }

/**
 * Partagé (connecté par un admin) ou connecté par la personne elle-même — jamais le Notion perso d'un autre,
 * ni en « en tant que » : la consultation ouvre une vraie session de la cible, seul le partagé reste visible.
 */
export function canSeeConnection(row: { shared: boolean; connectedById: string | null }, viewer: Viewer): boolean {
  if (row.shared) return true
  return !viewer.impersonating && row.connectedById !== null && row.connectedById === viewer.id
}
/** Sa propre connexion ; un admin, n'importe laquelle (règle 5 du 2026-10-12). */
export function canDisconnect(row: { connectedById: string | null }, viewer: Viewer): boolean {
  return viewer.role === 'admin' || (row.connectedById !== null && row.connectedById === viewer.id)
}
