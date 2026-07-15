'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { saveSnapCode } from './actions'
import { SNAP_STATUTS, type SnapCodeRow, type SnapCodesData, type SnapStatut } from './types'

/**
 * Codes Snap (porté de gla-workflow) : identifiants Snapchat par modèle, édition inline
 * avec autosave (debounce 500 ms + save au blur), mots de passe masqués par défaut,
 * filtre par modèle. Une ligne par modèle actif — la ligne se crée à la première édition.
 */

const STATUT_CLASS: Record<SnapStatut, string> = {
  actif: 'text-green-700 dark:text-green-400',
  banni: 'text-red-700 dark:text-red-400',
  'en pause': 'text-amber-700 dark:text-amber-400',
  'à recréer': 'text-orange-700 dark:text-orange-400',
}

function CodeRow({ row }: { row: SnapCodeRow }) {
  const [local, setLocal] = useState(row)
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function persist(next: SnapCodeRow) {
    void saveSnapCode({
      creatorId: next.creatorId,
      pseudo: next.pseudo,
      mdp: next.mdp,
      statut: next.statut,
      notes: next.notes,
    }).then((res) => {
      if (!res.success) return setError(res.error)
      setError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  function change(patch: Partial<SnapCodeRow>, immediate = false) {
    const next = { ...local, ...patch }
    setLocal(next)
    clearTimeout(timer.current)
    if (immediate) persist(next)
    else timer.current = setTimeout(() => persist(next), 500)
  }

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        <Badge className={modelColor(local.model)}>{local.model}</Badge>
      </TableCell>
      <TableCell className="min-w-36">
        <Input
          className="h-8 font-mono text-xs"
          value={local.pseudo}
          onChange={(e) => change({ pseudo: e.target.value })}
          onBlur={(e) => change({ pseudo: e.target.value }, true)}
          placeholder="pseudo…"
        />
      </TableCell>
      <TableCell className="min-w-44">
        {/* Œil PAR LIGNE, collé au champ (retour utilisateur) — le champ reste éditable masqué. */}
        <div className="flex items-center gap-1">
          <Input
            type={show ? 'text' : 'password'}
            className="h-8 font-mono text-xs"
            value={local.mdp}
            onChange={(e) => change({ mdp: e.target.value })}
            onBlur={(e) => change({ mdp: e.target.value }, true)}
            placeholder="mot de passe…"
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={() => setShow((v) => !v)}
            title={show ? 'Masquer' : 'Afficher'}
          >
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        </div>
      </TableCell>
      <TableCell className="min-w-32">
        <Select value={local.statut} onValueChange={(v) => change({ statut: v as SnapStatut }, true)}>
          <SelectTrigger className={cn('h-8 text-xs font-medium', STATUT_CLASS[local.statut])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SNAP_STATUTS.map((s) => (
              <SelectItem key={s} value={s} className={cn('text-xs', STATUT_CLASS[s])}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          className="h-8 text-xs"
          value={local.notes}
          onChange={(e) => change({ notes: e.target.value })}
          onBlur={(e) => change({ notes: e.target.value }, true)}
          placeholder="notes…"
        />
      </TableCell>
      <TableCell className="w-10 text-center">
        {saved && <Check className="mx-auto size-4 text-green-600" />}
        {error && (
          <span className="text-[10px] text-red-600 dark:text-red-400" title={error}>
            ✕
          </span>
        )}
      </TableCell>
    </TableRow>
  )
}

export function SnapCodesTemplate({ data }: { data: SnapCodesData }) {
  const [model, setModel] = useState('all')

  const modelOptions = useMemo(
    () => data.rows.map((r) => ({ value: r.creatorId, label: r.model })),
    [data.rows],
  )
  const shown = model === 'all' ? data.rows : data.rows.filter((r) => r.creatorId === model)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Codes Snap</h1>
        <p className="text-sm text-muted-foreground">
          Identifiants Snapchat par modèle (1 par modèle) — édition directe, sauvegarde automatique
        </p>
      </div>

      <Combobox
        value={model}
        onChange={setModel}
        className="h-8 w-44 text-xs"
        searchPlaceholder="Rechercher un modèle…"
        options={[{ value: 'all', label: 'Tous les modèles' }, ...modelOptions]}
      />

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Modèle</TableHead>
              <TableHead>Pseudo</TableHead>
              <TableHead>Mot de passe</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <CodeRow key={r.creatorId} row={r} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
