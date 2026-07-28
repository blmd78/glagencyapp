'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { ChevronRight } from 'lucide-react'
import { frDayShort } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { eur2, eur2max } from '@/lib/format'
import { modelColor } from '@/lib/model-color'
import { ROLE_NAME, ROLE_TONE } from '@/lib/roles'
import { ComptaLinkDialog } from './compta-link-dialog'
import { ComptaSettingsDialog } from './compta-settings-dialog'
import type { ComptaRow } from '../types'

/*
 * Colonnes de la data-table de la Compta. Fichier SÉPARÉ de `compta-table.tsx` (qui ne garde
 * que le câblage `DataTable` : filtre, tri, lignes dépliées) pour tenir les deux sous 300
 * lignes — même découpe que `chatters-columns.tsx` / `chatters-table.tsx`
 * (docs/guidelines-standard-feature.md).
 */

/**
 * Montant de colonne. Un zéro reste DISCRET (`—` en muted) plutôt que d'aligner des « 0 € »
 * sur sept colonnes : c'est la transposition en tableau de ce que fait déjà la fiche, qui ne
 * monte pas la ligne du tout quand la composante est nulle (`compta-payslip.tsx`).
 *
 * `negative` inverse le signe à l'affichage — malus et sanctions sont stockés POSITIFS
 * (ce sont des composantes, `computePayslip` les soustrait), et la fiche les affiche déjà
 * précédés du signe moins.
 */
function Money({ value, negative }: { value: number; negative?: boolean }) {
  if (value === 0) return <span className="tabular-nums text-muted-foreground">—</span>
  return <span className="tabular-nums">{eur2(negative ? -value : value)}</span>
}

/** Modèles montrés en clair dans la colonne « CA modèle » ; au-delà, un « +N ». */
const MODEL_BADGES = 2

/**
 * Ventilation du CA par modèle, en colonne. MÊME présentation que la fiche dépliée (badges
 * `modelColor`, `nom · montant`, tri par CA décroissant) — c'est déjà le vocabulaire visuel de
 * la feature, aucun style nouveau.
 *
 * BORNÉE À `MODEL_BADGES` badges + un « +N » : un chatteur peut travailler sur six modèles, et
 * une cellule qui s'étire au gré du plus bavard casse la lisibilité de toute la table — or
 * c'est pour la lisibilité que la pile de noms est devenue une table. Le compte complet reste
 * accessible sans clic (`title` de la cellule) et en entier dans la fiche dépliée, qui affiche
 * déjà tous les modèles. Le repli « +N » est le patron de `members-table.tsx` (`BadgeList`),
 * recopié ici parce qu'il vit dans une AUTRE feature (import interdit).
 *
 * `flex` sans `flex-wrap` : la ligne doit rester d'une seule hauteur, la table déborde
 * horizontalement dans le conteneur `overflow-x-auto` de `<Table>` plutôt que verticalement.
 */
function ModelCaCell({ modelCa }: { modelCa: Record<string, number> }) {
  const sorted = Object.entries(modelCa).sort(([, a], [, b]) => b - a)
  if (sorted.length === 0) return <span className="text-muted-foreground">—</span>
  const shown = sorted.slice(0, MODEL_BADGES)
  const extra = sorted.length - shown.length
  return (
    <div
      className="flex items-center gap-1"
      title={sorted.map(([name, ca]) => `${name} · ${eur2(ca)}`).join(' · ')}
    >
      {shown.map(([name, ca]) => (
        <Badge key={name} className={modelColor(name)}>
          {name} · {eur2(ca)}
        </Badge>
      ))}
      {extra > 0 && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          +{extra}
        </Badge>
      )}
    </div>
  )
}

/** Statuts de prime, MÊMES mots que le formulaire (`compta-settings-form.tsx`). */
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
      {eur2max(row.prime.amount)} {PRIME_STATUS[row.prime.status] ?? row.prime.status}
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
      // C'est le fixe du RÉGLAGE qui est montré ici, pas celui de la période : une saisie hebdo
      // peut le remplacer (37,50 € au lieu de 75 €), et c'est la fiche dépliée qui le dit —
      // cette cellule décrit la configuration du membre, pas le résultat d'une période.
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.rate} %
          {row.original.fixedAmount > 0 && ` · fixe ${eur2max(row.original.fixedAmount)}`}
        </span>
      ),
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
        return r.paid ? (
          <span className="text-xs text-muted-foreground">
            payé le {r.paidOn ? frDayShort(r.paidOn) : '—'} — {eur2(r.paidAmount ?? 0)}
          </span>
        ) : (
          <span className="text-xs">{eur2(r.payslip.net)} à payer</span>
        )
      },
      meta: { align: 'right' },
    },
    // Engrenage des réglages de paie — ADMIN seul (`canConfigure`, distinct de `canPay` et de
    // `canEnter` : régler un taux, verser, et saisir un bonus sont trois droits différents).
    // Colonne d'actions plutôt qu'un bouton dans le panneau déplié : régler un chatteur ne
    // demande plus de déplier sa ligne, ce qui est exactement le gain demandé. Colonne DÉCLARÉE
    // même sans le droit (avec une cellule vide) serait du bruit : on ne la pousse pas du tout.
    ...(canConfigure
      ? [
          {
            id: 'settings',
            header: '',
            cell: ({ row }) => (
              // stopPropagation : même motif que la colonne « Statut » ci-dessus — le dialog est
              // portalé dans <body> côté DOM mais enfant de cette cellule côté React, sans ça
              // chaque clic dedans replierait/déplierait la ligne (data-table.tsx).
              <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                <ComptaSettingsDialog row={row.original} />
              </div>
            ),
            meta: { align: 'right' },
          } satisfies ColumnDef<ComptaRow>,
        ]
      : []),
  ]
}

