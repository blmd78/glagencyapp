import { createAdminClient } from '@glagency/db'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { CaLine } from './rate-segments'

/**
 * LE CA DE LA PÉRIODE, par (chatteur MyPuls, JOUR, modèle).
 *
 * FICHIER À PART de `compta-sources.ts` (qui atteignait le plafond de 300 lignes, CLAUDE.md), et
 * la frontière est nette : tout ce fichier est la SEULE lecture de la compta qui sorte du régime
 * RLS. Son cadrage est applicatif et tient dans un paramètre — `linked` — dont le contrat est
 * documenté ci-dessous ; l'isoler le rend relisable d'un coup d'œil.
 */

interface CcdRow {
  chatter_id: string
  creator_id: string
  date: string
  ca: number | null
}

export async function loadPeriodCa({
  linked,
  from,
  to,
}: {
  /**
   * ⚠️ LA SEULE BARRIÈRE DE CE FICHIER. Les `profiles.chatter_id` DÉJÀ renvoyés par la lecture
   * RLS de `profiles` (`compta-sources.ts`) — donc, pour un encadrant, ses rattachés directs et
   * personne d'autre. NE JAMAIS l'élargir, ni le construire depuis une autre source : le client
   * admin utilisé ci-dessous ignore toute policy.
   */
  linked: string[]
  from: string
  to: string
}): Promise<Map<string, CaLine[]>> {
  const admin = createAdminClient()

  // ── CLIENT ADMIN, CADRAGE APPLICATIF ──────────────────────────────────────────────────────
  // POURQUOI PAS SOUS RLS : `chatter_creator_daily_scoped_read` cloisonne PAR MODÈLE
  // (`profile_creators`), pas par chatteur. Un encadrant qui suit un chatteur sans être assigné
  // à TOUS les modèles sur lesquels celui-ci travaille y lit un CA AMPUTÉ — la requête ne lève
  // pas, elle renvoie moins de lignes. Mesuré sur l'UAT, plage 01–15/07/2026 : Giovani
  // 1 527,27 € réels → 97,54 € vus par Chérif (6 %) ; Benj2p 7 320,80 € → 4 728,22 € vus par
  // Marco. La base valant CA × taux, la fiche de paie affichée était fausse.
  //
  // POURQUOI PAS UNE POLICY ADDITIONNELLE (le remède retenu en 0086 pour les sanctions) : une
  // policy est par TABLE, pas par page. Elle aurait aussi élargi les quatre RPC `security
  // invoker` qui lisent cette même table (`chatters_report` 0017, `health_report` 0049,
  // `models_report` 0050, `overview_report` 0052) — arbitré le 2026-07-27 : la compta récupère
  // la valeur du chatteur, et RIEN d'autre ne bouge.
  //
  // `fetchAll` : table de faits journaliers, troncature SILENCIEUSE à 1000 lignes sinon
  // (1 426 lignes mesurées sur la seule plage 01–15/07/2026, UAT).
  const { data: ccd, error: ccdErr } = linked.length
    ? await fetchAll<CcdRow>((f, t) =>
        admin
          .from('chatter_creator_daily')
          .select('chatter_id, creator_id, date, ca')
          .in('chatter_id', linked)
          .gte('date', from)
          .lte('date', to)
          .order('chatter_id')
          .order('creator_id')
          .order('date')
          .range(f, t),
      )
    : { data: [], error: null }
  if (ccdErr) throw new Error(ccdErr.message)

  // Noms des modèles, par client ADMIN et non RLS — même motif et même cadrage que le CA
  // ci-dessus. `creators` est cloisonnée PAR MODÈLE (`creators_scoped_read`), alors que le CA
  // qu'on vient de lire couvre TOUS les modèles des rattachés : sous RLS, les modèles non
  // assignés perdaient leur nom et se fondaient tous dans une seule ligne « — » de la
  // ventilation de la fiche (3 modèles pour Chérif, 6 pour Marco — mesuré sur l'UAT).
  // Restreint aux `creator_id` DÉJÀ présents dans `ccd`, lui-même cadré sur `linked` : aucun
  // modèle supplémentaire n'en ressort.
  const creatorIds = [...new Set(ccd.map((r) => r.creator_id))]
  const { data: creators, error: creatorsErr } = creatorIds.length
    ? await admin.from('creators').select('id, name').in('id', creatorIds)
    : { data: [], error: null }
  if (creatorsErr) throw new Error(creatorsErr.message)

  // LE JOUR EST CONSERVÉ depuis 0093, et il le faut : le taux de commission change à une date
  // d'effet, donc le CA doit pouvoir être ventilé par segment de taux (`segmentsOf`).
  // L'agrégation par modèle sur toute la période, qui se faisait ici, s'est déplacée dans
  // `compta-rows.ts` — elle s'y fait SEGMENT PAR SEGMENT.
  //
  // Coût mémoire : ce sont exactement les lignes de `ccd` déjà chargées, regroupées (1 426 sur
  // la plage 01–15/07/2026, UAT). Aucune lecture supplémentaire.
  const creatorName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const caByChatter = new Map<string, CaLine[]>()
  for (const r of ccd) {
    const arr = caByChatter.get(r.chatter_id)
    const line = { date: r.date, model: creatorName.get(r.creator_id) ?? '—', ca: r.ca ?? 0 }
    if (arr) arr.push(line)
    else caByChatter.set(r.chatter_id, [line])
  }
  return caByChatter
}
