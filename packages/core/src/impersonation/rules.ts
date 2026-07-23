import { createHmac, timingSafeEqual } from 'node:crypto'
export const IMPERSONATION_ROLES = ['manager', 'sous-manager', 'police', 'chatteur'] as const
export function isImpersonatable(role: string | null | undefined): boolean {
  return role != null && (IMPERSONATION_ROLES as readonly string[]).includes(role)
}
const b64u = (s: string) => Buffer.from(s).toString('base64url')
function hmac(data: string, secret: string) { return createHmac('sha256', secret).update(data).digest('hex') }
export function signState(payload: { sid: string; exp: number }, secret: string): string {
  const body = b64u(JSON.stringify(payload))
  return `${body}.${hmac(body, secret)}`
}
export function verifyState(cookie: string | undefined, secret: string): { sid: string; exp: number } | null {
  if (!cookie || !cookie.includes('.')) return null
  const [body, sig] = cookie.split('.')
  if (!body || !sig) return null
  const expected = hmac(body, secret)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof p?.sid === 'string' && typeof p?.exp === 'number') return { sid: p.sid, exp: p.exp }
  } catch { /* falsifié */ }
  return null
}
export function isExpired(exp: number, nowMs: number): boolean { return nowMs >= exp }
