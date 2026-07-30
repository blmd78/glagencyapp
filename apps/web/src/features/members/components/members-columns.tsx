'use client'

// Défs de colonnes de la table Membres + actions de ligne — extraites de `members-table.tsx`
// (règle « > 300 lignes → split par responsabilité », même découpe que le pilote
// `chatters-columns.tsx`). `members-table.tsx` ne garde que la composition DataTable + toolbar.

import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { AlertTriangle, LogOut, Pencil, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { isImpersonatable } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { RoleBadge } from '@/components/role-badge'
import { TeamBadge } from '@/components/team-badge'
import { ShiftBadge } from '@/components/shift-badge'
import { NewBadge } from '@/components/new-badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { MKT_PAGE_CHOICES, PAGE_CHOICES } from '@/config/workspaces'
import { ROLE_NAME, ROLE_TONE } from '@/lib/roles'
import { STATUS_COLORS } from '@/lib/status-color'
import { deleteMember, reactivateMember } from '../actions'
import { ImpersonateButton } from './impersonate-button'
import { MemberDepartureDialog } from './member-departure-dialog'
import { MemberDialog } from './member-dialog'
import { DEPARTURE_LABEL, type Member } from '../types'

// « Créé le » en fuseau Europe/Paris EXPLICITE (formateur hoisté, même patron que
// spenders-table) : created_at est un timestamptz — sans timeZone, le SSR (UTC) et un
// navigateur parisien peuvent rendre un jour différent → mismatch d'hydratation.
const FR_DATE_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' })

/**
 * Badge « Parti le … » (0102). GRIS (`STATUS_COLORS.neutral`) : un départ n'est ni une alerte ni
 * une information à mettre en avant, c'est un état éteint — et la ligne est de toute façon masquée
 * par défaut (bascule « anciens »). Le détail — motif, acteur, commentaire — tient dans le
 * survol : trois informations de plus dans la cellule la rendraient illisible.
 */
function DepartureBadge({ member }: { member: Member }) {
  if (!member.leftAt) return null
  const detail = [
    member.leftReason ? DEPARTURE_LABEL[member.leftReason] : null,
    member.leftByName ? `acté par ${member.leftByName}` : null,
    member.leftNote,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Badge className={STATUS_COLORS.neutral} title={detail || undefined}>
      Parti le {FR_DATE_PARIS.format(new Date(`${member.leftAt}T00:00:00`))}
    </Badge>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

/**
 * Colonne Actions : Modifier (dialog) + Supprimer (ConfirmDialog). Admins jamais
 * éditables ici ; un manager n'agit que sur les comptes user, et jamais sur sa propre
 * ligne (rôle manager).
 *
 * `member.editable` porte le dernier filtre (admin → tout ; manager → les chatteurs, 0095).
 * Garde d'AFFICHAGE seule — la vraie barrière reste `authz.ts` (`requireEditableTarget`)
 * côté serveur, doublée par la RLS.
 */
function RowActions({
  member,
  creators,
  chatters,
  managers,
  scope,
  viewer,
  superadmin,
}: {
  member: Member
  creators: { id: string; name: string }[]
  chatters: { id: string; name: string }[]
  managers: { id: string; name: string; role: string }[]
  scope: 'chatter' | 'marketing'
  viewer: 'admin' | 'manager'
  /** Propriétaire : seul à pouvoir gérer les fiches admin. */
  superadmin: boolean
}) {
  if (member.role === 'superadmin') return null
  if (member.role === 'admin' && !superadmin) return null
  if (viewer === 'manager' && member.role !== 'chatteur') return null

  // Consulter en tant que : admin uniquement, rôle BRUT de la ligne dans l'allowlist (garde
  // d'affichage seule — la vraie barrière est côté serveur, `startImpersonation`). Elle ne
  // dépend PAS de `editable` : un admin a de toute façon tout en éditable.
  // `!member.leftAt` : consulter EN TANT QU'un parti n'a plus de sens depuis 0102 — `getProfile`
  // lui retourne null, la session d'emprunt atterrirait donc sur /login sans rien expliquer.
  const canImpersonate = viewer === 'admin' && isImpersonatable(member.role) && !member.leftAt
  // Plus rien à rendre : pas de cellule vide (une ligne sans action ne montre pas une colonne).
  if (!canImpersonate && !member.editable) return null

  return (
    <div className="flex justify-end gap-1.5">
      {canImpersonate && <ImpersonateButton memberId={member.id} memberName={member.displayName} />}
      {member.editable && (
        <>
          <MemberDialog
            member={member}
            creators={creators}
            chatters={chatters}
            managers={managers}
            scope={scope}
            viewer={viewer}
            superadmin={superadmin}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Modifier ${member.displayName}`}
              >
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          {/* DÉPART ou RETOUR — le geste courant. Un départ n'efface rien : il enregistre une
              date, un motif, et coupe l'accès (0102). C'est ce qui rend le turnover mesurable. */}
          {member.leftAt ? (
            <ConfirmDialog
              title={`Réactiver ${member.displayName} ?`}
              description="Son accès est rétabli et les informations de départ sont effacées — il redeviendra un membre en poste."
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Réactiver ${member.displayName}`}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              }
              onConfirm={async () => {
                const res = await reactivateMember(member.id)
                if (!res.success) {
                  toast.error(res.error)
                  return res.error
                }
                toast.success(`${member.displayName} réactivé`)
              }}
            />
          ) : (
            <MemberDepartureDialog
              member={member}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Enregistrer le départ de ${member.displayName}`}
                >
                  <LogOut className="size-3.5" />
                </Button>
              }
            />
          )}
          {/* LA CORBEILLE — admin/superadmin SEULEMENT (décision Benoit 2026-07-30 : ce sont les
              managers qui créent les comptes et qui en ratent). Elle DÉTRUIT, elle ne sert donc
              qu'au compte créé par erreur. Rouge et distincte de la porte de sortie ci-dessus
              pour que les deux gestes ne se confondent jamais.
              onConfirm renvoie l'erreur (string) en cas d'échec → le dialog reste ouvert. */}
          {viewer === 'admin' && (
            <ConfirmDialog
              title={`Supprimer définitivement ${member.displayName} ?`}
              description="Aucune trace ne sera conservée — à réserver à un compte créé par erreur (doublon, email erroné). Pour un vrai départ, utilise « Enregistrer le départ » : le profil est conservé et compte dans le turnover."
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-red-600 hover:text-red-700"
                  aria-label={`Supprimer définitivement ${member.displayName}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              }
              onConfirm={async () => {
                const res = await deleteMember(member.id)
                if (!res.success) {
                  toast.error(res.error)
                  return res.error
                }
                toast.success('Compte supprimé définitivement')
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Badges limités à `max`, le reste en « +N ». */
function BadgeList({ items, max = 4 }: { items: { key: string; node: React.ReactNode }[]; max?: number }) {
  const shown = items.slice(0, max)
  const extra = items.length - shown.length
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((i) => i.node)}
      {extra > 0 && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          +{extra}
        </Badge>
      )}
    </div>
  )
}

/** Colonnes de la table — mêmes défs qu'avant l'extraction, comportement identique. */
export function buildMembersColumns({
  creators,
  chatters,
  managers,
  scope,
  viewer,
  superadmin,
}: {
  creators: { id: string; name: string }[]
  chatters: { id: string; name: string }[]
  managers: { id: string; name: string; role: string }[]
  scope: 'chatter' | 'marketing'
  viewer: 'admin' | 'manager'
  superadmin: boolean
}): ColumnDef<Member>[] {
  const creatorName = new Map(creators.map((c) => [c.id, c.name]))
  const choices = scope === 'marketing' ? MKT_PAGE_CHOICES : PAGE_CHOICES

  const modelsColumn: ColumnDef<Member>[] = scope === 'chatter' ? [
    {
      id: 'models',
      header: 'Modèles',
      cell: ({ row }) => {
        if (row.original.role === 'admin' || row.original.role === 'superadmin')
          return <span className="text-xs text-muted-foreground">tous</span>
        const items = row.original.creatorIds.map((id) => {
          const name = creatorName.get(id) ?? '—'
          return {
            key: id,
            node: (
              <Badge key={id} className={modelColor(name)}>
                {name}
              </Badge>
            ),
          }
        })
        return items.length ? (
          <BadgeList items={items} />
        ) : (
          <span className="text-xs text-muted-foreground">aucun</span>
        )
      },
    },
  ] : []

  return [
    {
      id: 'displayName',
      accessorKey: 'displayName',
      header: ({ column }) => <Sortable column={column} label="Membre" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">
              {initials(row.original.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{row.original.displayName}</span>
              {/* Warning : membre chatteur SANS chatteur MyPuls lié → à relier (badges closing
                  vides tant que le lien manque). Visible aux admins (seuls à pouvoir relier). */}
              {viewer === 'admin' && row.original.role === 'chatteur' && !row.original.chatterId && (
                <span title="Aucun chatter MyPuls lié — à relier dans la fiche" className="shrink-0">
                  <AlertTriangle className="size-3.5 text-amber-500" aria-label="Aucun chatter MyPuls lié" />
                </span>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: ({ column }) => <Sortable column={column} label="Rôle" />,
      cell: ({ getValue, row }) =>
        // Libellés ET teintes depuis `lib/roles.ts` (source unique, partagée avec la pile de
        // noms du Dashboard/Planning). Seul l'icône « bouclier » de la direction reste ici.
        (() => {
          const role = getValue() as string
          const badge = (
            // Repli sur la teinte « chatter » : un rôle hors table (le `'user'` transitoire de
            // 0059, ou une valeur inconnue) doit garder un badge gris, pas le style plein par
            // défaut du composant — c'est ce que faisait la cascade de ternaires d'avant.
            <Badge className={cn('gap-1 text-xs', ROLE_TONE[role] ?? ROLE_TONE.chatteur)}>
              {(role === 'superadmin' || role === 'admin') && <ShieldCheck className="size-3" />}
              {ROLE_NAME[role] ?? ROLE_NAME.chatteur}
            </Badge>
          )
          // Un chatter porte en plus ses étiquettes closing (setter/closer, équipe) et son
          // SHIFT — les trois sont des attributs du membre (0077 pour le closing, 0099 pour le
          // shift, qui vivait jusque-là sur la fiche MyPuls).
          return role === 'chatteur' || !ROLE_NAME[role] ? (
            <div className="flex flex-wrap items-center gap-1">
              {badge}
              <RoleBadge role={row.original.closingRole} />
              <TeamBadge team={row.original.closingTeam} />
              <ShiftBadge shift={row.original.shift} />
              <NewBadge isNew={row.original.isNew} arrivedAt={row.original.arrivedAt} />
              <DepartureBadge member={row.original} />
            </div>
          ) : (
            badge
          )
        })(),
    },
    {
      id: 'pages',
      header: 'Pages',
      cell: ({ row }) => {
        if (row.original.role === 'admin' || row.original.role === 'superadmin')
          return <span className="text-xs text-muted-foreground">toutes</span>
        const items = choices.filter((p) => row.original.pages.includes(p.slug)).map((p) => {
          const Icon = p.icon
          return {
            key: p.slug,
            node: (
              <Badge key={p.slug} variant="outline" className="gap-1 font-normal">
                <Icon className="size-3" /> {p.label}
              </Badge>
            ),
          }
        })
        return items.length ? (
          <BadgeList items={items} />
        ) : (
          <span className="text-xs text-muted-foreground">aucune</span>
        )
      },
    },
    ...modelsColumn,
    {
      id: 'createdBy',
      accessorFn: (m) => m.createdByName ?? '',
      header: ({ column }) => <Sortable column={column} label="Créé par" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.createdByName ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <Sortable column={column} label="Créé le" className="justify-end" />,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-muted-foreground">
          {FR_DATE_PARIS.format(new Date(getValue() as string))}
        </span>
      ),
      meta: { align: 'right' },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <RowActions
          member={row.original}
          creators={creators}
          chatters={chatters}
          managers={managers}
          scope={scope}
          viewer={viewer}
          superadmin={superadmin}
        />
      ),
      meta: { align: 'right' },
    },
  ]
}
