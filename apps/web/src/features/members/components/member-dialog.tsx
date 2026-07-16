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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  managers = [],
  trigger,
  scope = 'chatter',
  viewer = 'admin',
  superadmin = false,
}: {
  /** Absent = création. */
  member?: Member
  creators: { id: string; name: string }[]
  /** Managers rattachables (sélecteur admin, face chatteurs). */
  managers?: { id: string; name: string }[]
  trigger: ReactNode
  /** Face dont on gère les droits — les slugs de l'autre face sont préservés côté serveur. */
  scope?: 'chatter' | 'marketing'
  /** Manager : rôle verrouillé sur user, sélecteurs rôle/rattachement masqués. */
  viewer?: 'admin' | 'manager'
  /** Propriétaire : option rôle Admin (garde serveur en plus du sélecteur). */
  superadmin?: boolean
}) {
  const [open, setOpen] = useState(false)
  const choices = scope === 'marketing' ? MKT_PAGE_CHOICES : PAGE_CHOICES
  const scopeSlugs = new Set(choices.map((c) => c.slug as string))
  // Un modèle hors du périmètre de l'appelant (invisible dans `creators`) ne doit pas
  // rester dans le form : le serveur le refuserait — il est préservé côté serveur.
  const creatorSet = new Set(creators.map((c) => c.id))
  // Pas d'auto-rattachement (check en base) : on exclut la ligne éditée des options.
  const attachables = managers.filter((m) => m.id !== member?.id)

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemberForm>({
    resolver: zodResolver(memberInput),
    defaultValues: {
      scope,
      email: member?.email ?? '',
      displayName: member?.displayName ?? '',
      role:
        viewer === 'manager'
          ? 'user'
          : member?.role === 'admin'
            ? 'admin'
            : member?.role === 'manager'
              ? 'manager'
              : 'user',
      // Seules les pages du périmètre courant sont éditées ici.
      pages: (member?.pages ?? []).filter((p) => scopeSlugs.has(p)),
      creatorIds: (member?.creatorIds ?? []).filter((id) => creatorSet.has(id)),
      // Le serveur force le rattachement au créateur pour un appelant manager,
      // et l'ignore sur ses éditions (il ne peut pas déplacer un chatter).
      managerId: member?.managerId ?? '',
      workLink: member?.workLink ?? '',
    },
  })
  // Rôle admin choisi → pages/modèles/rattachement sans objet (un admin voit tout).
  const roleValue = watch('role')

  const submit = handleSubmit(async (values) => {
    const res = member
      ? await updateMember({
          scope,
          id: member.id,
          displayName: values.displayName,
          role: values.role,
          pages: values.pages,
          creatorIds: values.creatorIds,
          managerId: values.managerId,
          workLink: values.workLink,
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
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Lien outil de travail (optionnel)
            </label>
            <Input
              type="url"
              placeholder="https://notion.so/…"
              disabled={isSubmitting}
              {...register('workLink')}
            />
            <p className="text-xs text-muted-foreground">
              Le membre le retrouve dans son menu utilisateur, en bas de la sidebar.
            </p>
            {errors.workLink && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.workLink.message}</p>
            )}
          </div>

          {viewer === 'admin' && <Controller
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
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    {/* Nommer un admin = propriétaires uniquement (garde serveur en plus). */}
                    {superadmin && <SelectItem value="admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}
          />}

          {viewer === 'admin' && scope === 'chatter' && roleValue !== 'admin' && (
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

          {roleValue !== 'admin' && <Controller
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
          />}

          {scope === 'chatter' && roleValue !== 'admin' && <Controller
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
