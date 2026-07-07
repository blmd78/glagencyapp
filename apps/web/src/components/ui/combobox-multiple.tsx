'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Check, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { ComboOption } from '@/components/ui/combobox'

/** Chip additionnel (hors options, ex. noms texte legacy) affiché dans le champ, avec sa croix. */
export interface ExtraChip {
  key: string
  label: string
  className?: string
  title?: string
  onRemove: () => void
}

/**
 * Combobox MULTIPLE (pattern shadcn « Multiple ») déclenché par un `trigger` fourni par
 * l'appelant (l'affichage hôte, ex. une cellule de tableau, reste intact). Le popover contient
 * le champ ComboboxChips — sélections en chips avec croix + saisie inline — et la liste filtrée
 * avec coches. `onChange` est émis à chaque ajout/retrait (sauvegarde immédiate côté appelant).
 */
export function ComboboxMultiple({
  trigger,
  options,
  value,
  onChange,
  labelById = {},
  placeholder = 'Rechercher…',
  emptyText = 'Aucun résultat.',
  chipClassName,
  chipTitle,
  extraChips = [],
}: {
  trigger: ReactNode
  options: ComboOption[]
  value: string[]
  onChange: (next: string[]) => void
  /** Résolution du label des valeurs absentes des options (ex. entités inactives). */
  labelById?: Record<string, string>
  placeholder?: string
  emptyText?: string
  /** Classe du chip d'une valeur (string ou fonction par valeur). */
  chipClassName?: string | ((v: string) => string)
  /** Tooltip d'un chip (par valeur). */
  chipTitle?: (v: string) => string | undefined
  extraChips?: ExtraChip[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const labelOf = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]))
    return (v: string) => m.get(v) ?? labelById[v] ?? '?'
  }, [options, labelById])

  // Options = actives ∪ valeurs sélectionnées hors liste (décochables), triées par label.
  const allOptions = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]))
    for (const v of value) if (!m.has(v)) m.set(v, labelById[v] ?? '?')
    return [...m.entries()]
      .map(([v, label]) => ({ value: v, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [options, value, labelById])

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
    setSearch('')
    inputRef.current?.focus()
  }

  const chipCls = (v: string) =>
    typeof chipClassName === 'function' ? chipClassName(v) : chipClassName

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          {/* Champ ComboboxChips : sélections (croix de retrait) + saisie inline. */}
          <div
            className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5"
            onClick={() => inputRef.current?.focus()}
          >
            {value.map((v) => (
              <span
                key={v}
                title={chipTitle?.(v)}
                className={cn(
                  'flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium',
                  chipCls(v) ?? 'bg-muted text-foreground',
                )}
              >
                {labelOf(v)}
                <span
                  role="button"
                  title="Retirer"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(value.filter((x) => x !== v))
                  }}
                  className="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
                >
                  <X className="size-3" />
                </span>
              </span>
            ))}
            {extraChips.map((c) => (
              <span
                key={c.key}
                title={c.title}
                className={cn(
                  'flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium',
                  c.className ?? 'bg-muted text-foreground',
                )}
              >
                {c.label}
                <span
                  role="button"
                  title="Retirer"
                  onClick={(e) => {
                    e.stopPropagation()
                    c.onRemove()
                  }}
                  className="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
                >
                  <X className="size-3" />
                </span>
              </span>
            ))}
            <CommandPrimitive.Input
              ref={inputRef}
              autoFocus
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                // Backspace sur champ vide = retire la dernière sélection (pattern standard).
                if (e.key === 'Backspace' && !search) {
                  if (value.length) onChange(value.slice(0, -1))
                  else if (extraChips.length) extraChips[extraChips.length - 1].onRemove()
                }
              }}
              placeholder={placeholder}
              className="min-w-16 flex-1 bg-transparent py-0.5 text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allOptions.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                  <span className="truncate">{o.label}</span>
                  <Check
                    className={cn(
                      'ml-auto size-4',
                      value.includes(o.value) ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
