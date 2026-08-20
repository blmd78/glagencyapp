import { describe, expect, it } from 'vitest'
import { recruitScoreJsonSchema, recruitScoreZod } from './recruit-schema'
import { RECRUIT_PERSONA_NAMES, RECRUIT_PERSONAS, RECRUIT_SCORE_SYSTEM, recruitBotSystem, recruitToMessages, recruitTranscript } from './recruit-prompts'

describe('RECRUIT_PERSONAS (GLA PERSONAS)', () => {
  it('3 personas nommés, dans l\'ordre de rotation GLA', () => {
    expect(RECRUIT_PERSONA_NAMES).toEqual(['Lucas', 'Marco', 'David'])
    expect(Object.keys(RECRUIT_PERSONAS)).toEqual(['Lucas', 'Marco', 'David'])
  })
  it('Lucas : timide et hésitant', () => {
    expect(RECRUIT_PERSONAS.Lucas).toContain('Timide et hésitant')
  })
  it('Marco : pressé et direct', () => {
    expect(RECRUIT_PERSONAS.Marco).toContain('Pressé et direct')
  })
  it('David : radin mais accro', () => {
    expect(RECRUIT_PERSONAS.David).toContain('Radin mais accro')
  })
})

describe('recruitBotSystem (GLA bot_system)', () => {
  it('interpole le profil du persona choisi', () => {
    expect(recruitBotSystem('Lucas')).toContain(RECRUIT_PERSONAS.Lucas)
    expect(recruitBotSystem('Marco')).toContain(RECRUIT_PERSONAS.Marco)
    expect(recruitBotSystem('Marco')).not.toContain(RECRUIT_PERSONAS.David)
  })
  it('contient les 3 épreuves cachées (RELANCE, GRATUIT, DÉSIR)', () => {
    const p = recruitBotSystem('David')
    expect(p).toContain('RELANCE')
    expect(p).toContain('GRATUIT')
    expect(p).toContain('DÉSIR')
  })
  it('contient les règles média (média verrouillé)', () => {
    expect(recruitBotSystem('Lucas')).toContain('[MEDIA VERROUILLE - 15€]')
  })
  it('impose le style SMS (messages courts)', () => {
    expect(recruitBotSystem('Lucas')).toContain('COURTS (1 à 2 phrases max)')
  })
  it('ne révèle jamais être une IA', () => {
    expect(recruitBotSystem('Lucas')).toContain('Tu ne révèles JAMAIS que tu es une IA')
  })
})

describe('recruitToMessages (GLA to_messages)', () => {
  it('client = assistant, candidat = user, préfixé par le message de démarrage', () => {
    const msgs = recruitToMessages([{ speaker: 'client', body: 'Salut !' }])
    expect(msgs).toEqual([
      { role: 'user', content: '(Le candidat vient de se connecter au chat. Démarre la conversation.)' },
      { role: 'assistant', content: 'Salut !' },
    ])
  })
  it('un historique vide donne un seul tour user (le message de démarrage)', () => {
    expect(recruitToMessages([])).toEqual([
      { role: 'user', content: '(Le candidat vient de se connecter au chat. Démarre la conversation.)' },
    ])
  })
  it('fusionne les tours consécutifs de même rôle', () => {
    const msgs = recruitToMessages([
      { speaker: 'client', body: 'cc' },
      { speaker: 'client', body: 'ça va ?' },
      { speaker: 'candidat', body: 'oui et toi' },
    ])
    expect(msgs).toEqual([
      { role: 'user', content: '(Le candidat vient de se connecter au chat. Démarre la conversation.)' },
      { role: 'assistant', content: 'cc\nça va ?' },
      { role: 'user', content: 'oui et toi' },
    ])
  })
  it('un corps vide/blanc devient "..."', () => {
    const msgs = recruitToMessages([{ speaker: 'client', body: '   ' }])
    expect(msgs[1]).toEqual({ role: 'assistant', content: '...' })
  })
  it('GLA : le 1er tour est TOUJOURS le message de démarrage — même si le 1er échange réel est le candidat, il est fusionné DEDANS (pas de garde comme la formation)', () => {
    const msgs = recruitToMessages([{ speaker: 'candidat', body: 'hey' }])
    expect(msgs).toEqual([
      { role: 'user', content: '(Le candidat vient de se connecter au chat. Démarre la conversation.)\nhey' },
    ])
  })
})

