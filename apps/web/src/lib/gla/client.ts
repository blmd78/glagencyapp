import 'server-only'
import { Client } from 'pg'
import { getGlaDatabaseUrl } from '@/lib/env'
import type { GlaAccount, GlaSessionRow } from './types'

/**
 * SEULE frontière avec la base Good Luck Agency (GLA). Module NEUTRE (pas de `'use server'`) : une
 * fonction qui lit `salt` / `pw_hash` ne doit jamais devenir un point d'entrée HTTP appelable depuis
 * le navigateur (patron `features/members/recruit-link.ts:8-12`, `lib/chatter-link.ts`).
 *
 * Frontière à UN SEUL FICHIER, et c'est délibéré : le jour où GLA doit mourir, on `pg_dump` les
 * deux tables utiles dans un schéma `gla_legacy` de notre propre projet et **seul ce fichier
 * change** — `transform.ts` et l'import ne bougent pas.
 *
 * Pas de repli par `@supabase/supabase-js` : lire `salt`/`pw_hash` malgré la RLS supposerait la clé
 * `service_role` de GLA, ce qui (a) rouvrirait `pw_plain` — 235 mots de passe EN CLAIR —, (b) nous
 * donnerait le droit d'écrire et de supprimer sur une base en production active, (c) ouvrirait
 * `candidates` / `blocked`, 385 lignes de données personnelles hors périmètre. Ce chemin est FERMÉ.
 */

/** Une requête doit rendre la main vite : la base d'en face sert de vrais utilisateurs. */
const STATEMENT_TIMEOUT_MS = 15_000
const CONNECT_TIMEOUT_MS = 5_000
/** Filet côté client : si le serveur ne répond pas du tout, on ne bloque pas la Server Action. */
const QUERY_TIMEOUT_MS = 20_000

/**
 * `options=-c statement_timeout=…` DANS L'URI — mais ce n'est PAS ce qui borne réellement les
 * requêtes : mesuré le 2026-08-24 contre la vraie base GLA, `pg` envoie bien le paramètre dans le
 * startup packet, et le pooler Supavisor d'en face le JETTE en silence (`SHOW statement_timeout`
 * rend `2min`). La forme URI n'est donc gardée que pour une connexion DIRECTE (5432) ; le
 * `set local` de `withGla` est celui qui mord en pooling, et c'est lui la vraie borne.
 */
function connectionString(): string {
  const url = new URL(getGlaDatabaseUrl())
  if (!url.searchParams.has('options')) {
    url.searchParams.set('options', `-c statement_timeout=${STATEMENT_TIMEOUT_MS}`)
  }
  return url.toString()
}

/**
 * Ouvre une connexion, exécute, referme — une par appel. Toute lecture se fait dans une transaction
 * `READ ONLY` : même si le rôle `gla_readonly` n'avait pas encore été posé, aucune écriture ne peut
 * partir d'ici. La connexion est TOUJOURS refermée (`finally`), y compris sur erreur.
 */
async function withGla<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: connectionString(),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    // Une base tierce : on ne présume pas de son certificat, mais on chiffre.
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    await client.query('begin transaction read only')
    // La SEULE forme de `statement_timeout` qui morde ici (§6.4 en proposait deux) : le paramètre
    // `options` de l'URI est ignoré par le pooler d'en face. `SET LOCAL` vaut pour la transaction
    // courante, donc en pooling de transaction COMME en pooling de session — sans quoi une requête
    // lente tourne 2 minutes sur la PRODUCTION GLA pendant que `query_timeout` nous a déjà rendu la
    // main à 20 s : exactement le déni de service que §6.4 existe pour fermer.
    await client.query(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
    const out = await fn(client)
    await client.query('commit')
    return out
  } finally {
    // `end()` ne lève pas si la connexion est déjà tombée ; on n'écrase jamais l'erreur d'origine.
    await client.end().catch(() => {})
  }
}

