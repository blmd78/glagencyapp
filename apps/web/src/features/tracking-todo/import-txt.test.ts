import { describe, expect, it } from 'vitest'
import { holderMatches, parseTodoFile, periodLength } from './import-txt'

/**
 * Fichier ANONYMISÉ, au format de l'exemple du 2026-10-12 (#163) : le vrai contient des noms et
 * des montants, et le dépôt est public. Même structure : en-tête, horaires, bloc routine, titres de
 * semaine, jours, et un bloc sans date.
 */
const FILE = `TO-DO DE CAMILLE · MODÈLE A, MODÈLE B · 12 → 18 OCTOBRE 2026
Horaires : 10h30-12h, 13h-17h. Chaque jour : la routine + les tâches du jour.

=== À CRÉER UNE SEULE FOIS : SECTION RÉCURRENTE « ROUTINE » ===
Matin · Contrôler la nuit sur les deux modèles
Soir · Lire le récap de l'équipe

##### SEMAINE 1 · REMISE EN ORDRE #####

=== LUNDI 12 OCTOBRE · ≈ 2 h de tâches ===
[Modèle A] Répondre aux messages en attente (trier par montant) (1 h)
[2 modèles] Ranger les scripts (45 min)

=== MARDI 13 OCTOBRE · ≈ 1 h 30 de tâches ===
[Modèle B] Réécrire le début du script (1 h 30)
[Modèle B] Réécrire le début du script (1 h 30)
Sans tag ni durée

=== SI UNE JOURNÉE SE LIBÈRE ===
[Modèle A] Créer un nouveau script (3 h)
`

describe('parseTodoFile', () => {
  const r = parseTodoFile(FILE)

  it('lit la personne visée et la période de la 1re ligne', () => {
    expect(r.holder).toBe('CAMILLE')
    expect(r.period).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(r.errors).toEqual([])
  })

  it('la routine devient la section « Routine », créneau gardé dans le titre', () => {
    expect(r.routineSection).toBe('Routine')
    expect(r.routine.map((t) => t.label)).toEqual([
      'Matin · Contrôler la nuit sur les deux modèles',
      "Soir · Lire le récap de l'équipe",
    ])
  })

  it('une tâche du jour : tag dans le titre, durée dans la description', () => {
    expect(r.days[0]).toEqual({
      date: '2026-10-12',
      tasks: [
        { label: '[Modèle A] Répondre aux messages en attente (trier par montant)', description: 'Durée estimée : 1 h', category: 'À faire', urgency: 'normale' },
        { label: '[2 modèles] Ranger les scripts', description: 'Durée estimée : 45 min', category: 'À faire', urgency: 'normale' },
      ],
    })
  })

  it('une ligne sans tag ni durée reste une tâche', () => {
    expect(r.days[1]?.tasks.at(-1)).toEqual({ label: 'Sans tag ni durée', description: '', category: 'À faire', urgency: 'normale' })
  })

  it('un doublon du même jour est listé, pas importé deux fois', () => {
    expect(r.days[1]?.tasks.filter((t) => t.label.startsWith('[Modèle B]'))).toHaveLength(1)
    expect(r.ignored.some((x) => x.reason === 'en double dans le fichier' && x.line === 16)).toBe(true)
  })

  it('le bloc sans date n’est pas importé mais apparaît, avec sa ligne', () => {
    expect(r.ignored).toContainEqual({
      line: 20,
      text: '[Modèle A] Créer un nouveau script (3 h)',
      reason: 'bloc sans date (« SI UNE JOURNÉE SE LIBÈRE »)',
    })
  })

  it('les lignes informatives (horaires, semaines) ne sont ni importées ni listées', () => {
    expect(r.ignored.map((x) => x.line)).toEqual([16, 20])
  })
})

describe('parseTodoFile — erreurs, rien ne s’importe', () => {
  it('1re ligne illisible', () => {
    expect(parseTodoFile('Ma to-do\n=== LUNDI 12 OCTOBRE ===\n[A] x').errors[0]?.line).toBe(1)
  })

  it('jour qui ne correspond pas à la date', () => {
    const r = parseTodoFile('TO-DO DE X · A · 12 → 18 OCTOBRE 2026\n=== MARDI 12 OCTOBRE ===\n[A] x')
    expect(r.errors[0]).toEqual({ line: 2, message: '« MARDI 12 OCTOBRE » : le 12/10 n\'est pas un mardi.' })
  })

  it('jour hors de la période', () => {
    const r = parseTodoFile('TO-DO DE X · A · 12 → 18 OCTOBRE 2026\n=== LUNDI 19 OCTOBRE ===\n[A] x')
    expect(r.errors[0]?.message).toContain('hors de la période')
  })

  it('titre trop long', () => {
    const r = parseTodoFile(`TO-DO DE X · A · 12 → 18 OCTOBRE 2026\n=== LUNDI 12 OCTOBRE ===\n[A] ${'a'.repeat(200)}`)
    expect(r.errors[0]?.line).toBe(3)
  })
})

describe('périodes', () => {
  it('à cheval sur deux mois', () => {
    const r = parseTodoFile('TO-DO DE X · A · 28 SEPTEMBRE → 4 OCTOBRE 2026\n=== LUNDI 28 SEPTEMBRE ===\n[A] x')
    expect(r.period).toEqual({ from: '2026-09-28', to: '2026-10-04' })
    expect(r.days[0]?.date).toBe('2026-09-28')
    expect(r.errors).toEqual([])
  })

  it('à cheval sur deux années : décembre est l’année d’avant', () => {
    const r = parseTodoFile('TO-DO DE X · A · 28 DÉCEMBRE → 3 JANVIER 2027\n=== LUNDI 28 DÉCEMBRE ===\n[A] x')
    expect(r.period).toEqual({ from: '2026-12-28', to: '2027-01-03' })
    expect(r.days[0]?.date).toBe('2026-12-28')
  })

  it('longueur en jours', () => {
    expect(periodLength({ from: '2026-10-12', to: '2026-10-31' })).toBe(20)
  })
})