describe('recruitTranscript (GLA /api/score)', () => {
  it('lignes Client:/Candidat:, sans repli sur corps vide', () => {
    expect(
      recruitTranscript([
        { speaker: 'client', body: 'Salut' },
        { speaker: 'candidat', body: 'Bonjour !' },
        { speaker: 'client', body: '' },
      ]),
    ).toBe('Client: Salut\nCandidat: Bonjour !\nClient: ')
  })
})

describe('RECRUIT_SCORE_SYSTEM (GLA SCORE_SYSTEM)', () => {
  it('4 critères sur 25, langage cru non pénalisé, JSON strict', () => {
    expect(RECRUIT_SCORE_SYSTEM).toContain('Note 4 critères, chacun sur 25')
    expect(RECRUIT_SCORE_SYSTEM).toContain('orthographe')
    expect(RECRUIT_SCORE_SYSTEM).toContain('coherence')
    expect(RECRUIT_SCORE_SYSTEM).toContain('relance')
    expect(RECRUIT_SCORE_SYSTEM).toContain('vente')
    expect(RECRUIT_SCORE_SYSTEM).toContain("n'est PAS un défaut")
  })
})

describe('recruitScoreJsonSchema (GLA CAND_SCORE_SCHEMA)', () => {
  it('4 axes + commentaire, requis = les 4 axes seulement, strict', () => {
    expect(Object.keys(recruitScoreJsonSchema.properties)).toEqual(['orthographe', 'coherence', 'relance', 'vente', 'commentaire'])
    expect(recruitScoreJsonSchema.required).toEqual(['orthographe', 'coherence', 'relance', 'vente'])
    expect(recruitScoreJsonSchema.additionalProperties).toBe(false)
    expect(recruitScoreJsonSchema.properties).not.toHaveProperty('total')
  })
})

describe('recruitScoreZod', () => {
  const ok = { orthographe: 20, coherence: 18, relance: 22, vente: 25, commentaire: 'bon candidat' }

  it('accepte une notation valide', () => {
    expect(recruitScoreZod.safeParse(ok).success).toBe(true)
  })
  it('clampe une note hors [0, 25] au lieu de rejeter', () => {
    const r = recruitScoreZod.safeParse({ ...ok, orthographe: 40 })
    expect(r.success).toBe(true)
    expect(r.data?.orthographe).toBe(25)
    const r2 = recruitScoreZod.safeParse({ ...ok, vente: -5 })
    expect(r2.success).toBe(true)
    expect(r2.data?.vente).toBe(0)
  })
  it('tolère une dérive numérique (arrondi)', () => {
    const r = recruitScoreZod.safeParse({ ...ok, coherence: 17.6 })
    expect(r.success).toBe(true)
    expect(r.data?.coherence).toBe(18)
  })
  it('commentaire optionnel (comme CAND_SCORE_SCHEMA)', () => {
    const withoutComment: Record<string, unknown> = { ...ok }
    delete withoutComment.commentaire
    expect(recruitScoreZod.safeParse(withoutComment).success).toBe(true)
  })
  it('une clé d\'axe manquante ou un type non-numérique reste un échec structurel', () => {
    const missing: Record<string, unknown> = { ...ok }
    delete missing.orthographe
    expect(recruitScoreZod.safeParse(missing).success).toBe(false)
    expect(recruitScoreZod.safeParse({ ...ok, vente: 'vingt' }).success).toBe(false)
  })
})
