'use client'

import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
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
import { MKT_PAGE_CHOICES, PAGE_CHOICES } from '@/config/workspaces'
import { createMember, updateMember } from '../actions'
import { memberInput, type MemberForm } from '../schema'
import type { Member } from '../types'
import { MemberAccessFields } from './member-access-fields'
import { MemberChatterLinkField } from './member-chatter-link-field'
import { MemberClosingFields } from './member-closing-fields'
import { MemberPermissionFields } from './member-permission-fields'

/** Champs affichant un message d'erreur juste sous eux (les autres — role/managerId/
 *  creatorIds — n'ont pas de zone dédiée) : un `fieldErrors` server-side dessus est remonté
 *  au message global plutôt qu'avalé silencieusement (cf. remap dans `submit`). */
const DISPLAYED_FIELDS = ['email', 'displayName', 'workLink', 'pages'] as const satisfies readonly (keyof MemberForm)[]
const isDisplayedField = (field: string): field is (typeof DISPLAYED_FIELDS)[number] =>
  (DISPLAYED_FIELDS as readonly string[]).includes(field)

/**
 * Dialog Nouveau/Modifier membre (RHF + Zod, schéma partagé avec le serveur). Email (verrouillé
 * en édition), nom, pages accessibles et modèles assignés. Aucun mot de passe (connexion OTP).
 * Champs rôle/rattachement et pages/modèles extraits dans member-access-fields.tsx et
 * member-permission-fields.tsx (split > 300 l., docs/guidelines-standard-feature.md).
 */
export function MemberDialog({
  member,
  creators,
  chatters,
  managers = [],
  trigger,
  scope = 'chatter',
  viewer = 'admin',
  superadmin = false,
}: {
  /** Absent = création. */
  member?: Member
  creators: { id: string; name: string }[]
  /** Chatteurs MyPuls sélectionnables pour le lien (champ superadmin uniquement). */
  chatters: { id: string; name: string }[]
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
    formState: { errors, isSubmitting },
  } = useForm<MemberForm>({
    resolver: zodResolver(memberInput),
    defaultValues: {
      scope,
      email: member?.email ?? '',
      displayName: member?.displayName ?? '',
      role:
        viewer === 'manager'
          ? 'chatteur'
          : member?.role === 'admin'
            ? 'admin'
            : member?.role === 'manager'
              ? 'manager'
              : member?.role === 'sous-manager'
                ? 'sous-manager'
                : member?.role === 'police'
                  ? 'police'
                  : 'chatteur',
      // Seules les pages du périmètre courant sont éditées ici.
      pages: (member?.pages ?? []).filter((p) => scopeSlugs.has(p)),
      creatorIds: (member?.creatorIds ?? []).filter((id) => creatorSet.has(id)),
      // Le serveur force le rattachement au créateur pour un appelant manager,
      // et l'ignore sur ses éditions (il ne peut pas déplacer un chatter).
      managerId: member?.managerId ?? '',
      workLink: member?.workLink ?? '',
      closingRole: member?.closingRole ?? null,
      closingTeam: member?.closingTeam ?? null,
      chatterId: member?.chatterId ?? '',
    },
  })
  // Rôle admin choisi → pages/modèles/rattachement sans objet (un admin voit tout).
  const roleValue = useWatch({ control, name: 'role' })

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
          closingRole: values.closingRole,
          closingTeam: values.closingTeam,
          chatterId: values.chatterId,
        })
      : await createMember({ ...values, scope, email: values.email.trim().toLowerCase() })
    if (!res.success) {
      // Un message global générique ne dit pas quel champ corriger (ex. email déjà pris) —
      // remap champ par champ quand `fieldErrors` le permet, cf. todo-dialog.tsx.
      let hiddenFieldMessage: string | undefined
      for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
        const message = messages?.[0]
        if (!message) continue
        if (isDisplayedField(field)) {
          setError(field, { message })
        } else {
          hiddenFieldMessage = message
        }
      }
      const rootMessage = hiddenFieldMessage ?? res.error
      setError('root', { message: rootMessage })
      toast.error(rootMessage)
      return
    }
    toast.success(member ? 'Membre modifié' : 'Membre créé')
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

          {viewer === 'admin' && (
            <MemberAccessFields
              control={control}
              scope={scope}
              roleValue={roleValue}
              superadmin={superadmin}
              attachables={attachables}
              isSubmitting={isSubmitting}
            />
          )}

          {/* Désignation closing (setter/closer + équipe) — chatteur uniquement (masqué sinon).
              Placée au-dessus des pages : rôle → désignation → pages/modèles. */}
          <MemberClosingFields control={control} roleValue={roleValue} isSubmitting={isSubmitting} />

          {/* Lien chatteur : visible aux ADMINS (admin + superadmin, = garde serveur applyChatterLink)
              ET seulement pour un membre role chatteur (le closing n'existe que pour eux — évite de
              « consommer » l'unicité d'un chatteur sur un membre non-chatteur). */}
          {viewer === 'admin' && roleValue === 'chatteur' && (
            <MemberChatterLinkField control={control} chatters={chatters} isSubmitting={isSubmitting} />
          )}

          <MemberPermissionFields
            control={control}
            scope={scope}
            roleValue={roleValue}
            choices={choices}
            creators={creators}
            pagesError={errors.pages?.message as string | undefined}
            isSubmitting={isSubmitting}
          />

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
