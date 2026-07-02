import { cn } from '@/lib/utils'
import { modelBarColor } from '@/lib/model-color'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface RankItem {
  name: string
  /** Valeur qui pilote la largeur de la barre. */
  value: number
  /** Texte déjà formaté affiché à droite, ex. « 94 782 € · 36,6 % ». */
  sub: string
  isPrivate?: boolean
}

/** Classement modèles en barres colorées (couleur déterministe par modèle). */
export function ModelRanking({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: RankItem[]
}) {
  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <span className={cn('size-2.5 shrink-0 rounded-full', modelBarColor(item.name))} />
                <span className="truncate">{item.name}</span>
                {item.isPrivate && (
                  <Badge variant="outline" className="shrink-0 px-1 text-[10px] font-normal">
                    privé
                  </Badge>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{item.sub}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', modelBarColor(item.name))}
                style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
