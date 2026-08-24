/**
 * Vocabulaire de l'encart « Ancienne plateforme » de Ma formation.
 *
 * TROIS ÉTATS, pas deux — le troisième est celui qu'on oublie et c'est le mécanisme de reprise sur
 * incident : tant que `lastSyncAt` est `null`, l'import n'a jamais été mené à son terme, `sessions`
 * ne veut rien dire et ne doit PAS être affiché (sinon un import coupé s'annonce « repris —
 * 0 sessions », ce qui est un mensonge).
 */
export interface LegacyClaimState {
  /** Le login DANS SA CASSE D'ORIGINE — 162 des 248 logins GLA portent des majuscules. */
  loginDisplay: string
  claimedAt: string
  /** `null` = import jamais mené à son terme → « Récupération interrompue ». */
  lastSyncAt: string | null
  /** Import en cours : verrou de 5 minutes (§3.3) — le bouton est désactivé tant qu'il court. */
  syncStartedAt: string | null
  /**
   * `syncStartedAt` encore dans la fenêtre de 5 minutes, DÉCIDÉ CÔTÉ SERVEUR.
   * Le comparer à `Date.now()` dans le composant produirait un booléen différent au rendu serveur
   * et à l'hydratation dès qu'on franchit la frontière des 5 minutes entre les deux.
   */
  syncing: boolean
  sessionsCount: number
  /** Détaché par un admin : l'encart d'appel revient, l'identifiant reste réservé. */
  detachedAt: string | null
}

/** Le retour d'une réclamation ou d'une resynchronisation réussie. */
export interface LegacyClaimResult {
  /** Phrase composée côté serveur (source unique des textes de §2.3). */
  message: string
  /** Sessions reprises EN BASE — jamais le nombre de lignes qu'on a tenté d'écrire. */
  sessions: number
  newSessions: number
  cases: number
  messages: number
  loginDisplay: string
}
