'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { frTimeShort, frWeekdayLong } from '@glagency/core'
import { ThumbsUp, Trash2, TriangleAlert, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, num } from '@/lib/format'
import { deletePoliceReport } from '../actions'
import type { PoliceReport } from '../types'

// Sentinelle « pas de filtre » — une option à part entière du Combobox (value non vide) pour
// qu'il affiche son libellé « Tous… » au lieu du placeholder muet.
const ALL = 'all'

/**
 * Consultation des rapports du soir — feuille client PURE (reçoit `reports` en props, ne fetch
 * jamais ; le fetch reste dans le service appelé par `page.tsx`).
 *
 * Deux modes selon `vue` (`?vue=` dans l'URL) :
 * - JOUR : `reports` = les rapports du SEUL jour sélectionné (`?day=`). Liste plate, un par modèle,
 *   SANS date sur les cartes (le jour est déjà dans le sélecteur).
 * - MOIS : `reports` = tous les rapports du mois (`?month=`, triés `day desc` par le service).
 *   On REGROUPE par jour (en-tête de date `frWeekdayLong` + cartes du jour), zéro filet décoratif.
 *
 * Filtres modèle/chatteur (les deux modes) = état local `useState`, PAS de searchParams : filtre de
 * VUE (non partageable par lien), volume faible (on filtre les rapports déjà chargés, aucun
 * aller-retour serveur) — même choix que `todos-view.tsx`.
 *
 * Vue « une seule ligne chatteur » : filtrer par chatteur ne garde que les rapports où il apparaît
 * ET n'affiche QUE sa ligne dans chacun (on ne noie pas sa ligne parmi les autres). En mois, c'est
 * l'évolution du chatteur sur le mois, soir après soir.
 */
export function ReportHistory({
  reports,
  currentProfileId,
  vue,
}: {
  reports: PoliceReport[]
  /** Spectateur — la corbeille n'apparaît que sur SES propres rapports (miroir du `.eq('author_id')`
   *  de `deletePoliceReport` + RLS). */
  currentProfileId: string
  /** Mode d'affichage : `jour` (liste plate) ou `mois` (regroupé par jour). */
  vue: 'jour' | 'mois'
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

  // Filtrage combinable (modèle ET chatteur) dans le jour. Sur filtre chatteur, chaque rapport ne
  // garde QUE la ligne du chatteur.
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

  // Regroupement par jour (mode mois) : `visible` est déjà trié `day desc` (service), on préserve
  // cet ordre — première apparition d'un jour = ordre de sa section. Une section par jour.
  const byDay = useMemo(() => {
    const groups: { day: string; reports: PoliceReport[] }[] = []
    const index = new Map<string, number>()
    for (const r of visible) {
      let i = index.get(r.day)
      if (i === undefined) {
        i = groups.length
        index.set(r.day, i)
        groups.push({ day: r.day, reports: [] })
      }
      groups[i].reports.push(r)
    }
    return groups
  }, [visible])

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

  // Carte d'un rapport — identique dans les deux modes (modèle + auteur + chiffres + alerte +
  // lignes chatteur). En mois, la date utile est portée par l'en-tête `h3` du groupe ; en jour,
  // pas de date sur la carte (le jour est déjà dans le sélecteur). Fonction de rendu (pas un
  // composant imbriqué) pour partager le même markup entre la liste plate et les sections du mois.
  const renderCard = (report: PoliceReport) => (
    <article key={report.id} className="flex flex-col gap-3 rounded-xl border p-4">
      {/* En-tête : Modèle + chiffres du soir sur UNE même ligne. L'auteur descend en bas de carte. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">Modèle</span>{' '}
          <span className="font-semibold">{report.creatorName}</span>
        </span>
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
        // Alerte du soir = avertissement → Badge STATUS_COLORS.warning (le traitement d'alerte que
        // l'app utilise déjà), affiché seulement s'il y en a une. `h-auto`/`whitespace-normal` :
        // une alerte peut faire une phrase → la pastille s'adapte ; `font-normal` car ce n'est pas
        // un libellé.
        <div>
          <Badge
            className={`${STATUS_COLORS.warning} h-auto items-start gap-1.5 py-1 text-left font-normal whitespace-normal`}
          >
            <TriangleAlert className="size-3.5 shrink-0 translate-y-0.5" />
            <span>
              <span className="font-medium">Alerte</span> {report.alerte}
            </span>
          </Badge>
        </div>
      )}

      {/* Lignes chatteur : ce qui a marché (ThumbsUp) / à régler (Wrench). */}
      {report.lines.length > 0 && (
        <div className="flex flex-col gap-2">
          {report.lines.map((line) => (
            <div key={line.id} className="text-sm">
              <span className="text-muted-foreground">Chatteur</span>{' '}
              <span className="font-medium">{line.chatterName}</span>
              {!line.aMarche && !line.aRegler && <span className="text-muted-foreground"> — </span>}
              {(line.aMarche || line.aRegler) && (
                // « a marché » / « à régler » côte à côte (2 colonnes), comme à la saisie.
                <div className="mt-0.5 grid gap-x-6 gap-y-0.5 text-muted-foreground sm:grid-cols-2">
                  {line.aMarche && (
                    <span className="flex items-start gap-1.5">
                      <ThumbsUp className="size-3.5 shrink-0 translate-y-0.5" />
                      <span>{line.aMarche}</span>
                    </span>
                  )}
                  {line.aRegler && (
                    <span className="flex items-start gap-1.5">
                      <Wrench className="size-3.5 shrink-0 translate-y-0.5" />
                      <span>{line.aRegler}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bas de carte, à droite : « auteur · heure » (même format que le Tracker) + corbeille
          (sur ses propres rapports, miroir du `.eq('author_id')`). */}
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          {report.authorName ? `${report.authorName} · ` : ''}
          {frTimeShort(report.createdAt)}
        </span>
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
    </article>
  )

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">
        {vue === 'mois' ? 'Rapports du mois' : 'Rapports du jour'}
      </h2>

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {vue === 'mois' ? 'Aucun rapport ce mois.' : 'Aucun rapport ce jour.'}
        </p>
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
          ) : vue === 'mois' ? (
            // MOIS : une section par jour (en-tête de date), cartes du jour dedans. Zéro filet
            // décoratif — hiérarchie par la typo + l'espace.
            <div className="flex flex-col gap-6">
              {byDay.map((group) => (
                <div key={group.day} className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium capitalize">{frWeekdayLong(group.day)}</h3>
                  <div className="flex flex-col gap-4">{group.reports.map(renderCard)}</div>
                </div>
              ))}
            </div>
          ) : (
            // JOUR : liste plate des rapports du jour (un par modèle), SANS date sur les cartes.
            <div className="flex flex-col gap-4">{visible.map(renderCard)}</div>
          )}
        </>
      )}
    </section>
  )
}
