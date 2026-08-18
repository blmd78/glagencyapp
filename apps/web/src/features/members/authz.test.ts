import { describe, expect, it, vi } from 'vitest'

// authz.ts importe des modules lourds (next/headers via @/lib/auth, cookies via
// @/lib/supabase/server, @glagency/db) — mockés pour isoler mergePages, seule fonction pure
// testée ici (@glagency/core est pur, pas besoin de mock).
vi.mock('@/lib/auth', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@glagency/db', () => ({ createAdminClient: vi.fn() }))

import { mergePages } from './authz'

describe('mergePages', () => {
  it('pose le droit de face formation dès qu’une page frm-* est cochée, et préserve les autres faces', () => {
    expect(mergePages(['overview', 'mkt-liens', 'marketing'], ['frm-entrainement'], 'formation'))
      .toEqual(['overview', 'mkt-liens', 'marketing', 'frm-entrainement', 'formation'])
  })
  it('retire le droit de face quand plus aucune page de la face n’est cochée', () => {
    expect(mergePages(['overview', 'frm-suivi', 'formation'], [], 'formation')).toEqual(['overview'])
  })
  it('remplace les slugs de la face courante sans toucher aux autres', () => {
    expect(mergePages(['frm-suivi', 'formation', 'overview'], ['frm-entrainement'], 'formation'))
      .toEqual(['overview', 'frm-entrainement', 'formation'])
  })
  it('face chatteurs : pas de droit de face', () => {
    expect(mergePages(['frm-suivi', 'formation'], ['overview', 'insights'], 'chatter'))
      .toEqual(['frm-suivi', 'formation', 'overview', 'insights'])
  })
})
