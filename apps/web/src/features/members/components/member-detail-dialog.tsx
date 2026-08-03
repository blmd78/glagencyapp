'use client'

import { DEPARTURE_LABEL, frDateNumeric, type DepartureReason } from '@glagency/core'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { RoleBadge } from '@/components/role-badge'
import { TeamBadge } from '@/components/team-badge'
import { ShiftBadge } from '@/components/shift-badge'
import { NewBadge } from '@/components/new-badge'
import { ROLE_NAME, ROLE_TONE } from '@/lib/roles'
import { STATUS_COLORS } from '@/lib/status-color'
import { modelColor } from '@/lib/model-color'
import { cn } from '@/lib/utils'
import type { Member } from '../types'

/** Une ligne « libellé → valeur ». `value` vide (null, '', tableau vide) → rien n'est rendu :
 *  une fiche pleine de « — » se lit moins bien qu'une fiche courte. */
function Ligne({ label, children }: { label: string; children?: React.ReactNode }) {
  if (children === null || children === undefined || children === false) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 last:border-0">
      <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-sm">{children}</span>
    </div>
  )
}

/**
 * FICHE DE CONSULTATION d'un membre — tout ce que la ligne du tableau ne porte plus.
 *
 * La colonne « Rôle » empilait jusqu'à six badges (rôle, closing, équipe, shift, nouveau, parti)
 * en plus des colonnes Modèles et Pages : illisible d'un coup d'œil, et pourtant incomplet — ni la
 * date d'arrivée, ni le motif de départ, ni le lien MyPuls n'y tenaient. Le tableau garde ce qui
 * IDENTIFIE et ce qui ALERTE ; le reste est ici, en une seule ouverture.
 *
 * LECTURE SEULE, et c'est la différence avec le dialog d'édition : on vient voir, pas modifier —
 * « Modifier » est une entrée voisine du même menu. Un écran de consultation qui n'a pas de
 * bouton d'enregistrement ne peut pas être quitté par erreur en laissant une saisie en plan.
 */
export function MemberDetailDialog({
  member,
  creators,
  open,
  onOpenChange,
}: {
  member: Member
  /** Tous les modèles, pour résoudre les noms depuis `member.creatorIds`. */
  creators: { id: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const modeles = creators.filter((c) => member.creatorIds.includes(c.id)).map((c) => c.name)
  const estChatteur = member.role === 'chatteur'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member.displayName}</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col">
          <Ligne label="Rôle">
            <Badge className={cn('text-xs', ROLE_TONE[member.role] ?? ROLE_TONE.chatteur)}>
              {ROLE_NAME[member.role] ?? ROLE_NAME.chatteur}
            </Badge>
          </Ligne>

          {/* Les attributs de chatteur ne sont même pas rendus pour un encadrant : le serveur les
              force à null, une ligne vide n'apprendrait rien. */}
          {estChatteur && (
            <>
              <Ligne label="Closing">
                {member.closingRole || member.closingTeam ? (
                  <>
                    <RoleBadge role={member.closingRole} />
                    <TeamBadge team={member.closingTeam} />
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Ligne>
              <Ligne label="Shift">
                {member.shift ? (
                  <ShiftBadge shift={member.shift} />
                ) : (
                  <span className="text-muted-foreground">à placer</span>
                )}
              </Ligne>
            </>
          )}

          <Ligne label="Modèles">
            {modeles.length ? (
              // `modelColor` : chaque modèle a une teinte STABLE dans toute l'app (colonne
              // Modèles, Tracker, graphes). Un badge gris ici aurait fait de cette fiche le seul
              // écran où Emma n'est pas de la couleur d'Emma.
              modeles.map((n) => (
                <Badge key={n} className={modelColor(n)}>
                  {n}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">aucun</span>
            )}
          </Ligne>

          {(member.arrivedAt || member.isNew) && (
            <Ligne label="Arrivée">
              {/* `leftAt` éteint le badge : « nouvel arrivant » et « parti le … » sur la même
                  fiche se lisaient comme une contradiction. La DATE, elle, reste. */}
              <NewBadge isNew={member.isNew} arrivedAt={member.arrivedAt} leftAt={member.leftAt} />
              {member.arrivedAt && (
                <span className="text-muted-foreground">le {frDateNumeric(member.arrivedAt)}</span>
              )}
            </Ligne>
          )}

          {member.leftAt && (
            <Ligne label="Départ">
              <Badge className={STATUS_COLORS.neutral}>{frDateNumeric(member.leftAt)}</Badge>
              {member.leftReason && (
                <span>{DEPARTURE_LABEL[member.leftReason as DepartureReason]}</span>
              )}
              {member.leftByName && (
                <span className="text-muted-foreground">· acté par {member.leftByName}</span>
              )}
              {member.leftNote && (
                <span className="w-full text-muted-foreground">{member.leftNote}</span>
              )}
            </Ligne>
          )}

          <Ligne label="Lien MyPuls">
            {member.chatterId ? (
              <span className="text-muted-foreground">lié</span>
            ) : (
              <span className="text-muted-foreground">aucun</span>
            )}
          </Ligne>

          {member.workLink && (
            <Ligne label="Outil de travail">
              <a
                href={member.workLink}
                target="_blank"
                rel="noreferrer"
                className="truncate underline underline-offset-2"
              >
                {member.workLink}
              </a>
            </Ligne>
          )}

          <Ligne label="Compte créé">
            <span className="text-muted-foreground">
              {frDateNumeric(member.createdAt.slice(0, 10))}
              {member.createdByName && ` · par ${member.createdByName}`}
            </span>
          </Ligne>
        </div>
      </DialogContent>
    </Dialog>
  )
}
