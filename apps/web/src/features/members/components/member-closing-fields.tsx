'use client'

import { Controller, type Control } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CRM_ROLES,
  CRM_SHIFTS,
  CRM_TEAMS,
  SHIFT_LABEL,
  type CrmRole,
  type CrmShift,
  type CrmTeam,
} from '@/lib/types/chatters'
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

/**
 * Désignation « closing » d'un chatteur : rôle (setter/closer/hybride/nouveau), équipe
 * (rouge/bleue) et SHIFT PRINCIPAL — tous trois portés par le MEMBRE (0077 pour le closing, 0100
 * pour le shift, qui vivait jusque-là sur la fiche MyPuls). Depuis 0110 le shift ici est le
 * PRINCIPAL de la personne ; ses PLACEMENTS sur le board (plusieurs créneaux, par modèle) se
 * composent dans Organisation et ne bougent pas quand on change le principal — tout placement sur
 * un autre créneau y apparaît en heure sup. Masquée pour les autres rôles — le serveur force null.
 * Sentinelle 'none' ↔ null car Radix interdit value="" sur un item (même patron que le
 * rattachement manager).
 *
 * Les trois champs sont ouverts à tout éditeur du membre (admin ou encadrant) : aucun ne dépend
 * plus d'une table admin-only, donc aucun ne risque plus l'effacement silencieux qui imposait
 * de masquer le shift aux managers (audit 2026-07-29).
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
      <Controller
        name="shift"
        control={control}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Shift principal
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
          </div>
        )}
      />
    </div>
  )
}
