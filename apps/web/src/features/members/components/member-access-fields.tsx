'use client'

import { Controller, type Control } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
                <SelectItem value="chatteur">Chatteur</SelectItem>
                {/* Rôle fonctionnel, pas hiérarchique — pas d'équipe, pas de to-do/planning. */}
                <SelectItem value="police">Police</SelectItem>
                <SelectItem value="sous-manager">Sous-manager</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                {/* Nommer un admin = propriétaires uniquement (garde serveur en plus). */}
                {superadmin && <SelectItem value="admin">Admin</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      {scope === 'chatter' && roleValue !== 'admin' && (
        <Controller
          name="managerId"
          control={control}
          render={({ field }) => (
            <div className="grid gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Manager (rattachement)
              </label>
              {/* Radix interdit value="" sur un item → sentinelle 'none' ↔ '' côté form. */}
              <Select
                value={field.value || 'none'}
                onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {attachables.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Le membre apparaît dans la vue Membres de ce manager.
              </p>
            </div>
          )}
        />
      )}
    </>
  )
}
