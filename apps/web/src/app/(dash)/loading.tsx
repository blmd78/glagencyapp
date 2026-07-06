import { LoadingDots } from '@/components/loading-dots'

// Fallback de navigation pour tout le dash : la sidebar reste, le contenu affiche
// l'indicateur le temps du rendu serveur de la page cible.
export default function DashLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <LoadingDots />
    </div>
  )
}
