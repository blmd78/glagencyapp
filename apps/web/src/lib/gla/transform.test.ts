import { describe, expect, it } from 'vitest'
import { LegacySourceError } from './bounds'
import {
  BOSS_FAN_IDS, CASE_IDS, MODULE_IDS, PROFILE_ID, bossWithDetails, bossWithoutDetails, catalog,
  soloCapped, soloMedia, soloMomentsString,
} from './transform.fixtures'
import { transformLegacySessions } from './transform'
import type { GlaSessionRow } from './types'
import { glaMessageId, glaSessionId, glaThreadId } from './uuid5'

const run = (sessions: GlaSessionRow[]) => transformLegacySessions({ profileId: PROFILE_ID, sessions, catalog })
const msgsOf = (rows: ReturnType<typeof run>['rows'], threadId: string) =>
  rows.messages.filter((m) => m.thread_id === threadId).sort((a, b) => a.position - b.position)

describe('session solo', () => {
  const { rows, stats } = run([soloCapped])
  const s = rows.sessions[0]
  const t = rows.threads[0]

  it('pose la session en « scored » dès l’insert, sur le cas et le module du CATALOGUE', () => {
    expect(rows.sessions).toHaveLength(1)
    expect(s.id).toBe(glaSessionId(soloCapped.id))
    expect(s.legacy_id).toBe(soloCapped.id)
    expect(s.profile_id).toBe(PROFILE_ID)
    expect(s.case_id).toBe(CASE_IDS.renc)
    expect(s.module_id).toBe(MODULE_IDS.renc)
    expect(s.kind).toBe('solo')
    expect(s.status).toBe('scored')
    expect(s.total).toBe(65)
    expect(s.objective_reached).toBe(false)
  })

  // `date_label` dit « 08/08/2026 10:14 » (UTC) alors que l'instant réel est 12:14 à Paris :
  // 774 sessions sur 17 260 changent de jour civil si on le réutilise.
  it('date les lignes depuis created_ms, JAMAIS depuis date_label', () => {
    expect(s.started_at).toBe('2026-08-08T10:14:28.452Z')
    expect(s.ended_at).toBe(s.started_at)
    expect(s.scored_at).toBe(s.started_at)
    expect(JSON.stringify(rows)).not.toContain('08/08/2026')
  })

  it('reconstruit le case_snapshot sans aucun champ secret', () => {
    const snap = s.case_snapshot as Record<string, unknown>
    expect(snap.title).toBe('Niveau 1 — Envie spontanée et légère')
    expect(snap.moduleTitle).toBe('Demande de rencontre')
    expect(snap.objectiveLabel).toBe('L’esprit de ta réponse')
    expect(snap.maxTurns).toBe(8)
    for (const secret of ['targetLine', 'fan_brief', 'expected', 'fanBrief']) expect(snap).not.toHaveProperty(secret)
  })

  it('crée un fil unique, compte les tours du chatteur et reprend max_turns du cas', () => {
    expect(rows.threads).toHaveLength(1)
    expect(t.id).toBe(glaThreadId(soloCapped.id, 0))
    expect(t.position).toBe(0)
    expect(t.fan_name).toBe('Pascal')
    expect(t.max_turns).toBe(8)
    expect(t.turns_used).toBe(3)
    // `lost_reason` est absent de GLA : aucun fil importé n'est 'lost'.
    expect(t.status).toBe('done')
    expect(t.lost_reason).toBeNull()
    expect(t.ref_case_id).toBeNull()
    expect(t.boss_fan_id).toBeNull()
  })

  // `who = 'me'` est le CHATTEUR (il joue la créatrice), `who = 'them'` est le FAN. Contre-intuitif.
  it('traduit who=me → chatter et who=them → fan, et pose visible_at EXPLICITEMENT', () => {
    const m = msgsOf(rows, t.id!)
    expect(m).toHaveLength(6)
    expect(m.map((x) => x.speaker)).toEqual(['fan', 'chatter', 'fan', 'chatter', 'fan', 'chatter'])
    expect(m.map((x) => x.position)).toEqual([0, 1, 2, 3, 4, 5])
    expect(m[0].id).toBe(glaMessageId(soloCapped.id, 0, 0))
    expect(m[0].session_id).toBe(s.id)
    // Sans ce visible_at, `get-session.ts:138` rend une transcription entièrement blanche.
    expect(m.every((x) => x.visible_at === s.started_at && x.created_at === s.started_at)).toBe(true)
    expect(m.every((x) => x.media_price == null)).toBe(true)
  })

  // GLA stocke un NOMBRE (`plafond`), pas un booléen : `capped` se déduit de la preuve directe du
  // rabotage — total(65) < Σaxes(67).
  it('recalcule capped depuis l’écart entre le total et la somme des axes', () => {
    const sc = rows.threadScores[0]
    expect(sc.thread_id).toBe(t.id)
    expect(sc.total).toBe(65)
    expect(sc.objective_reached).toBe(false)
    expect(sc.capped).toBe(true)
    expect(sc.comment).toContain('Bonne validation')
    expect(sc.scored_at).toBe(s.started_at)
  })

  it('nettoie les moments : `mieux` → `indice`, `problème` → `probleme`, clés inconnues écartées', () => {
    const moments = rows.threadScores[0].moments as { cite?: string; probleme?: string; indice?: string; type?: string }[]
    expect(moments).toHaveLength(2)
    expect(moments[1].probleme).toBe('Refus sec, sans alternative.')
    expect(moments[1].indice).toBe('Propose une contrepartie à la place du refus.')
    expect(JSON.stringify(moments)).not.toContain('cite2')
  })

  it('écrit les 4 axes du module, avec leurs libellés, et rien d’autre', () => {
    expect(rows.axisScores.map((a) => [a.axis_key, a.score])).toEqual([
      ['validation', 14], ['justification', 18], ['compensation', 17], ['maintien', 18],
    ])
    expect(rows.axisScores[0].axis_name).toBe('Validation émotionnelle')
    expect(rows.axisScores.every((a) => a.thread_id === t.id)).toBe(true)
  })

  it('rend des compteurs alignés sur ce qui sera écrit', () => {
    expect(stats).toMatchObject({ read: 1, sessions: 1, threads: 1, messages: 6, cases: 1, skipped: [] })
  })
})

