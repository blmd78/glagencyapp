'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { LS_PLATFORMS, LS_PLATFORM_LABEL, type LsPlatform } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateLsAttribution } from '../actions'
import type { TraficEdit } from '../types'

const NONE = 'none'

/**
 * Le crayon d'une ligne de lien : modèle, réseau, et compte Instagram ou opérateur X. Même modèle
 * de fenêtre que `edit-x-handle-dialog.client.tsx`. Enregistrer fige la ligne (`manual`).
 */
export function EditAttributionDialog({
  edit,
  label,
  creators,
  accounts,
}: {
  edit: TraficEdit
  label: string
  creators: { id: string; name: string }[]
  accounts: { id: string; handle: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [creatorId, setCreatorId] = useState(edit.creatorId ?? NONE)
  const [platform, setPlatform] = useState<LsPlatform>(edit.platform)
  const [accountId, setAccountId] = useState(edit.socialAccountId ?? NONE)
  const [operator, setOperator] = useState(edit.operator ?? '')
  const [pending, start] = useTransition()
  const id = `ls-${edit.linkId}`

  const reset = () => {
    setCreatorId(edit.creatorId ?? NONE)
    setPlatform(edit.platform)
    setAccountId(edit.socialAccountId ?? NONE)
    setOperator(edit.operator ?? '')
  }

  const save = () =>
    start(async () => {
      const res = await updateLsAttribution({
        linkId: edit.linkId,
        creatorId: creatorId === NONE ? null : creatorId,
        platform,
        socialAccountId: platform === 'instagram' && accountId !== NONE ? accountId : null,
        operator: platform === 'x' && operator.trim() ? operator.trim() : null,
      })
      if (!res.success) return void toast.error(res.error)
      toast.success('Attribution enregistrée : le relevé ne la recalculera plus.')
      setOpen(false)
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        if (o) reset()
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={`Corriger l’attribution de ${label}`}
          title="Corriger l’attribution"
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <DialogHeader>
            <DialogTitle>Corriger l’attribution</DialogTitle>
            <DialogDescription>
              {label} — {edit.manual ? 'déjà corrigé à la main' : 'attribué automatiquement'}. Une fois enregistré, le
              relevé nocturne ne touche plus à ce lien.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-modele`}>Modèle</Label>
            <Select value={creatorId} onValueChange={setCreatorId} disabled={pending}>
              <SelectTrigger id={`${id}-modele`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Non attribuée</SelectItem>
                {creators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-reseau`}>Réseau</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as LsPlatform)} disabled={pending}>
              <SelectTrigger id={`${id}-reseau`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LS_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {LS_PLATFORM_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {platform === 'instagram' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-compte`}>Compte Instagram</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={pending}>
                <SelectTrigger id={`${id}-compte`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      @{a.handle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {platform === 'x' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-operateur`}>Opérateur X</Label>
              <Input
                id={`${id}-operateur`}
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                disabled={pending}
                autoComplete="off"
                maxLength={40}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={pending}>
              Enregistrer
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
