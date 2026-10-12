import { describe, expect, it } from 'vitest'
import { addTaskInput, habitInput, moveTaskInput, updateTaskInput } from './schema'

const OWNER = '11111111-1111-4111-8111-111111111111'
const TASK = '22222222-2222-4222-8222-222222222222'

/**
 * LA CATÉGORIE VIDE EST UNE CATÉGORIE — « Sans section », première option de leur sélecteur
 * d'habitude (todo.html:1365), et le défaut de `habitInput`.
 *
 * Elle ne l'était que pour les habitudes : `addTaskInput` et `moveTaskInput` exigeaient
 * `min(1)`. Dès qu'un encadrant posait une habitude sans section, le groupe qu'elle fait
 * apparaître dans la semaine (`get-week.ts:109`, `names.add(h.category)`) devenait un cul-de-sac
 * — son « + » répondait « Saisie invalide », et un déposant n'avait plus AUCUN point d'entrée ce
 * jour-là, le groupe d'accueil de `DayColumn` ne se posant que sur une journée vide.
 * Cas réel : Marco, habitude du 2026-09-03 récurrente 6 jours sur 7.
 */
describe('catégorie « sans section »', () => {
  it('addTask accepte la catégorie vide', () => {
    const r = addTaskInput.safeParse({ ownerId: OWNER, date: '2026-09-08', category: '', label: 'Relancer' })
    expect(r.success).toBe(true)
  })

  it('moveTask accepte la catégorie vide', () => {
    const r = moveTaskInput.safeParse({ ownerId: OWNER, taskId: TASK, date: '2026-09-08', category: '' })
    expect(r.success).toBe(true)
  })

  it('la catégorie vide est bien celle que produit une habitude sans section', () => {
    const r = habitInput.safeParse({ ownerId: OWNER, label: 'Relancer', weekdays: [1] })
    expect(r.success && r.data.category).toBe('')
  })

  it('un intitulé de tâche reste obligatoire', () => {
    const r = addTaskInput.safeParse({ ownerId: OWNER, date: '2026-09-08', category: '', label: '  ' })
    expect(r.success).toBe(false)
  })
})

/**
 * TITRE, DESCRIPTION, URGENCE (#160) — décision de Benoit du 2026-10-12 : titre obligatoire,
 * description facultative, urgence Normale par défaut. Les bornes sont celles des `check` de 0193.
 */
describe('titre, description et urgence', () => {
  it('le titre seul reste une tâche complète : description vide, urgence normale', () => {
    const r = addTaskInput.safeParse({ ownerId: OWNER, date: '2026-10-12', category: '', label: 'Relancer' })
    expect(r.success && r.data.description).toBe('')
    expect(r.success && r.data.urgency).toBe('normale')
  })

  it('une urgence hors des trois niveaux est refusée', () => {
    const r = addTaskInput.safeParse({ ownerId: OWNER, date: '2026-10-12', category: '', label: 'x', urgency: 'critique' })
    expect(r.success).toBe(false)
  })

  it('la description est bornée à 2000 caractères, comme la base', () => {
    const r = addTaskInput.safeParse({ ownerId: OWNER, date: '2026-10-12', category: '', label: 'x', description: 'a'.repeat(2001) })
    expect(r.success).toBe(false)
  })

  it('la pop-up modifie aussi une occurrence VIRTUELLE d’habitude', () => {
    const r = updateTaskInput.safeParse({
      ownerId: OWNER,
      taskId: `habit:${TASK}:2026-10-12`,
      label: 'Renommée',
      description: '',
      urgency: 'urgente',
      date: '2026-10-13',
    })
    expect(r.success).toBe(true)
  })

  it('la pop-up refuse un titre vide', () => {
    const r = updateTaskInput.safeParse({ ownerId: OWNER, taskId: TASK, label: ' ', description: '', urgency: 'normale', date: '2026-10-12' })
    expect(r.success).toBe(false)
  })

  it('une habitude a aussi description et urgence, par défaut vides / normale', () => {
    const r = habitInput.safeParse({ ownerId: OWNER, label: 'Routine', weekdays: [1] })
    expect(r.success && r.data.urgency).toBe('normale')
    expect(r.success && r.data.description).toBe('')
  })
})
