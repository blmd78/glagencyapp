/** Compte rendu journalier d'une personne (1 par jour, upsert). Ni `id` ni `updated_at` :
 *  rien ne les affiche, et l'upsert cible la clé métier `(profile_id, day)`. */
export interface Report {
  /** Jour métier `YYYY-MM-DD`. */
  day: string
  content: string
}

/** Personne consultable (le scoping hiérarchique est fait par la RLS de `profiles`). */
export interface ReportMember {
  id: string
  name: string
  role: string
}

/**
 * Une personne + SES comptes rendus. Le Dashboard en empile une par ligne, dépliable
 * (accordéon) ; le sélecteur `?membre=` reste disponible pour se restreindre à une seule
 * personne, auquel cas la page ne construit qu'une entrée et l'affiche à plat.
 */
export interface ReportEntry {
  id: string
  name: string
  /** Rôle brut, pour le suffixe du libellé — '' = soi-même (pas de suffixe). */
  role: string
  /**
   * Jours où cette personne a écrit dans la fenêtre — SANS le contenu : c'est tout ce dont la
   * ligne repliée a besoin pour son repère. Le texte, lui, est chargé à l'ouverture
   * (`loadReports`), sinon 30 jours × N encadrants partiraient dans le premier rendu.
   */
  days: string[]
  /** L'auteur peut rédiger SON CR du jour courant (hors superadmin, qui ne rédige pas). */
  canWrite: boolean
}

/** Fenêtre glissante affichée / rédigeable (jours). Aussi la borne min du sélecteur de date. */
export const REPORT_WINDOW_DAYS = 30
