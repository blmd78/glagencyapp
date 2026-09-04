import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseChatterActivity,
  parseSegmentsCsv,
  parseShiftsPage,
  parseTeamReport,
} from './shifts'

// Fixtures = extraits de captures RÉELLES du 2026-08-29 / 2026-08-31, pas du HTML inventé :
// c'est le seul moyen de vérifier qu'on lit MyPuls et pas l'idée qu'on s'en fait.
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixture = (name: string): string => readFileSync(resolve(dir, name), 'utf8')

describe('parseShiftsPage', () => {
  const page = parseShiftsPage(fixture('shifts-page.html'))

  it('lit les modèles du sélecteur — la liste qui fait autorité', () => {
    expect(page.creators).toHaveLength(5)
    expect(page.creators[0]).toEqual({ mypulsCreatorId: '1951', label: 'Alice_prvv' })
    // Le pseudo MyPuls, pas le nom d'usage du CRM (« Claire »).
    expect(page.creators.map((c) => c.label)).toContain('Claire_sps')
  })

  it('lit les trois fenêtres de créneau, dont celle qui franchit minuit', () => {
    expect(page.windows).toEqual([
      { label: 'Matin', start: '05:00', end: '13:00' },
      { label: 'Après-midi', start: '13:00', end: '21:00' },
      { label: 'Soirée', start: '21:00', end: '05:00' },
    ])
  })

  it('échoue bruyamment si le sélecteur disparaît', () => {
    expect(() => parseShiftsPage('<html><body>rien</body></html>')).toThrow(/reportCreators/)
  })
})