/**
 * Le compte GLA, ramené par `lower(login)` — `lower()` CÔTÉ SQL et jamais côté JS : 6 logins
 * contiennent du non-ASCII et `String.toLowerCase()` ne suit pas les mêmes règles Unicode que
 * Postgres. GLA cherche déjà ainsi (`db.py:238-242`, index fonctionnel `idx_chatters_lower_login`).
 *
 * `login` est ramené EN MÊME TEMPS que le sel et le hash, et c'est STRUCTURANT : c'est cette valeur
 * exacte qui sert ensuite à `readSessions` — un `lower(login) = …` sur `sessions` coûterait un
 * balayage complet de 57 Mo à chaque réclamation, sur une base en production (le seul index y est
 * sur la colonne BRUTE, `db.py:155`).
 *
 * `pw_plain` n'est JAMAIS lu : il est inutile à la vérification (on compare des hash) et sa lecture
 * ne ferait qu'élargir la surface de fuite.
 */
export async function readAccount(login: string): Promise<GlaAccount | null> {
  const key = login.trim()
  if (!key) return null
  return withGla(async (c) => {
    const r = await c.query<{ login: string; salt: string | null; pw_hash: string | null }>(
      'select login, salt, pw_hash from chatters where lower(login) = lower($1) limit 1',
      [key],
    )
    const row = r.rows[0]
    return row ? { login: row.login, salt: row.salt, pwHash: row.pw_hash } : null
  })
}

/**
 * Tout l'historique d'un login (D4 : rien de partiel, rien de « depuis telle date »).
 *
 * `where login = $1` sur la valeur EXACTE rendue par `readAccount` : c'est ce qui fait tenir
 * `idx_sessions_login`. Correct par construction — `storage_add_session` écrit
 * `"login": c.get("login")` (serveur.py:1055), la casse est donc identique.
 *
 * `cutoffMs` borne le corpus quand `GLA_CUTOFF_MS` est posée (§9.7) : par défaut elle ne l'est pas,
 * D3 fait autorité et la reprise suit GLA aussi longtemps que GLA vit.
 */
export async function readSessions(login: string, cutoffMs?: number | null): Promise<GlaSessionRow[]> {
  return withGla(async (c) => {
    const cut = cutoffMs != null && Number.isFinite(cutoffMs) ? cutoffMs : null
    const r = await c.query<{
      id: string
      case_id: string | null
      module: string | null
      score: unknown
      history: unknown
      created_ms: string | number | null
      date_label: string | null
    }>(
      `select id, case_id, module, score, history, created_ms, date_label
         from sessions
        where login = $1
          and ($2::bigint is null or created_ms <= $2::bigint)
        order by created_ms asc, id asc`,
      [login, cut],
    )
    return r.rows.map((s) => ({
      id: s.id,
      caseId: s.case_id,
      module: s.module,
      score: s.score,
      history: s.history,
      createdMs: s.created_ms,
      dateLabel: s.date_label,
    }))
  })
}

/**
 * Autocomplétion du login pour le filet admin (D7). Servie par une Server Action ADMIN, jamais par
 * une route publique : c'est un annuaire de 235 logins attaquables. §2.4 en fait une obligation —
 * sans elle l'admin tape à l'aveugle parmi 235 logins dont 151 portent des majuscules, et une
 * faute *plausible* rattache le mauvais historique tout en brûlant un `login_key` unique.
 */
export async function searchLogins(prefix: string, limit = 10): Promise<string[]> {
  const p = prefix.trim()
  if (!p) return []
  return withGla(async (c) => {
    const r = await c.query<{ login: string }>(
      'select login from chatters where login ilike $1 || \'%\' order by login limit $2',
      [p, Math.max(1, Math.min(50, limit))],
    )
    return r.rows.map((x) => x.login)
  })
}

/**
 * Aperçu de confirmation du chemin admin (§2.4) : l'admin valide un FAIT, pas une chaîne de
 * caractères. Sert aussi de sonde de disponibilité avant un détachement — celui-ci supprime des
 * lignes qu'on ne sait reconstruire qu'en relisant GLA, il est donc REFUSÉ si GLA est injoignable.
 */
export async function readAccountSummary(login: string): Promise<{ login: string; sessions: number; lastAt: number | null } | null> {
  const key = login.trim()
  if (!key) return null
  return withGla(async (c) => {
    const a = await c.query<{ login: string }>('select login from chatters where lower(login) = lower($1) limit 1', [key])
    const exact = a.rows[0]?.login
    if (!exact) return null
    const s = await c.query<{ n: string; last: string | null }>(
      'select count(*)::text as n, max(created_ms)::text as last from sessions where login = $1',
      [exact],
    )
    const row = s.rows[0]
    return { login: exact, sessions: Number(row?.n ?? 0), lastAt: row?.last ? Number(row.last) : null }
  })
}
