'use client'

import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'

/**
 * Bouton d'action serveur : affiche un spinner et se désactive pendant l'opération.
 * Passer `pending` (depuis un `useTransition` ou un état de chargement).
 */
export function ActionButton({
  pending,
  disabled,
  children,
  ...props
}: ButtonProps & { pending?: boolean }) {
  return (
    <Button disabled={disabled || pending} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  )
}
