import { round1, round2 } from '@glagency/core'
import { ltvOf } from '@/lib/format'
import type { MktLinkRow } from '@/lib/types/marketing'
import type { MktLinkDailyRow } from '@/lib/services/get-mkt-links'
import type {
  CreatorRevenue,
  DailyShare,
  DailySubs,
  MktModeleRow,
  MktModelesData,
} from './types'

/** Part en %, arrondie à 0,1. `null` si le dénominateur est nul — JAMAIS 0 : « pas de base de
 *  calcul » et « part nulle » sont deux informations différentes, et les confondre fait lire
 *  une ingestion muette comme un échec commercial. */
const part = (n: number, d: number): number | null => (d > 0 ? round1((n / d) * 100) : null)

/**
 * Croise l'agrégat par modèle (RPC `mkt_creator_revenue`, 0152) avec les liens de tracking
 * de la période (`getLinkRows`). FONCTION PURE — tout le métier de la page tient ici.
 *
 * La jointure se fait par `creatorId`, jamais par nom : sous RLS `creators_scoped_read`, un
 * non-admin ne lit aucun nom de modèle et toute jointure par nom lui rendrait une page vide.
 *
 * Un lien sans modèle rattachée ne disparaît pas : il ne s'accroche à aucune bande, mais
 * compte dans les totaux d'agence — son revenu est réel.
 */
export function buildModeles(
  revenue: CreatorRevenue[],
  links: MktLinkRow[],
  daily: DailyShare[],
  periodLabel: string,
): MktModelesData {
  const byCreator = new Map<string, MktLinkRow[]>()
  for (const l of links) {
    if (!l.creatorId) continue
    byCreator.set(l.creatorId, [...(byCreator.get(l.creatorId) ?? []), l])
  }

  const modeles: MktModeleRow[] = revenue
    .map((r) => {
      const own = (byCreator.get(r.creator_id) ?? [])
        .slice()
        .sort((a, b) => b.conversions - a.conversions || b.revenueEur - a.revenueEur)
      const caLiens = round2(own.reduce((s, l) => s + l.revenueEur, 0))
      const subsLiens = own.reduce((s, l) => s + l.conversions, 0)
      return {
        creatorId: r.creator_id,
        name: r.name,
        caTotal: round2(r.ca),
        newSubs: r.new_subs,
        subsActive: r.subs_active,
        // `ltvOf` = la formule unique de l'app (lib/format), pas une division locale.
        ltv: ltvOf(r.ca, r.new_subs),
        caLiens,
        subsLiens,
        clics: own.reduce((s, l) => s + l.clicks, 0),
        partCa: part(caLiens, r.ca),
        partSubs: part(subsLiens, r.new_subs),
        links: own,
      }
    })
    .sort((a, b) => b.caTotal - a.caTotal)

  // Totaux d'agence : les liens sont sommés sur TOUS les liens (non rattachés compris),
  // le CA sur toutes les modèles rendues par la RPC.
  const caTotal = round2(revenue.reduce((s, r) => s + r.ca, 0))
  const newSubs = revenue.reduce((s, r) => s + r.new_subs, 0)
  const caLiens = round2(links.reduce((s, l) => s + l.revenueEur, 0))
  const subsLiens = links.reduce((s, l) => s + l.conversions, 0)
  const clics = links.reduce((s, l) => s + l.clicks, 0)

  return {
    period: periodLabel,
    daily,
    // Un relevé existe dès qu'une métrique bouge — un lien peut avoir des clics sans revenu.
    hasLinkData: caLiens > 0 || subsLiens > 0 || clics > 0,
    totals: {
      caTotal,
      newSubs,
      caLiens,
      subsLiens,
      clics,
      partCa: part(caLiens, caTotal),
      partSubs: part(subsLiens, newSubs),
    },
    modeles,
  }
}

/**
 * La courbe : quelle part des nouveaux abonnés de CHAQUE jour est venue d'un lien.
 *
 * Deux sources au même grain : `subs` vient de la RPC (`->'daily'`, toute l'agence),
 * `linkDaily` des lignes brutes de `mkt_link_daily` que le service lit déjà pour
 * `getLinkRows` — aucune requête supplémentaire.
 *
 * L'axe des jours est celui des ABONNÉS, pas celui des liens : un jour sans le moindre relevé
 * de lien reste sur la courbe à 0 %, ce qui est vrai. Un jour sans nouvel abonné, lui, rend
 * `part` indéfinie — d'où `null`, un trou dans la courbe, jamais un 0 qui se lirait comme un
 * effondrement.
 */
export function buildDailyShare(subs: DailySubs[], linkDaily: MktLinkDailyRow[]): DailyShare[] {
  const convByDay = new Map<string, number>()
  for (const d of linkDaily) {
    convByDay.set(d.date, (convByDay.get(d.date) ?? 0) + d.conversions)
  }
  return subs
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const subsLiens = convByDay.get(d.date) ?? 0
      return { date: d.date, newSubs: d.new_subs, subsLiens, part: part(subsLiens, d.new_subs) }
    })
}
