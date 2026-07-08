'use client'

import { useState, type ReactNode } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { MKT_PAGE_CHOICES, PAGE_CHOICES } from '@/config/workspaces'
import { createMember, updateMember } from '../actions'
import { memberInput, type MemberForm } from '../schema'
import type { Member } from '../types'

const toggleArr = (arr: string[], key: string) =>
  arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key]

/**
 * Dialog Nouveau/Modifier membre (RHF + Zod, schéma partagé avec le serveur). Email (verrouillé
 * en édition), nom, pages accessibles et modèles assignés. Aucun mot de passe (connexion OTP).
 */
export function MemberDialog({
  member,
  creators,
  trigger,
  scope = 'chatter',
}: {
  /** Absent = création. */
  member?: Member
  creators: { id: string; name: string }[]
  trigger: ReactNode
  /** Face dont on gère les droits — les slugs de l'autre face sont préservés côté serveur. */
  scope?: 'chatter' | 'marketing'
}) {
  const [open, setOpen] = useState(false)
  const choices = scope === 'marketing' ? MKT_PAGE_CHOICES : PAGE_CHOICES
  const scopeSlugs = new Set(choices.map((c) => c.slug as string))

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberForm>({
    resolver: zodResolver(memberInput),
    defaultValues: {
      scope,
      email: member?.email ?? '',
      displayName: member?.displayName ?? '',
      // Seules les pages du périmètre courant sont éditées ici.
      pages: (member?.pages ?? []).filter((p) => scopeSlugs.has(p)),
      creatorIds: member?.creatorIds ?? [],
    },
  })

  const submit = handleSubmit(async (values) => {
    const res = member
      ? await updateMember({
          scope,
          id: member.id,
          displayName: values.displayName,
          pages: values.pages,
          creatorIds: values.creatorIds,
        })
      : await createMember({ ...values, scope, email: values.email.trim().toLowerCase() })
    if (!res.success) {
      setError('root', { message: res.error })
      return
    }
    setOpen(false)
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{member ? `Modifier ${member.displayName}` : 'Nouveau membre'}</DialogTitle>
          <DialogDescription>
            {member
              ? 'Ajuste les pages et modèles accessibles.'
              : 'Le membre se connectera avec un code reçu par email — aucun mot de passe.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <Input
              type="email"
              placeholder="prenom@exemple.fr"
              disabled={!!member || isSubmitting}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Nom affiché
            </label>
            <Input placeholder="Marco" disabled={isSubmitting} {...register('displayName')} />
            {errors.displayName && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.displayName.message}</p>
            )}
          </div>

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
                {errors.pages && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {errors.pages.message as string}
                  </p>
                )}
              </div>
            )}
          />

          {scope === 'chatter' && <Controller
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
          />}

          {errors.root && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <ActionButton type="submit" pending={isSubmitting} className="w-full sm:w-auto">
              {member ? 'Enregistrer' : 'Créer le membre'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
