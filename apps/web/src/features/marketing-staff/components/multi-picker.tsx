'use client'

import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { Label } from '@/components/ui/label'

/**
 * Multi-select à chips des fiches VA — même composant ComboboxMultiple que le planning
 * repos (chips avec croix + saisie inline + liste cochée), déclenché par un champ labellisé.
 */
export function MultiPicker({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const byId = new Map(options.map((o) => [o.id, o.label]))
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <ComboboxMultiple
        trigger={
          <Button type="button" variant="outline" disabled={disabled} className="h-auto min-h-9 justify-between font-normal">
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
        }
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        value={selected}
        onChange={onChange}
      />
    </div>
  )
}
