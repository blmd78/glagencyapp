'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { updateChatterCrm } from '../actions'
import { updateChatterCrmInput, type UpdateChatterCrmInput } from '../schema'
import { CRM_ROLES, CRM_SHIFTS, CRM_TEAMS } from '@/lib/types/chatters'
import type { ChatterRow } from '@/lib/types/chatters'

const LABELS: Record<string, string> = {
  closer: 'Closer',
  setter: 'Setter',
  rouge: 'Rouge',
  bleue: 'Bleue',
  matin: 'Matin',
  aprem: 'Après-midi',
  soir: 'Soir',
}
const NONE = 'none' // valeur sentinelle des selects (Radix refuse la string vide)

function CrmSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: readonly string[]
  onChange: (v: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-sm text-muted-foreground">
            —
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-sm">
              {LABELS[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Crayon + dialog : édite rôle / équipe (rouge-bleue) / shift closing d'un chatteur. */
export function ChatterCrmDialog({ chatter }: { chatter: ChatterRow }) {
  const [open, setOpen] = useState(false)
  const form = useForm<UpdateChatterCrmInput>({
    resolver: zodResolver(updateChatterCrmInput),
    defaultValues: {
      chatterId: chatter.id,
      role: chatter.role,
      team: chatter.team,
      shift: chatter.shift,
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await updateChatterCrm(values)
    if (!res.success) {
      // Erreur métier/technique : message de l'action (jamais un message Supabase brut).
      form.setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(`Closing de ${chatter.name} enregistré`)
    setOpen(false)
  })

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Réouverture : repartir des valeurs actuelles de la ligne (pas d'un vieux brouillon).
    if (next)
      form.reset({ chatterId: chatter.id, role: chatter.role, team: chatter.team, shift: chatter.shift })
  }

  const serverError = form.formState.errors.root?.serverError?.message

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Éditer closing">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Closing — {chatter.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <CrmSelect label="Rôle" value={field.value} options={CRM_ROLES} onChange={field.onChange} />
            )}
          />
          <Controller
            control={form.control}
            name="team"
            render={({ field }) => (
              <CrmSelect label="Équipe" value={field.value} options={CRM_TEAMS} onChange={field.onChange} />
            )}
          />
          <Controller
            control={form.control}
            name="shift"
            render={({ field }) => (
              <CrmSelect label="Shift" value={field.value} options={CRM_SHIFTS} onChange={field.onChange} />
            )}
          />
          {serverError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {serverError}
            </p>
          )}
          <ActionButton type="submit" pending={form.formState.isSubmitting} className="self-end">
            Enregistrer
          </ActionButton>
        </form>
      </DialogContent>
    </Dialog>
  )
}
