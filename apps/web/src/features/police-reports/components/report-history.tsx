'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { eur, num } from '@/lib/format'
import { deletePoliceReport } from '../actions'
import type { PoliceReport } from '../types'

// Sentinelle « pas de filtre » — une option à part entière du Combobox (value non vide) pour
// qu'il affiche son libellé « Tous… » au lieu du placeholder muet.
const ALL = 'all'

// Date du soir, format long FR (ex. « mardi 21 juillet 2026 »). `timeZone: 'UTC'` + parse à
// minuit UTC : `day` est une date calendaire (colonne `date`), on veut le MÊME jour affiché
// quel que soit le fuseau du navigateur (sinon décalage d'un jour en fuseau négatif). Hoisté
// (formateur Intl coûteux à reconstruire, cf. lib/format.ts).
const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const formatDay = (day: string) => DATE_FMT.format(new Date(`${day}T00:00:00Z`))

/**
 * Consultation / historique des rapports du soir — feuille client PURE (reçoit `reports` en
 * props, ne fetch jamais ; le fetch reste dans le service appelé par `page.tsx`).
 *
 * Filtres = état local `useState`, PAS de searchParams : c'est un filtre de VUE (non partageable
 * par lien) et le volume est faible (on filtre les rapports déjà chargés côté client, aucun
 * aller-retour serveur) — même choix documenté que `todos-view.tsx`.
 *
 * Vue « évolution d'un chatteur soir après soir » : filtrer par chatteur ne garde que ses
 * rapports ET n'affiche QUE sa ligne dans chacun (on ne noie pas sa ligne parmi les autres).
 */
export function ReportHistory({
  reports,
  currentProfileId,
}: {
  reports: PoliceReport[]
  /** Spectateur — la corbeille n'apparaît que sur SES propres rapports (miroir du `.eq('author_id')`
   *  de `deletePoliceReport` + RLS). */
  currentProfileId: string
}) {
  const router = useRouter()
  const [modelFilter, setModelFilter] = useState(ALL)
  const [chatterFilter, setChatterFilter] = useState(ALL)

  // Options MODÈLE dérivées des rapports eux-mêmes (dédupe `creatorId`) — pas de la liste des
  // modèles assignés : on ne propose que des modèles qui ont réellement un rapport.
  const modelOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of reports) if (!seen.has(r.creatorId)) seen.set(r.creatorId, r.creatorName)
    const opts = [...seen]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    return [{ value: ALL, label: 'Tous les modèles' }, ...opts]
  }, [reports])

  // Options CHATTEUR dérivées des lignes de tous les rapports (dédupe `chatterId`).
  const chatterOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of reports) for (const l of r.lines) if (!seen.has(l.chatterId)) seen.set(l.chatterId, l.chatterName)
    const opts = [...seen]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    return [{ value: ALL, label: 'Tous les chatteurs' }, ...opts]
  }, [reports])

  // Filtrage combinable (modèle ET chatteur). Le service ordonne déjà `day desc` → les plus
  // récents restent en tête. Sur filtre chatteur, chaque rapport ne garde QUE la ligne du chatteur.
  const visible = useMemo(() => {
    return reports
      .filter((r) => modelFilter === ALL || r.creatorId === modelFilter)
      .filter((r) => chatterFilter === ALL || r.lines.some((l) => l.chatterId === chatterFilter))
      .map((r) =>
        chatterFilter === ALL
          ? r
          : { ...r, lines: r.lines.filter((l) => l.chatterId === chatterFilter) },
      )
  }, [reports, modelFilter, chatterFilter])

  // Suppression (même patron que `todo-row.tsx` remove()) : succès → la ligne disparaît, pas de
  // toast ; échec → `router.refresh()` resynchronise + on renvoie la string d'erreur pour que le
  // ConfirmDialog reste ouvert et l'affiche.
  const onDelete = async (id: string): Promise<string | void> => {
    const res = await deletePoliceReport({ id })
    if (res.success) {
      router.refresh()
      return
    }
    router.refresh()
    return res.error
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Historique</h2>

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun rapport pour l’instant.</p>
      ) : (
        <>
          {/* Filtres de vue (locaux). Réinitialiser = repasser sur l'option « Tous… ». */}
          <div className="flex flex-wrap gap-3">
            <Combobox
              className="w-full sm:w-56"
              options={modelOptions}
              value={modelFilter}
              onChange={setModelFilter}
              placeholder="Tous les modèles"
              searchPlaceholder="Filtrer par modèle…"
            />
            <Combobox
              className="w-full sm:w-56"
              options={chatterOptions}
              value={chatterFilter}
              onChange={setChatterFilter}
              placeholder="Tous les chatteurs"
              searchPlaceholder="Filtrer par chatteur…"
            />
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun rapport pour ce filtre.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {visible.map((report) => (
                <article key={report.id} className="flex flex-col gap-3 rounded-xl border p-4">
                  {/* En-tête : date (titre), modèle + auteur en discret, corbeille si c'est le sien. */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium capitalize">{formatDay(report.day)}</span>
                      <span className="text-sm text-muted-foreground">{report.creatorName}</span>
                      {report.authorName && (
                        <span className="text-xs text-muted-foreground">Saisi par {report.authorName}</span>
                      )}
                    </div>
                    {report.authorId === currentProfileId && (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-red-600 hover:text-red-700"
                            aria-label="Supprimer ce rapport"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                        title="Supprimer ce rapport ?"
                        onConfirm={() => onDelete(report.id)}
                        destructive
                      />
                    )}
                  </div>

                  {/* Chiffres du modèle — hiérarchie par la typo, aucun séparateur décoratif. */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span>
                      <span className="text-muted-foreground">CA</span> {eur(report.ca)}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Non traitées</span> {num(report.nonTraitees)}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Absents</span> {num(report.absents)}
                    </span>
                  </div>

                  {report.alerte && (
                    <p className="text-sm">
                      <span className="font-medium">Alerte</span> {report.alerte}
                    </p>
                  )}

                  {/* Lignes chatteur : 👍 ce qui a marché, 🔧 ce qui reste à régler. */}
                  {report.lines.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {report.lines.map((line) => (
                        <div key={line.id} className="text-sm">
                          <span className="font-medium">{line.chatterName}</span>
                          {!line.aMarche && !line.aRegler && (
                            <span className="text-muted-foreground"> — </span>
                          )}
                          {(line.aMarche || line.aRegler) && (
                            <div className="mt-0.5 flex flex-col gap-0.5 text-muted-foreground">
                              {line.aMarche && <span>👍 {line.aMarche}</span>}
                              {line.aRegler && <span>🔧 {line.aRegler}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