describe('session boss', () => {
  const { rows } = run([bossWithDetails])

  it('éclate boss_details en 5 fils et résout les 5 fans du catalogue', () => {
    expect(rows.threads).toHaveLength(5)
    expect(rows.threads.map((t) => t.position)).toEqual([0, 1, 2, 3, 4])
    expect(rows.threads.map((t) => t.fan_name)).toEqual(['Kevin', 'Thomas', 'Julien', 'Marc', 'Alex'])
    expect(rows.threads.map((t) => t.boss_fan_id)).toEqual(Object.values(BOSS_FAN_IDS))
    expect(rows.threads.every((t) => t.max_turns === 32)).toBe(true)
    expect(rows.threads.map((t) => t.turns_used)).toEqual([1, 1, 1, 0, 0])
  })

  it('prend la note DU FIL et déduit objective_reached du seuil boss (60)', () => {
    expect(rows.threadScores.map((x) => x.total)).toEqual([30, 55, 60, 15, 0])
    expect(rows.threadScores.map((x) => x.objective_reached)).toEqual([false, false, true, false, false])
    // Pas de plafond au niveau d'un fil de boss.
    expect(rows.threadScores.every((x) => x.capped === false)).toBe(true)
    expect(rows.threadScores.every((x) => Array.isArray(x.moments) && (x.moments as unknown[]).length === 0)).toBe(true)
  })

  // « Non sollicité » n'est pas « raté » : insérer 0 fausserait `training_axis_profile`, qui fait
  // une moyenne sur les lignes EXISTANTES.
  it('n’écrit pas de ligne d’axe là où GLA a null (axes: null en bloc compris)', () => {
    expect(rows.axisScores).toHaveLength(5)
    expect(rows.axisScores.map((a) => a.axis_key)).toEqual(['setting', 'setting', 'transition', 'setting', 'setting'])
    expect(rows.axisScores.map((a) => a.score)).toEqual([25, 55, 40, 60, 20])
    expect(rows.axisScores[0].axis_name).toBe('Setting')
    expect(rows.axisScores.some((a) => a.thread_id === rows.threads[4].id)).toBe(false)
  })

  it('range les messages sous le bon fil (sessions.history est vide sur toutes les sessions boss)', () => {
    expect(msgsOf(rows, rows.threads[0].id!).map((m) => m.speaker)).toEqual(['fan', 'chatter', 'fan'])
    expect(msgsOf(rows, rows.threads[4].id!)).toHaveLength(0)
    expect(rows.messages).toHaveLength(8)
  })
})

