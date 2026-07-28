import { describe, expect, it } from 'vitest'
import { DEFAULT_RATE, rateOn, rateSpans, type RateChange } from './rates'

/** Les 14 jours de la periode 06 -> 19/07/2026 — celle de la feuille du proprietaire. */
const PERIOD = [
  '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12',
  '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19',
]

describe('rateSpans', () => {
  it('sans aucun historique : UN segment au taux par defaut, marque comme tel', () => {
    // Le `fallback` n est pas cosmetique : c est lui qui fait dire a la fiche « taux par defaut,
    // jamais regle ». Un `false` en dur ici passerait ce test si on n assertait que le taux.
    expect(rateSpans(PERIOD, [])).toEqual([
      { from: '2026-07-06', to: '2026-07-19', rate: DEFAULT_RATE, fallback: true },
    ])
  })

  it('une ligne anterieure a la periode : UN segment, et PLUS de fallback', () => {
    const h: RateChange[] = [{ effectiveFrom: '2026-01-01', rate: 10 }]
    // Meme taux que le defaut, mais REGLE : la fiche ne doit pas les presenter pareil, donc
    // `fallback` doit basculer. Un `rateSpans` qui ignorerait l historique quand le taux egale
    // le defaut rendrait `fallback: true` et tomberait ici.
    expect(rateSpans(PERIOD, h)).toEqual([
      { from: '2026-07-06', to: '2026-07-19', rate: 10, fallback: false },
    ])
  })

  it('LE CAS DE LA FEUILLE : 10 % puis 11 % au 2e lundi = DEUX segments cales sur les semaines', () => {
    // Josaphat, JC, Ethane, Salemmontin (mesures 2026-07-28) : 10 % en S1, 11 % en S2.
    const h: RateChange[] = [
      { effectiveFrom: '2026-01-01', rate: 10 },
      { effectiveFrom: '2026-07-13', rate: 11 },
    ]
    expect(rateSpans(PERIOD, h)).toEqual([
      { from: '2026-07-06', to: '2026-07-12', rate: 10, fallback: false },
      { from: '2026-07-13', to: '2026-07-19', rate: 11, fallback: false },
    ])
  })

  it('une date d effet EN MILIEU DE SEMAINE coupe la ou elle tombe, pas au lundi', () => {
    // La semaine n est pas le grain du decoupage, c est seulement celui que la feuille pratique.
    // Un `mondayOf(effectiveFrom)` cache dans le decoupage passerait le test precedent et
    // tomberait ici : il rendrait la coupure au 13/07 au lieu du 16/07.
    const h: RateChange[] = [
      { effectiveFrom: '2026-01-01', rate: 10 },
      { effectiveFrom: '2026-07-16', rate: 11 },
    ]
    expect(rateSpans(PERIOD, h)).toEqual([
      { from: '2026-07-06', to: '2026-07-15', rate: 10, fallback: false },
      { from: '2026-07-16', to: '2026-07-19', rate: 11, fallback: false },
    ])
  })

  it('un debut d historique EN COURS DE PERIODE laisse les jours d avant au defaut', () => {
    // LE cas que la spec §4 refuse de taire : un membre jamais regle, dont l admin pose le taux
    // au 13/07. Les 7 premiers jours ne sont couverts par AUCUNE ligne — ils valent 10 % et la
    // fiche doit le SIGNALER (`fallback: true`), pas le subir.
    const h: RateChange[] = [{ effectiveFrom: '2026-07-13', rate: 11 }]
    expect(rateSpans(PERIOD, h)).toEqual([
      { from: '2026-07-06', to: '2026-07-12', rate: DEFAULT_RATE, fallback: true },
      { from: '2026-07-13', to: '2026-07-19', rate: 11, fallback: false },
    ])
  })

  it('le taux du jour est celui de la ligne la PLUS RECENTE deja en vigueur', () => {
    // Trois lignes, dont deux AVANT la periode. Prendre la premiere (la plus ancienne) donnerait
    // 9 %, prendre la derniere de la liste sans regarder la date donnerait 13 % des le 06/07.
    const h: RateChange[] = [
      { effectiveFrom: '2026-05-01', rate: 9 },
      { effectiveFrom: '2026-06-15', rate: 10.5 },
      { effectiveFrom: '2026-07-18', rate: 13 },
    ]
    expect(rateSpans(PERIOD, h)).toEqual([
      { from: '2026-07-06', to: '2026-07-17', rate: 10.5, fallback: false },
      { from: '2026-07-18', to: '2026-07-19', rate: 13, fallback: false },
    ])
  })

  it('un historique DESORDONNE donne le meme resultat qu un historique trie', () => {
    // `compta_rates` se lit sans `order by` garanti cote PostgREST. Sans le tri interne, le
    // balayage arriere retiendrait la derniere ligne du TABLEAU et non la plus recente : ici
    // 10 % partout au lieu de la coupure au 13/07.
    const desordre: RateChange[] = [
      { effectiveFrom: '2026-07-13', rate: 11 },
      { effectiveFrom: '2026-01-01', rate: 10 },
    ]
    expect(rateSpans(PERIOD, desordre)).toEqual([
      { from: '2026-07-06', to: '2026-07-12', rate: 10, fallback: false },
      { from: '2026-07-13', to: '2026-07-19', rate: 11, fallback: false },
    ])
  })

  it('deux lignes au MEME taux ne font qu un segment', () => {
    // Coalescence : sinon la fiche afficherait deux blocs « 11 % » cote a cote, et le detail
    // deviendrait illisible pour rien.
    const h: RateChange[] = [
      { effectiveFrom: '2026-01-01', rate: 11 },
      { effectiveFrom: '2026-07-13', rate: 11 },
    ]
    expect(rateSpans(PERIOD, h)).toHaveLength(1)
    expect(rateSpans(PERIOD, h)[0]?.rate).toBe(11)
  })

  it('une ligne POSTERIEURE a la periode ne change rien', () => {
    const h: RateChange[] = [
      { effectiveFrom: '2026-01-01', rate: 10 },
      { effectiveFrom: '2026-08-03', rate: 12 },
    ]
    expect(rateSpans(PERIOD, h)).toEqual([
      { from: '2026-07-06', to: '2026-07-19', rate: 10, fallback: false },
    ])
  })

  it('aucun jour = aucun segment', () => {
    expect(rateSpans([], [{ effectiveFrom: '2026-01-01', rate: 10 }])).toEqual([])
  })
})

