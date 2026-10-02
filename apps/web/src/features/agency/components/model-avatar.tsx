import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

/**
 * L'avatar rond de la modèle d'un événement (2026-10-02). La photo MyPuls ne fait que 100 × 100 :
 * elle reste petite, jamais à la place de la grande photo importée. Sans photo (une modèle que
 * MyPuls n'illustre pas), l'initiale ; sans modèle, rien.
 */
export function ModelAvatar({
  name,
  url,
  className,
}: {
  name: string | null
  url: string | null
  className?: string
}) {
  if (!name) return null
  return (
    <Avatar className={cn('size-6 shrink-0', className)} title={name}>
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback className="text-[10px] font-medium">{name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}