describe('session boss sans transcription', () => {
  // 1 211 sessions `boss_details: null` + 180 sans la clé : elles comptent, sans un seul fil.
  it('crée la session notée, et rien d’autre — sans lever', () => {
    const { rows, stats } = run([bossWithoutDetails])
    expect(rows.sessions).toHaveLength(1)
    expect(rows.sessions[0].total).toBe(47)
    expect(rows.sessions[0].objective_reached).toBe(true)
    expect(rows.threads).toHaveLength(0)
    expect(rows.messages).toHaveLength(0)
    expect(rows.threadScores).toHaveLength(0)
    expect(stats).toMatchObject({ read: 1, sessions: 1, threads: 0, messages: 0, skipped: [], anomalies: [] })
  })

  // §9.7 : `/api/formation/boss-save` n'impose aucun plafond sur `total` côté GLA. Une note haute
  // SANS la moindre transcription est le seul signal qu'on ait contre un chiffre fabriqué — on
  // importe quand même, on alerte. `boss_details: []` est le MÊME cas qu'absent : sans ça le
  // tableau vide serait le contournement de l'alerte.
  it('signale — sans écarter — une note ≥ 90 sans transcription, tableau vide compris', () => {
    const { rows, stats } = run([{ ...bossWithoutDetails, score: { total: 95, boss_details: null } }])
    expect(rows.sessions[0].total).toBe(95)
    expect(stats.skipped).toEqual([])
    expect(stats.anomalies).toEqual([
      { glaId: bossWithoutDetails.id, reason: 'session boss notée 95/100 sans aucune transcription' },
    ])
    expect(run([{ ...bossWithoutDetails, score: { total: 100, boss_details: [] } }]).stats.anomalies).toHaveLength(1)
  })
})

