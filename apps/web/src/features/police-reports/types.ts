/** Rapport du soir police (spec 2026-07-21) : en-tête modèle + lignes chatteur. */
export interface PoliceReportLine {
  id: string
  chatterId: string
  chatterName: string
  aMarche: string | null
  aRegler: string | null
}

export interface PoliceReport {
  id: string
  creatorId: string
  creatorName: string
  day: string
  ca: number
  nonTraitees: number
  absents: number
  alerte: string | null
  authorName: string | null
  lines: PoliceReportLine[]
}

/** Option de sélecteur (modèle ou chatteur). */
export interface ReportOption {
  id: string
  name: string
}
