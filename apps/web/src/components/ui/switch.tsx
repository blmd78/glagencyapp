'use client'

import { cn } from '@/lib/utils'

/**
 * Interrupteur NATIF (`button[role=switch]`) — pas de dépendance Radix (le repo n'embarque pas
 * `@radix-ui/react-switch`, et un switch n'a pas d'état intermédiaire qui la justifierait).
 * API alignée sur le Checkbox shadcn (`checked` / `onCheckedChange`) pour brancher un Controller
 * RHF à l'identique.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input dark:bg-input/80',
        className,
      )}
    >
      <span
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
