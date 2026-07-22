import { createClient } from '@/lib/supabase/server'
import { getClosingByChatter } from '@/lib/services/closing-by-chatter'
import type { Period } from '@/lib/period'
import type {
  ChatterModel,
  ChatterRow,
  ChattersData,
  CrmShift,
} from '@/lib/types/chatters'

import { conv, round1, round2 } from '@/lib/format'

/** Barème de commission par défaut (10 % du CA) — à remplacer par la vraie config plus tard. */
const COM_RATE = 0.1

/** Forme brute renvoyée par le RPC `chatters_report` — sommes déjà agrégées EN BASE. */
interface Report {
  /** Agrégat tous-modèles par chatteur (chatter_daily). Vide en restreint (RLS admin-only). */
  totals: Array<{
    chatter_id: string
    ca: number | null
    ppv: number | null
    tips: number | null
    propose: number | null
    vendu: number | null
    presence_active_h: number | null
    presence_idle_h: number | null
    reactivite_avg: number | null
  }>
  /** Ventilation par (chatteur, modèle) (chatter_creator_daily, RLS = ses modèles). */
  by_creator: Array<{
    chatter_id: string
    creator_id: string
    model: string | null
    ca: number | null
    ppv: number | null
    tips: number | null
    propose: number | null
    vendu: number | null
  }>
  chatters: Array<{
    id: string
    display_name: string | null
    email: string | null
    active: boolean | null
    team: string | null
  }>
  scope: { attributed: number; messaging: number; all_accounts: number }
  ranking: { date: string; names: string[] } | null
}

/**
 * Onglet Chatteurs agrégé sur la période (datepicker du header).
 *
 * L'agrégation (GROUP BY par chatteur, par chatteur×modèle, périmètres, classement du jour)
 * est faite EN BASE par le RPC `chatters_report` (migration 0017) : un seul aller-retour qui
 * renvoie quelques centaines de lignes déjà sommées. Avant, le worker tirait ~7,5k lignes
 * brutes et sommait en JS, ce qui explosait le plafond CPU 10 ms du plan Workers Free
 * (Cloudflare « Error 1102 exceeded resources ») dès que la plage s'élargissait.
 *
 * Cloisonnement : le RPC est SECURITY INVOKER → la RLS s'applique. En restreint (rôle `user`),
 * `totals` est vide (chatter_daily admin-only) → l'agrégat chatteur se reconstruit depuis
 * `by_creator` (limité à SES modèles) ; com/proposé/présence/réactivité/scope/ranking n'existent
 * pas à ce grain → masqués à null ici.
 */
