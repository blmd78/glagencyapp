import { describe, expect, it } from 'vitest'
import { bossFanSystemPrompt, fanSystemPrompt, formatTranscript, mediaLabel, stripElim, toFanMessages } from './prompts'

describe('toFanMessages (GLA to_messages_formation)', () => {
  it('fan = assistant, chatter = user, tours consécutifs fusionnés, média formaté', () => {
    const msgs = toFanMessages([
      { speaker: 'fan', body: 'cc', mediaPrice: null },
      { speaker: 'fan', body: 'tu fais quoi', mediaPrice: null },
      { speaker: 'chatter', body: 'salut toi', mediaPrice: null },
      { speaker: 'chatter', body: '', mediaPrice: 6 },
    ])
    expect(msgs).toEqual([
      { role: 'user', content: '(début de la conversation)' },
      { role: 'assistant', content: 'cc\ntu fais quoi' },
      { role: 'user', content: 'salut toi\n[MEDIA VERROUILLE - 6€]' },
    ])
  })
  it('un historique vide donne un seul tour user', () => {
    expect(toFanMessages([])).toEqual([{ role: 'user', content: '(début de la conversation)' }])
  })
  it('un historique commençant par le chatter ne reçoit pas de préfixe', () => {
    expect(toFanMessages([{ speaker: 'chatter', body: 'hey', mediaPrice: null }])).toEqual([{ role: 'user', content: 'hey' }])
  })
})

describe('stripElim', () => {
  it('extrait et retire le token de faute', () => {
    expect(stripElim('nan laisse tomber 😒 [[ELIM:froid]]')).toEqual({ text: 'nan laisse tomber 😒', faultCode: 'froid' })
    expect(stripElim('[[ELIM:INTERRO]]')).toEqual({ text: '😒', faultCode: 'interro' })
    expect(stripElim('ça va et toi')).toEqual({ text: 'ça va et toi', faultCode: null })
    expect(stripElim('ok [[ELIM:inconnu]]')).toEqual({ text: 'ok', faultCode: null })
  })
})

describe('prompts', () => {
  it('fan solo : prénom, consigne, section MÉDIAS seulement si vente', () => {
    const p = fanSystemPrompt({ fanName: 'Tony', fanBrief: 'Tu es méfiant.', isSale: true })
    expect(p).toContain("Tu t'appelles Tony")
    expect(p).toContain('Tu es méfiant.')
    expect(p).toContain('MÉDIAS PAYANTS')
    expect(fanSystemPrompt({ fanName: null, fanBrief: 'x', isSale: false })).not.toContain('MÉDIAS PAYANTS')
  })
  it('boss : paliers ≤ plafond', () => {
    const p = bossFanSystemPrompt({ name: 'Kevin', age: 34, job: 'plombier', city: 'Lyon', persona: 'méfiant', derails: 'd', budgetCap: 60, negoWhere: 'nw', meetWhere: 'rw' })
    expect(p).toContain('6€ puis 30€ puis 60€')
    expect(p).not.toContain('150€')
    expect(p).toContain('TON PLAFOND DE DÉPENSE est 60€')
  })
  it('formatTranscript', () => {
    expect(formatTranscript([{ speaker: 'chatter', body: 'hey', mediaPrice: null }, { speaker: 'chatter', body: '', mediaPrice: 30 }, { speaker: 'fan', body: 'ok', mediaPrice: null }]))
      .toBe('Créatrice: hey\nCréatrice: [MEDIA VERROUILLE - 30€]\nFan: ok')
    expect(mediaLabel(6)).toBe('[MEDIA VERROUILLE - 6€]')
  })
})
