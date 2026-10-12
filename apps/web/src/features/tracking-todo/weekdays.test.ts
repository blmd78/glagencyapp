import { describe, expect, it } from 'vitest'
import { mergeWeekdays, startAfterAdd } from './weekdays'

describe('mergeWeekdays', () => {
  it('AJOUTE le jour à ceux que la section avait déjà', () => {
    // Recréer « Compta » depuis le mardi alors qu'elle existe le lundi doit la faire apparaître
    // les deux jours. Remplacer la déplaçait, et le lundi perdait sa section sans prévenir.
    expect(mergeWeekdays('1', [2])).toBe('1,2')
  })

  it('trie et dédoublonne', () => {
    expect(mergeWeekdays('3,1', [2, 1])).toBe('1,2,3')
  })

  it('accepte une section qui n’avait aucun jour', () => {
    // `weekdays` vaut '' par défaut en base (0127) : une section ponctuelle.
    expect(mergeWeekdays('', [5])).toBe('5')
  })

  it('ignore les restes vides d’une chaîne mal formée', () => {
    expect(mergeWeekdays('1,,2', [])).toBe('1,2')
  })
})

describe('startAfterAdd — retaper une section importée (0194)', () => {
  it('depuis un jour antérieur à sa date de début : elle commence ce jour-là', () => {
    expect(startAfterAdd('2026-10-12', '2026-10-05')).toBe('2026-10-05')
  })
  it('depuis un jour où elle est déjà visible : rien ne change', () => {
    expect(startAfterAdd('2026-10-12', '2026-10-14')).toBeUndefined()
  })
  it('section sans date (faite à la main) : rien ne change, elle est partout', () => {
    expect(startAfterAdd(null, '2026-10-05')).toBeUndefined()
  })
})

