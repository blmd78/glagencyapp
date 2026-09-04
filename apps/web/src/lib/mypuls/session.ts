import { createAdminClient } from '@glagency/db'

/**
 * Cookie de session MyPuls, pour les lectures « à la demande » depuis le web.
 *
 * Il vit dans `ingest_session` (migration 0109), une table en RLS deny-all : seul le
 * service-role la lit. Elle n'est pas dans les types générés, d'où le `as never`.
 *
 * LECTURE SEULE, et c'est important : `refreshCookie()` fait GLISSER le remember-me partagé
 * par toute l'ingestion. Le déclencher depuis une page web ferait tourner le token à chaque
 * consultation d'une fiche et périmerait celui que le cron nocturne a en réserve. La rotation
 * appartient au worker, à lui seul.
 */
export async function loadMypulsCookie(): Promise<string | null> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('ingest_session' as never)
    .select('cookie')
    .eq('id', 'mypuls')
    .maybeSingle()
  if (error) throw new Error(`ingest_session : ${error.message}`)
  return (data as { cookie?: string } | null)?.cookie ?? process.env.MYPULS_SESSION_COOKIE ?? null
}
