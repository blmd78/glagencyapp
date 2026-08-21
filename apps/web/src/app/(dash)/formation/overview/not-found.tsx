import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * `?chatter=` valide mais hors roster (parti, droit Entraînement retiré, id d'un autre profil) :
 * 404 dans le chrome du dash, en français — même patron que les 404 de Modules et Session (sans ce
 * fichier, `notFound()` retomberait sur la page 404 par défaut de Next, hors chrome et en anglais).
 */
export default function OverviewNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chatter introuvable</h1>
        <p className="text-sm text-muted-foreground">Cette personne n’est pas (ou plus) en formation.</p>
      </div>
      <Button asChild variant="outline" className="w-fit">
        <Link href="/formation/overview">Retour au roster</Link>
      </Button>
    </div>
  )
}
