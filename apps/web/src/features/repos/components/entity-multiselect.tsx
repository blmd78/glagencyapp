'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
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
 * Combobox MULTIPLE générique (modèles OU chatteurs) : Popover + Command (recherche + clavier),
 * coches persistantes, plus un champ texte libre optionnel. Sauvegarde à la fermeture.
 * Le rendu du déclencheur est délégué à l'appelant.
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
      setCustom('')
    } else {
      onCommit({ ids: selected, names: allowCustom ? customTokens.join(', ') : '' })
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {allOptions.map((o) => (
                <CommandItem key={o.id} value={o.name} onSelect={() => toggle(o.id)}>
                  <Check
                    className={cn(
                      'size-4',
                      selected.includes(o.id) ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>

        {allowCustom && (
          <div className="border-t p-2">
            {customTokens.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
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
            <div className="flex items-center gap-1.5">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={addCustom}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
