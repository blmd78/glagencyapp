// DTO MyPuls (forme des données renvoyées par le CRM).

export interface ChatterRow {
  chatter: string
  ca: number
  caPpv: number
  caTips: number
  propose: number
  vendu: number
  tauxConv: number | null
  reactivite?: string
}

export interface CreatorStats {
  label: string
  creatorId?: string
  data: number[] // série quotidienne
}
