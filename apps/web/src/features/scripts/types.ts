/**
 * Contrat de la page « Scripts » (face chatteurs) : le funnel de messages d'UN modèle,
 * séquence ordonnée d'items — messages copiables, notes d'attente, avertissements,
 * titres de section. Lecture cloisonnée par la RLS (modèles assignés), édition admin.
 */

export type ScriptKind = 'section' | 'message' | 'note' | 'warn'

export interface ScriptItem {
  id: string
  creatorId: string
  position: number
  kind: ScriptKind
  /** Badge du message (« MESSAGE 8 • 10€ ») ou titre de section — vide pour les notes. */
  label: string
  body: string
}

export interface ScriptsData {
  /** Modèle affiché (null = aucun modèle accessible). */
  creatorId: string | null
  creatorName: string | null
  items: ScriptItem[]
  /** Modèles accessibles (bornés par la RLS) pour le sélecteur. */
  creators: { id: string; name: string }[]
}
