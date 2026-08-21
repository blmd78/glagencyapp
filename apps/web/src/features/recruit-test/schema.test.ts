import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  saveConnectionInput,
  saveQiInput,
  saveTypingInput,
  sendToBotInput,
  startAttemptInput,
  submitCandidateInput,
} from './schema'

// Ces schémas gardent des actions PUBLIQUES (aucune session) : leur test n'est pas un confort de
// formulaire, c'est la vérification du seul filtre qui existe avant la base. On fixe donc les
// contrats qui portent une règle métier ou une garantie de sécurité :
//   - la normalisation d'identité (blocklist « un seul essai » : un e-mail non minusculé ne
//     matcherait JAMAIS, cf. 0126) ;
//   - les 5 réponses QI exactement (invariant du verdict `qi/5*30`) ;
//   - le OU EXCLUSIF message / média du bot ;
//   - les bornes (device, wpm, mbps, prix) qui empêchent une valeur forgée d'arriver en base.

const UUID = '3f2a1b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c'

const fieldErrors = (r: z.ZodSafeParseResult<unknown>): Record<string, string[] | undefined> =>
  r.success ? {} : z.flattenError(r.error).fieldErrors

describe('startAttemptInput', () => {
  it('accepte un UUID de navigateur et le trim', () => {
    const r = startAttemptInput.safeParse({ device: `  ${UUID}  ` })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.device).toBe(UUID)
  })

  it('refuse un device trop court, trop long ou hors charset (anti-injection de filtre PostgREST)', () => {
    expect(startAttemptInput.safeParse({ device: 'abc' }).success).toBe(false)
    expect(startAttemptInput.safeParse({ device: 'a'.repeat(65) }).success).toBe(false)
    // une virgule ou une parenthèse permettrait de greffer un fragment de filtre PostgREST
    expect(startAttemptInput.safeParse({ device: 'aaaaaaaa,ip.eq.1' }).success).toBe(false)
    expect(startAttemptInput.safeParse({ device: 'aaaaaaaa(x)' }).success).toBe(false)
    expect(startAttemptInput.safeParse({ device: 'aaaaaaaa.eq' }).success).toBe(false)
  })
})

describe('saveQiInput', () => {
  it('accepte 5 réponses, `null` compris (non répondu = faux)', () => {
    const r = saveQiInput.safeParse({ attemptId: UUID, answers: [0, 1, null, 3, 2] })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.answers).toEqual([0, 1, null, 3, 2])
  })

  it('refuse une longueur différente de 5 (invariant du verdict qi/5)', () => {
    expect(fieldErrors(saveQiInput.safeParse({ attemptId: UUID, answers: [0, 1, 2, 3] })).answers).toContain('Il faut 5 réponses')
    expect(saveQiInput.safeParse({ attemptId: UUID, answers: [0, 1, 2, 3, 0, 1] }).success).toBe(false)
    expect(saveQiInput.safeParse({ attemptId: UUID, answers: [] }).success).toBe(false)
  })

  it('refuse un index hors des 4 options, décimal, ou un attemptId non UUID', () => {
    expect(saveQiInput.safeParse({ attemptId: UUID, answers: [0, 1, 2, 3, 4] }).success).toBe(false)
    expect(saveQiInput.safeParse({ attemptId: UUID, answers: [-1, 1, 2, 3, 0] }).success).toBe(false)
    expect(saveQiInput.safeParse({ attemptId: UUID, answers: [1.5, 1, 2, 3, 0] }).success).toBe(false)
    expect(saveQiInput.safeParse({ attemptId: 'pas-un-uuid', answers: [0, 1, 2, 3, 0] }).success).toBe(false)
  })
})

describe('saveTypingInput / saveConnectionInput', () => {
  it('accepte une mesure plausible (accuracy décimale tolérée, elle reste en jsonb)', () => {
    const r = saveTypingInput.safeParse({ attemptId: UUID, wpm: 42, accuracy: 96.5, seconds: 60 })
    expect(r.success).toBe(true)
    expect(saveConnectionInput.safeParse({ attemptId: UUID, mbps: 87.4 }).success).toBe(true)
  })

  it('refuse les valeurs forgées hors bornes', () => {
    expect(saveTypingInput.safeParse({ attemptId: UUID, wpm: 251, accuracy: 100, seconds: 60 }).success).toBe(false)
    expect(saveTypingInput.safeParse({ attemptId: UUID, wpm: -1, accuracy: 100, seconds: 60 }).success).toBe(false)
    // wpm finit en smallint (`recruit_candidates.typing_wpm`) : décimal refusé
    expect(saveTypingInput.safeParse({ attemptId: UUID, wpm: 42.5, accuracy: 100, seconds: 60 }).success).toBe(false)
    expect(saveTypingInput.safeParse({ attemptId: UUID, wpm: 42, accuracy: 101, seconds: 60 }).success).toBe(false)
    expect(saveTypingInput.safeParse({ attemptId: UUID, wpm: 42, accuracy: 100, seconds: 0 }).success).toBe(false)
    expect(saveTypingInput.safeParse({ attemptId: UUID, wpm: 42, accuracy: 100, seconds: 3601 }).success).toBe(false)
    expect(saveConnectionInput.safeParse({ attemptId: UUID, mbps: -1 }).success).toBe(false)
    expect(saveConnectionInput.safeParse({ attemptId: UUID, mbps: 10001 }).success).toBe(false)
  })
})

