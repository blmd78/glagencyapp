/**
 * Contrat de l'onglet Accès — annuaire des comptes de l'équipe (repris du CRM legacy
 * gla-workflow, adapté : notre connexion est OTP par email → pas de mot de passe, et le
 * schéma n'a pas de hiérarchie manager→équipe → regroupement par rôle).
 */

export interface AccesMember {
  id: string
  name: string
  email: string
  role: 'superadmin' | 'admin' | 'manager' | 'user'
  /** Modèles assignés (profile_creators → creators.name). */
  models: string[]
  /** Lien « outil de travail » (posé dans Membres) — '' = aucun. */
  workLink: string
}

export interface AccesData {
  admins: AccesMember[]
  managers: AccesMember[]
  membres: AccesMember[]
}
