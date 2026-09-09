// Types / forme des props de la feature marketing-modeles.

import type { MktLinkRow } from '@/lib/types/marketing'

/** Une ligne de `mkt_creator_revenue(…)->'creators'` (0152) — comptes privés déjà regroupés. */
export interface CreatorRevenue {
  creator_id: string
  name: string
  ca: number
  new_subs: number
  subs_active: number
}

/** Une ligne de `mkt_creator_revenue(…)->'daily'` : les nouveaux abonnés de TOUTE l'agence ce jour. */
export interface DailySubs {
  date: string
  new_subs: number
}

/** Un point de la courbe : quelle part des abonnés de ce jour est venue d'un lien. */
export interface DailyShare {
  date: string
  newSubs: number
  subsLiens: number
  /** %, `null` si aucun nouvel abonné ce jour-là — la courbe fait un trou, elle ne tombe pas à 0. */
  part: number | null
}

/** Une modèle, ses totaux et la part venue des liens de tracking. */
export interface MktModeleRow {
  creatorId: string
  name: string
  /** Totaux de la modèle (source `creator_daily`, via RPC 0152). */
  caTotal: number
  newSubs: number
  subsActive: number
  /** € par nouvel abonné sur la période (CA total ÷ nouveaux abonnés) — `null` sans abonné.
   *  Ce que vaut un abonné chez cette modèle, toutes sources confondues. */
  ltv: number | null
  /** Attribué aux liens de tracking (source `mkt_link_daily`). */
  caLiens: number
  subsLiens: number
  clics: number
  /** Parts en %, `null` quand le dénominateur est nul (jamais 0 — cf. §4.4 de la spec). */
  partCa: number | null
  partSubs: number | null
  /** Liens de la modèle, triés par abonnés décroissants puis CA. */
  links: MktLinkRow[]
}

export interface MktModelesData {
  period: string
  /** Part des nouveaux abonnés venue des liens, jour par jour. */
  daily: DailyShare[]
  /** Y a-t-il UN relevé de lien sur la période ? `false` → état vide explicite, jamais des 0. */
  hasLinkData: boolean
  totals: {
    caTotal: number
    newSubs: number
    caLiens: number
    subsLiens: number
    clics: number
    partCa: number | null
    partSubs: number | null
  }
  modeles: MktModeleRow[]
}