describe('rateOn', () => {
  it('rend le taux de la ligne la plus recente deja en vigueur', () => {
    const h: RateChange[] = [
      { effectiveFrom: '2026-01-01', rate: 10 },
      { effectiveFrom: '2026-07-13', rate: 11 },
    ]
    expect(rateOn('2026-07-12', h)).toEqual({ rate: 10, fallback: false })
    expect(rateOn('2026-07-13', h)).toEqual({ rate: 11, fallback: false })
    // La date d effet est INCLUSIVE : le 13 est deja au nouveau taux. Un `<` a la place du `<=`
    // decalerait toute la paie d un jour.
    expect(rateOn('2026-07-14', h)).toEqual({ rate: 11, fallback: false })
  })

  it('rend le defaut, MARQUE, quand aucune ligne ne couvre le jour', () => {
    expect(rateOn('2026-07-06', [{ effectiveFrom: '2026-07-13', rate: 11 }])).toEqual({
      rate: DEFAULT_RATE,
      fallback: true,
    })
    expect(rateOn('2026-07-06', [])).toEqual({ rate: DEFAULT_RATE, fallback: true })
  })

  it('donne la MEME reponse que rateSpans sur chaque jour de la periode', () => {
    // Deux implementations de la meme regle vivent dans ce fichier (`rateOn` sert au controle
    // d ecriture et a l affichage du taux courant, `rateSpans` a la paie). Ce test est ce qui
    // les empeche de diverger : c est exactement le defaut que la feature a corrige cote calcul
    // (une seule implementation du net).
    const h: RateChange[] = [
      { effectiveFrom: '2026-07-08', rate: 10.5 },
      { effectiveFrom: '2026-07-13', rate: 11 },
    ]
    const spans = rateSpans(PERIOD, h)
    for (const day of PERIOD) {
      const span = spans.find((s) => s.from <= day && day <= s.to)
      expect({ day, ...rateOn(day, h) }).toEqual({ day, rate: span?.rate, fallback: span?.fallback })
    }
  })
})
