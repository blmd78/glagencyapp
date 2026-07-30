'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { ChevronRight } from 'lucide-react'
import { frDayShort } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { NewBadge } from '@/components/new-badge'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { eur2 } from '@/lib/format'
import { ROLE_NAME, ROLE_TONE } from '@/lib/roles'
import { STATUS_COLORS } from '@/lib/status-color'
import { Money, ModelCaCell, RemunerationCell } from './compta-cells'
import { ComptaLinkDialog } from './compta-link-dialog'
import type { ComptaRow } from '../types'

/*
 * Colonnes de la data-table de la Compta. Fichier SÉPARÉ de `compta-table.tsx` (qui ne garde
 * que le câblage `DataTable` : filtre, tri, lignes dépliées) pour tenir les deux sous 300
 * lignes — même découpe que `chatters-columns.tsx` / `chatters-table.tsx`
 * (docs/guidelines-standard-feature.md).
 */

/**
 * Statuts de prime. `renoncée` n'est plus SAISISSABLE depuis la tâche 20 (le formulaire n'a
 * gardé que le montant, 0 € = pas de prime) mais reste LISIBLE : la contrainte de colonne
 * l'accepte toujours et d'anciennes lignes peuvent le porter. Le retirer d'ici afficherait
 * `skipped` en clair via le `??` plus bas — un mot anglais brut dans une colonne d'argent.
 * `à verser` / `versée` sont la distinction que cette cellule doit continuer de faire.
 */
const PRIME_STATUS: Record<string, string> = {
  due: 'à verser',
  paid: 'versée',
  skipped: 'renoncée',
}

/**
 * Colonne « Prime ». Deux lectures différentes, à ne pas confondre :
 *  - `payslip.prime` — ce que la prime PÈSE dans le net de cette période (donc 0 si elle est
 *    versée, renoncée, ou si la période n'est pas encore échue) ;
 *  - `row.prime` — la prime ENREGISTRÉE pour ce membre, avec son état.
 *
 * Le premier cas s'affiche comme n'importe quel montant du calcul. Le second, en muted et
 * suffixé de son état : c'est ce que disait le résumé de l'ancienne section repliée
 * (`Prime 100,00 € à verser`), qui a disparu avec elle — sans ça, une prime renoncée ou déjà
 * versée serait un `—` indiscernable d'une absence de prime, et il faudrait ouvrir le dialog
 * de chaque chatteur pour savoir laquelle est laquelle.
 */
function PrimeCell({ row }: { row: ComptaRow }) {
  if (row.payslip.prime !== 0) return <Money value={row.payslip.prime} />
  if (!row.prime) return <Money value={0} />
  return (
    <span
      className="text-xs text-muted-foreground"
      title="Prime enregistrée — non comptée dans le net de cette période."
    >
      {eur2(row.prime.amount)} {PRIME_STATUS[row.prime.status] ?? row.prime.status}
    </span>
  )
}

/**
 * Colonnes de la compta. Fabriquées (et non constantes de module) parce que la colonne
 * « Statut » porte le bouton « Relier », qui dépend du droit de l'appelant et des options
 * chargées côté serveur — même patron que `makeChattersColumns`.
 */
