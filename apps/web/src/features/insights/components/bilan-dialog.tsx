'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { InsightBilan } from '../types'

export const ETAT_OPTIONS = [
  ['neutre', 'Neutre / RAS'],
  ['motive', 'Motivé / mobilisé'],
  ['fatigue', 'Fatigué / surchargé'],
  ['demotive', 'Démotivé / désengagé'],
  ['resistant', 'Résistant / défensif'],
] as const

const DUREE_OPTIONS = [
  ['5min', '5 min — vite fait'],
  ['15min', '15 min — standard'],
  ['30min', '30 min — sérieux'],
  ['1h+', '1h+ — approfondi'],
] as const

const EMPTY: InsightBilan = {
  date: new Date().toISOString().slice(0, 10),
  duree: '15min',
  etat: 'neutre',
  resume: '',
  actions: '',
  objectifs: '',
  sanction: '',
  nextCheck: '',
  notes: '',
}

function Field({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">optionnel</span>}
      </label>
      {children}
    </div>
  )
}

const areaCls =
  'w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Modal « bilan » de résolution — repris champ pour champ du CRM legacy : guide le
 * manager (résumé du call, actions engagées, objectifs chiffrés, sanction, checkpoint)
 * au lieu d'une note libre d'une phrase. Requis pour passer une carte en Résolu.
 */
export function BilanDialog({
  open,
  onOpenChange,
  title,
  initial,
  pending,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial: InsightBilan | null
  pending: boolean
  onSave: (bilan: InsightBilan) => void
}) {
  const [b, setB] = useState<InsightBilan>(initial ?? EMPTY)
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof InsightBilan>(k: K, v: InsightBilan[K]) => {
    setTouched(true)
    setB((prev) => ({ ...prev, [k]: v }))
  }
  const resumeOk = b.resume.trim().length >= 10

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-xl"
        // Ne pas perdre un bilan en cours de frappe sur un clic hors du modal.
        onInteractOutside={(e) => {
          if (touched) e.preventDefault()
        }}
      >
        <DialogHeader className="space-y-1.5 px-6 pb-5 pt-6 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Bilan de résolution
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{title}</p>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-6 pb-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Date du call">
              <Input
                type="date"
                className="h-9 text-sm"
                value={b.date}
                onChange={(e) => set('date', e.target.value)}
              />
            </Field>
            <Field label="Durée">
              <Select value={b.duree} onValueChange={(v) => set('duree', v as InsightBilan['duree'])}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DUREE_OPTIONS.map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-sm">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="État du chatteur">
              <Select value={b.etat} onValueChange={(v) => set('etat', v as InsightBilan['etat'])}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ETAT_OPTIONS.map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-sm">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Résumé du call">
            <textarea
              rows={3}
              className={areaCls}
              placeholder="Qu'est-ce qui s'est dit ? Les points clés discutés."
              value={b.resume}
              onChange={(e) => set('resume', e.target.value)}
            />
            {touched && !resumeOk && (
              <span className="text-xs text-red-600 dark:text-red-400">
                Quelques phrases minimum — c&apos;est le cœur du bilan.
              </span>
            )}
          </Field>

          <Field label="Actions engagées par le chatteur" optional>
            <textarea
              rows={2}
              className={areaCls}
              placeholder="Ex : il va relancer 5 spenders, voice notes quotidiennes…"
              value={b.actions}
              onChange={(e) => set('actions', e.target.value)}
            />
          </Field>

          <Field label="Objectifs définis — chiffré + deadline" optional>
            <textarea
              rows={2}
              className={areaCls}
              placeholder="Ex : 800 € d'ici dimanche, 30 nouveaux subs qualifiés…"
              value={b.objectifs}
              onChange={(e) => set('objectifs', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Sanction si non tenu" optional>
              <Input
                className="h-9 text-sm"
                placeholder="Ex : PIP, dernière chance, départ"
                value={b.sanction}
                onChange={(e) => set('sanction', e.target.value)}
              />
            </Field>
            <Field label="Prochain checkpoint" optional>
              <Input
                type="date"
                className="h-9 text-sm"
                value={b.nextCheck}
                onChange={(e) => set('nextCheck', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Notes, red flags, contexte" optional>
            <textarea
              rows={2}
              className={areaCls}
              placeholder="Tout ce qu'il faut retenir pour la prochaine fois (vie perso, conflits…)"
              value={b.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter className="gap-2 px-6 pb-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={() => onSave(b)} disabled={pending || !resumeOk}>
            {pending ? 'Enregistrement…' : 'Enregistrer le bilan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
