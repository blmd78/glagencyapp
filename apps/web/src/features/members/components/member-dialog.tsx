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
import { pageChoicesFor, type WorkspaceId } from '@/config/workspaces'
import { createMember, updateMember } from '../actions'
import type { MemberPrefill } from './member-defaults'
import { loadMemberEvents } from '../actions-lifecycle'
import { loadLegacyState } from '../actions-legacy'
import { checkRecruitByEmail } from '../actions-recruit'
import { memberInput, type MemberForm } from '../schema'
import { memberDefaults } from './member-defaults'
import type { LegacyAdminState } from '../legacy-link'
import type { Member, MemberEvent, RecruitCheck } from '../types'
import { MemberAccessFields } from './member-access-fields'
import { MemberArrivalFields } from './member-arrival-fields'
import { MemberChatterLinkField } from './member-chatter-link-field'
import { MemberClosingFields } from './member-closing-fields'
import { MemberHistoryTab } from './member-history-tab'
import { MemberIdentityFields } from './member-identity-fields'
import { MemberLegacyFields } from './member-legacy-fields'
import { MemberPayForm, MemberPayPlaceholder } from './member-pay-form'
import { MemberPermissionFields } from './member-permission-fields'

/** Champs affichant un message d'erreur juste sous eux (les autres — role/managerIds/
 *  creatorIds — n'ont pas de zone dédiée) : un `fieldErrors` server-side dessus est remonté
 *  au message global plutôt qu'avalé silencieusement (cf. remap dans `submit`). */
const DISPLAYED_FIELDS = ['email', 'displayName', 'workLink', 'pages', 'arrivedAt'] as const satisfies readonly (keyof MemberForm)[]
const isDisplayedField = (field: string): field is (typeof DISPLAYED_FIELDS)[number] =>
  (DISPLAYED_FIELDS as readonly string[]).includes(field)

