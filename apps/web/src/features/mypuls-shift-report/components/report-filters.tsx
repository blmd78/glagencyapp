'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { SLOT_KEYS, SLOT_LABEL, SLOT_START_HOUR, type SlotKey } from '@glagency/core'
import type { SlotFilter } from '../types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

/**
 * Les filtres PROPRES à l'écran. Les dates n'en font plus partie : elles viennent du sélecteur
 * de période du header, comme partout ailleurs dans le CRM. Un écran qui a son propre sélecteur
 * de jour à côté du sélecteur global oblige à se demander lequel des deux commande.
 *
 * Le reste vit dans l'URL, pas dans un état client : un relevé se partage par lien, et le Server
 * Component se recharge sur la nouvelle valeur.
 *
 * `router.replace` et non `push` : basculer un filtre ne doit pas remplir l'historique du
 * navigateur au point qu'un retour arrière devienne inutilisable.
 */
export function ReportFilters({
  slot,
  onlyExpected,
  belowOnly,
}: {
  slot: SlotFilter
  onlyExpected: boolean
  belowOnly: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (key: 'shift' | 'attendu' | 'ecart', value: string) => {
    const next = new URLSearchParams(params.toString())
    // Une bascule éteinte sort de l'URL au lieu d'y écrire « 0 » : un lien partagé reste lisible.
    if (value === '') next.delete(key)
    else next.set(key, value)
    startTransition(() => {
      router.replace(`?${next.toString()}` as Route, { scroll: false })
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={slot} onValueChange={(v) => go('shift', v === 'all' ? '' : v)} disabled={pending}>
        <SelectTrigger className="w-[13rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les créneaux</SelectItem>
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
          onCheckedChange={(v) => go('attendu', v ? '1' : '')}
        />
        Seulement ceux qui ont un créneau
      </label>

      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={belowOnly}
          disabled={pending}
          onCheckedChange={(v) => go('ecart', v ? '1' : '')}
        />
        Seulement ceux qui ont manqué des jours
      </label>
    </div>
  )
}

/** Le créneau suivant dans la journée — sa borne de début est la borne de fin du courant. */
const nextSlot = (k: SlotKey): SlotKey =>
  SLOT_KEYS[(SLOT_KEYS.indexOf(k) + 1) % SLOT_KEYS.length] as SlotKey
