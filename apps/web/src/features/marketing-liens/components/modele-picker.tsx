'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Combobox } from '@/components/ui/combobox'
import { ALL, type LinkOption, type Modele } from '../link-options'

/**
 * Le champ MODÈLE — la raison d'être de l'écran : sur MyPuls, additionner ce qu'une modèle a
 * rapporté oblige à ouvrir ses liens un par un.
 *
 * Partagé par le Classement et le mode Graphique : un seul endroit écrit `?modele=`, donc les
 * deux onglets ne peuvent pas diverger, et la vue reste partageable. `replace` et non `push` —
 * chaque modèle regardée ne mérite pas son entrée d'historique (même patron que `LinkPicker`).
 *
 * Changer de modèle REMET le lien sur « tous » : sans ça on pourrait rester sur un lien de Léna
 * avec le champ du dessus sur Carla. Le serveur applique la même règle
 * (`resolveGraphSelection`), celle-ci ne fait qu'éviter l'aller-retour visible.
 */
export function ModelePicker({
  options,
  modele,
  className = 'w-full sm:w-56',
}: {
  options: LinkOption[]
  modele: Modele
  className?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const go = (v: string) => {
    const params = new URLSearchParams(searchParams)
    // La valeur par défaut ne s'écrit pas : URL propre, même convention que `UrlTabs`.
    if (v === ALL) params.delete('modele')
    else params.set('modele', v)
    params.delete('lien')
    const qs = params.toString()
    router.replace((qs ? `/marketing/liens?${qs}` : '/marketing/liens') as Route, { scroll: false })
  }

  return (
    <Combobox
      options={options}
      value={modele}
      onChange={(v) => v && v !== modele && go(v)}
      placeholder="Modèle…"
      searchPlaceholder="Rechercher une modèle…"
      emptyText="Aucune modèle."
      className={className}
    />
  )
}
