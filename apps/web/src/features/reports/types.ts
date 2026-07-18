/** Compte rendu journalier d'une personne (1 par jour, upsert). */
export interface Report {
  id: string
  /** Jour métier `YYYY-MM-DD`. */
  day: string
  content: string
  updatedAt: string
}

/** Personne consultable via le sélecteur (le scoping par rôle est fait par la RLS de `profiles`). */
export interface ReportMember {
  id: string
  name: string
  role: string
}

/** Fenêtre glissante affichée / rédigeable (jours). Aussi la borne min du sélecteur de date. */
export const REPORT_WINDOW_DAYS = 30
