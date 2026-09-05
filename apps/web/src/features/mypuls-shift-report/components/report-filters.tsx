'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { SLOT_KEYS, SLOT_LABEL, SLOT_START_HOUR, type SlotKey } from '@glagency/core'
import type { ReportMode, SlotFilter } from '../types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/**
 * Les filtres propres à l'écran, et LA bascule de grain.
 *
 * Le grain se choisit à la main plutôt que de se déduire de la longueur de la période : voir
 * l'écran changer de tête parce qu'on a bougé le datepicker d'un jour serait déroutant.
 *
 *   Période  → suit le sélecteur de dates du header, comme le reste du CRM. Compte de jours
 *              tenus, pas de dépliage (sur un mois, le DOM ne le supporterait pas).
 *   Jour     → IGNORE le header et propose ses propres jours. Jauge en minutes, timeline des
 *              sessions dépliable, attendus sans activité. C'est le grain d'origine de l'écran.
 *
 * Tout vit dans l'URL, pas dans un état client : un relevé se partage par lien, et le Server
 * Component se recharge sur la nouvelle valeur. `router.replace` et non `push` : basculer un
 * filtre ne doit pas remplir l'historique au point qu'un retour arrière devienne inutilisable.
 */
export function ReportFilters({
  mode,
  day,
  dayOptions,
  slot,
  onlyExpected,
  belowOnly,
}: {
  mode: ReportMode
  /** Jour affiché — seulement en mode `day`. */
  day?: string
  dayOptions?: { value: string; label: string }[]
  slot: SlotFilter
  onlyExpected: boolean
  belowOnly: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      // Une valeur par défaut SORT de l'URL au lieu d'y écrire une sentinelle : un lien partagé
      // reste lisible.
      if (v === '') next.delete(k)
      else next.set(k, v)
    }
    startTransition(() => {
      router.replace(`?${next.toString()}` as Route, { scroll: false })
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup
        type="single"
        value={mode}
        disabled={pending}
        // `onValueChange` rend '' quand on re-clique l'option active : on ignore, sinon la
        // bascule se viderait et l'écran repartirait sur son défaut sans qu'on l'ait voulu.
        onValueChange={(v) => {
          if (v === 'day') go({ vue: 'jour' })
          else if (v === 'period') go({ vue: '', date: '' })
        }}
        className="rounded-md border p-0.5"
      >
        <ToggleGroupItem value="period" className="px-3 text-sm">
          Période
        </ToggleGroupItem>
        <ToggleGroupItem value="day" className="px-3 text-sm">
          Un jour
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === 'day' && dayOptions && (
        <Select value={day} onValueChange={(v) => go({ date: v })} disabled={pending}>
          <SelectTrigger className="w-[15rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dayOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={slot}
        onValueChange={(v) => go({ shift: v === 'all' ? '' : v })}
        disabled={pending}
      >
        <SelectTrigger className="w-[13rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {mode === 'day' ? 'Journée complète' : 'Tous les créneaux'}
          </SelectItem>
          {SLOT_KEYS.map((k) => (
            <SelectItem key={k} value={k}>
              {SLOT_LABEL[k]} · {String(SLOT_START_HOUR[k]).padStart(2, '0')}h →{' '}
              {String(SLOT_START_HOUR[nextSlot(k)]).padStart(2, '0')}h
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={onlyExpected}
          disabled={pending}
          onCheckedChange={(v) => go({ attendu: v ? '1' : '' })}
        />
        Seulement leur créneau
      </label>

      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={belowOnly}
          disabled={pending}
          onCheckedChange={(v) => go({ ecart: v ? '1' : '' })}
        />
        {mode === 'day' ? 'Sous le seuil seulement' : 'Ont manqué des jours'}
      </label>
    </div>
  )
}

/** Le créneau suivant dans la journée — sa borne de début est la borne de fin du courant. */
const nextSlot = (k: SlotKey): SlotKey =>
  SLOT_KEYS[(SLOT_KEYS.indexOf(k) + 1) % SLOT_KEYS.length] as SlotKey