describe('holderMatches — un avertissement, jamais un blocage', () => {
  it('même prénom, casse et accents différents', () => expect(holderMatches('LÉA', 'Léa Martin')).toBe(true))
  it('autre personne', () => expect(holderMatches('CAMILLE', 'Axel')).toBe(false))
})

/**
 * 2e FORMAT (fichier du 2026-10-12 après-midi), anonymisé : des notes d'en-tête, et dans chaque jour
 * des paragraphes qui commencent par un TITRE DE GROUPE. Le modèle s'écrit `Modèle A : …`.
 */
const FILE_V2 = `TO-DO DE CAMILLE · MODÈLE A, MODÈLE B · 12 → 18 OCTOBRE 2026

Règles : une mission à la fois, on la finit avant de passer à la suite.
Pas fini le soir ? On continue le lendemain.

=== SECTION RÉCURRENTE « ROUTINE » (à créer une seule fois) ===
Matin · Vérifier la nuit
Soir · Lire le récap

##### SEMAINE 1 #####

=== LUNDI 12 OCTOBRE ===
Urgences
Modèle A : Répondre aux messages en attente
Se présenter dans les groupes

Outils
Créer le tableau des envois
Se présenter dans les groupes

=== MARDI 13 OCTOBRE ===
Une tâche seule, sans titre
`

describe('parseTodoFile — 2e format, titres de groupe', () => {
  const r = parseTodoFile(FILE_V2)

  it('les notes d’en-tête ne sont ni importées ni signalées', () => {
    expect(r.errors).toEqual([])
    expect(r.ignored).toEqual([])
  })

  it('le titre d’un paragraphe devient la section de ses tâches', () => {
    expect(r.days[0]?.tasks.map((t) => `${t.category} | ${t.label}`)).toEqual([
      'Urgences | Modèle A : Répondre aux messages en attente',
      'Urgences | Se présenter dans les groupes',
      'Outils | Créer le tableau des envois',
      'Outils | Se présenter dans les groupes',
    ])
  })

  it('le groupe « Urgences » passe ses tâches en Urgente, les autres restent Normale', () => {
    expect(r.days[0]?.tasks.map((t) => t.urgency)).toEqual(['urgente', 'urgente', 'normale', 'normale'])
  })

  it('le même titre dans deux groupes du même jour n’est pas un doublon', () => {
    expect(r.days[0]?.tasks.filter((t) => t.label === 'Se présenter dans les groupes')).toHaveLength(2)
  })

  it('une ligne seule dans son paragraphe reste une tâche, dans « À faire »', () => {
    expect(r.days[1]?.tasks).toEqual([
      { label: 'Une tâche seule, sans titre', description: '', category: 'À faire', urgency: 'normale' },
    ])
  })

  it('la routine reste lue, dans sa section', () => {
    expect(r.routineSection).toBe('Routine')
    expect(r.routine.map((t) => t.category)).toEqual(['Routine', 'Routine'])
  })
})

describe('parseTodoFile — cas limites des titres de groupe (revue)', () => {
  it('1er format : une tâche sans tag en tête de jour reste une tâche', () => {
    const r = parseTodoFile('TO-DO DE X · A · 12 → 18 OCTOBRE 2026\n=== LUNDI 12 OCTOBRE ===\nAppeler Camille\n[Modèle A] Ranger les scripts (45 min)')
    expect(r.days[0]?.tasks.map((t) => `${t.category} | ${t.label}`)).toEqual([
      'À faire | Appeler Camille',
      'À faire | [Modèle A] Ranger les scripts',
    ])
  })

  it('2e format : un paragraphe sans titre après « Urgences » revient dans « À faire », en Normale', () => {
    const r = parseTodoFile('TO-DO DE X · A · 12 → 18 OCTOBRE 2026\n=== LUNDI 12 OCTOBRE ===\nUrgences\nRépondre\n\nFaire le bilan')
    expect(r.days[0]?.tasks.map((t) => `${t.category} | ${t.urgency} | ${t.label}`)).toEqual([
      'Urgences | urgente | Répondre',
      'À faire | normale | Faire le bilan',
    ])
  })

  it('« Pas urgent » n’est pas « Urgences »', () => {
    const r = parseTodoFile('TO-DO DE X · A · 12 → 18 OCTOBRE 2026\n=== LUNDI 12 OCTOBRE ===\nPas urgent\nRanger')
    expect(r.days[0]?.tasks[0]).toMatchObject({ category: 'Pas urgent', urgency: 'normale' })
  })

  it('avant le 1er bloc : une ligne en forme de tâche reste listée, la prose est ignorée', () => {
    const r = parseTodoFile('TO-DO DE X · A · 12 → 18 OCTOBRE 2026\nRègles : une à la fois.\n[A] Tâche sans jour (1 h)\n=== LUNDI 12 OCTOBRE ===\n[A] x')
    expect(r.ignored).toEqual([{ line: 3, text: '[A] Tâche sans jour (1 h)', reason: 'hors de tout bloc' }])
  })
})

