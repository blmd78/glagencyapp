'use client'

import { useState, useTransition } from 'react'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { addXAccounts, type AddXAccountsResult } from '../actions'

const count = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « 55 ajoutés · 2 déjà présents · 1 invalide » — seulement les rubriques non vides. */
function summary(r: AddXAccountsResult): string {
  const parts = [
    r.added.length && count(r.added.length, 'ajouté'),
    r.reactivated.length && count(r.reactivated.length, 'réactivé'),
    r.existing.length && count(r.existing.length, 'déjà présent'),
    r.invalid.length && count(r.invalid.length, 'invalide'),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Aucun pseudo reconnu.'
}

/**
 * Ajout des comptes X au relevé (demande Benoit 2026-09-29) : on colle une liste de pseudos, un
 * par ligne. Bouton = celui des Groupes sur l'écran Liens, fenêtre = celle de la note des sources
 * (`source-note-dialog.client.tsx`). Les entrées refusées restent dans la zone de texte, pour être
 * corrigées sans retaper le reste.
 */
export function AddXAccountsDialog() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [refused, setRefused] = useState(false)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      const res = await addXAccounts({ text })
      if (!res.success) return void toast.error(res.error)
      const r = res.data
      const nothing = !r.added.length && !r.reactivated.length && !r.existing.length && !r.invalid.length
      if (nothing) return void toast.warning(summary(r))
      if (r.invalid.length) {
        toast.warning(summary(r))
        setText(r.invalid.join('\n'))
        setRefused(true)
        return
      }
      toast.success(summary(r))
      setText('')
      setRefused(false)
      setOpen(false)
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        if (o) {
          setText('')
          setRefused(false)
        }
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
          <UserPlus className="size-4" />
          Ajouter des comptes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter des comptes X</DialogTitle>
          <DialogDescription>
            Un pseudo par ligne — le @ et les liens x.com sont acceptés. Les comptes ajoutés sont
            relevés dès la nuit suivante (0,01 $ par compte et par nuit).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="x-handles">Pseudos</Label>
          <Textarea
            id="x-handles"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            disabled={pending}
            placeholder={'carla_lovy\n@lolaa_chic\nhttps://x.com/…'}
          />
          {refused && (
            <span className="text-xs text-muted-foreground">
              Ces entrées ne sont pas des pseudos X : corrige-les ou efface-les.
            </span>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <ActionButton pending={pending} onClick={submit} disabled={!text.trim()}>
            Ajouter
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
