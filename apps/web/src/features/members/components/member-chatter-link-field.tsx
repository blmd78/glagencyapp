'use client'

import { Controller, type Control } from 'react-hook-form'
import { Combobox } from '@/components/ui/combobox'
import type { MemberForm } from '../schema'

/** Lien « Chatteur MyPuls » — SUPERADMIN uniquement (garde serveur en plus). Permet de lire le
 *  closing du membre côté Chatteurs/Spenders. Sentinelle 'none' ↔ '' (pas de lien), même patron
 *  que le rattachement manager (member-access-fields.tsx). */
export function MemberChatterLinkField({
  control,
  chatters,
  isSubmitting,
}: {
  control: Control<MemberForm>
  chatters: { id: string; name: string }[]
  isSubmitting: boolean
}) {
  return (
    <Controller
      name="chatterId"
      control={control}
      render={({ field }) => (
        <div className="grid gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Chatteur MyPuls lié
          </label>
          <Combobox
            options={[{ value: 'none', label: 'Aucun' }, ...chatters.map((c) => ({ value: c.id, label: c.name }))]}
            value={field.value || 'none'}
            onChange={(v) => field.onChange(v === 'none' ? '' : v)}
            placeholder="Rechercher un chatteur…"
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">
            Lie ce membre à son chatteur MyPuls (rôle/équipe closing lus depuis ce membre).
          </p>
        </div>
      )}
    />
  )
}
