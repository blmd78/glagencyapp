import { describe, expect, it } from 'vitest'
import { mergeModelOptions } from './model-options'

const row = (creatorId: string, model: string) => ({ creatorId, model })

describe('mergeModelOptions', () => {
  it('toutes les modèles connues sont proposées, même sans ligne chargée (vues paginées : 100 premières lignes)', () => {
    const known = [
      { value: 'c-elsa', label: 'Elsa' },
      { value: 'c-emma', label: 'Emma' },
      { value: 'c-romy', label: 'Romy' },
    ]
    expect(mergeModelOptions(known, [row('c-emma', 'Emma')])).toEqual(known)
  })

  it('une modèle présente dans les lignes mais absente des connues reste proposée ; pas de doublon ; tri par nom', () => {
    const known = [{ value: 'c-romy', label: 'Romy' }]
    expect(mergeModelOptions(known, [row('c-emma', 'Emma'), row('c-romy', 'Romy'), row('c-emma', 'Emma')])).toEqual([
      { value: 'c-emma', label: 'Emma' },
      { value: 'c-romy', label: 'Romy' },
    ])
  })

  it('sans modèles connues : déduites des lignes (vues Alertes et Archive, chargées en entier)', () => {
    expect(mergeModelOptions(undefined, [row('c-lucie', 'Lucie'), row('c-alice', 'Alice')])).toEqual([
      { value: 'c-alice', label: 'Alice' },
      { value: 'c-lucie', label: 'Lucie' },
    ])
  })
})