export function makeComptaColumns({
  canConfigure,
  linkableChatters,
}: {
  canConfigure: boolean
  linkableChatters: { id: string; name: string }[]
}): ColumnDef<ComptaRow>[] {
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <Sortable column={column} label="Chatteur" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              row.getIsExpanded() && 'rotate-90',
              !row.getCanExpand() && 'opacity-0',
            )}
          />
          <span className="font-medium">{row.original.name}</span>
          {/* Icône et non badge texte : la ligne porte déjà un badge de rôle, un second mot la
              surchargerait. Utile ici — un nouvel arrivant n'a pas le même rendement attendu. */}
          <NewBadge isNew={row.original.isNew} arrivedAt={row.original.arrivedAt} variant="icon" />
          {/* Parti mais encore listé : il reste dû. Le badge dit POURQUOI il est là, sinon sa
              présence dans une liste de paie ressemblerait à une erreur. */}
          {row.original.leftAt && (
            <Badge className={cn('shrink-0 text-xs font-normal', STATUS_COLORS.neutral)}>
              Parti le {row.original.leftAt.split('-').reverse().slice(0, 2).join('/')}
            </Badge>
          )}
          {ROLE_NAME[row.original.role] && (
            <Badge
              className={cn('shrink-0 text-xs font-normal', ROLE_TONE[row.original.role])}
            >
              {ROLE_NAME[row.original.role]}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'ca',
      accessorFn: (r) => r.payslip.ca,
      header: ({ column }) => <Sortable column={column} label="CA" className="justify-end" />,
      // Membre non relié : `—` et JAMAIS « 0 € ». Sans `chatter_id` le CA n'est pas nul, il
      // est INCONNU — c'est le même refus du zéro silencieux que la fiche (spec §7).
      cell: ({ row }) =>
        row.original.chatterId == null ? (
          <span className="tabular-nums text-muted-foreground">—</span>
        ) : (
          <Money value={row.original.payslip.ca} />
        ),
      meta: { align: 'right' },
    },
    {
      id: 'modelCa',
      header: 'CA modèle',
      // Pas de `Sortable` : un `Record` de modèles n'a pas d'ordre total qui veuille dire
      // quelque chose. Le total, lui, est trié par la colonne « CA » juste à gauche.
      cell: ({ row }) => <ModelCaCell modelCa={row.original.modelCa} />,
    },
    {
      id: 'remuneration',
      header: 'Rémunération',
      // LES DEUX RÉGLAGES, jamais l'un OU l'autre (tâche 16) : le taux s'applique toujours, le
      // fixe s'y AJOUTE dès qu'il est renseigné. La colonne disait « Commission » et affichait
      // `10 %` ou `Fixe 75 €` selon un mode qui n'existe plus.
      //
      // CLIQUABLE depuis le 2026-07-28, en remplacement de l'engrenage : ces réglages se
      // saisissent dans l'onglet « Compta » du dialog de Membres. Le lien mène à la PAGE
      // Membres et pas à la fiche : aucune route n'ouvre un membre précis (`/chatter/members`
      // est une liste, son filtre est un état client) — voir le rapport de tâche pour la
      // proposition de `?membre=<id>`.
      //
      // Le détail (taux daté, `stopPropagation`) est dans `RemunerationCell`.
      cell: ({ row }) => <RemunerationCell row={row.original} />,
    },
    {
      id: 'base',
      accessorFn: (r) => r.payslip.base,
      header: ({ column }) => <Sortable column={column} label="Base" className="justify-end" />,
      cell: ({ row }) => <Money value={row.original.payslip.base} />,
      meta: { align: 'right' },
    },
    {
      id: 'bonus',
      accessorFn: (r) => r.payslip.bonus,
      header: ({ column }) => <Sortable column={column} label="Bonus" className="justify-end" />,
      cell: ({ row }) => <Money value={row.original.payslip.bonus} />,
      meta: { align: 'right' },
    },
    {
      id: 'malus',
      accessorFn: (r) => r.payslip.malus,
      header: ({ column }) => <Sortable column={column} label="Malus" className="justify-end" />,
      cell: ({ row }) => <Money value={row.original.payslip.malus} negative />,
      meta: { align: 'right' },
    },
    {
      id: 'sanctions',
      accessorFn: (r) => r.payslip.sanctions,
      header: ({ column }) => (
        <Sortable column={column} label="Sanctions" className="justify-end" />
      ),
      cell: ({ row }) => <Money value={row.original.payslip.sanctions} negative />,
      meta: { align: 'right' },
    },
    {
      id: 'prime',
      accessorFn: (r) => r.payslip.prime,
      header: ({ column }) => <Sortable column={column} label="Prime" className="justify-end" />,
      cell: ({ row }) => <PrimeCell row={row.original} />,
      meta: { align: 'right' },
    },
    {
      id: 'net',
      accessorFn: (r) => r.payslip.net,
      header: ({ column }) => <Sortable column={column} label="Net" className="justify-end" />,
      // Le net s'affiche même à zéro, en gras : c'est LA colonne de décision, un `—` y
      // laisserait croire à une donnée manquante alors que zéro est un résultat.
      cell: ({ row }) => (
        <span className="tabular-nums font-semibold">{eur2(row.original.payslip.net)}</span>
      ),
      meta: { align: 'right' },
    },
    {
      id: 'status',
      header: 'Statut',
      cell: ({ row }) => {
        const r = row.original
        if (r.chatterId == null) {
          return (
            // stopPropagation : le dialog est portalé dans <body> côté DOM mais enfant de
            // cette cellule côté React — sans ça, tout clic dedans bubble jusqu'au onClick
            // d'expansion de la ligne (data-table.tsx). Même motif que chatters-columns.tsx.
            <div
              className="flex items-center justify-end gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xs text-amber-700 dark:text-amber-400">⚠ non relié</span>
              {canConfigure && (
                <ComptaLinkDialog
                  memberId={r.id}
                  memberName={r.name}
                  chatters={linkableChatters}
                />
              )}
            </div>
          )
        }
        // Badge « Payé » (demande du propriétaire, 2026-07-28 : « un badge payé quand je
        // clique sur payé pour qu'on le voie bien ») — vert sémantique de l'app
        // (`STATUS_COLORS.positive`, même forme que le badge de rôle ci-dessus). La date et
        // le montant RESTENT à côté : c'est de l'information de paie, le badge ne fait que
        // la rendre repérable d'un coup d'œil. L'ensemble se lit « Payé le 18/07 — 123,45 € ».
        return r.paid ? (
          <span className="flex items-center justify-end gap-2">
            <Badge className={cn('shrink-0 text-xs font-normal', STATUS_COLORS.positive)}>
              Payé
            </Badge>
            <span className="text-xs text-muted-foreground">
              le {r.paidOn ? frDayShort(r.paidOn) : '—'} — {eur2(r.paidAmount ?? 0)}
            </span>
          </span>
        ) : (
          <span className="text-xs">{eur2(r.payslip.net)} à payer</span>
        )
      },
      meta: { align: 'right' },
    },
    // L'ENGRENAGE DES RÉGLAGES DE PAIE A DISPARU D'ICI le 2026-07-28 (demande du propriétaire :
    // « je pense que tout va dans membre, tu mets un tab dans le dialog direct »). Taux, fixe et
    // prime sont des attributs de la PERSONNE, pas de la période : les tenir dans deux écrans
    // était la même erreur que le fixe qui vivait en double (tâche 19). Ils se saisissent dans
    // l'onglet « Compta » du dialog de Membres, où la colonne « Rémunération » ci-dessus renvoie.
    // `canConfigure` reste utilisé — par le bouton « Relier » de la colonne « Statut », le barème
    // du Classement et l'onglet Suivi.
  ]
}