describe('sendToBotInput', () => {
  it('accepte un message texte seul (trimé) OU un média seul', () => {
    const txt = sendToBotInput.safeParse({ attemptId: UUID, body: '  coucou toi  ' })
    expect(txt.success).toBe(true)
    if (txt.success) {
      expect(txt.data.body).toBe('coucou toi')
      expect(txt.data.mediaPrice).toBeUndefined()
    }
    expect(sendToBotInput.safeParse({ attemptId: UUID, mediaPrice: 15 }).success).toBe(true)
  })

  it('refuse les deux à la fois et aucun des deux (OU exclusif)', () => {
    const both = sendToBotInput.safeParse({ attemptId: UUID, body: 'tiens', mediaPrice: 15 })
    expect(both.success).toBe(false)
    if (!both.success) expect(both.error.issues[0]?.message).toBe('Envoie un message OU un média verrouillé.')
    expect(sendToBotInput.safeParse({ attemptId: UUID }).success).toBe(false)
  })

  it('refuse un message vide/blanc, trop long, et un prix hors bornes ou décimal', () => {
    expect(sendToBotInput.safeParse({ attemptId: UUID, body: '   ' }).success).toBe(false)
    expect(sendToBotInput.safeParse({ attemptId: UUID, body: 'a'.repeat(501) }).success).toBe(false)
    expect(sendToBotInput.safeParse({ attemptId: UUID, mediaPrice: 0 }).success).toBe(false)
    expect(sendToBotInput.safeParse({ attemptId: UUID, mediaPrice: 10001 }).success).toBe(false)
    expect(sendToBotInput.safeParse({ attemptId: UUID, mediaPrice: 9.5 }).success).toBe(false)
  })
})

describe('submitCandidateInput', () => {
  // Profil 0127 valide (âge/localisation/téléphone/shifts/source sont REQUIS depuis leur ajout).
  const PROFILE = { age: '22', location: 'Paris, France', phone: '06 12 34 56 78', shifts: ['Matin (5h–13h)'], source: 'par un ami' }

  it('normalise l’identité : trim partout, e-mail et Discord en MINUSCULES (0126)', () => {
    const r = submitCandidateInput.safeParse({
      attemptId: UUID,
      firstName: '  Léa ',
      lastName: ' Martin  ',
      email: '  Lea.Martin@Gmail.COM ',
      discord: '  LeaM#1234 ',
      ...PROFILE,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.firstName).toBe('Léa')
      expect(r.data.lastName).toBe('Martin')
      // sans ce lower(), la blocklist « un seul essai » ne matcherait jamais le 2e passage
      expect(r.data.email).toBe('lea.martin@gmail.com')
      expect(r.data.discord).toBe('leam#1234')
      // La chaîne du formulaire devient l'entier de la colonne (check 18..99, 0127).
      expect(r.data.age).toBe(22)
    }
  })

  it('profil 0127 : refuse un mineur (message GLA), un âge non numérique, aucun shift, une source vide', () => {
    const base = { attemptId: UUID, firstName: 'Léa', lastName: 'Martin', email: 'a@b.fr', ...PROFILE }
    expect(fieldErrors(submitCandidateInput.safeParse({ ...base, age: '17' })).age).toContain('Tu dois être majeur (18 ans ou plus) pour postuler.')
    expect(submitCandidateInput.safeParse({ ...base, age: 'vingt' }).success).toBe(false)
    expect(submitCandidateInput.safeParse({ ...base, shifts: [] }).success).toBe(false)
    expect(submitCandidateInput.safeParse({ ...base, shifts: ['Soir (18h–2h)'] }).success).toBe(false)
    expect(submitCandidateInput.safeParse({ ...base, source: ' ' }).success).toBe(false)
  })

  it('Discord absent ou vide → null (le check SQL veut 1..60 ou NULL, pas la chaîne vide)', () => {
    const absent = submitCandidateInput.safeParse({ attemptId: UUID, firstName: 'Léa', lastName: 'Martin', email: 'a@b.fr', ...PROFILE })
    expect(absent.success).toBe(true)
    if (absent.success) expect(absent.data.discord).toBeNull()

    const vide = submitCandidateInput.safeParse({ attemptId: UUID, firstName: 'Léa', lastName: 'Martin', email: 'a@b.fr', discord: '   ', ...PROFILE })
    expect(vide.success).toBe(true)
    if (vide.success) expect(vide.data.discord).toBeNull()
  })

  it('refuse un e-mail invalide, une identité vide ou trop longue, un Discord > 60', () => {
    const base = { attemptId: UUID, firstName: 'Léa', lastName: 'Martin', email: 'a@b.fr', ...PROFILE }
    expect(fieldErrors(submitCandidateInput.safeParse({ ...base, email: 'pas-un-email' })).email).toContain('Email invalide')
    expect(fieldErrors(submitCandidateInput.safeParse({ ...base, firstName: '   ' })).firstName).toContain('Prénom requis')
    expect(fieldErrors(submitCandidateInput.safeParse({ ...base, lastName: '' })).lastName).toContain('Nom requis')
    expect(submitCandidateInput.safeParse({ ...base, firstName: 'a'.repeat(61) }).success).toBe(false)
    expect(submitCandidateInput.safeParse({ ...base, lastName: 'a'.repeat(61) }).success).toBe(false)
    expect(submitCandidateInput.safeParse({ ...base, discord: 'a'.repeat(61) }).success).toBe(false)
  })
})
