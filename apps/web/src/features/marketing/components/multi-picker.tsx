'use client'

import { useMemo, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Multi-select avec recherche (même ergonomie que le sélecteur du planning repos). */
export function MultiPicker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o.label])), [options])
  const needle = search.trim().toLowerCase()
  const shown = needle
    ? options.filter((o) => o.label.toLowerCase().includes(needle))
    : options

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-auto min-h-9 justify-between font-normal">
            <span className="flex flex-wrap gap-1 text-left">
              {selected.length ? (
                selected.map((id) => (
                  <span key={id} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {byId.get(id) ?? id}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">Aucun</span>
              )}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
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
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
