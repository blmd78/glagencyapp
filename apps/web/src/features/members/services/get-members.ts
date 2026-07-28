import { mondayOf, rateOn, todayParis, type RateChange } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getProfile } from '@/lib/auth'
import type { CrmRole, CrmTeam } from '@/lib/types/chatters'
import type { Member, MembersData } from '../types'

/** Défaut de la colonne `compta_settings.fixed_amount` (migration 0084), repris tel quel : tant
 *  qu'aucune ligne n'existe, c'est ce que la Compta calcule (`loadComptaRows`). Le défaut du
 *  TAUX, lui, vit dans `@glagency/core` (`DEFAULT_RATE`) depuis qu'il est daté (0093) — c'est le
 *  calcul qui l'applique, l'écran ne fait que l'annoncer. */
const DEFAULT_FIXED = 0

/**
 * Liste des membres + modèles assignables (page admin OU manager). La RLS filtre par
 * appelant (0054, élargie en 0087) : admin = tout, manager = lui-même + TOUT son sous-arbre
 * (ses sous-managers ET les chatteurs de ceux-ci) — mais VOIR n'est pas ÉDITER : l'écriture
 * reste bornée à ses rattachés DIRECTS (`authz.ts`, inchangée) ;
 * `creators` reste scopé aux modèles du manager — le périmètre qu'il peut assigner.
 * `chatters` (options du lien MyPuls, client admin agence-wide) n'est chargé QUE pour un
 * admin : le champ lien est admin-only (UI + serveur) et un manager ne doit pas recevoir
 * cette liste hors de son périmètre RLS dans son payload.
 *
 * MÊME RÈGLE POUR LES RÉGLAGES DE PAIE (2026-07-28) : `compta_settings` et `compta_primes` ne
 * sont lus que pour un admin. La RLS les laisse LIRE à un manager sur ses rattachés
 * (`compta_settings_read`, 0085) mais lui en refuse l'ÉCRITURE — l'onglet « Compta » n'est donc
 * pas monté pour lui, et son payload n'a aucune raison de porter ces montants.
 */
