'use client'

// Historique des rapports du soir en TABLE (patron DataTable, homogène avec le Tracker
// sanctions et la page Membres — demande Benoit 2026-08-06). Une ligne = un rapport
// (modèle × soir) : Modèle, puis les CHATTERS SUIVIS en clair (leurs noms — pas un compte),
// chiffres du soir, alerte (icône), date, auteur. PAS d'accordéon (retiré sur retour Benoit) :
// le CRAYON en bout de ligne ouvre le rapport complet en dialog (`ReportDetail`), avec
// « Modifier » quand c'est sa propre fiche d'un soir encore dans la fenêtre de saisie (14 j).
// Barre d'outils : RECHERCHE LIBRE PAR
// CHATTEUR (les noms vivent dans les lignes, pas dans une colonne → recherche maison, hors
// DataTable) + SÉLECTEUR PAR MODÈLE. Chercher un chatteur ne garde que les rapports où il
// apparaît et n'affiche que ses lignes — son évolution soir après soir.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { frDayShort, frTimeShort } from '@glagency/core'
import { toast } from 'sonner'
import { Trash2, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { eur, num } from '@/lib/format'
import { isDayInWindow } from '@/lib/periods'
import { modelColor } from '@/lib/model-color'
import { deletePoliceReport } from '../actions'
import type { PoliceReport } from '../types'
import { ReportDetail } from './report-detail-dialog'
import type { ReportTarget } from './report-form'

// Sentinelle « pas de filtre » — une option à part entière du Combobox (value non vide) pour
// qu'il affiche son libellé « Tous… » au lieu du placeholder muet.
const ALL = 'all'

/** Corbeille d'un rapport — sur SES propres rapports uniquement (miroir du `.eq('author_id')`
 *  de `deletePoliceReport` + RLS). Même contrat que la corbeille du Tracker (audit homogénéité) :
 *  échec → l'erreur reste DANS le ConfirmDialog (retour string, pas de refresh prématuré) ;
 *  succès → toast + refresh (l'action revalide, le refresh resynchronise l'écran courant). */
function DeleteReport({ report }: { report: PoliceReport }) {
  const router = useRouter()
  const onDelete = async (): Promise<string | void> => {
    const res = await deletePoliceReport({ id: report.id })
    if (!res.success) return res.error
    toast.success('Rapport supprimé')
    router.refresh()
  }
  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Supprimer"
          className="size-7 text-red-600 hover:text-red-700"
          aria-label="Supprimer ce rapport"
        >
          <Trash2 className="size-3.5" />
        </Button>
      }
      title="Supprimer ce rapport ?"
      description={`Supprimer définitivement le rapport du soir de ${report.creatorName} (${report.day}) ? Cette action est irréversible.`}
      onConfirm={onDelete}
    />
  )
}

function buildColumns(
  currentProfileId: string,
  /** id → rapport NON filtré : le crayon montre TOUT le rapport, même quand la recherche
   *  chatteur a réduit `lines` pour l'affichage des colonnes (défaut relevé à l'audit). */
  originalById: Map<string, PoliceReport>,
  onEdit?: (target: ReportTarget) => void,
): ColumnDef<PoliceReport>[] {
  return [
    {
      accessorKey: 'creatorName',
      header: ({ column }) => <Sortable column={column} label="Modèle" />,
      cell: ({ row }) => (
        <Badge className={modelColor(row.original.creatorName)}>{row.original.creatorName}</Badge>
      ),
    },
    {
      // Les chatteurs suivis EN CLAIR, juste après le modèle (demande Benoit — un compte
      // « 1 chatter(s) » ne disait rien). Le détail (a marché / à régler) vit dans le crayon.
      id: 'chatters',
      accessorFn: (r) => r.lines.map((l) => l.chatterName).join(', '),
      header: 'Chatters',
      cell: ({ row }) => {
        const names = row.original.lines.map((l) => l.chatterName).join(', ')
        return names ? (
          <span className="block max-w-56 truncate" title={names}>
            {names}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      accessorKey: 'ca',
      header: ({ column }) => <Sortable column={column} label="CA" className="justify-end" />,
      cell: ({ getValue }) => (
        <span className="font-semibold tabular-nums">{eur(getValue() as number)}</span>
      ),
      meta: { align: 'right' },
    },
    {
      accessorKey: 'nonTraitees',
      header: 'Non traitées',
      cell: ({ getValue }) => <span className="tabular-nums">{num(getValue() as number)}</span>,
      meta: { align: 'right' },
    },
    {
      accessorKey: 'absents',
      header: 'Absents',
      cell: ({ getValue }) => <span className="tabular-nums">{num(getValue() as number)}</span>,
      meta: { align: 'right' },
    },
    {
      // Présence d'une alerte en un coup d'œil — le texte complet vit dans le crayon.
      id: 'alerte',
      accessorFn: (r) => (r.alerte ? 1 : 0),
      header: 'Alerte',
      cell: ({ row }) =>
        row.original.alerte ? (
          <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      // Tri par SOIR du rapport (la donnée affichée), heure de saisie en départage — un rapport
      // antidaté via le datepicker du dialog se classe à SON soir, pas à celui de la saisie.
      id: 'day',
      accessorFn: (r) => `${r.day} ${r.createdAt}`,
      header: ({ column }) => <Sortable column={column} label="Date" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {frDayShort(row.original.day)} · {frTimeShort(row.original.createdAt)}
        </span>
      ),
    },
    {
      accessorKey: 'authorName',
      header: 'Auteur',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.authorName ?? '—'}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        // Le rapport COMPLET (pas la version aux lignes réduites par la recherche).
        const r = originalById.get(row.original.id) ?? row.original
        const mine = r.authorId === currentProfileId
        // « Modifier » = re-saisir SA fiche (upsert keyé auteur/modèle/jour) — borné à la
        // FENÊTRE DE SAISIE (14 j, comme le datepicker et la garde serveur) : un soir plus
        // ancien se consulte mais ne se re-saisit plus.
        const editable = mine && !!onEdit && isDayInWindow(r.day)
        return (
          <div className="flex items-center justify-end">
            <ReportDetail
              report={r}
              onEdit={editable ? () => onEdit?.({ creatorId: r.creatorId, day: r.day }) : undefined}
            />
            {mine && <DeleteReport report={r} />}
          </div>
        )
      },
    },
  ]
}

