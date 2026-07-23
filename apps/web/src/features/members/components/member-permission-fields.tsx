'use client'

import { Controller, type Control } from 'react-hook-form'
import type { LucideIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import type { MemberForm } from '../schema'

const toggleArr = (arr: string[], key: string) =>
  arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key]

/**
 * Pages accessibles + modèles assignés. Extrait de member-dialog.tsx (split > 300 l.,
 * docs/guidelines-standard-feature.md) — JSX déplacé tel quel, DOM byte-identique.
 */
export function MemberPermissionFields({
  control,
  scope,
  roleValue,
  choices,
  creators,
  pagesError,
  isSubmitting,
}: {
  control: Control<MemberForm>
  scope: 'chatter' | 'marketing'
  roleValue: MemberForm['role']
  choices: { slug: string; label: string; icon: LucideIcon }[]
  creators: { id: string; name: string }[]
  pagesError?: string
  isSubmitting: boolean
}) {
  'use no memo'
  return (
    <>
      {roleValue !== 'admin' && (
        <Controller
          name="pages"
          control={control}
          render={({ field }) => (
            <div className="grid gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pages accessibles
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {choices.map((p) => {
                  const Icon = p.icon
                  return (
                    <label
                      key={p.slug}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                    >
                      <Checkbox
                        checked={field.value.includes(p.slug)}
                        onCheckedChange={() => field.onChange(toggleArr(field.value, p.slug))}
                        disabled={isSubmitting}
                      />
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="truncate">{p.label}</span>
                    </label>
                  )
                })}
              </div>
              {pagesError && (
                <p className="text-xs text-red-600 dark:text-red-400">{pagesError}</p>
              )}
            </div>
          )}
        />
      )}

      {scope === 'chatter' && roleValue !== 'admin' && (
        <Controller
          name="creatorIds"
          control={control}
          render={({ field }) => (
            <div className="grid gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Modèles assignés
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {creators.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                  >
                    <Checkbox
                      checked={field.value.includes(c.id)}
                      onCheckedChange={() => field.onChange(toggleArr(field.value, c.id))}
                      disabled={isSubmitting}
                    />
                    <Badge className={modelColor(c.name)}>{c.name}</Badge>
                  </label>
                ))}
              </div>
            </div>
          )}
        />
      )}
    </>
  )
}
