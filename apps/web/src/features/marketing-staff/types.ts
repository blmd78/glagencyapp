// Types / forme des props de la feature marketing-staff.

export interface MktStaffRow {
  id: string
  name: string
  role: 'va' | 'manager'
  color: string
  fixedEur: number
  rateTw: number
  rateIg: number
  bonusEur: number
  pct: number
  paymentMethod: string
  active: boolean
  /** Assignations. */
  linkIds: string[]
  igAccountIds: string[]
  /** Comptes Twitter suivis — affichage uniquement, aucun impact paye. */
  twAccountIds: string[]
  /** Paye calculée sur la période. */
  pay: {
    fixed: number
    twConversions: number
    twVariable: number
    igViews: number
    igVariable: number
    bonus: number
    pctAmount: number
    total: number
  }
  /** Paiements enregistrés sur les mois de la période. */
  paid: number
  remaining: number
}

export interface MktStaffData {
  period: string
  staff: MktStaffRow[]
  totalBudget: number
  totalPaid: number
  totalRemaining: number
  /** Revenus des liens du pôle sur la période (contexte). */
  periodRevenue: number
  /** 1er jour du mois de la période — mois de rattachement des paiements. */
  monthStart: string
  /** Options des sélecteurs d'assignation. */
  linkOptions: { id: string; name: string; type: 'twitter' | 'instagram' | 'telegram' | 'other' }[]
  igOptions: { id: string; handle: string }[]
  twOptions: { id: string; handle: string }[]
}
