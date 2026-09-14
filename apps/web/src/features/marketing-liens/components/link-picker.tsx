'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Combobox } from '@/components/ui/combobox'
import { ALL, RESEAU_OPTIONS, type LinkOption, type Reseau } from '../link-options'

/**
 * Les deux champs du mode Graphique : le RÉSEAU, puis le LIEN qu'il laisse passer.
 *
 * Ils NAVIGUENT (`?reseau=`, `?lien=`) au lieu de tenir un état local : la série est lue par le
 * serveur, et la vue reste partageable. Même patron que `TodoAccountSelect`. `replace` et non
 * `push` — chaque lien regardé ne mérite pas son entrée d'historique.
 *
 * Changer de réseau REMET le lien sur « tous » : sans ça on pourrait rester sur un lien Twitter
 * avec le champ du dessus sur Instagram, un écran qui se contredit. Le serveur applique la même
 * règle (`resolveGraphSelection`), celle-ci ne fait qu'éviter l'aller-retour visible.
 */
export function LinkPicker({
  options,
  reseau,
  lien,
}: {
  options: LinkOption[]
  reseau: Reseau
  lien: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const go = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(next)) {
      // La valeur par défaut ne s'écrit pas : URL propre, même convention que `UrlTabs`.
      if (v === ALL) params.delete(k)
      else params.set(k, v)
    }
    const qs = params.toString()
    router.replace((qs ? `/marketing/liens?${qs}` : '/marketing/liens') as Route, { scroll: false })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Combobox
        options={RESEAU_OPTIONS}
        value={reseau}
        onChange={(v) => v && v !== reseau && go({ reseau: v, lien: ALL })}
        placeholder="Réseau…"
        searchPlaceholder="Rechercher un réseau…"
        emptyText="Aucun réseau."
        className="w-full sm:w-56"
      />
      <Combobox
        options={options}
        value={lien}
        onChange={(v) => v && v !== lien && go({ lien: v })}
        placeholder="Lien…"
        searchPlaceholder="Rechercher un lien…"
        emptyText="Aucun lien."
        className="w-full sm:w-96"
      />
    </div>
  )
}
