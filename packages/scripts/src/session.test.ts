import { describe, expect, it } from 'vitest'
import { ScriptsSessionError, keepScriptsSessionAlive, scriptsSessionForSend, type SessionDeps, type SessionStore } from './session'

/** Ligne `ingest_session` en mémoire. */
function store(initial: { cookie: string; refreshedAt: string } | null = null) {
  let row = initial
  const writes: string[] = []
  const s: SessionStore = {
    read: async () => row,
    write: async (cookie) => {
      writes.push(cookie)
      row = { cookie, refreshedAt: new Date().toISOString() }
    },
  }
  return { s, writes }
}
/** Réseau MyPuls factice : `valid` = cookies encore acceptés ; `rememberMeLogin` rend un cookie frais. */
function deps(valid: string[] = []) {
  const renewed: string[] = []
  const d: SessionDeps = {
    readCookie: (cookie, name) => new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie)?.[1] ?? null,
    verifySession: async (cookie) => valid.includes(cookie),
    rememberMeLogin: async (remember) => {
      renewed.push(remember)
      return { cookie: `PHPSESSID=new; REMEMBERME=${remember}+`, rememberExpiry: null }
    },
  }
  return { d, renewed }
}

describe('scriptsSessionForSend', () => {
  it('session valide → gardée telle quelle, ni renouvellement ni écriture', async () => {
    const { s, writes } = store({ cookie: 'PHPSESSID=a; REMEMBERME=r1', refreshedAt: '2026-10-07T08:00:00Z' })
    const { d, renewed } = deps(['PHPSESSID=a; REMEMBERME=r1'])
    expect(await scriptsSessionForSend(s, undefined, d)).toBe('PHPSESSID=a; REMEMBERME=r1')
    expect(renewed).toEqual([])
    expect(writes).toEqual([])
  })
  it('session morte avec REMEMBERME → renouvelée, cookie frais enregistré', async () => {
    const { s, writes } = store({ cookie: 'PHPSESSID=a; REMEMBERME=r1', refreshedAt: '2026-10-01T08:00:00Z' })
    const { d, renewed } = deps()
    expect(await scriptsSessionForSend(s, undefined, d)).toBe('PHPSESSID=new; REMEMBERME=r1+')
    expect(renewed).toEqual(['r1'])
    expect(writes).toEqual(['PHPSESSID=new; REMEMBERME=r1+'])
  })
  it('ligne vide → amorçage par la variable ; ligne présente → l’amorçage est ignoré', async () => {
    const empty = store()
    const a = deps()
    expect(await scriptsSessionForSend(empty.s, ' PHPSESSID=x; REMEMBERME=seed ', a.d)).toBe('PHPSESSID=new; REMEMBERME=seed+')
    expect(empty.writes).toEqual(['PHPSESSID=new; REMEMBERME=seed+'])

    const full = store({ cookie: 'PHPSESSID=a; REMEMBERME=r1', refreshedAt: '2026-10-07T08:00:00Z' })
    const b = deps(['PHPSESSID=a; REMEMBERME=r1'])
    expect(await scriptsSessionForSend(full.s, 'PHPSESSID=x; REMEMBERME=seed', b.d)).toBe('PHPSESSID=a; REMEMBERME=r1')
  })
  it('ligne vide et amorçage ENCORE valide → enregistré tel quel, pour que la garde de nuit le prenne en charge', async () => {
    const empty = store()
    const { d, renewed } = deps(['PHPSESSID=x; REMEMBERME=seed'])
    expect(await scriptsSessionForSend(empty.s, ' PHPSESSID=x; REMEMBERME=seed ', d)).toBe('PHPSESSID=x; REMEMBERME=seed')
    expect(renewed).toEqual([])
    expect(empty.writes).toEqual(['PHPSESSID=x; REMEMBERME=seed'])
    expect(await keepScriptsSessionAlive(empty.s, new Date(Date.now() + 13 * 3_600_000), d)).toBe('renouvelée')
  })
  it('session enregistrée irrécupérable + NOUVEL amorçage valide → l’amorçage remplace la ligne (réamorçage possible)', async () => {
    const dead = store({ cookie: 'PHPSESSID=old; REMEMBERME=expired', refreshedAt: '2026-10-01T08:00:00Z' })
    const d: SessionDeps = {
      ...deps(['PHPSESSID=fresh; REMEMBERME=new']).d,
      rememberMeLogin: async () => {
        throw new Error('rememberMeLogin : REMEMBERME refusé (302) — refournir MYPULS_SESSION_COOKIE')
      },
    }
    expect(await scriptsSessionForSend(dead.s, 'PHPSESSID=fresh; REMEMBERME=new', d)).toBe('PHPSESSID=fresh; REMEMBERME=new')
    expect(dead.writes).toEqual(['PHPSESSID=fresh; REMEMBERME=new'])
  })
  it('session irrécupérable sans nouvel amorçage → ScriptsSessionError qui nomme LA BONNE variable', async () => {
    const dead = store({ cookie: 'PHPSESSID=old; REMEMBERME=expired', refreshedAt: '2026-10-01T08:00:00Z' })
    const d: SessionDeps = {
      ...deps().d,
      rememberMeLogin: async () => {
        throw new Error('rememberMeLogin : REMEMBERME refusé (302) — refournir MYPULS_SESSION_COOKIE')
      },
    }
    const err = await scriptsSessionForSend(dead.s, 'PHPSESSID=old; REMEMBERME=expired', d).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ScriptsSessionError)
    expect((err as Error).message).toBe(
      'Session MyPuls « scripts » expirée : recolle un cookie frais dans MYPULS_SCRIPTS_SESSION_COOKIE (Vercel), puis redéploie.',
    )
    const none = await scriptsSessionForSend(store().s, undefined, deps().d).catch((e: unknown) => e)
    expect(none).toBeInstanceOf(ScriptsSessionError)
  })
  it('ni ligne ni amorçage → erreur explicite', async () => {
    await expect(scriptsSessionForSend(store().s, undefined, deps().d)).rejects.toThrow(
      'Session MyPuls « scripts » absente : colle un cookie dans MYPULS_SCRIPTS_SESSION_COOKIE (Vercel), puis redéploie.',
    )
  })
  it('session morte sans REMEMBERME → erreur explicite', async () => {
    const { s } = store({ cookie: 'PHPSESSID=a', refreshedAt: '2026-10-01T08:00:00Z' })
    await expect(scriptsSessionForSend(s, undefined, deps().d)).rejects.toThrow(
      'Session MyPuls « scripts » expirée : recolle un cookie frais dans MYPULS_SCRIPTS_SESSION_COOKIE (Vercel), puis redéploie.',
    )
  })
})

