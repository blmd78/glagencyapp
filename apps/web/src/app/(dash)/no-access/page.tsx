import { ShieldAlert } from 'lucide-react'
import { requireUser } from '@/lib/auth'

/** Atterrissage d'un compte authentifié sans aucune page assignée (évite la boucle login↔overview). */
export default async function NoAccessPage() {
  await requireUser()
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Aucune page ne t&apos;est assignée</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ton compte est actif mais aucun accès n&apos;a encore été configuré. Demande à un
        administrateur de t&apos;assigner des pages et des modèles.
      </p>
    </div>
  )
}
