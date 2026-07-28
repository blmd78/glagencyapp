'use client'

import Link from 'next/link'
import { DEFAULT_RATE, frDayShort } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { eur2 } from '@/lib/format'
import { modelColor } from '@/lib/model-color'
import type { ComptaRow } from '../types'

/*
 * Cellules de la data-table de la Compta. Extraites de `compta-columns.tsx` (2026-07-28) pour
 * tenir les deux fichiers sous 300 lignes (CLAUDE.md) : d'un côté les CELLULES, de l'autre la
 * définition des colonnes. Même découpe d'esprit que `compta-columns.tsx` / `compta-table.tsx`.
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
export function Money({ value, negative }: { value: number; negative?: boolean }) {
  if (value === 0) return <span className="tabular-nums text-muted-foreground">—</span>
  return <span className="tabular-nums">{eur2(negative ? -value : value)}</span>
}

/** Modèles montrés en clair dans la colonne « CA modèle » ; au-delà, un « +N ». */
const MODEL_BADGES = 2

/**
 * Cellule « Rémunération » : le ou LES taux de commission de la période, plus le fixe éventuel.
 *
 * Le taux étant DATÉ depuis 0093, une période peut en porter plusieurs. La cellule les rend dans
 * l'ordre chronologique, séparés par une flèche (« 10 → 11 % ») — c'est la forme la plus courte
 * qui reste vraie. Les valeurs sortent de `payslip.segments`, donc de ce qui a RÉELLEMENT été
 * appliqué au CA de cette période, jamais de l'historique brut.
 *
 * `segments` VIDE (aucun CA sur la période) : on retombe sur le dernier taux réglé, ou sur le
 * défaut — il n'y a rien à quoi l'appliquer, mais la colonne décrit la configuration du membre
 * et doit rester remplie.
 *
 * `stopPropagation` : même motif que la colonne « Statut » — sans lui, le clic bubble jusqu'au
 * `onClick` d'expansion de la ligne (`data-table.tsx`) et déplie la fiche en partant.
 */
export function RemunerationCell({ row }: { row: ComptaRow }) {
  const taux = [...new Set(row.payslip.segments.map((s) => s.rate))]
  const affiche = taux.length > 0 ? taux : [row.rateHistory.at(-1)?.rate ?? DEFAULT_RATE]
  return (
    <Link
      href="/chatter/members"
      onClick={(e) => e.stopPropagation()}
      title={
        affiche.length > 1
          ? `Taux daté : ${row.payslip.segments.map((s) => `${s.rate} % du ${frDayShort(s.from)} au ${frDayShort(s.to)}`).join(', ')}`
          : 'Se règle dans Membres — onglet Compta de la fiche'
      }
      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
    >
      {affiche.join(' → ')} %{row.fixedAmount > 0 && ` · fixe ${eur2(row.fixedAmount)}`}
    </Link>
  )
}

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
export function ModelCaCell({ modelCa }: { modelCa: Record<string, number> }) {
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