describe('keepScriptsSessionAlive', () => {
  const now = new Date('2026-10-07T23:05:00Z')
  it('ligne vide → rien (import pas encore amorcé)', async () => {
    const { d, renewed } = deps()
    expect(await keepScriptsSessionAlive(store().s, now, d)).toBe('absente')
    expect(renewed).toEqual([])
  })
  it('rafraîchie il y a moins de 12 h → rien (ne marche pas sur un import récent)', async () => {
    const { s, writes } = store({ cookie: 'PHPSESSID=a; REMEMBERME=r1', refreshedAt: '2026-10-07T20:05:00Z' })
    const { d, renewed } = deps()
    expect(await keepScriptsSessionAlive(s, now, d)).toBe('récente')
    expect(renewed).toEqual([])
    expect(writes).toEqual([])
  })
  it('rafraîchie il y a plus de 12 h → renouvelée', async () => {
    const { s, writes } = store({ cookie: 'PHPSESSID=a; REMEMBERME=r1', refreshedAt: '2026-10-07T10:05:00Z' })
    const { d, renewed } = deps()
    expect(await keepScriptsSessionAlive(s, now, d)).toBe('renouvelée')
    expect(renewed).toEqual(['r1'])
    expect(writes).toEqual(['PHPSESSID=new; REMEMBERME=r1+'])
  })
})
