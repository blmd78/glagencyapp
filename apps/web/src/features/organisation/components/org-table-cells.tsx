'use client'

import { useState } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { NewBadge } from '@/components/new-badge'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { HeaderInfo } from '@/components/data-table/header-info'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { SHIFT_LABEL, type CrmShift } from '@/lib/types/chatters'

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
//  • pastilles des chatters dans les cases : BLEUES (code couleur des rôles) pour un shift
//    principal, ROUGES pour une heure sup (0110) ;
//  • lavis de colonne « heure de la journée » (matin chaud → soir froid) : c'est un FOND, pas
//    un badge — le code couleur des RÔLES (chatter bleu, encadrement vert, police orange,
//    modèle violet) reste réservé aux pastilles ;
//  • la hiérarchie passe par la STRUCTURE, plus par la répétition : une bande par manager, le
//    sous-manager écrit une seule fois sur ses modèles.
export const SHIFTS: Record<CrmShift, { label: string; wash: string }> = {
  matin: { label: SHIFT_LABEL.matin, wash: 'bg-amber-50/70 dark:bg-amber-950/20' },
  aprem: { label: SHIFT_LABEL.aprem, wash: 'bg-muted/40' },
  soir: { label: SHIFT_LABEL.soir, wash: 'bg-indigo-50/70 dark:bg-indigo-950/25' },
}

/** Nombre de colonnes du tableau — sert le `colSpan` de la ligne « Ajouter ». */
export const COLS = 8

/** Option « pas de sous-manager » : le modèle est porté directement par le manager. */
export const DIRECT = { id: 'direct', name: 'porté par le manager' }

export const CHIP_GREEN = 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
export const CHIP_VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
export const CHIP_BLUE = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
/** Placement marqué HEURE SUP (0110) — décision Benoit 2026-08-17 : ROUGE = heure sup, BLEU (le bleu
 *  chatter habituel) = shift principal. Légende au-dessus du tableau (`OrgLegend`). */
export const CHIP_RED = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'

/** Bleu = placement principal, rouge = heure sup (`hs_shifts`). Vaut pour la case et son popover ;
 *  le « comment basculer » est dans la légende (ⓘ), pas répété sur chaque pastille. */
const chipTone = (hs: boolean) => (hs ? CHIP_RED : CHIP_BLUE)
const chipTitle = (hs: boolean) => (hs ? 'Heure sup' : 'Shift principal')

/** Légende du code couleur — même forme que celle du planning repos (`planning-grid.tsx`), mais
 *  AU-DESSUS du tableau (demande Benoit 2026-08-17). */
export function OrgLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={cn('rounded px-1.5 py-0.5 font-medium', CHIP_BLUE)}>bleu</span>
        shift principal
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cn('rounded px-1.5 py-0.5 font-medium', CHIP_RED)}>rouge</span>
        heure sup
      </span>
      {/* Le « comment » n'est pas une info de tous les jours : le ⓘ de l'app (HeaderInfo), en bleu
          pour qu'il se remarque. */}
      <HeaderInfo
        emphasis
        side="right"
        label="Comment basculer entre shift principal et heure sup"
        text="Ouvre une case, puis clique sur le nom d’une pastille pour la faire passer de shift principal à heure sup (et inversement)."
      />
    </div>
  )
}

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
 * Cellule de shift : pastilles des chatters sur le lavis de la colonne — BLEU = placement principal,
 * ROUGE = heure sup (0110, marque éditable : case ouverte → clic sur le nom = bascule) ; le cadre
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
  hsOf,
  onToggleKind,
  chipFilter,
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
  /** Ce placement est-il marqué heure sup ? (serveur, override optimiste, ou défaut) — 0110. */
  hsOf: (id: string) => boolean
  /** Bascule principal ⇄ heure sup de ce placement (0110). */
  onToggleKind: (id: string) => void
  /** Recherche active : seules les pastilles qui passent le filtre sont RENDUES dans la case ; la
   *  composition réelle (`ids`) reste entière — ouvrir la case montre tout le monde. */
  chipFilter?: (id: string) => boolean
  options: { id: string; name: string }[]
  canWrite: boolean
  modelName: string
  onChange: (next: string[]) => void
}) {
  const chips = (chipFilter ? ids.filter(chipFilter) : ids).map((id) => (
    <span
      key={id}
      title={chipTitle(hsOf(id))}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        chipTone(hsOf(id)),
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
        chipClassName={(id) => chipTone(hsOf(id))}
        chipTitle={(id) => chipTitle(hsOf(id))}
        onChipClick={onToggleKind}
        placeholder="Rechercher un chatter…"
        // Avertissement AVANT le choix : cette case n'est pas un simple planning, elle écrit
        // une donnée qui vit ailleurs (l'assignation, visible sur la fiche Membre du chatteur).
        note={
          <>
            Ajouter quelqu’un ici le place sur{' '}
            <strong className="font-medium">{modelName}</strong> en{' '}
            <strong className="font-medium">{SHIFTS[shift].label.toLowerCase()}</strong> (assigné au
            modèle si besoin) — ses autres cases ne bougent pas. Bleu = shift principal, rouge =
            heure sup : <strong className="font-medium">clic sur un nom pour basculer</strong>.
          </>
        }
      />
    </td>
  )
}
