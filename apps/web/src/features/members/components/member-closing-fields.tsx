'use client'

import { Controller, type Control } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CRM_ROLES, CRM_TEAMS, type CrmRole, type CrmTeam } from '@/lib/types/chatters'
import type { MemberForm } from '../schema'

const ROLE_LABEL: Record<CrmRole, string> = { closer: 'Closer', setter: 'Setter' }
const TEAM_LABEL: Record<CrmTeam, string> = { rouge: 'Rouge', bleue: 'Bleue' }

/**
 * Désignation « closing » d'un chatteur : rôle (setter/closer) + équipe (rouge/bleue), portée par
 * le MEMBRE (cf. migration 0077). Masquée pour les autres rôles — le serveur force null. Sentinelle
 * 'none' ↔ null car Radix interdit value="" sur un item (même patron que le rattachement manager).
 */
export function MemberClosingFields({
  control,
  roleValue,
  isSubmitting,
}: {
  control: Control<MemberForm>
  roleValue: MemberForm['role']
  isSubmitting: boolean
}) {
  if (roleValue !== 'chatteur') return null
  return (
    <div className="flex flex-wrap gap-4">
      <Controller
        name="closingRole"
        control={control}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rôle closing
            </label>
            <Select
              value={field.value ?? 'none'}
              onValueChange={(v) => field.onChange(v === 'none' ? null : (v as CrmRole))}
              disabled={isSubmitting}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {CRM_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />
      <Controller
        name="closingTeam"
        control={control}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Équipe
            </label>
            <Select
              value={field.value ?? 'none'}
              onValueChange={(v) => field.onChange(v === 'none' ? null : (v as CrmTeam))}
              disabled={isSubmitting}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune</SelectItem>
                {CRM_TEAMS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TEAM_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />
    </div>
  )
}
