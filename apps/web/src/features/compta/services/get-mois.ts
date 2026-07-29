import {
  mondaysOfMonth,
  monthOfPeriod,
  periodsOfMonth,
  recentPeriods,
  round2,
  todayParis,
  type PayPeriod,
} from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { loadMonthSetterPrimes } from './setter-ranking'
import type { MoisData, MoisRow } from '../types'

/**
 * RÉCAP MENSUEL — le bloc de fin de mois de la feuille du propriétaire, que l'app ne savait pas
 * produire : `Total Mois` (le CA du chatteur sur le mois), `Nbre de handoff-🤝 / Mois` et
 * `PRIME TOP15 SETTER`. La colonne `PRIME TOP3 MOIS` a été RETIRÉE le 2026-07-28 avec le
 * concept (décision de Benoit). La cinquième colonne du bloc, `PRIME D'EMBAUCHE`,
 * reste dans l'onglet Suivi : elle ne dépend d'aucun mois — une prime échue le reste jusqu'à ce
 * qu'elle soit versée.
 *
 * ── « UN MOIS », C'EST LE MOIS CIVIL ─────────────────────────────────────────────────────────
 * Les périodes de paie font 14 jours et ne s'alignent pas sur les mois (26 par an, une période
 * peut chevaucher deux mois voire deux années). Mais un agrégat qui s'appelle « Total Mois » et
 * qui se compare d'un mois sur l'autre n'a qu'une définition possible : du 1er au dernier jour du
 * mois. Toute autre borne (« les deux dernières périodes », « 28 jours glissants ») afficherait
 * sous l'étiquette « juillet » un total qui n'est pas celui de juillet, sans que rien ne le dise.
 *
 * `ca` et `handoffs` sont donc des agrégats du MOIS CIVIL. La prime setter, elle, est un
 * montant de PÉRIODE : elle est sommée sur les 2 ou 3 périodes RATTACHÉES au mois (celles
 * dont le lundi de départ y tombe, `periodsOfMonth`). Les deux grains ne couvrent pas exactement
 * les mêmes jours, et c'est irréductible : une prime versée l'a été pour une période, pas pour un
 * mois. L'écran nomme les périodes retenues plutôt que de laisser deviner.
 *
 * ── UNE SEMAINE À CHEVAL SUR DEUX MOIS N'EST JAMAIS DÉCOUPÉE ────────────────────────────────
 * Les handoffs viennent de deux saisies de grains différents, traitées chacune par sa clé :
 *  - `compta_day_entries` est clée par DATE → rattachée au mois de cette date ;
 *  - `compta_week_entries` est clée par LUNDI → rattachée au mois de ce lundi, en entier.
 * La semaine du 29/06 au 05/07 compte donc pour JUIN, ses cinq jours de juillet compris. C'est la
 * règle déjà en place un cran plus bas (« une semaine est rattachée à la période de son lundi »,
 * spec §3) : la découper au prorata inventerait des handoffs par cinquièmes que personne n'a
 * saisis, et ferait diverger ce total de celui des fiches.
 *
 * ── LE MOIS SE DÉDUIT DE LA PÉRIODE CHOISIE ──────────────────────────────────────────────────
 * `?debut=` reste le SEUL paramètre : le mois est celui du lundi de départ de la période affichée
 * (`monthOfPeriod`). Un second sélecteur aurait créé une deuxième notion de « mois d'une
 * période » pouvant contredire celle-là. Une seule règle, deux usages : l'affichage et
 * l'agrégation.
 */
