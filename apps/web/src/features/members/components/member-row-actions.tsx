'use client'

// Actions de ligne de la table Membres — modifier, enregistrer un départ / réactiver, et la
// corbeille admin. Extraites de `members-columns.tsx` (règle « > 300 lignes → split par
// responsabilité », guidelines-standard-feature §1) : les défs de colonnes décrivent ce qu'on
// AFFICHE, ce fichier ce qu'on peut FAIRE — deux sujets, deux fichiers.

import { toast } from 'sonner'
import { LogOut, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { isImpersonatable } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deleteMember, reactivateMember } from '../actions-lifecycle'
import { ImpersonateButton } from './impersonate-button'
import { MemberDepartureDialog } from './member-departure-dialog'
import { MemberDialog } from './member-dialog'
import type { Member } from '../types'

/**
 * Colonne Actions : Modifier (dialog) + Supprimer (ConfirmDialog). Admins jamais
 * éditables ici ; un manager n'agit que sur les comptes user, et jamais sur sa propre
 * ligne (rôle manager).
 *
 * `member.editable` porte le dernier filtre (admin → tout ; manager → les chatteurs, 0095).
 * Garde d'AFFICHAGE seule — la vraie barrière reste `authz.ts` (`requireEditableTarget`)
 * côté serveur, doublée par la RLS.
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
