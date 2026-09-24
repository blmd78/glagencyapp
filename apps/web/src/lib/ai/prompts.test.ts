import { describe, expect, it } from 'vitest'
import { bossFanSystemPrompt, fanSystemPrompt, formatTranscript, mediaLabel, sonnetBossFanSystem, sonnetFanSystem, stripElim, toFanMessages } from './prompts'

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

describe('prompts du fan Sonnet', () => {
  const boss = { name: 'Kevin', age: 34, job: 'plombier', city: 'Lyon', persona: 'méfiant', derails: 'd', budgetCap: 60, negoWhere: 'nw', meetWhere: 'rw' }
  const all = (b: { text: string }[]) => b.map((x) => x.text).join('\n')

  it('solo : partie fixe en cache 1 h, la même pour tous les cas ; le personnage dans le 2e bloc', () => {
    const a = sonnetFanSystem({ fanName: 'Tony', fanBrief: 'Tu es méfiant.', isSale: false })
    const b = sonnetFanSystem({ fanName: 'Karim', fanBrief: 'Tu es pressé.', isSale: false })
    expect(a).toHaveLength(2)
    expect(a[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(a[0].text).toBe(b[0].text)
    expect(a[0].text).not.toContain('Tony')
    expect(a[1].text).toContain("Tu t'appelles Tony")
    expect(a[1].text).toContain('Tu es méfiant.')
    expect(a[1].text).toContain('EST RARISSIME')
  })
  it('partie fixe assez longue pour être cachée : Sonnet 5 ne cache rien sous 1 024 tokens', () => {
    // ~2,07 caractères par token (mesuré au compteur de l'API : 3 518 car. = 1 699 tokens) — 2 500
    // caractères laissent une marge au-dessus du seuil. En dessous, le cache se coupe EN SILENCE.
    expect(sonnetFanSystem({ fanName: null, fanBrief: 'x', isSale: false })[0].text.length).toBeGreaterThan(2500)
    expect(sonnetBossFanSystem(boss)[0].text.length).toBeGreaterThan(2500)
  })
  it('vente seulement : section MÉDIAS et interdiction d’écrire la balise', () => {
    expect(all(sonnetFanSystem({ fanName: null, fanBrief: 'x', isSale: true }))).toContain("Tu n'écris JAMAIS la balise")
    expect(all(sonnetFanSystem({ fanName: null, fanBrief: 'x', isSale: false }))).not.toContain('MÉDIAS PAYANTS')
  })
  it('boss : même découpage, paliers et plafond dans le 2e bloc', () => {
    const p = sonnetBossFanSystem(boss)
    expect(p[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(p[0].text).not.toContain('Kevin')
    expect(p[1].text).toContain('6€ puis 30€ puis 60€')
    expect(p[1].text).toContain('TON PLAFOND DE DÉPENSE est 60€')
  })
  it('Haiku ne reçoit AUCUN garde-fou Sonnet — son prompt reste celui de GLA', () => {
    expect(fanSystemPrompt({ fanName: 'Tony', fanBrief: 'x', isSale: true })).not.toContain('RARISSIME')
    expect(bossFanSystemPrompt(boss)).not.toContain('RARISSIME')
  })
})
