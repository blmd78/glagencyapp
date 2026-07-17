import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

/** Tags invalidables de l'extérieur — liste FERMÉE (pas de revalidation arbitraire). */
const ALLOWED_TAGS = ['facts-daily'] as const

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Appelé par apps/ingestion en fin de run : expire les caches `use cache` taggés
 * (profil 'max' = stale-while-revalidate, non bloquant). Secret partagé en header
 * (pas en query — les query params fuitent dans les logs), comparé en timing-safe.
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const got = req.headers.get('x-revalidate-secret')
  if (!secret || !got || !safeEqual(got, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as { tags?: unknown } | null
  const asked = Array.isArray(body?.tags) ? body.tags.filter((t) => typeof t === 'string') : []
  const tags = asked.filter((t): t is (typeof ALLOWED_TAGS)[number] =>
    (ALLOWED_TAGS as readonly string[]).includes(t),
  )
  if (tags.length === 0) return NextResponse.json({ error: 'no valid tags' }, { status: 400 })
  for (const tag of tags) revalidateTag(tag, 'max')
  return NextResponse.json({ revalidated: tags })
}
