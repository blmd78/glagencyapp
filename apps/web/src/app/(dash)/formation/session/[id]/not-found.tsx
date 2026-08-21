import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Session inconnue, ou hors RLS (celle d'un autre chatter) : 404 dans le chrome du dash, en français. */
export default function SessionNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Session introuvable</h1>
        <p className="text-sm text-muted-foreground">Cette session n’existe pas ou ne t’est pas accessible.</p>
      </div>
      <Button asChild variant="outline" className="w-fit">
        <Link href="/formation/modules">Retour aux modules</Link>
      </Button>
    </div>
  )
}