export async function getChatters(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<ChattersData> {
  const restricted = opts.restricted ?? false
  const supabase = await createClient()

  // Shift (chatters.shift, migration 0029) — hors RPC pour ne pas toucher chatters_report ;
  // lecture couverte par la policy chatters_scoped_read. Rôle/équipe closing sont gérés sur le
  // MEMBRE : lus via le helper partagé `getClosingByChatter` (source unique, cf. 0077/0079).
  const [rpcRes, crmRes, closingByChatter] = await Promise.all([
    supabase.rpc('chatters_report', { p_from: period.from, p_to: period.to }),
    supabase.from('chatters').select('id, shift'),
    getClosingByChatter(),
  ])
  if (rpcRes.error) throw new Error(rpcRes.error.message)
  if (crmRes.error) throw new Error(crmRes.error.message)
  // Le RPC est typé (nom + args) mais son retour est déclaré `Json` (types générés) →
  // on applique le contrat local par cast. `.overrideTypes<Report>` est inapplicable ici :
  // le garde de postgrest-js 2.110 distribue sur l'union Json et rejette tout override
  // (cf. docs/guidelines-data-loading.md §1). Cast du data uniquement — le nom du RPC et
  // ses arguments restent typés nativement (plus de cast forcé sur l'appel, ni de PromiseLike).
  const rep = (rpcRes.data as Report | null) ?? {
    totals: [],
    by_creator: [],
    chatters: [],
    scope: { attributed: 0, messaging: 0, all_accounts: 0 },
    ranking: null,
  }

  const chMeta = new Map(rep.chatters.map((c) => [c.id, c]))
  const crmById = new Map((crmRes.data ?? []).map((c) => [c.id, c]))

  // Agrégat chatteur (header). Non restreint : depuis `totals` (déjà 1 ligne/chatteur).
  // Restreint : `totals` vide → somme de la ventilation par modèle visible.
  const agg = new Map<
    string,
    { ca: number; ppv: number; tips: number; propose: number; vendu: number; pa: number; pi: number; react: number | null }
  >()
  if (restricted) {
    for (const r of rep.by_creator) {
      const a = agg.get(r.chatter_id) ?? { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0, pa: 0, pi: 0, react: null }
      a.ca += r.ca ?? 0
      a.ppv += r.ppv ?? 0
      a.tips += r.tips ?? 0
      a.vendu += r.vendu ?? 0
      agg.set(r.chatter_id, a)
    }
  } else {
    for (const r of rep.totals) {
      agg.set(r.chatter_id, {
        ca: r.ca ?? 0,
        ppv: r.ppv ?? 0,
        tips: r.tips ?? 0,
        propose: r.propose ?? 0,
        vendu: r.vendu ?? 0,
        pa: r.presence_active_h ?? 0,
        pi: r.presence_idle_h ?? 0,
        react: r.reactivite_avg,
      })
    }
  }

  // Ventilation par modèle (déjà 1 ligne/(chatteur, modèle) côté RPC).
  const bd = new Map<string, Map<string, { model: string | null; ca: number; ppv: number; tips: number; propose: number; vendu: number }>>()
  for (const r of rep.by_creator) {
    let m = bd.get(r.chatter_id)
    if (!m) {
      m = new Map()
      bd.set(r.chatter_id, m)
    }
    m.set(r.creator_id, {
      model: r.model,
      ca: r.ca ?? 0,
      ppv: r.ppv ?? 0,
      tips: r.tips ?? 0,
      propose: r.propose ?? 0,
      vendu: r.vendu ?? 0,
    })
  }

  const rows: ChatterRow[] = [...agg.entries()]
    .map(([id, a]) => {
      const meta = chMeta.get(id)
      const byCr = bd.get(id) ?? new Map<string, { model: string | null; ca: number; ppv: number; tips: number; propose: number; vendu: number }>()

      // Raccord avec la période filtrée : seuls les comptes qui ont rapporté de
      // l'argent apparaissent (chaque compte OF reste une ligne distincte).
      const models: ChatterModel[] = [...byCr.entries()]
        .filter(([, x]) => x.ca > 0)
        .map(([cid, x]) => ({
          creatorId: cid,
          model: x.model ?? '—',
          ca: x.ca,
          ppv: x.ppv,
          tips: x.tips,
          com: restricted ? null : round2(x.ca * COM_RATE),
          propose: x.propose,
          vendu: x.vendu,
          tauxConv: conv(x.vendu, x.propose),
        }))
        .sort((p, q) => q.ca - p.ca || p.model.localeCompare(q.model))
      const attributed = models.reduce((s, m) => s + m.ca, 0)
      return {
        id,
        name: meta?.display_name ?? '—',
        email: meta?.email ?? null,
        active: meta?.active ?? false,
        managementTeam: meta?.team ?? null,
        shift: (crmById.get(id)?.shift ?? null) as CrmShift | null,
        closingRole: closingByChatter.get(id)?.role ?? null,
        closingTeam: closingByChatter.get(id)?.team ?? null,
        ca: a.ca,
        ppv: a.ppv,
        tips: a.tips,
        com: restricted ? null : round2(a.ca * COM_RATE),
        propose: restricted ? null : a.propose,
        vendu: a.vendu,
        tauxConv: restricted ? null : conv(a.vendu, a.propose),
        presenceActiveH: restricted ? null : round1(a.pa),
        presenceIdleH: restricted ? null : round1(a.pi),
        reactiviteS: a.react != null ? Math.round(a.react) : null,
        caUnattributed: round2(a.ca - attributed),
        models,
      }
    })
    .sort((p, q) => q.ca - p.ca)

  // Périmètres emboîtés du CA sur la période (attribué ⊂ messagerie ⊂ total agence).
  // En restreint : « total agence » n'est pas visible → pas de bandeau (null).
  const scope = restricted
    ? null
    : {
        attributed: round2(rep.scope.attributed),
        messaging: round2(rep.scope.messaging),
        allAccounts: round2(rep.scope.all_accounts),
      }

  // Classement du DERNIER jour ingéré (noms seuls, export partageable). null en restreint.
  const dailyRanking = restricted ? null : rep.ranking

  return { period: period.label, chatters: rows, scope, dailyRanking }
}