describe('messages « média »', () => {
  const { rows } = run([soloMedia])
  const bodies = msgsOf(rows, rows.threads[0].id!).map((m) => [m.body, m.media_price])

  // Forme reprise À L'IDENTIQUE de ce que l'app écrit nativement
  // (`features/training-session/actions.ts:109`) : importé et joué doivent être indiscernables.
  it('synthétise le corps, conserve le prix 0 et arrondit le seul prix décimal du corpus', () => {
    expect(bodies[2]).toEqual(['Média verrouillé — 6 €', 6])
    expect(bodies[4]).toEqual(['Média verrouillé — 0 €', 0])
    expect(bodies[5]).toEqual(['Média verrouillé — 9 €', 9])
  })

  it('laisse le prix null sur les messages texte et n’oublie aucune position', () => {
    expect(bodies[0][1]).toBeNull()
    expect(msgsOf(rows, rows.threads[0].id!).map((m) => m.position)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('calcule capped à false quand le total n’a pas été raboté', () => {
    expect(rows.threadScores[0].capped).toBe(false)
    expect(rows.threadScores[0].total).toBe(44)
  })
})

// 30 sessions du 30/07 au 02/08 portent `total = Σaxes > 65`, `objectif_atteint = false` et AUCUNE
// clé `plafond` : la règle « objectif non atteint → cap à 65 » n'était pas encore en vigueur côté
// serveur. La formule de reconstruction de la spec les dirait plafonnées ; elles ne le sont pas.
describe('capped sur les sessions antérieures à la règle des 65', () => {
  it('ne dit pas « plafonnée » une note que le serveur n’a jamais rabotée', () => {
    const { rows } = run([{
      ...soloCapped, id: 's-avant-la-regle',
      score: { total: 76, validation: 20, justification: 20, compensation: 18, maintien: 18, objectif_atteint: false, commentaire: '', moments: [] },
    }])
    expect(rows.threadScores[0].total).toBe(76)
    expect(rows.threadScores[0].capped).toBe(false)
  })
})

describe('anomalies de forme du score', () => {
  const { rows } = run([soloMomentsString])

  it('rend [] quand `moments` est une chaîne — la colonne est lue par un .map()', () => {
    expect(rows.threadScores[0].moments).toEqual([])
  })

  // 102 sessions portent `type`/`cite`/`probleme`/`indice` à la RACINE de `score`, et 4 des clés
  // fantômes : un parseur permissif les prendrait pour des axes.
  it('lit les axes en liste blanche : les clés aplaties à la racine n’en deviennent pas', () => {
    expect(rows.axisScores.map((a) => a.axis_key)).toEqual(['naturel', 'lecture', 'personnalisation', 'progression'])
    expect(rows.axisScores).toHaveLength(4)
  })
})

describe('corps de message hors normes', () => {
  const bodyOf = (n: number): GlaSessionRow => ({
    ...soloMedia,
    id: 's-long-body',
    history: [{ who: 'me', t: 'x'.repeat(n) }],
  })

  // 59 messages GLA dépassent 1 000 caractères, le plus long en fait 101 764 : le relâchement de
  // 0123 existe pour eux, et D5 interdit toute troncature.
  it('conserve INTÉGRALEMENT un corps de 101 764 caractères', () => {
    const { rows } = run([bodyOf(101_764)])
    expect(rows.messages[0].body).toHaveLength(101_764)
  })

  it('arrête le lot au-delà de la borne SQL, sans rien avoir écrit', () => {
    expect(() => run([bodyOf(200_001)])).toThrow(LegacySourceError)
  })
})

describe('entrée hostile — /api/formation/boss-save ne borne rien côté GLA', () => {
  it('clampe une note forgée au lieu de casser l’import entier', () => {
    const { rows } = run([{ ...soloCapped, id: 's-forge', score: { ...(soloCapped.score as object), total: 999_999 } }])
    expect(rows.sessions[0].total).toBe(100)
  })

  it('refuse un boss_details gonflé (plafond 5 fils)', () => {
    const details = Array.from({ length: 40 }, (_, i) => ({ fan: `F${i}`, total: 10, axes: {}, commentaire: '', history: [] }))
    expect(() => run([{ ...bossWithDetails, score: { boss_details: details } }])).toThrow(/plafond 5/)
  })

  it('refuse un nom de fan de 300 caractères (fan_name est borné à 30 en base)', () => {
    const details = [{ fan: 'z'.repeat(300), total: 10, axes: {}, commentaire: '', history: [] }]
    expect(() => run([{ ...bossWithDetails, score: { boss_details: details } }])).toThrow(/plafond 30/)
  })

  it('refuse une history gonflée (plafond 500 messages par fil)', () => {
    const history = Array.from({ length: 501 }, () => ({ who: 'me', t: 'a' }))
    expect(() => run([{ ...soloCapped, history }])).toThrow(/plafond 500/)
  })

  it('refuse un lot de plus de 1 000 sessions (max mesuré : 399)', () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...soloCapped, id: `s${i}` }))
    expect(() => run(many)).toThrow(/plafond 1000/)
  })

  it('refuse un poids cumulé absurde — le plafond par ligne n’en est pas un pour l’agrégat', () => {
    const heavy = Array.from({ length: 200 }, (_, i) => ({
      ...soloCapped, id: `s-heavy-${i}`,
      history: Array.from({ length: 500 }, () => ({ who: 'me', t: 'y'.repeat(199_000) })),
    }))
    expect(() => run(heavy)).toThrow(/poids cumulé/)
  })
})

describe('robustesse du lot', () => {
  it('écarte une session au cas inconnu au lieu de faire échouer tout l’import', () => {
    const { rows, stats } = run([soloCapped, { ...soloCapped, id: 's-inconnu', caseId: 'cas_qui_nexiste_pas' }])
    expect(rows.sessions).toHaveLength(1)
    expect(stats.read).toBe(2)
    expect(stats.sessions).toBe(1)
    expect(stats.skipped).toEqual([{ glaId: 's-inconnu', reason: 'cas inconnu du catalogue (cas_qui_nexiste_pas)' }])
  })

  it('écarte une session dont created_ms est absurde (la date porte tous les agrégats)', () => {
    const { stats } = run([{ ...soloCapped, id: 's-date', createdMs: 0 }])
    expect(stats.sessions).toBe(0)
    expect(stats.skipped[0].reason).toContain('created_ms')
  })

  // La PK est la clé d'idempotence : `on conflict (id) do nothing` couvre les trois tables sans une
  // seule lecture préalable. Un doublon n'est pas neutre — il double `attempts` dans les bests.
  it('produit exactement les mêmes identifiants d’une passe à l’autre', () => {
    const a = run([soloCapped, bossWithDetails])
    const b = run([soloCapped, bossWithDetails])
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows))
  })

  it('compte les cas distincts pour le message de succès', () => {
    const { stats } = run([soloCapped, soloMedia, { ...soloCapped, id: 's-rejeu' }])
    expect(stats).toMatchObject({ read: 3, sessions: 3, cases: 2 })
  })
})
