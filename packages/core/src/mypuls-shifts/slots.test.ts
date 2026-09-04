import { describe, expect, it } from 'vitest'
import { held, hoursOf, slotOf } from './slots'

describe('slotOf', () => {
  it('traduit les trois libellés MyPuls en vocabulaire CRM', () => {
    expect(slotOf('Matin')).toBe('matin')
    expect(slotOf('Après-midi')).toBe('aprem')
    // MyPuls dit « Soirée », le domaine tracker dit « nuit », le CRM dit « soir ».
    expect(slotOf('Soirée')).toBe('soir')
  })

  it('est insensible aux accents, à la casse et à la ponctuation', () => {
    expect(slotOf('APRES-MIDI')).toBe('aprem')
    expect(slotOf('soiree')).toBe('soir')
    expect(slotOf('Après midi')).toBe('aprem')
  })

  it('accepte « Nuit », le mot du tracker, pour le même créneau', () => {
    expect(slotOf('Nuit')).toBe('soir')
  })

  it('retombe sur l’heure de début si le créneau a été renommé dans MyPuls', () => {
    // Les fenêtres sont saisies dans un formulaire : un renommage ne doit pas casser l'import.
    expect(slotOf('Équipe A', '05:00')).toBe('matin')
    expect(slotOf('Équipe B', '13:00')).toBe('aprem')
    expect(slotOf('Équipe C', '21:00')).toBe('soir')
  })

  it('tolère un décalage de moins de deux heures', () => {
    expect(slotOf('Tôt', '06:30')).toBe('matin')
    expect(slotOf('Tard', '22:00')).toBe('soir')
  })

  it('gère la distance circulaire autour de minuit', () => {
    // 23:30 est à 2 h 30 de 21:00 → refusé ; 22:30 est à 1 h 30 → soir.
    expect(slotOf('X', '22:30')).toBe('soir')
    expect(() => slotOf('X', '23:30')).toThrow(/inconnu/)
  })

  it('refuse de trancher plutôt que de ranger un créneau au hasard', () => {
    expect(() => slotOf('Brunch')).toThrow(/inconnu/)
    expect(() => slotOf('Brunch', '10:00')).toThrow(/inconnu/)
  })
})

describe('hoursOf', () => {
  it('convertit HH:MM en heures décimales', () => {
    expect(hoursOf('05:00')).toBe(5)
    expect(hoursOf('13:30')).toBe(13.5)
    expect(hoursOf('5:15')).toBe(5.25)
  })

  it('refuse une heure illisible', () => {
    expect(() => hoursOf('midi')).toThrow(/illisible/)
  })
})

describe('held', () => {
  it('le poste est tenu À PARTIR du seuil, pas strictement au-dessus', () => {
    expect(held(80, 80)).toBe(true)
    expect(held(79.9, 80)).toBe(false)
    expect(held(100, 80)).toBe(true)
  })
})
