'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useMemberPanel } from '@/hooks/use-member-panel'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MKT_PAGE_CHOICES, PAGE_CHOICES } from '@/config/workspaces'
import { createMember, updateMember } from '../actions'
import { loadMemberEvents } from '../actions-lifecycle'
import { memberInput, type MemberForm } from '../schema'
import { memberDefaults } from './member-defaults'
import type { Member, MemberEvent } from '../types'
import { MemberAccessFields } from './member-access-fields'
import { MemberArrivalFields } from './member-arrival-fields'
import { MemberChatterLinkField } from './member-chatter-link-field'
import { MemberClosingFields } from './member-closing-fields'
import { MemberHistoryTab } from './member-history-tab'
import { MemberIdentityFields } from './member-identity-fields'
import { MemberPayForm, MemberPayPlaceholder } from './member-pay-form'
import { MemberPermissionFields } from './member-permission-fields'

/** Champs affichant un message d'erreur juste sous eux (les autres — role/managerIds/
 *  creatorIds — n'ont pas de zone dédiée) : un `fieldErrors` server-side dessus est remonté
 *  au message global plutôt qu'avalé silencieusement (cf. remap dans `submit`). */
const DISPLAYED_FIELDS = ['email', 'displayName', 'workLink', 'pages', 'arrivedAt'] as const satisfies readonly (keyof MemberForm)[]
const isDisplayedField = (field: string): field is (typeof DISPLAYED_FIELDS)[number] =>
  (DISPLAYED_FIELDS as readonly string[]).includes(field)

/**
 * Dialog Nouveau/Modifier membre (RHF + Zod, schéma partagé avec le serveur). Email (verrouillé
 * en édition), nom, pages accessibles et modèles assignés. Aucun mot de passe (connexion OTP).
 * Champs rôle/rattachement et pages/modèles extraits dans member-access-fields.tsx et
 * member-permission-fields.tsx (split > 300 l., docs/guidelines-standard-feature.md).
 *
 * DEUX ONGLETS depuis le 2026-07-28 — « Général » et « Compta » (demande du propriétaire : « je
 * pense que tout va dans membre, tu mets un tab dans le dialog direct »). L'onglet Compta porte
 * les réglages de paie sortis de la table Compta : taux, fixe et prime sont des attributs de la
 * personne, pas de la période.
 *
 * IL N'APPARAÎT QUE POUR UN ADMIN, et c'est la contrainte structurante : ce dialog est aussi
 * utilisable par un MANAGER dans son périmètre (`actions.ts`, `requireCaller` +
 * `authorizeRoleAndScope`), alors que `compta_settings` et `compta_primes` sont admin-seul en
 * écriture (RLS `compta_settings_admin_write` / `compta_primes_admin_write`, migration 0085).
 * Monter l'onglet pour un manager lui montrerait des champs dont l'enregistrement serait refusé
 * par la base — tard, et mal. Le gate est en deux temps : le serveur ne lui envoie même pas les
 * valeurs (`Member.pay` est `undefined` hors admin, cf. `get-members.ts`).
 *
 * Restreint aussi au rôle CHATTEUR, comme le lien MyPuls et la désignation closing : la Compta
 * ne paie que `profiles.role = 'chatteur'` (`compta-sources.ts`), régler un taux sur un manager
 * n'aurait aucun effet visible nulle part.
 *
 * DEUX `<form>` FRÈRES, un par onglet, chacun avec son bouton — jamais imbriqués (invalide en
 * HTML). C'est aussi ce qui garantit qu'une prime ne s'écrit pas « en passant » : elle ne part
 * que si on a ouvert l'onglet et cliqué son bouton (cf. member-pay-form.tsx).
 */
