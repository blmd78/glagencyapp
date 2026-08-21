import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Module inconnu ou désactivé (getModule → null → notFound()) : 404 dans le chrome du dash, en français. */
export default function ModuleNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Module introuvable</h1>
        <p className="text-sm text-muted-foreground">Ce module n’existe plus ou n’est plus disponible.</p>
      </div>
      <Button asChild variant="outline" className="w-fit">
        <Link href="/formation/modules">Retour aux modules</Link>
      </Button>
    </div>
  )
}
