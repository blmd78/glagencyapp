'use client'

import { useMemo, useState, useTransition } from 'react'
import { ClipboardEdit, Plus } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addSocialAccount, saveSocialEntries } from '../actions'
import type { MktSocialRow } from '../types'

type Draft = { followers: string; views: string; engagement: string }

/**
 * Saisie du jour (remplace le bilan Discord des VA) : une ligne par compte —
 * followers actuels (préremplis avec le dernier relevé) + vues 24 h (+ engagement sur X).
 * Les lignes laissées telles quelles ne sont pas modifiées si aucune vue n'est saisie.
 */
export function SocialEntryDialog({
  platform,
  accounts,
}: {
  platform: 'instagram' | 'twitter' | 'telegram'
  accounts: MktSocialRow[]
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const active = useMemo(() => accounts.filter((a) => a.active), [accounts])

  const draftOf = (id: string): Draft => drafts[id] ?? { followers: '', views: '', engagement: '' }
  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftOf(id), ...patch } }))

  const openDialog = () => {
    // Préremplit les followers avec le dernier relevé connu (la saisie ne corrige que le delta).
    const init: Record<string, Draft> = {}
    for (const a of active) {
      init[a.id] = { followers: a.followers != null ? String(a.followers) : '', views: '', engagement: '' }
    }
    setDrafts(init)
    setDate(today)
    setError('')
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const rows = active
        .map((a) => {
          const d = draftOf(a.id)
          const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s))))
          const followers = num(d.followers)
          const views = num(d.views)
          const engagement = platform === 'twitter' ? num(d.engagement) : null
          // Ne compte que les lignes réellement renseignées (vues saisies, ou followers modifiés).
          const touched =
            views != null || engagement != null || (followers != null && followers !== a.followers)
          if (!touched) return null
          return { accountId: a.id, followers, views24h: views, engagement24h: engagement, status: 'ok' }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      if (!rows.length) {
        setError('Aucune valeur saisie.')
        return
      }
      const res = await saveSocialEntries({ platform, date, rows })
      if (!res.success) {
        setError(res.error)
        return
      }
      setOpen(false)
    })

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={openDialog}>
        <ClipboardEdit className="size-4" />
        Saisie du jour
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saisie {platform === 'instagram' ? 'Instagram' : platform === 'twitter' ? 'Twitter / X' : 'Telegram'}</DialogTitle>
            <DialogDescription>
              Followers actuels et vues des dernières 24 h par compte — seules les lignes
              renseignées sont enregistrées (delta followers calculé automatiquement).
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Label htmlFor="entry-date" className="text-xs text-muted-foreground">
              Date
            </Label>
            <Input
              id="entry-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-40 text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <div
              className={`grid items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ${platform === 'twitter' ? 'grid-cols-[1fr_6rem_6rem_6rem]' : 'grid-cols-[1fr_6rem_6rem]'}`}
            >
              <span>Compte</span>
              <span className="text-right">Followers</span>
              <span className="text-right">Vues 24 h</span>
              {platform === 'twitter' && <span className="text-right">Engag.</span>}
            </div>
            {active.map((a) => {
              const d = draftOf(a.id)
              return (
                <div
                  key={a.id}
                  className={`grid items-center gap-2 ${platform === 'twitter' ? 'grid-cols-[1fr_6rem_6rem_6rem]' : 'grid-cols-[1fr_6rem_6rem]'}`}
                >
                  <span className="truncate text-sm">@{a.handle}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={d.followers}
                    placeholder={a.followers != null ? String(a.followers) : '—'}
                    onChange={(e) => setDraft(a.id, { followers: e.target.value })}
                    className="h-8 text-right text-sm tabular-nums"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={d.views}
                    placeholder="0"
                    onChange={(e) => setDraft(a.id, { views: e.target.value })}
                    className="h-8 text-right text-sm tabular-nums"
                  />
                  {platform === 'twitter' && (
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={d.engagement}
                      placeholder="0"
                      onChange={(e) => setDraft(a.id, { engagement: e.target.value })}
                      className="h-8 text-right text-sm tabular-nums"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <ActionButton onClick={submit} pending={pending}>
              Enregistrer la saisie
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Ajout d'un compte de la farm à suivre. */
export function AddAccountDialog({ platform }: { platform: 'instagram' | 'twitter' | 'telegram' }) {
  const [open, setOpen] = useState(false)
  const [handle, setHandle] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      const res = await addSocialAccount({ platform, handle, creatorId: null, staffId: null })
      if (!res.success) {
        setError(res.error)
        return
      }
      setHandle('')
      setOpen(false)
    })

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Compte
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau {platform === 'telegram' ? 'canal Telegram' : platform === 'instagram' ? 'compte Instagram' : 'compte X'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-handle">Handle</Label>
            <Input
              id="acc-handle"
              value={handle}
              placeholder="@moncompte"
              onChange={(e) => setHandle(e.target.value)}
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <ActionButton onClick={submit} pending={pending} disabled={!handle.trim()}>
              Ajouter
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
