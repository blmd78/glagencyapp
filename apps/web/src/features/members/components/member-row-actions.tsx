'use client'

// Actions de ligne de la table Membres, réunies sous UN SEUL bouton. Extraites de
// `members-columns.tsx` (règle « > 300 lignes → split par responsabilité ») : les défs de colonnes
// décrivent ce qu'on AFFICHE, ce fichier ce qu'on peut FAIRE.

import { useState } from 'react'
import { toast } from 'sonner'
import { Eye, LogOut, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { isImpersonatable } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteMember, reactivateMember } from '../actions-lifecycle'
import { ImpersonateButton } from './impersonate-button'
import { MemberDepartureDialog } from './member-departure-dialog'
import { MemberDetailDialog } from './member-detail-dialog'
import { MemberDialog } from './member-dialog'
import type { Member } from '../types'

/** Le dialog ouvert, ou aucun — ils sortent tous du même menu, un seul à la fois. */
type Ouvert = null | 'detail' | 'edition' | 'emprunt' | 'depart' | 'reactivation' | 'suppression'

/**
 * UN SEUL BOUTON pour toutes les actions (demande Benoit 2026-08-03). La colonne en portait
 * jusqu'à quatre côte à côte — consulter en tant que, modifier, départ, corbeille — sur une ligne
 * déjà chargée de badges. Un menu les rassemble et surtout les NOMME : « Enregistrer un départ »
 * et « Supprimer définitivement » ne se confondent plus une fois écrits en toutes lettres, ce que
 * deux icônes voisines ne garantissaient pas.
 *
 * LES DIALOGS SONT MONTÉS HORS DU MENU, pilotés par un état. C'est obligatoire avec Radix : un
 * `DropdownMenuItem` ne peut pas servir de trigger — le menu se démonte à la sélection et
 * emporterait le dialog avec lui. D'où les props `open`/`onOpenChange` ajoutées à `MemberDialog`,
 * `MemberDepartureDialog`, `ImpersonateButton` et `ConfirmDialog` ; leur mode `trigger` reste
 * intact partout ailleurs dans l'app.
 *
 * Gardes d'affichage inchangées : `member.editable` (calqué sur `requireEditableTarget`), admins
 * jamais éditables hors propriétaire, manager borné aux chatteurs. La vraie barrière reste
 * `authz.ts` côté serveur, doublée par la RLS.
 */
export function RowActions({
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
  const [ouvert, setOuvert] = useState<Ouvert>(null)
  const fermer = (o: boolean) => !o && setOuvert(null)

  if (member.role === 'superadmin') return null
  if (member.role === 'admin' && !superadmin) return null
  if (viewer === 'manager' && member.role !== 'chatteur') return null

  // Consulter en tant que : admin uniquement, rôle BRUT dans l'allowlist. `!member.leftAt` —
  // `getProfile` refuse un parti, la session d'emprunt atterrirait sur /login sans rien expliquer.
  const canImpersonate = viewer === 'admin' && isImpersonatable(member.role) && !member.leftAt

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Actions pour ${member.displayName}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Le détail EN TÊTE : geste le plus fréquent, et le seul sans conséquence. */}
          <DropdownMenuItem onSelect={() => setOuvert('detail')}>
            <Eye className="size-3.5" />
            Voir le détail
          </DropdownMenuItem>

          {member.editable && (
            <DropdownMenuItem onSelect={() => setOuvert('edition')}>
              <Pencil className="size-3.5" />
              Modifier
            </DropdownMenuItem>
          )}

          {canImpersonate && (
            <DropdownMenuItem onSelect={() => setOuvert('emprunt')}>
              <Eye className="size-3.5" />
              Consulter en tant que
            </DropdownMenuItem>
          )}

          {member.editable && (
            <>
              <DropdownMenuSeparator />
              {member.leftAt ? (
                <DropdownMenuItem onSelect={() => setOuvert('reactivation')}>
                  <RotateCcw className="size-3.5" />
                  Réactiver
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setOuvert('depart')}>
                  <LogOut className="size-3.5" />
                  Enregistrer un départ
                </DropdownMenuItem>
              )}
              {/* La corbeille DÉTRUIT (cascade `profiles_id_fkey`) : admins seuls, et séparée du
                  reste. Un vrai départ s'enregistre, il ne s'efface pas. */}
              {viewer === 'admin' && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setOuvert('suppression')}
                >
                  <Trash2 className="size-3.5" />
                  Supprimer définitivement
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <MemberDetailDialog
        member={member}
        creators={creators}
        open={ouvert === 'detail'}
        onOpenChange={fermer}
      />

      {canImpersonate && (
        <ImpersonateButton
          memberId={member.id}
          memberName={member.displayName}
          open={ouvert === 'emprunt'}
          onOpenChange={fermer}
        />
      )}

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
            open={ouvert === 'edition'}
            onOpenChange={fermer}
          />

          <MemberDepartureDialog
            member={member}
            open={ouvert === 'depart'}
            onOpenChange={fermer}
          />

          <ConfirmDialog
            open={ouvert === 'reactivation'}
            onOpenChange={fermer}
            title={`Réactiver ${member.displayName} ?`}
            description="Son accès est rétabli et les informations de départ sont effacées — il redeviendra un membre en poste."
            confirmLabel="Réactiver"
            destructive={false}
            onConfirm={async () => {
              const res = await reactivateMember(member.id)
              if (!res.success) {
                toast.error(res.error)
                return res.error
              }
              toast.success(`${member.displayName} réactivé`)
            }}
          />

          <ConfirmDialog
            open={ouvert === 'suppression'}
            onOpenChange={fermer}
            title={`Supprimer définitivement ${member.displayName} ?`}
            description="Aucune trace ne sera conservée — à réserver à un compte créé par erreur (doublon, email erroné). Pour un vrai départ, utilise « Enregistrer un départ » : le profil est conservé et compte dans le turnover."
            onConfirm={async () => {
              const res = await deleteMember(member.id)
              if (!res.success) {
                toast.error(res.error)
                return res.error
              }
              toast.success('Compte supprimé définitivement')
            }}
          />
        </>
      )}
    </div>
  )
}
