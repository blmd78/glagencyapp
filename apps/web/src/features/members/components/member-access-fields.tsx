'use client'

import { Controller, type Control } from 'react-hook-form'
import { ChevronsUpDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { ROLE_NAME } from '@/lib/roles'
import type { MemberForm } from '../schema'

/**
 * Rôle + rattachement manager — réservés à un appelant admin (le manager a son rôle/
 * rattachement verrouillés côté serveur). Extrait de member-dialog.tsx (split > 300 l.,
 * docs/guidelines-standard-feature.md) — JSX déplacé tel quel, DOM byte-identique.
 */
export function MemberAccessFields({
  control,
  scope,
  roleValue,
  superadmin,
  attachables,
  isSubmitting,
}: {
  control: Control<MemberForm>
  scope: 'chatter' | 'marketing'
  roleValue: MemberForm['role']
  superadmin: boolean
  /** Managers rattachables (l'éditée est déjà exclue par l'appelant). */
  attachables: { id: string; name: string }[]
  isSubmitting: boolean
}) {
  'use no memo'
  return (
    <>
      <Controller
        name="role"
        control={control}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rôle
            </label>
            <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Libellés depuis `lib/roles.ts` (source unique). */}
                <SelectItem value="chatteur">{ROLE_NAME.chatteur}</SelectItem>
                {/* Rôle fonctionnel, pas hiérarchique — pas d'équipe, pas de to-do/planning. */}
                <SelectItem value="police">{ROLE_NAME.police}</SelectItem>
                <SelectItem value="sous-manager">{ROLE_NAME['sous-manager']}</SelectItem>
                <SelectItem value="manager">{ROLE_NAME.manager}</SelectItem>
                {/* Nommer un admin = propriétaires uniquement (garde serveur en plus). */}
                {superadmin && <SelectItem value="admin">{ROLE_NAME.admin}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      {scope === 'chatter' && roleValue !== 'admin' && (
        <Controller
          name="managerIds"
          control={control}
          render={({ field }) => (
            <div className="grid gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Managers (rattachement)
              </label>
              {/* MULTIPLE (0092) : un membre peut dépendre de plusieurs encadrants. */}
              <ComboboxMultiple
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    disabled={isSubmitting}
                    className="h-9 w-56 justify-between font-normal"
                  >
                    <span className="truncate">
                      {field.value.length === 0
                        ? 'Aucun'
                        : field.value.length === 1
                          ? (attachables.find((m) => m.id === field.value[0])?.name ?? '1 manager')
                          : `${field.value.length} managers`}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                }
                options={attachables.map((m) => ({ value: m.id, label: m.name }))}
                value={field.value}
                onChange={field.onChange}
                placeholder="Rechercher un manager…"
              />
              <p className="text-xs text-muted-foreground">
                Le membre apparaît dans la vue Membres de chacun de ces managers.
              </p>
            </div>
          )}
        />
      )}
    </>
  )
}