export function MemberDialog({
  member,
  creators,
  chatters,
  managers = [],
  trigger,
  open: openProp,
  onOpenChange,
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
  managers?: { id: string; name: string; role: string }[]
  /** Omis quand l'ouverture est pilotée par `open`. */
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Face dont on gère les droits — les slugs de l'autre face sont préservés côté serveur. */
  scope?: 'chatter' | 'marketing'
  /** Manager : rôle verrouillé sur user, sélecteurs rôle/rattachement masqués. */
  viewer?: 'admin' | 'manager'
  /** Propriétaire : option rôle Admin (garde serveur en plus du sélecteur). */
  superadmin?: boolean
}) {
  'use no memo'
  const [openState, setOpenState] = useState(false)
  // Contrôlé quand `open` est fourni (ouverture depuis un menu déroulant, qui ne peut pas servir
  // de trigger : Radix le démonte à la sélection), autonome sinon.
  const open = openProp ?? openState
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOpenState(v))
  const choices = scope === 'marketing' ? MKT_PAGE_CHOICES : PAGE_CHOICES
  // Pas d'auto-rattachement (check en base) : on exclut la ligne éditée des options.
  const attachables = managers.filter((m) => m.id !== member?.id)

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MemberForm>({
    resolver: zodResolver(memberInput),
    defaultValues: memberDefaults({ member, scope, viewer, creators }),
  })
  // Réinitialise à L'OUVERTURE SEULEMENT (transition fermé→ouvert, gardée par prevOpen) : le
  // useForm n'est semé qu'au montage — sans reset, le dialog garde l'état de sa précédente
  // ouverture. SURTOUT PAS « à chaque changement de member » dialog ouvert : les actions de
  // l'onglet Compta (saveMemberRate…) font revalidatePath SANS fermer le dialog → nouvelle
  // identité de `member` → un reset ici écraserait la saisie en cours de l'onglet Général
  // (régression attrapée par l'audit du 2026-07-29).
  const prevOpen = useRef(false)
  useEffect(() => {
    const opening = open && !prevOpen.current
    prevOpen.current = open
    if (!opening) return
    reset(memberDefaults({ member, scope, viewer, creators }))
  }, [open, member, scope, viewer, creators, reset])

  // Rôle admin choisi → pages/modèles/rattachement sans objet (un admin voit tout).
  const roleValue = useWatch({ control, name: 'role' })
  // Historique (0101) : chargé quand on ARRIVE sur l'onglet, via `onValueChange` ci-dessous —
  // un événement, pas un effet (patron `useMemberPanel`, partagé avec les piles de noms).
  const { panel: historyPanel, open: loadHistory } = useMemberPanel<MemberEvent[]>(loadMemberEvents)
  // Commande l'apparition du champ « Arrivé le » (0101) — observé ici, comme `roleValue`, plutôt
  // que dans le composant de champs : un `useWatch` par composant multiplierait les re-rendus.
  const isNewValue = useWatch({ control, name: 'isNew' })

  const submit = handleSubmit(async (values) => {
    // `...values` des DEUX côtés : `memberUpdateInput` ne déclare pas `email` (verrouillé en
    // édition) et Zod retire les clés non déclarées au parse — inutile de recopier quinze champs
    // à la main. C'était une liste de plus à tenir à jour : chaque champ ajouté au formulaire
    // devait l'être ici aussi, sans que rien ne le signale à la compilation.
    const res = member
      ? await updateMember({ ...values, scope, id: member.id })
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

  // Onglet Compta : admin + membre chatteur. `member.pay` est fourni par `get-members.ts` pour
  // TOUS les membres dès que l'appelant est admin — un membre existant sans `pay` n'est donc pas
  // atteignable ici, le repli sur le placeholder ne sert qu'à la création.
  const showPayTab = viewer === 'admin' && roleValue === 'chatteur'

  const generalForm = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <MemberIdentityFields
        register={register}
        errors={errors}
        emailLocked={!!member}
        isSubmitting={isSubmitting}
      />

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

      {/* Désignation closing (setter/closer + équipe) + shift — chatteur uniquement (masqué
          sinon). Placée au-dessus des pages : rôle → désignation → pages/modèles.
          Le shift est ouvert aux encadrants depuis 0100 : porté par `profiles`, il n'est plus
          tributaire de la table MyPuls admin-only qui imposait de le leur cacher. Depuis 0110 c'est
          le shift PRINCIPAL ; les placements (board) vivent sur `profile_creators.shifts`. */}
      <MemberClosingFields control={control} roleValue={roleValue} isSubmitting={isSubmitting} />

      <MemberArrivalFields
        control={control}
        roleValue={roleValue}
        isNewValue={isNewValue}
        isSubmitting={isSubmitting}
        getValues={getValues}
        setValue={setValue}
      />

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
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{member ? `Modifier ${member.displayName}` : 'Nouveau membre'}</DialogTitle>
          <DialogDescription>
            {member
              ? 'Ajuste les pages et modèles accessibles.'
              : 'Le membre se connectera avec un code reçu par email — aucun mot de passe.'}
          </DialogDescription>
        </DialogHeader>

        {/* Pas d'onglets quand il n'y en aurait qu'un : un `TabsList` à une seule entrée serait
            du bruit. L'HISTORIQUE (0101) n'existe que pour un membre DÉJÀ CRÉÉ — à la création,
            il n'y a rien à raconter, et pas d'id à interroger. */}
        {showPayTab || member ? (
          <Tabs
            defaultValue="general"
            onValueChange={(v) => {
              // Une seule lecture par ouverture de dialog : `panel.id` retient déjà ce membre.
              if (v === 'historique' && member && historyPanel?.id !== member.id)
                loadHistory(member.id)
            }}
          >
            <TabsList>
              <TabsTrigger value="general">Général</TabsTrigger>
              {showPayTab && <TabsTrigger value="compta">Compta</TabsTrigger>}
              {member && <TabsTrigger value="historique">Historique</TabsTrigger>}
            </TabsList>
            <TabsContent value="general">{generalForm}</TabsContent>
            {showPayTab && (
              <TabsContent value="compta">
                {member?.pay ? (
                  <MemberPayForm memberId={member.id} pay={member.pay} />
                ) : (
                  <MemberPayPlaceholder />
                )}
              </TabsContent>
            )}
            {member && (
              <TabsContent value="historique">
                <MemberHistoryTab panel={historyPanel} />
              </TabsContent>
            )}
          </Tabs>
        ) : (
          generalForm
        )}
      </DialogContent>
    </Dialog>
  )
}
