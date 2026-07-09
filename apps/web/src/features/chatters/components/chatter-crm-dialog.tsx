'use client'

import { useState, useTransition } from 'react'
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
import { CRM_ROLES, CRM_SHIFTS, CRM_TEAMS } from '../types'
import type { ChatterRow, CrmRole, CrmShift, CrmTeam } from '../types'

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
  const [role, setRole] = useState<CrmRole | null>(chatter.role)
  const [team, setTeam] = useState<CrmTeam | null>(chatter.team)
  const [shift, setShift] = useState<CrmShift | null>(chatter.shift)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const res = await updateChatterCrm({ chatterId: chatter.id, role, team, shift })
      if (!res.success) return setError(res.error)
      setError(null)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Éditer closing">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Closing — {chatter.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <CrmSelect
            label="Rôle"
            value={role}
            options={CRM_ROLES}
            onChange={(v) => setRole(v as CrmRole | null)}
          />
          <CrmSelect
            label="Équipe"
            value={team}
            options={CRM_TEAMS}
            onChange={(v) => setTeam(v as CrmTeam | null)}
          />
          <CrmSelect
            label="Shift"
            value={shift}
            options={CRM_SHIFTS}
            onChange={(v) => setShift(v as CrmShift | null)}
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <ActionButton pending={pending} onClick={submit} className="self-end">
            Enregistrer
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
