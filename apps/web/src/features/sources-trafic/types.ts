// Contrat de la page Équipe › Sources de trafic : pour chaque modèle visible, TOUTES ses sources
// (les réseaux où elle a des liens, 0172) et, quand elle existe, la note que le pôle marketing
// y a écrite (`mkt_source_notes`, 0170) — en LECTURE SEULE côté Chatteurs.

export interface SourceNoteView {
  body: string
  /** « 23 septembre 2026 » — formatée côté serveur, pour que le rendu ne dépende pas du fuseau du navigateur. */
  updatedLabel: string
}

/** Un réseau d'une modèle, avec sa note ou `null`. */
export interface SourceView {
  groupKey: string
  reseau: string
  color: string
  note: SourceNoteView | null
}

export interface ModeleSources {
  creatorId: string
  name: string
  sources: SourceView[]
}

export interface SourcesTraficData {
  /** TOUTES les modèles visibles par l'appelant, même sans source ni note. */
  modeles: ModeleSources[]
  /** Nombre de notes, pour l'en-tête. */
  notes: number
}