export function ReportTable({
  reports,
  currentProfileId,
  onEdit,
}: {
  reports: PoliceReport[]
  currentProfileId: string
  /** Fourni par un écrivain (reports-view) : le crayon propose « Modifier » (fenêtre 14 j). */
  onEdit?: (target: ReportTarget) => void
}) {
  const [modelFilter, setModelFilter] = useState(ALL)
  const [search, setSearch] = useState('')

  // Options MODÈLE dérivées des rapports chargés (dédupe) — on ne propose que des modèles qui
  // ont réellement un rapport dans la période (et le périmètre serveur les borne déjà).
  const modelOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of reports) if (!seen.has(r.creatorId)) seen.set(r.creatorId, r.creatorName)
    const opts = [...seen]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    return [{ value: ALL, label: 'Tous les modèles' }, ...opts]
  }, [reports])

  // Un changement de période (datepicker global) peut faire disparaître le modèle filtré des
  // options → table vide avec un Combobox pointant une option fantôme. Remise à zéro PENDANT le
  // rendu (patron React, remplace l'ancienne garde sur la bascule jour/mois).
  if (modelFilter !== ALL && !modelOptions.some((o) => o.value === modelFilter))
    setModelFilter(ALL)

  // Sélecteur modèle + recherche chatteur (combinables). Chercher un chatteur ne garde que les
  // rapports où un nom matche, et n'y montre QUE les lignes qui matchent — sa progression soir
  // après soir, pas noyée parmi les autres.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reports
      .filter((r) => modelFilter === ALL || r.creatorId === modelFilter)
      .filter((r) => !q || r.lines.some((l) => l.chatterName.toLowerCase().includes(q)))
      .map((r) =>
        !q ? r : { ...r, lines: r.lines.filter((l) => l.chatterName.toLowerCase().includes(q)) },
      )
  }, [reports, modelFilter, search])

  // id → rapport complet, pour le crayon (les `rows` peuvent avoir des lignes réduites).
  const originalById = useMemo(() => new Map(reports.map((r) => [r.id, r])), [reports])

  const columns = useMemo(
    () => buildColumns(currentProfileId, originalById, onEdit),
    [currentProfileId, originalById, onEdit],
  )

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Rapports de la période</h2>
      <DataTable
        data={rows}
        columns={columns}
        initialSorting={[{ id: 'day', desc: true }]}
        pageSize={20}
        getRowId={(r) => r.id}
        countLabel={(n) => `${n} rapport(s)`}
        // Recherche CONTRÔLÉE (pas de `filterColumnId`) : les noms de chatteurs vivent dans les
        // lignes imbriquées — le filtrage est fait dans `rows` ci-dessus, l'input est celui de
        // la DataTable (plus de réplique maison depuis l'audit).
        filterPlaceholder="Rechercher un chatter…"
        search={search}
        onSearchChange={setSearch}
        toolbar={
          <Combobox
            className="w-full sm:w-56"
            options={modelOptions}
            value={modelFilter}
            onChange={setModelFilter}
            placeholder="Tous les modèles"
            searchPlaceholder="Filtrer par modèle…"
          />
        }
      />
    </section>
  )
}