export async function getMois({ debut }: { debut?: string }): Promise<MoisData> {
  const today = todayParis()
  const choices = recentPeriods(today, 12)
  // Même validation PAR APPARTENANCE que `getCompta` — jamais la seule regex ISO : une date bien
  // formée mais non alignée fabriquerait une période, donc un mois, qui n'existe pas au découpage.
  const period: PayPeriod = choices.find((p) => p.start === debut) ?? choices[0]
  const month = monthOfPeriod(period)
  const periods = periodsOfMonth(month)
  const mondays = mondaysOfMonth(month)

  const supabase = await createClient()
  const admin = createAdminClient()

  // `getProfile` est `cache()` : la page a déjà appelé `requireAccess('compta')` dans le même
  // rendu — pas de seconde requête. Même patron que `get-compta.ts` / `get-suivi.ts`.
  const profile = await getProfile()
  // Inatteignable derrière `requireAccess('compta')` — même garde que `compta-sources.ts`.
  if (!profile) throw new Error('Session expirée')
  const isAdmin = profile.role === 'admin'

  const membersQuery = supabase
    .from('profiles')
    .select('id, display_name, email, chatter_id')
    .eq('role', 'chatteur')
    .order('display_name')

  const [
    { data: members, error: membersErr },
    { data: dayEntries, error: dayErr },
    { data: weekEntries, error: weekErr },
    setterPrimes,
  ] = await Promise.all([
    // ⚠️ ANCRE DE SÉCURITÉ, comme dans `compta-sources.ts` et `get-suivi.ts` : c'est CETTE
    // lecture qui définit la population, et la lecture par client admin plus bas se cadre dessus
    // sans jamais l'élargir. Le `.contains('manager_ids', …)` RE-BORNE aux rattachés DIRECTS ce que la
    // RLS `profiles` rend transitif depuis 0087 (tout le sous-arbre) — motif complet dans
    // `compta-sources.ts` : le périmètre de PAIE reste direct, et les handoffs lus juste en
    // dessous (`compta_day/week_entries`) sont eux restés sur `manages()` direct-only, donc un
    // chatteur de sous-manager s'afficherait avec 0 handoff et une prime setter nulle.
    isAdmin ? membersQuery : membersQuery.contains('manager_ids', [profile.id]),
    // Handoffs saisis au JOUR, sous RLS : la population affichée est exactement celle que la RLS
    // laisse passer, donc aucune raison de passer par le client admin ici (contrairement au
    // classement, dont les RANGS dépendent de toute l'agence). `fetchAll` : jusqu'à 31 jours ×
    // ~96 membres = 2 976 lignes possibles, au-delà du plafond de 1000 que PostgREST applique EN
    // SILENCE. Tronqué, le total du mois serait sous-estimé sans une seule erreur.
    fetchAll<{ chatter_id: string; handoffs: number }>((f, t) =>
      supabase
        .from('compta_day_entries')
        .select('chatter_id, handoffs')
        .gte('date', month.start)
        .lte('date', month.end)
        .order('chatter_id')
        .order('date')
        .range(f, t),
    ),
    // Handoffs saisis à la SEMAINE, rattachés par leur LUNDI (jamais découpés). Au plus 5 lundis
    // dans un mois × ~96 membres = 480 lignes — sous le plafond, qui ne serait atteint qu'au-delà
    // de 200 membres. Même raisonnement que `compta-sources.ts`.
    supabase
      .from('compta_week_entries')
      .select('chatter_id, handoffs')
      .in('week_start', mondays.length ? mondays : ['1970-01-01']),
    loadMonthSetterPrimes(periods),
  ])
  if (membersErr) throw new Error(membersErr.message)
  if (dayErr) throw new Error(dayErr.message)
  if (weekErr) throw new Error(weekErr.message)

  // ── LE CA DU MOIS : CLIENT ADMIN, CADRÉ SUR `linked` ────────────────────────────────────────
  // MÊME MOTIF ET MÊME BARRIÈRE que dans `compta-sources.ts` : `chatter_creator_daily` est
  // cloisonnée PAR MODÈLE (`profile_creators`), pas par chatteur. Sous RLS, un encadrant non
  // assigné à tous les modèles d'un chatteur en lit un CA AMPUTÉ — la requête ne lève pas, elle
  // rend moins de lignes (mesuré : Giovani 1 527,27 € réels → 97,54 € vus par Chérif). Le
  // `.in('chatter_id', linked)` REMPLACE ici la RLS : `linked` ne contient que les
  // `profiles.chatter_id` déjà renvoyés par la lecture RLS ci-dessus. Ne jamais l'élargir.
  //
  // `fetchAll` : table de faits journaliers sur un mois entier — 1 426 lignes mesurées sur la
  // seule quinzaine 01–15/07, donc largement au-delà du plafond sur 31 jours.
  const linked = (members ?? []).map((m) => m.chatter_id).filter((v): v is string => v != null)
  const { data: ccd, error: ccdErr } = linked.length
    ? await fetchAll<{ chatter_id: string; ca: number | null }>((f, t) =>
        admin
          .from('chatter_creator_daily')
          .select('chatter_id, ca')
          .in('chatter_id', linked)
          .gte('date', month.start)
          .lte('date', month.end)
          .order('chatter_id')
          .order('creator_id')
          .order('date')
          .range(f, t),
      )
    : { data: [], error: null }
  if (ccdErr) throw new Error(ccdErr.message)

  const caByChatter = new Map<string, number>()
  for (const r of ccd) caByChatter.set(r.chatter_id, (caByChatter.get(r.chatter_id) ?? 0) + (r.ca ?? 0))

  const handoffsByMember = new Map<string, number>()
  for (const r of [...dayEntries, ...(weekEntries ?? [])]) {
    handoffsByMember.set(r.chatter_id, (handoffsByMember.get(r.chatter_id) ?? 0) + r.handoffs)
  }

  const all: MoisRow[] = (members ?? []).map((m) => ({
    id: m.id,
    name: m.display_name ?? m.email ?? '—',
    // `null` et non 0 pour un membre non relié : sans lien MyPuls aucun CA n'est calculable, et
    // un 0 € le ferait passer pour non rémunérable (spec §7, même règle que la fiche).
    ca: m.chatter_id ? round2(caByChatter.get(m.chatter_id) ?? 0) : null,
    handoffs: handoffsByMember.get(m.id) ?? 0,
    setterPrime: round2(setterPrimes.get(m.id) ?? 0),
  }))

  // On n'affiche que les membres qui ont VÉCU le mois, et on COMPTE les autres au lieu de les
  // faire disparaître : ~96 lignes de zéros ne se lisent pas, mais une liste amputée en silence
  // se lirait « il n'y a que ça ». Un membre non relié (ca `null`) reste affiché s'il a des
  // handoffs ou une prime — c'est justement le cas où il faut aller poser son lien.
  const rows = all.filter((r) => (r.ca ?? 0) > 0 || r.handoffs > 0 || r.setterPrime > 0)
  // CA décroissant : `Total Mois` est le chiffre de tête du bloc de la feuille.
  rows.sort((a, b) => (b.ca ?? 0) - (a.ca ?? 0) || a.name.localeCompare(b.name, 'fr'))

  return { month, periods, rows, idleCount: all.length - rows.length }
}
