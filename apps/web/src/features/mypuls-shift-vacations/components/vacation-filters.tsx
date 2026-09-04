'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { SLOT_KEYS, SLOT_LABEL } from '@glagency/core'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { VacationsPage } from '../types'

/** Valeur sentinelle des `Select` : Radix interdit une `SelectItem` de valeur vide. */
const ANY = '__tous__'

/**
 * Les filtres vivent dans l'URL, pas dans un état client : une vue d'enquête se partage par
 * lien, et le Server Component se recharge sur la nouvelle valeur.
 *
 * `router.replace` et non `push` : parcourir les jours ne doit pas rendre le retour arrière
 * inutilisable.
 */
export function VacationFilters({ data }: { data: VacationsPage }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      // Un filtre éteint SORT de l'URL au lieu d'y écrire une sentinelle : un lien partagé
      // reste lisible.
      if (v === '') next.delete(k)
      else next.set(k, v)
    }
    startTransition(() => {
      router.replace(`?${next.toString()}` as Route, { scroll: false })
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="vac-from" className="text-xs text-muted-foreground">
          Du
        </Label>
        <Input
          id="vac-from"
          type="date"
          className="w-[10.5rem]"
          value={data.from}
          disabled={pending}
          onChange={(e) => go({ du: e.target.value })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="vac-to" className="text-xs text-muted-foreground">
          Au
        </Label>
        <Input
          id="vac-to"
          type="date"
          className="w-[10.5rem]"
          value={data.to}
          disabled={pending}
          onChange={(e) => go({ au: e.target.value })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Chatter</Label>
        <Combobox
          className="w-[15rem]"
          options={[
            { value: ANY, label: 'Tous les chatters' },
            ...data.chatterOptions.map((c) => ({ value: c.id, label: c.name })),
          ]}
          value={data.chatterId ?? ANY}
          disabled={pending}
          placeholder="Tous les chatters"
          onChange={(v) => go({ chatteur: v === ANY ? '' : v })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Modèle</Label>
        <Select
          value={data.model ?? ANY}
          disabled={pending}
          onValueChange={(v) => go({ modele: v === ANY ? '' : v })}
        >
          <SelectTrigger className="w-[12rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Tous les modèles</SelectItem>
            {data.modelOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Créneau</Label>
        <Select
          value={data.slot}
          disabled={pending}
          onValueChange={(v) => go({ creneau: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="w-[11rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Journée complète</SelectItem>
            {SLOT_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {SLOT_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