export async function getMembers(): Promise<MembersData> {
  const supabase = await createClient()
  const admin = createAdminClient()
  // Le lien chatteur est admin-only → on ne requête/expose la liste agence-wide des chatteurs QUE
  // pour un admin (getProfile est caché : déjà appelé par requireAdminOrManager dans le même rendu).
  // `caller` sert AUSSI à calculer `editable` ligne par ligne, plus bas.
  const caller = await getProfile()
  const isAdmin = caller?.role === 'admin'
  const [
    { data: profiles, error: profilesErr },
    { data: links, error: linksErr },
    { data: creators, error: creatorsErr },
    { data: chattersData, error: chattersErr },
    { data: settings, error: settingsErr },
    { data: rates, error: ratesErr },
    { data: primes, error: primesErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, display_name, role, pages, work_link, manager_id, closing_role, closing_team, chatter_id, created_at',
      )
      .order('created_at'),
    // fetchAll : cap PostgREST silencieux — `profile_creators` grossit avec les membres et leurs
    // modèles assignés. `.order('profile_id').order('creator_id')` = la PK complète (0001).
    fetchAll((f, t) =>
      supabase
        .from('profile_creators')
        .select('profile_id, creator_id')
        .order('profile_id')
        .order('creator_id')
        .range(f, t),
    ),
    // TOUS les comptes (privés inclus) : `excluded` ne concerne que les calculs (LTV,
    // quotas), pas le droit d'accès — on doit pouvoir assigner « Carla (privé) ».
    supabase.from('creators').select('id, name').order('name'),
    // fetchAll : cap PostgREST silencieux — `chatters` (MyPuls) grossit sans purge. Tri
    // d'affichage `display_name` conservé en tête, `id` (PK) en tiebreaker déterministe.
    isAdmin
      ? fetchAll((f, t) =>
          admin
            .from('chatters')
            .select('id, display_name')
            .order('display_name')
            .order('id')
            .range(f, t),
        )
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
    // Pas de `fetchAll`, et c'est borné par la CLÉ : `chatter_id` est la PK des deux tables
    // (→ au plus une ligne par membre, ~105 en prod), très loin du plafond PostgREST de 1000.
    // Même raisonnement que `compta-sources.ts`, qui lit les deux mêmes tables sans pagination.
    isAdmin
      ? supabase.from('compta_settings').select('chatter_id, fixed_amount')
      : Promise.resolve({ data: [] as { chatter_id: string; fixed_amount: number }[], error: null }),
    // L'HISTORIQUE DES TAUX (`compta_rates`, 0093). Contrairement à ses deux voisines, cette
    // table n'est PAS bornée par sa clé à une ligne par membre : elle en gagne une par
    // augmentation. `.order(...)` sur la PK complète pour un rendu stable, et une borne explicite
    // de 5 000 lignes — le plafond PostgREST par défaut est 1 000 et il tronque EN SILENCE, ce
    // qui ferait disparaître les augmentations les plus récentes de l'écran de réglage (jamais
    // du calcul : la Compta, elle, pagine avec `fetchAll`).
    isAdmin
      ? supabase
          .from('compta_rates')
          .select('chatter_id, effective_from, rate')
          .order('chatter_id')
          .order('effective_from')
          .range(0, 4999)
      : Promise.resolve({
          data: [] as { chatter_id: string; effective_from: string; rate: number }[],
          error: null,
        }),
    // TOUS les statuts, et non les seules primes `'due'` : l'onglet a besoin de l'état RÉEL
    // pour afficher une prime DÉJÀ VERSÉE en lecture seule au lieu de proposer de la réécrire
    // (`writePrime` la refuserait — mais après coup).
    isAdmin
      ? supabase.from('compta_primes').select('chatter_id, amount, status, paid_at')
      : Promise.resolve({
          data: [] as { chatter_id: string; amount: number; status: string; paid_at: string | null }[],
          error: null,
        }),
  ])
  if (profilesErr) throw new Error(profilesErr.message)
  if (linksErr) throw new Error(linksErr.message)
  if (creatorsErr) throw new Error(creatorsErr.message)
  if (chattersErr) throw new Error(chattersErr.message)
  if (settingsErr) throw new Error(settingsErr.message)
  if (ratesErr) throw new Error(ratesErr.message)
  if (primesErr) throw new Error(primesErr.message)
  const settingsById = new Map((settings ?? []).map((s) => [s.chatter_id, s]))
  const primeById = new Map((primes ?? []).map((p) => [p.chatter_id, p]))
  const ratesById = new Map<string, RateChange[]>()
  for (const r of rates ?? []) {
    const line: RateChange = { effectiveFrom: r.effective_from, rate: Number(r.rate) }
    const arr = ratesById.get(r.chatter_id)
    if (arr) arr.push(line)
    else ratesById.set(r.chatter_id, [line])
  }
  // ── LA DATE D'EFFET PROPOSÉE PAR DÉFAUT : LE LUNDI DE LA SEMAINE EN COURS ──────────────────
  // Et non le lundi de la PÉRIODE, qui était la proposition initiale. Mesuré sur la feuille de
  // juillet (période 06 → 19/07) : les 12 changements de taux prennent TOUS effet au 13/07,
  // c'est-à-dire au SECOND lundi de la période. Le lundi de période aurait proposé le 06/07 et
  // repayé la première semaine au nouveau taux — exactement le sur-paiement que cette tâche
  // corrige, réintroduit par le défaut de l'écran.
  //
  // Le lundi de la SEMAINE est aussi la plus petite rétroactivité qui garde les segments calés
  // sur les semaines, ce qui est le grain que le propriétaire lit dans son document. Le champ
  // reste libre : c'est une proposition, pas une contrainte.
  //
  // Calculée CÔTÉ SERVEUR (`todayParis`) : un `new Date()` dans le composant dépendrait de
  // l'horloge et du fuseau du poste de l'admin, sur une date qui décide de la paie.
  // UNE SEULE lecture d'horloge pour tout le rendu : deux appels séparés pourraient tomber de
  // part et d'autre de minuit et dater le taux courant d'un jour et la proposition d'un autre.
  const today = todayParis()
  const defaultEffectiveFrom = mondayOf(today)
  const byProfile = new Map<string, string[]>()
  for (const l of links ?? []) {
    const arr = byProfile.get(l.profile_id)
    if (arr) arr.push(l.creator_id)
    else byProfile.set(l.profile_id, [l.creator_id])
  }
  const members: Member[] = (profiles ?? []).map((p) => {
    const s = settingsById.get(p.id)
    const prime = primeById.get(p.id)
    return {
      id: p.id,
      email: p.email ?? '—',
      displayName: p.display_name ?? (p.email ?? '').split('@')[0] ?? '—',
      role:
        p.role === 'superadmin'
          ? 'superadmin'
          : p.role === 'admin'
            ? 'admin'
            : p.role === 'manager'
              ? 'manager'
              : p.role === 'sous-manager'
                ? 'sous-manager'
                : p.role === 'police'
                  ? 'police'
                  : 'chatteur',
      pages: p.pages ?? [],
      creatorIds: byProfile.get(p.id) ?? [],
      managerId: p.manager_id ?? '',
      workLink: p.work_link ?? '',
      closingRole: (p.closing_role ?? null) as CrmRole | null,
      closingTeam: (p.closing_team ?? null) as CrmTeam | null,
      chatterId: p.chatter_id ?? '',
      createdAt: p.created_at,
      // ── QUI EST ÉDITABLE, ET POURQUOI ÇA SE CALCULE ICI ─────────────────────────────────
      // La règle est celle de `requireEditableTarget` (`authz.ts`), recopiée telle quelle :
      // `caller.role !== 'admin' && (target.role !== 'chatteur' || target.manager_id !==
      // caller.id)` → refus. Donc admin (superadmin compris, `getProfile` les mappe tous deux
      // sur `'admin'` — la MÊME valeur que lit `authz.ts`) : tout ; manager/sous-manager :
      // uniquement un `chatteur` qu'il encadre DIRECTEMENT.
      //
      // Depuis 0087 la RLS `profiles` rend à un manager TOUT son sous-arbre, alors que
      // `authz.ts` est resté direct (à raison : voir ≠ éditer). Sans ce drapeau, la table
      // afficherait Modifier/Supprimer sur les chatteurs de ses sous-managers — des boutons
      // qui échouent à tous les coups sur « Ce membre n'est pas dans ton équipe ».
      //
      // C'est de l'OPTIMISTE UI, rien d'autre : la garde réelle reste `authz.ts` côté action
      // et la RLS côté base. Aucune décision de sécurité ne repose sur ce booléen.
      // Les deux autres refus de `requireEditableTarget` (cible superadmin, cible admin vue
      // par un non-propriétaire) restent où ils sont déjà traités — `RowActions`.
      editable: isAdmin || (p.role === 'chatteur' && p.manager_id === caller?.id),
      // `undefined` (et pas un objet aux défauts) pour un non-admin : c'est ce qui fait que
      // l'onglet n'est pas monté. Les `Number(...)` : PostgREST rend le `numeric` en chaîne.
      pay: isAdmin
        ? {
            // Le taux EN VIGUEUR AUJOURD'HUI, et `fallback` s'il n'est que le défaut : c'est ce
            // que le champ pré-remplit, et l'écran doit pouvoir dire lequel des deux il montre.
            currentRate: rateOn(today, ratesById.get(p.id) ?? []),
            rateHistory: ratesById.get(p.id) ?? [],
            defaultEffectiveFrom,
            fixedAmount: s ? Number(s.fixed_amount) : DEFAULT_FIXED,
            prime: prime
              ? { amount: Number(prime.amount), status: prime.status, paidAt: prime.paid_at }
              : null,
          }
        : undefined,
    }
  })
  const chatters = (chattersData ?? [])
    .filter((c) => c.display_name)
    .map((c) => ({ id: c.id, name: c.display_name as string }))
  return { members, creators: creators ?? [], chatters }
}
