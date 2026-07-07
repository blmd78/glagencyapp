'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addPoliceWarning, addPoliceMalus } from '../actions'
import { POLICE_ERRORS, SHIFTS, type PoliceData } from '../types'

/**
 * Saisie d'un contrôle en UNE action : chatteur + type d'erreur, puis un champ montant.
 * Montant vide → simple avertissement ; montant renseigné → malus (avec l'erreur en motif).
 */
export function ControlPanel({
  data,
  chatterId,
  onChatterChange,
}: {
  data: PoliceData
  chatterId: string
  onChatterChange: (id: string) => void
}) {
  const [errorKey, setErrorKey] = useState('')
  const [shift, setShift] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const recentWarns = chatterId ? (data.warningsByChatter[chatterId] ?? 0) : null
  const amountEur = amount.trim() ? Number(amount.replace(',', '.')) : 0
  const isMalus = amountEur > 0

  const submit = () => {
    if (!chatterId || !errorKey) {
      setErr('Choisis un chatteur et un type d’erreur.')
      return
    }
    if (amount.trim() && (!Number.isFinite(amountEur) || amountEur <= 0)) {
      setErr('Montant invalide (laisse vide pour un simple avertissement).')
      return
    }
    setErr(null)
    startTransition(async () => {
      const res = isMalus
        ? await addPoliceMalus({
            day: data.day,
            chatterId,
            errorKey,
            amountEur,
            note: note.trim() || undefined,
            shift: shift || undefined,
          })
        : await addPoliceWarning({
            day: data.day,
            chatterId,
            errorKey,
            shift: shift || undefined,
          })
      if (!res.success) setErr(res.error)
      else {
        setErrorKey('')
        setAmount('')
        setNote('')
      }
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      {/* Chatteur + shift */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-52 flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Chatteur contrôlé</label>
          <Combobox
            options={data.chatterOptions.map((c) => ({ value: c.id, label: c.name }))}
            value={chatterId}
            onChange={onChatterChange}
            placeholder="Choisir un chatteur…"
            searchPlaceholder="Rechercher un chatteur…"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Shift</label>
          <Select value={shift} onValueChange={setShift}>
            <SelectTrigger className="h-9 w-32 text-sm capitalize">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {SHIFTS.map((s) => (
                <SelectItem key={s} value={s} className="text-sm capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {recentWarns != null && (
          <p className="pb-2 text-xs">
            {recentWarns > 0 ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {recentWarns} avert. / 30 j
              </span>
            ) : (
              <span className="text-muted-foreground">Aucun avert. récent</span>
            )}
          </p>
        )}
      </div>

      {/* Erreur + (montant à la suite) + action */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Type d’erreur</label>
          <Select value={errorKey} onValueChange={setErrorKey}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              {POLICE_ERRORS.map((e) => (
                <SelectItem key={e.key} value={e.key} className="text-sm">
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Malus € (vide = simple avert.)</label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="—"
            className="h-9 w-32 text-sm"
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Motif du malus (optionnel)</label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Raison…"
            disabled={!isMalus}
            className="h-9 text-sm"
          />
        </div>
        <Button
          onClick={submit}
          disabled={pending}
          variant={isMalus ? 'destructive' : 'default'}
          className="min-w-40"
        >
          {isMalus ? `Infliger le malus (${amountEur} €)` : 'Ajouter l’avertissement'}
        </Button>
      </div>

      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
