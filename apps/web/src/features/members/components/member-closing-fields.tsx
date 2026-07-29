'use client'

import { Controller, type Control } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CRM_ROLES, CRM_SHIFTS, CRM_TEAMS, type CrmRole, type CrmShift, type CrmTeam } from '@/lib/types/chatters'
import type { MemberForm } from '../schema'

// QUATRE entrées depuis le 2026-07-28 : `profiles.closing_role` accepte `hybride` et `nouveau`
// (migration 0090, légende de la feuille de paie). Sans elles, `z.enum(CRM_ROLES)` refusait
// d'enregistrer un membre déjà posé sur l'une des deux — `member-dialog.tsx` réinjecte
// `member?.closingRole` dans les valeurs par défaut, donc le formulaire échouait au submit tant
// qu'on ne touchait pas au champ. Le `Record<CrmRole, …>` rend l'oubli impossible à recompiler.
const ROLE_LABEL: Record<CrmRole, string> = {
  closer: 'Closer',
  setter: 'Setter',
  hybride: 'Hybride',
  nouveau: 'Nouveau',
}
const TEAM_LABEL: Record<CrmTeam, string> = { rouge: 'Rouge', bleue: 'Bleue' }
const SHIFT_LABEL: Record<CrmShift, string> = { matin: 'Matin', aprem: 'Après-midi', soir: 'Soir' }

/**
 * Désignation « closing » d'un chatteur : rôle (setter/closer/hybride/nouveau) + équipe
 * (rouge/bleue), portée par le MEMBRE (cf. migration 0077). Masquée pour les autres rôles — le
 * serveur force null. Sentinelle 'none' ↔ null car Radix interdit value="" sur un item (même
 * patron que le rattachement manager).
 */
export function MemberClosingFields({
  control,
  roleValue,
  isSubmitting,
  linked,
  showShift,
}: {
  control: Control<MemberForm>
  roleValue: MemberForm['role']
  isSubmitting: boolean
  /** Lien MyPuls présent : le shift s'écrit sur la fiche liée — sans lien, il ne peut pas être conservé. */
  linked: boolean
  /** Le shift vit sur la fiche chatteur : ADMIN seul (cf. member-dialog / applyShift). */
  showShift: boolean
}) {
  'use no memo'
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
      {showShift && (
      <Controller
        name="shift"
        control={control}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Shift
            </label>
            <Select
              value={field.value ?? 'none'}
              onValueChange={(v) => field.onChange(v === 'none' ? null : (v as CrmShift))}
              disabled={isSubmitting}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {CRM_SHIFTS.map((sh) => (
                  <SelectItem key={sh} value={sh}>
                    {SHIFT_LABEL[sh]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!linked && (
              <p className="text-xs text-muted-foreground">
                Nécessite le lien MyPuls (le shift vit sur la fiche chatteur).
              </p>
            )}
          </div>
        )}
      />
      )}
    </div>
  )
}
