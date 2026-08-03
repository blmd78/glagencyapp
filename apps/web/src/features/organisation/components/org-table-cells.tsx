'use client'

import { useState } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { NewBadge } from '@/components/new-badge'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
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
import type { CrmShift } from '@/lib/types/chatters'

/**
 * Les deux CELLULES du board d'orga, plus la palette de la grille. Extrait d'`org-table.tsx`
 * (split > 300 lignes, docs/guidelines-standard-feature.md §1) — rendu inchangé.
 *
 * Le niveau MODULE n'est pas un détail de rangement ici : voir l'avertissement sur `ShiftCell`.
 */

// ── LECTURE D'ABORD (refonte 2026-07-29 — la version « une pastille par nom » était
// illisible à côté de la feuille d'origine) ──────────────────────────────────────────────────
// Ce qui rendait la feuille lisible : chaque colonne de shift porte sa teinte — on scanne une
// journée d'un coup d'œil. On garde ce principe, dans le langage de l'app :
//  • pastilles BLEUES des chatters dans les cases (code couleur des rôles) ;
//  • lavis de colonne « heure de la journée » (matin chaud → soir froid) : c'est un FOND, pas
//    un badge — le code couleur des RÔLES (chatter bleu, encadrement vert, police orange,
//    modèle violet) reste réservé aux pastilles ;
//  • la hiérarchie passe par la STRUCTURE, plus par la répétition : une bande par manager, le
//    sous-manager écrit une seule fois sur ses modèles.
export const SHIFTS: Record<CrmShift, { label: string; wash: string }> = {
  matin: { label: 'Matin', wash: 'bg-amber-50/70 dark:bg-amber-950/20' },
  aprem: { label: 'Après-midi', wash: 'bg-muted/40' },
  soir: { label: 'Soir', wash: 'bg-indigo-50/70 dark:bg-indigo-950/25' },
}

/** Nombre de colonnes du tableau — sert le `colSpan` de la ligne « Ajouter ». */
export const COLS = 8

/** Option « pas de sous-manager » : le modèle est porté directement par le manager. */
export const DIRECT = { id: 'direct', name: 'porté par le manager' }

export const CHIP_GREEN = 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
export const CHIP_VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
export const CHIP_BLUE = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'

/**
 * Pastille cliquable (admin) qui ouvre une recherche à choix unique. Au repos : AUCUN cadre,
 * c'est une étiquette. Le fond et le crayon n'apparaissent qu'au survol — l'écran se lit
 * comme un tableau, pas comme un formulaire.
 */
export function ChipSelect({
  value,
  label,
  options,
  onSelect,
  chipClass,
  editable,
  disabled,
  placeholder = 'Rechercher…',
  title,
  defaultOpen = false,
}: {
  value: string | null
  label: string | null
  options: { id: string; name: string }[]
  onSelect: (id: string) => void
  chipClass: string
  editable: boolean
  disabled?: boolean
  placeholder?: string
  title?: string
  /** Ouvre la recherche dès l'affichage (ligne d'ajout : on choisit tout de suite). */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const chip = label ? (
    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', chipClass)}>{label}</span>
  ) : (
    <span className="text-xs text-muted-foreground/60">choisir…</span>
  )
  if (!editable) return chip
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={title ?? 'Cliquer pour changer'}
          className={cn(
            'group/chip -mx-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors',
            'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          )}
        >
          {chip}
          <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/chip:opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} autoFocus />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.name}
                  onSelect={() => {
                    setOpen(false)
                    if (o.id !== value) onSelect(o.id)
                  }}
                >
                  <Check className={cn('size-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Cellule de shift : pastilles BLEUES des chatters sur le lavis de la colonne ; le cadre
 * pointillé « + Ajouter » ne s'affiche que sur une case vide (comme le planning repos).
 *
 * ⚠️ DÉFINIE AU NIVEAU MODULE, et ça n'est pas cosmétique. Tant qu'elle vivait à l'intérieur
 * d'`OrgTable`, chaque rendu du parent en recréait la référence : React y voyait un type de
 * composant différent, démontait le sous-arbre et remontait le Popover — donc l'état `open`
 * était perdu et la liste se refermait après CHAQUE sélection (impossible d'ajouter trois
 * chatters d'affilée, retour Benoit 2026-07-30). Le planning repos ne connaît pas ce défaut :
 * ses cellules vivent dans `planning-grid-rows.tsx`, au niveau module.
 */
export function ShiftCell({
  shift,
  ids,
  nameById,
  newById,
  options,
  canWrite,
  modelName,
  onChange,
}: {
  shift: CrmShift
  ids: string[]
  nameById: Map<string, string>
  /** Drapeau « nouvel arrivant » par id (0101) — même provenance que `nameById` : les options. */
  newById: Map<string, { isNew: boolean; arrivedAt: string | null }>
  options: { id: string; name: string }[]
  canWrite: boolean
  modelName: string
  onChange: (next: string[]) => void
}) {
  const chips = ids.map((id) => (
    <span
      key={id}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        CHIP_BLUE,
      )}
    >
      {nameById.get(id) ?? '?'}
      <NewBadge
        isNew={newById.get(id)?.isNew ?? false}
        arrivedAt={newById.get(id)?.arrivedAt ?? null}
        variant="icon"
      />
    </span>
  ))
  if (!canWrite)
    return (
      <td className={cn('px-3 py-2 align-top', SHIFTS[shift].wash)}>
        {chips.length ? (
          <div className="flex flex-wrap gap-1">{chips}</div>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
    )
  return (
    <td className={cn('p-1 align-top', SHIFTS[shift].wash)}>
      <ComboboxMultiple
        trigger={
          <button
            type="button"
            title="Cliquer pour composer ce shift"
            className={cn(
              'group/cell flex min-h-9 w-full items-start gap-1 rounded-md border px-2 py-1.5 text-left transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              // Case VIDE = cadre pointillé « + Ajouter » (même affordance que le planning
              // repos) ; case remplie = pas de cadre, la couleur de colonne suffit.
              chips.length
                ? 'border-transparent hover:bg-foreground/[0.04]'
                : 'border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-foreground/[0.04]',
            )}
          >
            {chips.length ? (
              <>
                <span className="flex flex-wrap gap-1">{chips}</span>
                <Plus className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-60" />
              </>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <Plus className="size-3" />
                Ajouter
              </span>
            )}
          </button>
        }
        options={options.map((o) => ({ value: o.id, label: o.name }))}
        value={ids}
        labelById={Object.fromEntries(nameById)}
        onChange={onChange}
        chipClassName={CHIP_BLUE}
        placeholder="Rechercher un chatter…"
        // Avertissement AVANT le choix : cette case n'est pas un simple planning, elle écrit
        // deux données qui vivent ailleurs (la fiche Membre du chatteur).
        note={
          <>
            Ajouter quelqu’un ici pose son{' '}
            <strong className="font-medium">shift {SHIFTS[shift].label.toLowerCase()}</strong> et
            l’assigne au modèle <strong className="font-medium">{modelName}</strong> — les deux
            changent sur sa fiche Membre.
          </>
        }
      />
    </td>
  )
}