describe('parseSegmentsCsv', () => {
  const rows = parseSegmentsCsv(fixture('report.csv'))

  it('lit un segment simple', () => {
    expect(rows[0]).toEqual({
      chatterLabel: 'Omarion',
      mypulsUserId: '8644',
      day: '2026-08-29',
      startTime: '05:17',
      endTime: '14:54',
      endDay: '2026-08-29',
      activeMinutes: 379,
      messages: 1029,
      models: [{ label: 'Manonbch', messages: 1029 }],
    })
  })

  it('distingue le jour de début du jour de fin quand le segment franchit minuit', () => {
    const nuit = rows.find((r) => r.chatterLabel === 'Michel')!
    expect(nuit.day).toBe('2026-08-29')
    expect(nuit.endDay).toBe('2026-08-30')
    expect(nuit.startTime).toBe('21:01')
    expect(nuit.endTime).toBe('05:38')
  })

  it('ventile les messages par modèle, séparés par « | »', () => {
    const multi = rows.find((r) => r.models.length > 1)!
    expect(multi.models).toEqual([
      { label: 'Claire_sps', messages: 327 },
      { label: 'Manonbch', messages: 43 },
    ])
    // Le nombre entre parenthèses est un NOMBRE DE MESSAGES, pas un identifiant de modèle :
    // leur somme égale la colonne Messages. C'est ce qui a tranché la question.
    for (const r of rows) {
      expect(r.models.reduce((n, m) => n + m.messages, 0)).toBe(r.messages)
    }
  })

  it('accepte un CSV SANS la colonne « Modèles »', () => {
    // Avec un seul modèle demandé, MyPuls retire la colonne — il n'y aurait rien à ventiler.
    // Le parseur échouait alors sur toute la journée (rencontré le 2026-09-03).
    const csv = fixture('report.csv')
      .split('\n')
      .map((l) => (l.trim() === '' ? l : l.replace(/;("[^"]*"|[^;]*)$/, '')))
      .join('\n')
    const rows = parseSegmentsCsv(csv)
    expect(rows).toHaveLength(8)
    expect(rows[0]!.models).toEqual([])
    expect(rows[0]!.activeMinutes).toBe(379)
  })

  it('refuse une colonne inconnue ajoutée après « Messages »', () => {
    const csv = fixture('report.csv').replace('Messages;Modèles', 'Messages;Inconnue;Modèles')
    expect(() => parseSegmentsCsv(csv)).toThrow(/colonne inconnue|en-tête/)
  })

  it('refuse un en-tête inattendu plutôt que de deviner les colonnes', () => {
    expect(() => parseSegmentsCsv('Chatteur;Jour;Fin\nx;y;z\n')).toThrow(/en-tête CSV inattendu/)
  })

  it('refuse un CSV vide au lieu de rendre « personne n’a travaillé »', () => {
    expect(() => parseSegmentsCsv('')).toThrow(/CSV vide/)
  })
})

describe('parseTeamReport', () => {
  const range = { from: '2026-08-31', to: '2026-09-01' }
  const rows = parseTeamReport(fixture('team-report.html'), range)

  it('résout le jour sans année contre la plage demandée', () => {
    // MyPuls écrit « lun. 31 août » — l'année n'est nulle part sur la page.
    expect(new Set(rows.map((r) => r.day))).toEqual(new Set(['2026-08-31']))
  })

  it('reporte le jour sur les lignes suivantes, dont la cellule est vide', () => {
    expect(new Set(rows.map((r) => r.slotLabel))).toEqual(
      new Set(['Matin', 'Après-midi', 'Soirée']),
    )
    expect(rows.filter((r) => r.slotLabel === 'Soirée').every((r) => r.day === '2026-08-31')).toBe(true)
  })

  it('accepte les mois ABRÉGÉS, que MyPuls écrit « 1 sept » et non « septembre »', () => {
    // Cas rencontré au backfill : toute la plage échouait sur le passage au mois suivant.
    const html = fixture('team-report.html').replace('lun. 31 août', 'mar. 1 sept')
    const rows = parseTeamReport(html, { from: '2026-08-31', to: '2026-09-01' })
    expect(new Set(rows.map((r) => r.day))).toEqual(new Set(['2026-09-01']))
  })

  it('refuse un mois ambigu plutôt que de choisir entre juin et juillet', () => {
    const html = fixture('team-report.html').replace('lun. 31 août', 'mar. 1 ju')
    expect(() => parseTeamReport(html, { from: '2026-06-01', to: '2026-07-31' })).toThrow(/ambigu/)
  })

  it('lit le verdict de couverture tel que MyPuls l’affiche', () => {
    const first = rows[0]!
    expect(first.chatterLabel).toBe('Nasandra')
    expect(first.coveragePct).toBe(93.5)
    expect(first.activeMinutes).toBe(449) // « 7h29 »
    expect(first.messages).toBe(753)
    expect(first.firstTime).toBe('05:01')
    expect(first.lastTime).toBe('12:59')
    expect(first.slotStart).toBe('05:00')
    expect(first.slotEnd).toBe('13:00')
  })

  it('lit une durée sous l’heure, que MyPuls écrit « 58 min » et non « 0h58 »', () => {
    // Cas rencontré au premier run réel : le parseur échouait sur toute la journée. C'est
    // pourtant le chatteur qui n'a tenu qu'une fraction de son créneau qu'on cherche à voir.
    const html = fixture('team-report.html').replace('>7h29<', '>58 min<')
    const rows = parseTeamReport(html, range)
    expect(rows[0]!.activeMinutes).toBe(58)
  })

  it('lit les milliers séparés par une espace insécable', () => {
    // MyPuls écrit « 1 088 msg ». Un parseInt naïf lirait 1.
    const gros = rows.filter((r) => r.messages > 999)
    expect(gros.length).toBeGreaterThan(0)
    for (const r of gros) expect(Number.isInteger(r.messages)).toBe(true)
  })

  it('borne la couverture entre 0 et 100', () => {
    for (const r of rows) {
      expect(r.coveragePct).toBeGreaterThanOrEqual(0)
      expect(r.coveragePct).toBeLessThanOrEqual(100)
    }
  })

  it('échoue si le jour lu tombe hors de la plage demandée', () => {
    expect(() =>
      parseTeamReport(fixture('team-report.html'), { from: '2026-07-01', to: '2026-07-02' }),
    ).toThrow(/hors de la plage/)
  })

  it('échoue bruyamment sur un tableau absent', () => {
    expect(() => parseTeamReport('<div>rien</div>', range)).toThrow(/introuvable/)
  })
})

describe('parseChatterActivity', () => {
  const act = parseChatterActivity(fixture('chatter-activity.html'))

  it('lit les 14 KPI dans l’ordre de la page', () => {
    expect(act.kpis).toHaveLength(14)
    expect(act.kpis.map((k) => k.title)).toEqual([
      'Premier message',
      'Dernier message',
      'Messages envoyés',
      'PPV proposés',
      'PPV gratuit / payant',
      'Golden ratio',
      'Comptes liés',
      'Temps connecté MyPuls',
      'Temps actif MyPuls',
      'Temps inactif MyPuls',
      'Sessions MyPuls',
      'Chatting actif',
      'Chatting inactif',
      'Messages / heure active',
    ])
  })

  it('garde la valeur ET son sous-titre, qui porte la définition MyPuls', () => {
    const chatting = act.kpis.find((k) => k.title === 'Chatting actif')!
    expect(chatting.value).toBe('794 min')
    expect(chatting.subtitle).toBe('Minutes avec activité messages régulière')
  })

  it('lit l’infobulle, qui ventile par modèle avec son ID MyPuls', () => {
    const connecte = act.kpis.find((k) => k.title === 'Temps connecté MyPuls')!
    expect(connecte.tooltip).toContain('Taprofcarla (#183)')
    expect(connecte.tooltip).toContain('893 min')
  })

  it('ne confond pas la valeur avec l’attribut title qui la précède', () => {
    // Le balisage est <div class="kpi-value" ... title="…: 1817<br>">1817</div> : une regex
    // trop large ramènerait « ">1817 ».
    expect(act.kpis.find((k) => k.title === 'Messages envoyés')!.value).toBe('1817')
  })

  it('lit les trois séries minute par minute, de même longueur', () => {
    expect(act.series.labels).toHaveLength(6)
    expect(act.series.values).toHaveLength(6)
    expect(act.series.inactive).toHaveLength(6)
    expect(act.series.labels[0]).toBe('29/08 00:00')
  })

  it('lit la phrase des pauses sans avaler le reste du document', () => {
    expect(act.pauses).toBe(
      '12 pause(s) détectée(s). Plus longue pause: 3 min (29/08 00:30 → 29/08 00:32).',
    )
  })

  it('échoue si la page ne porte aucun KPI', () => {
    expect(() => parseChatterActivity('<div>rien</div>')).toThrow(/aucun KPI/)
  })
})
