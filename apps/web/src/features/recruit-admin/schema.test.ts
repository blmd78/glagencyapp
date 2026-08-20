import { describe, expect, it } from 'vitest'
import { configForm, reviewInput } from './schema'

// Ce que ce fichier protège : `configForm` est le SEUL endroit qui garantit que la banque de
// questions restera consommable par le test public. Une banque à 4 emplacements, une variante à
// 3 options ou une bonne réponse hors bornes ne casserait rien à l'enregistrement — elle ferait
// planter le TIRAGE (`toQiBank` de recruit-test THROW) ou afficherait une option vide au candidat,
// des heures plus tard, sans que personne relie la panne à l'édition de config.
// Le second invariant testé est la NORMALISATION du texte de frappe : l'écran de frappe compare
// la saisie du candidat au texte normalisé — stocker une majuscule fausserait la mesure de wpm.

const variant = (over: Partial<{ q: string; opts: string[]; a: string }> = {}) => ({
  q: 'Quelle est la suite : 2, 4, 8, 16, … ?',
  opts: ['24', '32', '30', '18'],
  a: '1',
  ...over,
})
const slot = (over: Partial<{ slot: string; variants: unknown[] }> = {}) => ({
  slot: 'Suite logique',
  variants: [variant()],
  ...over,
})
const bank = (slots = 5) => Array.from({ length: slots }, () => slot())

const TYPING =
  'le chatting est un metier ou la rapidite et la qualite comptent beaucoup pour reussir chaque jour'

const config = (over: Record<string, unknown> = {}) => ({
  open: true,
  botMessages: '14',
  qiTimer: '30',
  frappeMin: '30',
  connexionMin: '10',
  qiMin: '3',
  globalThreshold: '70',
  discordLink: '',
  typingText: TYPING,
  qiBank: bank(),
  ...over,
})

describe('configForm — banque QI', () => {
  it('accepte une banque conforme et coerce les nombres saisis en chaînes', () => {
    const r = configForm.safeParse(config())
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.botMessages).toBe(14)
      expect(r.data.qiBank).toHaveLength(5)
      expect(r.data.qiBank[0]?.variants[0]?.a).toBe(1)
    }
  })

  it('exige EXACTEMENT 5 emplacements (le verdict calcule qi/5×30)', () => {
    expect(configForm.safeParse(config({ qiBank: bank(4) })).success).toBe(false)
    expect(configForm.safeParse(config({ qiBank: bank(6) })).success).toBe(false)
  })

  it('exige au moins une variante par emplacement', () => {
    expect(configForm.safeParse(config({ qiBank: [slot({ variants: [] }), ...bank(4)] })).success).toBe(false)
  })

  it('exige 4 options non vides par variante', () => {
    const troisOptions = [slot({ variants: [variant({ opts: ['a', 'b', 'c'] })] }), ...bank(4)]
    expect(configForm.safeParse(config({ qiBank: troisOptions })).success).toBe(false)
    const optionVide = [slot({ variants: [variant({ opts: ['a', '  ', 'c', 'd'] })] }), ...bank(4)]
    expect(configForm.safeParse(config({ qiBank: optionVide })).success).toBe(false)
  })

  it('exige une bonne réponse dans [0,3]', () => {
    expect(configForm.safeParse(config({ qiBank: [slot({ variants: [variant({ a: '4' })] }), ...bank(4)] })).success).toBe(false)
    expect(configForm.safeParse(config({ qiBank: [slot({ variants: [variant({ a: '-1' })] }), ...bank(4)] })).success).toBe(false)
  })
})

describe('configForm — seuils et textes', () => {
  it('refuse un champ VIDÉ au lieu de l’enregistrer à 0 (z.coerce.number parse \'\' en 0)', () => {
    // Le piège porte sur les deux seuils dont 0 est une valeur légitime : vider « Score global
    // minimum » désactiverait tout refus au global, sans le moindre message.
    expect(configForm.safeParse(config({ globalThreshold: '' })).success).toBe(false)
    expect(configForm.safeParse(config({ qiMin: '   ' })).success).toBe(false)
    expect(configForm.safeParse(config({ botMessages: '' })).success).toBe(false)
    // Idem pour la bonne réponse d'une variante (radio non coché ⇒ null côté RHF).
    expect(configForm.safeParse(config({ qiBank: [slot({ variants: [variant({ a: '' })] }), ...bank(4)] })).success).toBe(false)
  })

  it('borne chaque seuil', () => {
    expect(configForm.safeParse(config({ botMessages: '0' })).success).toBe(false)
    expect(configForm.safeParse(config({ botMessages: '51' })).success).toBe(false)
    expect(configForm.safeParse(config({ qiTimer: '4' })).success).toBe(false)
    expect(configForm.safeParse(config({ qiTimer: '121' })).success).toBe(false)
    expect(configForm.safeParse(config({ qiMin: '6' })).success).toBe(false)
    expect(configForm.safeParse(config({ globalThreshold: '101' })).success).toBe(false)
    expect(configForm.safeParse(config({ frappeMin: '30.5' })).success).toBe(false)
  })

  it('normalise le texte de frappe (minuscules, espaces compactés) — l’écran de frappe compare au texte normalisé', () => {
    const r = configForm.safeParse(config({ typingText: `  LE Chatting   est un METIER ${TYPING}  ` }))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.typingText).toBe(`le chatting est un metier ${TYPING}`)
    }
  })

  it('refuse un texte de frappe trop court APRÈS normalisation', () => {
    expect(configForm.safeParse(config({ typingText: '   Trop    court   ' })).success).toBe(false)
  })

  it('accepte un lien Discord vide ou une URL, refuse le reste', () => {
    expect(configForm.safeParse(config({ discordLink: '' })).success).toBe(true)
    expect(configForm.safeParse(config({ discordLink: 'https://discord.gg/abc' })).success).toBe(true)
    expect(configForm.safeParse(config({ discordLink: 'discord.gg/abc' })).success).toBe(false)
  })

  it('refuse un lien Discord non http(s) — il finit en href sur la page publique /postuler', () => {
    // `z.url()` seul les accepte tous les trois : ce sont des URL valides, juste pas des liens.
    expect(configForm.safeParse(config({ discordLink: 'javascript:alert(1)' })).success).toBe(false)
    expect(configForm.safeParse(config({ discordLink: 'data:text/html,<script>alert(1)</script>' })).success).toBe(false)
    expect(configForm.safeParse(config({ discordLink: 'ftp://discord.gg/abc' })).success).toBe(false)
    expect(configForm.safeParse(config({ discordLink: 'http://discord.gg/abc' })).success).toBe(true)
  })
})

describe('reviewInput', () => {
  it('n’accepte que valide / refuse (nouveau est l’état initial, jamais reposé)', () => {
    const id = '3f2a1b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c'
    expect(reviewInput.safeParse({ id, status: 'valide' }).success).toBe(true)
    expect(reviewInput.safeParse({ id, status: 'refuse' }).success).toBe(true)
    expect(reviewInput.safeParse({ id, status: 'nouveau' }).success).toBe(false)
  })
})
