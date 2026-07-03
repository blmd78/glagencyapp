'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { saveQuotas, type SaveQuotasInput } from '../actions'
import type { QuotaTeamRow, QuotaValues } from '../types'

/** Colonnes de saisie — mêmes libellés que le dashboard legacy. */
const FIELDS = [
  { key: 'presenceH', label: 'Présence (h/j)', placeholder: 'ex : 7', int: false },
  { key: 'reactiviteS', label: 'Réactivité (s/j)', placeholder: 'ex : 300', int: true },
  { key: 'mediasProposes', label: 'Médias prop. /j', placeholder: 'ex : 20', int: true },
  { key: 'convPct', label: 'Conv. (%/j)', placeholder: 'ex : 25', int: false },
  { key: 'caEur', label: 'CA (€/j)', placeholder: 'ex : 100', int: false },
] as const

type FieldKey = (typeof FIELDS)[number]['key']
type RowValues = Record<FieldKey, string>

// Saisie libre en type="text" (pas type="number" : en badInput le DOM rapporte "" alors
// que du texte reste affiché → risque d'effacement silencieux). Filtre : chiffres + un
// séparateur décimal (point ou virgule française).
const NUMERIC_INPUT = /^\d*(?:[.,]\d*)?$/

function toRowValues(quota: QuotaValues | null): RowValues {
  return {
    presenceH: quota ? String(quota.presenceH) : '',
    reactiviteS: quota ? String(quota.reactiviteS) : '',
    mediasProposes: quota ? String(quota.mediasProposes) : '',
    convPct: quota ? String(quota.convPct) : '',
    caEur: quota ? String(quota.caEur) : '',
  }
}

type Status = { kind: 'ok' | 'error'; message: string } | null

/**
 * Tableau d'édition des seuils journaliers par équipe.
 * Règle : une ligne se sauvegarde complète (5 seuils) ou entièrement vide (= non configuré).
 */
export function QuotasEditor({ teams }: { teams: QuotaTeamRow[] }) {
  const initial = React.useMemo(() => {
    const m: Record<string, RowValues> = {}
    for (const t of teams) m[t.teamId] = toRowValues(t.quota)
    return m
  }, [teams])

  // On ne stocke que les OVERRIDES utilisateur (champs réellement modifiés), pas une
  // copie de l'état serveur : une revalidation venue de l'autre éditeur de la page ne
  // peut donc pas écraser une saisie en cours non sauvegardée.
  const [overrides, setOverrides] = React.useState<Record<string, Partial<RowValues>>>({})
  const [status, setStatus] = React.useState<Status>(null)
  const [isPending, startTransition] = React.useTransition()

  const fieldValue = (teamId: string, field: FieldKey) =>
    overrides[teamId]?.[field] ?? initial[teamId]?.[field] ?? ''

  const dirty = Object.keys(overrides).length > 0

  function setField(teamId: string, field: FieldKey, raw: string) {
    // Normalise le copier-coller : espaces (y c. insécables) de « 1 234,5 » retirés.
    const v = raw.replace(/[\s  ]/g, '')
    if (!NUMERIC_INPUT.test(v)) return // rejette lettres, signes, double séparateur
    setOverrides((prev) => {
      const row = { ...prev[teamId], [field]: v }
      // Champ revenu à la valeur serveur → on retire l'override (dirty exact).
      if (v === (initial[teamId]?.[field] ?? '')) delete row[field]
      const next = { ...prev, [teamId]: row }
      if (Object.keys(row).length === 0) delete next[teamId]
      return next
    })
    setStatus(null)
  }

  function handleSave() {
    const upserts: SaveQuotasInput['upserts'] = []
    const deletes: string[] = []

    for (const t of teams) {
      // Ne sauvegarde QUE les lignes portant un override : re-pousser les lignes
      // intactes écraserait les changements concurrents d'un autre utilisateur.
      if (!overrides[t.teamId]) continue
      const row = {} as RowValues
      for (const f of FIELDS) row[f.key] = fieldValue(t.teamId, f.key)

      const filled = FIELDS.filter((f) => row[f.key].trim() !== '')

      if (filled.length === 0) {
        if (t.quota) deletes.push(t.teamId) // ligne vidée = quota retiré
        continue
      }
      if (filled.length < FIELDS.length) {
        setStatus({
          kind: 'error',
          message: `${t.teamName} : renseigne les 5 seuils, ou vide toute la ligne pour retirer le quota.`,
        })
        return
      }

      const parsed = {} as Record<FieldKey, number>
      for (const f of FIELDS) {
        const n = Number(row[f.key].replace(',', '.'))
        if (!Number.isFinite(n) || n < 0) {
          setStatus({ kind: 'error', message: `${t.teamName} : « ${f.label} » est invalide.` })
          return
        }
        parsed[f.key] = f.int ? Math.round(n) : n
      }
      if (parsed.presenceH <= 0 || parsed.presenceH > 24) {
        setStatus({ kind: 'error', message: `${t.teamName} : la présence doit être entre 0 et 24 h/j.` })
        return
      }
      if (parsed.reactiviteS <= 0) {
        setStatus({ kind: 'error', message: `${t.teamName} : la réactivité doit être supérieure à 0.` })
        return
      }
      if (parsed.convPct > 100) {
        setStatus({ kind: 'error', message: `${t.teamName} : la conversion ne peut pas dépasser 100 %.` })
        return
      }

      upserts.push({ teamId: t.teamId, ...parsed })
    }

    startTransition(async () => {
      const res = await saveQuotas({ upserts, deletes })
      if (res.success) setOverrides({}) // le serveur fait foi après un save réussi
      setStatus(
        res.success
          ? { kind: 'ok', message: 'Sauvegardé — les prochaines cartes Analyses utiliseront ces seuils.' }
          : { kind: 'error', message: res.error },
      )
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Modèle</TableHead>
              {FIELDS.map((f) => (
                <TableHead key={f.key} className="text-right">
                  {f.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.teamId}>
                <TableCell className="font-medium">{t.teamName}</TableCell>
                {FIELDS.map((f) => (
                  <TableCell key={f.key} className="text-right">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder={f.placeholder}
                      value={fieldValue(t.teamId, f.key)}
                      onChange={(e) => setField(t.teamId, f.key, e.target.value)}
                      className="ml-auto h-8 w-24 text-right tabular-nums"
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!dirty || isPending}>
          {isPending ? 'Sauvegarde…' : 'Sauvegarder'}
        </Button>
        {status && (
          <p
            className={cn(
              'text-sm',
              status.kind === 'ok' ? 'text-muted-foreground' : 'text-destructive',
            )}
          >
            {status.message}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Réactivité : seuil maximal (plus bas = mieux) · autres métriques : seuil minimal. Ligne
        vide = quota non configuré, le modèle n&apos;apparaît pas dans les cartes Analyses.
      </p>
    </div>
  )
}
