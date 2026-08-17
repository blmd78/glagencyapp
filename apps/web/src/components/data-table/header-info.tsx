'use client'

import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Icône ⓘ + infobulle : définition d'une métrique en en-tête de colonne (gris discret, défaut), ou
 * mode d'emploi qu'on veut faire remarquer (`emphasis` : bleu — légende du board Organisation).
 */
export function HeaderInfo({
  text,
  emphasis = false,
  side = 'top',
  label = 'En savoir plus',
}: {
  text: string
  emphasis?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  label?: string
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              emphasis
                ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
                : 'text-muted-foreground/60 hover:text-foreground',
            )}
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[16rem] text-xs font-normal leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
