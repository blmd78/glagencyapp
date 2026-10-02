import { createAdminClient, fetchAll } from '@glagency/db'
import { avatarOutcome, avatarTargets } from '@glagency/core'
import { BASE_URL, UA } from '@glagency/mypuls'
import { loadEnv } from './env'
import { loadCookie } from './session'

// Charge le .env racine avant tout (client Supabase).
loadEnv()

/**
 * Photos des modèles depuis MyPuls — récupération UNIQUE, pas de cron (spec 2026-10-02, partie A).
 *
 *   pnpm --filter @glagency/ingestion avatars            # les modèles sans photo
 *   pnpm --filter @glagency/ingestion avatars --force    # toutes : photos remplacées
 *
 * Session : `loadCookie()` lit `ingest_session` SANS la renouveler (le run de nuit s'en charge).
 * Une redirection vers /login arrête le script : on ne range jamais la page de connexion.
 * Cibler l'UAT = préfixer SUPABASE_URL / SUPABASE_SECRET_KEY (cf. marketing-cli.ts) ; la session
 * lue est alors celle de l'UAT, souvent périmée — l'arrêt propre le dira. `MYPULS_COOKIE_OVERRIDE`
 * (facultatif) fournit le cookie à utiliser à la place, par exemple celui de la prod pour remplir
 * l'UAT : simple lecture des photos, aucune session n'est réécrite.
 */
const BUCKET = 'creator-avatars'
const force = process.argv.includes('--force')

async function main(): Promise<void> {
  const db = createAdminClient()
  const { data, error } = await fetchAll((f, t) =>
    db.from('creators').select('id, name, mypuls_creator_id, avatar_path').order('id').range(f, t),
  )
  if (error) throw new Error(`creators : ${error.message}`)
  const targets = avatarTargets(
    data.map((c) => ({ id: c.id, name: c.name, mypulsCreatorId: c.mypuls_creator_id, avatarPath: c.avatar_path })),
    force,
  )
  console.log(
    `[avatars] ${targets.length} modèle(s) à traiter${force ? ' (--force)' : ''} → ${process.env.SUPABASE_URL ?? '(SUPABASE_URL absente)'}`,
  )
  if (!targets.length) return

  const cookie = process.env.MYPULS_COOKIE_OVERRIDE?.trim() || (await loadCookie(db))
  const done: string[] = []
  const failed: string[] = []
  for (const c of targets) {
    const r = await fetch(`${BASE_URL}/creator/${c.mypulsCreatorId}/avatar`, {
      headers: { Cookie: cookie, 'User-Agent': UA },
      redirect: 'manual',
    })
    const bytes = new Uint8Array(await r.arrayBuffer())
    const out = avatarOutcome({ status: r.status, location: r.headers.get('location'), bytes })
    if (out.kind === 'session') {
      throw new Error(`session MyPuls expirée (redirection vers /login) — ${done.length} photo(s) déjà rangée(s), rien d'autre`)
    }
    if (out.kind === 'invalid') {
      failed.push(`${c.name} (${out.reason})`)
      continue
    }
    const path = `${c.id}.${out.ext}`
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: out.mime, upsert: true })
    if (up.error) {
      failed.push(`${c.name} (envoi : ${up.error.message})`)
      continue
    }
    const { error: uErr } = await db.from('creators').update({ avatar_path: path }).eq('id', c.id)
    if (uErr) {
      failed.push(`${c.name} (fiche : ${uErr.message})`)
      continue
    }
    done.push(c.name)
  }
  console.log(`[avatars] ${done.length} photo(s) rangée(s) : ${done.join(', ') || '—'}`)
  if (failed.length) {
    console.log(`[avatars] ${failed.length} échec(s) : ${failed.join(' · ')}`)
    process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  console.error('[avatars] ÉCHEC', err instanceof Error ? err.message : err)
  process.exit(1)
})
