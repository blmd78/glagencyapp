// Signature HMAC du cookie d'état d'impersonation (server-only : dépend de node:crypto).
// EXPRÈS hors du barrel `index.ts` (qui reste « domaine pur ») → un composant client qui
// importe `isImpersonatable`/`isExpired` depuis @glagency/core ne tire jamais node:crypto.
// Consommé uniquement côté serveur via le subpath `@glagency/core/impersonation/cookie-sign`.
import { createHmac, timingSafeEqual } from 'node:crypto'

const b64u = (s: string) => Buffer.from(s).toString('base64url')
function hmac(data: string, secret: string) {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signState(payload: { sid: string; exp: number }, secret: string): string {
  const body = b64u(JSON.stringify(payload))
  return `${body}.${hmac(body, secret)}`
}

export function verifyState(
  cookie: string | undefined,
  secret: string,
): { sid: string; exp: number } | null {
  if (!cookie || !cookie.includes('.')) return null
  const [body, sig] = cookie.split('.')
  if (!body || !sig) return null
  const expected = hmac(body, secret)
  const a = Buffer.from(sig),
    b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof p?.sid === 'string' && typeof p?.exp === 'number') return { sid: p.sid, exp: p.exp }
  } catch {
    /* falsifié */
  }
  return null
}
