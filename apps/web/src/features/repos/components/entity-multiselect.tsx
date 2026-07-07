'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { EntityOption } from '../types'

/** Tokens d'un texte libre (séparés par virgules/retours), vides filtrés. */
const tokensOf = (s: string) =>
  s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)

export interface EntityMultiSelectProps {
  /** Élément déclencheur (chips + éventuel crayon), fourni par l'appelant. */
  trigger: ReactNode
  /** IDs sélectionnés (source = serveur). */
  value: string[]
  /** Options cochables (entités actives). */
  options: EntityOption[]
  /** id → nom, pour afficher/décocher des IDs hors `options` (ex. inactifs déjà présents). */
  nameById: Record<string, string>
  /** Autoriser un champ texte libre (encadrement hors-liste) — sinon masqué. */
  allowCustom?: boolean
  /** Texte libre courant. */
  customValue?: string
  /** Placeholder du champ recherche. */
  searchPlaceholder?: string
  /** Placeholder du champ texte libre. */
  customPlaceholder?: string
  /** Commit à la fermeture du popover : IDs cochés + texte libre (vide si !allowCustom). */
  onCommit: (next: { ids: string[]; names: string }) => void
}

/**
 * Multi-select générique (modèles OU chatteurs) : popover avec recherche + coches, plus un champ
 * texte libre optionnel. Sauvegarde à la fermeture. Le rendu du déclencheur est délégué à l'appelant.
 */
export function EntityMultiSelect({
  trigger,
  value,
  options,
  nameById,
  allowCustom = false,
  customValue = '',
  searchPlaceholder = 'Rechercher…',
  customPlaceholder = 'Autre…',
  onCommit,
}: EntityMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>(value)
  const [customTokens, setCustomTokens] = useState<string[]>(() => tokensOf(customValue))
  const [custom, setCustom] = useState('')

  // Options = entités actives ∪ IDs déjà sélectionnés hors liste (décochables), triées par nom.
  const allOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of options) map.set(o.id, o.name)
    for (const id of selected) if (!map.has(id)) map.set(id, nameById[id] ?? '?')
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [options, selected, nameById])

  const needle = search.trim().toLowerCase()
  const shown = needle ? allOptions.filter((o) => o.name.toLowerCase().includes(needle)) : allOptions

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const addCustom = () => {
    const t = custom.trim()
    if (!t) return
    if (!customTokens.includes(t)) setCustomTokens((prev) => [...prev, t])
    setCustom('')
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSelected(value) // re-sync à l'ouverture (source = serveur)
      setCustomTokens(tokensOf(customValue))
      setSearch('')
      setCustom('')
    } else {
      onCommit({ ids: selected, names: allowCustom ? customTokens.join(', ') : '' })
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="mb-2 h-8 text-xs"
        />
        <div className="max-h-56 overflow-y-auto pr-1">
          {shown.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">Aucun résultat.</p>
          )}
          {shown.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60"
            >
              <Checkbox checked={selected.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
              <span className="truncate">{o.name}</span>
            </label>
          ))}
        </div>
        {allowCustom && (
          <>
            {customTokens.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
                {customTokens.map((t) => (
                  <button
                    key={t}
                    type="button"
                    title="Retirer"
                    onClick={() => setCustomTokens((prev) => prev.filter((x) => x !== t))}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/70"
                  >
                    {t} ✕
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-1.5 border-t pt-2">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustom()
                  }
                }}
                placeholder={customPlaceholder}
                className="h-8 text-xs"
              />
              <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={addCustom}>
                <Plus className="size-3.5" />
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