/** Hoisté : un `toLocaleDateString` avec options reconstruit un Intl.DateTimeFormat à chaque appel. */
const FR_DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' })

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
  prefill,
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
  scope?: WorkspaceId
  /** Manager : rôle verrouillé sur user, sélecteurs rôle/rattachement masqués. */
  viewer?: 'admin' | 'manager'
  /** Propriétaire : option rôle Admin (garde serveur en plus du sélecteur). */
  superadmin?: boolean
  /** Valeurs pré-saisies à la création (bouton « Ajouter au CRM » d'un dossier de recrutement). */
  prefill?: MemberPrefill
}) {
  'use no memo'
  const [openState, setOpenState] = useState(false)
  // DOSSIER DE RECRUTEMENT (0125) : à la création, dire si l'e-mail saisi a déjà passé le test
  // public. PUREMENT INFORMATIF — le rattachement (`recruit_candidates.profile_id`) est fait par
  // `createMember` côté serveur, qu'on ait affiché l'encart ou non. Déclaré ici, avant `setOpen`
  // qui le remet à zéro (cf. plus bas pour la lecture elle-même).
  const [recruitHit, setRecruitHit] = useState<RecruitCheck | null>(null)
  // Dernier e-mail interrogé : sert à la fois d'anti-doublon (blur sans changement) et de jeton
  // de course (une réponse qui revient après une nouvelle saisie est jetée).
  const askedEmail = useRef('')
  // Contrôlé quand `open` est fourni (ouverture depuis un menu déroulant, qui ne peut pas servir
  // de trigger : Radix le démonte à la sélection), autonome sinon.
  const open = openProp ?? openState
  const setOpen = (v: boolean) => {
    // L'encart « dossier de recrutement » repart de zéro à chaque bascule — le formulaire, lui,
    // est réinitialisé par l'effet d'ouverture plus bas. Fait ICI (gestionnaire d'événement) et
    // pas dans un effet : un setState synchrone dans un effet est refusé par le lint React
    // Compiler (`react-hooks/set-state-in-effect`), et provoquerait un rendu en cascade. Le
    // jeton `askedEmail`, lui, est un REF : il se remet à zéro dans l'effet d'ouverture (une
    // fonction appelée pendant le rendu n'a pas le droit d'y toucher — `react-hooks/refs`).
    setRecruitHit(null)
    return onOpenChange ? onOpenChange(v) : setOpenState(v)
  }
  const choices = pageChoicesFor(scope)
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
    defaultValues: memberDefaults({ member, scope, viewer, creators, prefill }),
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
    reset(memberDefaults({ member, scope, viewer, creators, prefill }))
    // Même geste pour le jeton du lookup recrutement : sans ça, rouvrir le dialog et resaisir LE
    // MÊME e-mail serait vu comme un doublon et l'encart ne reviendrait jamais.
    askedEmail.current = ''
  }, [open, member, scope, viewer, creators, prefill, reset])

  // Rôle admin choisi → pages/modèles/rattachement sans objet (un admin voit tout).
  const roleValue = useWatch({ control, name: 'role' })
  // Historique (0101) : chargé quand on ARRIVE sur l'onglet, via `onValueChange` ci-dessous —
  // un événement, pas un effet (patron `useMemberPanel`, partagé avec les piles de noms).
  const { panel: historyPanel, open: loadHistory } = useMemberPanel<MemberEvent[]>(loadMemberEvents)
  // Reprise Good Luck Agency (D7) : même patron que l'historique — la lecture (rattachement +
  // tentatives échouées) ne part qu'en arrivant sur l'onglet, jamais à l'ouverture du dialog.
  const { panel: legacyPanel, open: loadLegacy } = useMemberPanel<LegacyAdminState>(loadLegacyState)
  // Commande l'apparition du champ « Arrivé le » (0101) — observé ici, comme `roleValue`, plutôt
  // que dans le composant de champs : un `useWatch` par composant multiplierait les re-rendus.
  const isNewValue = useWatch({ control, name: 'isNew' })

  // Lecture du dossier de recrutement : ADMIN SEULEMENT (l'action lit une table dont la RLS ne
  // s'ouvre qu'à `is_admin()`) et à la CRÉATION seulement (en édition l'e-mail est verrouillé,
  // rien à re-vérifier). Déclenchée au BLUR et pas à la frappe : une lecture par e-mail terminé,
  // pas une par caractère.
  const canCheckRecruit = !member && viewer === 'admin'
  const onEmailBlur = async (raw: string) => {
    const email = raw.trim().toLowerCase()
    if (email === askedEmail.current) return
    askedEmail.current = email
    // Saisie encore incomplète : on n'appelle pas (le schéma zod de l'action refuserait).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setRecruitHit(null)
      return
    }
    try {
      const res = await checkRecruitByEmail({ email })
      if (askedEmail.current !== email) return
      setRecruitHit(res.success ? res.data : null)
    } catch {
      // Échec de transport : l'encart est un bonus, il disparaît sans rien dire.
      if (askedEmail.current === email) setRecruitHit(null)
    }
  }

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

  // Onglet « Ancienne plateforme » (reprise Good Luck Agency, D7) : ADMIN STRICT et membre EXISTANT
  // — il n'y a rien à rattacher à quelqu'un qui n'a pas encore d'id. Un onglet plutôt qu'un bloc
  // dans le formulaire Général : ses cinq gestes (rattacher / resynchroniser / détacher / libérer /
  // débloquer) sont indépendants d'« Enregistrer », et un `<form>` imbriqué dans un autre est
  // invalide en HTML. Même parti pris que l'onglet Compta, admin-seul lui aussi.
  const showLegacyTab = viewer === 'admin' && !!member

  const generalForm = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <MemberIdentityFields
        register={register}
        errors={errors}
        emailLocked={!!member}
        isSubmitting={isSubmitting}
        onEmailBlur={canCheckRecruit ? onEmailBlur : undefined}
        emailNotice={
          // Constat, jamais une promesse : le rattachement du dossier dépend d'un `profile_id`
          // encore libre, que cet encart ne connaît pas (et n'a pas à connaître).
          recruitHit ? (
            <p className="text-xs text-muted-foreground">
              A passé le test de recrutement le {FR_DAY.format(new Date(recruitHit.testedAt))} —{' '}
              <span className="font-medium tabular-nums text-foreground">{recruitHit.global}/100</span>{' '}
              ({recruitHit.passed ? 'réussi' : 'refusé'}).
            </p>
          ) : undefined
        }
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
              if (v === 'ancienne' && member && legacyPanel?.id !== member.id) loadLegacy(member.id)
            }}
          >
            <TabsList>
              <TabsTrigger value="general">Général</TabsTrigger>
              {showPayTab && <TabsTrigger value="compta">Compta</TabsTrigger>}
              {showLegacyTab && <TabsTrigger value="ancienne">Ancienne plateforme</TabsTrigger>}
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
            {showLegacyTab && member && (
              <TabsContent value="ancienne">
                <MemberLegacyFields
                  profileId={member.id}
                  panel={legacyPanel}
                  reload={() => void loadLegacy(member.id)}
                />
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
