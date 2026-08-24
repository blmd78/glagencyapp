import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { MeTemplate } from '@/features/training-me/MeTemplate'
import { MeSkeleton } from '@/features/training-me/components/me-skeleton'
import { getMe } from '@/features/training-me/services/get-me'
import { LegacyClaimCard } from '@/features/training-legacy/components/legacy-claim-card'
import { getLegacyClaim } from '@/features/training-legacy/services/get-claim'
import type { MeData, RankScope } from '@/features/training-me/types'

const SCOPES: RankScope[] = ['semaine', 'semaine-derniere', 'global']

/**
 * Budget de durée des Server Actions de cette route : la réclamation d'un ancien compte Good Luck
 * Agency écrit jusqu'à ~9 300 lignes (399 sessions, 6 500 messages, 1,2 Mo) puis recalcule tous les
 * agrégats du profil — le défaut de 15 s ne suffit pas. Au dépassement, l'utilisateur reçoit
 * « Récupération interrompue » et rattrape par « Reprendre », jamais un 500 muet.
 * Patron du projet sous `cacheComponents: true` : `formation/overview/page.tsx:16`.
 */
export const maxDuration = 300

/** Ma formation — progression, historique et classement du chatter (droit Entraînement). */
export default async function MaFormationPage({
  searchParams,
}: {
  searchParams: Promise<{ classement?: string }>
}) {
  const [profile, { classement }] = await Promise.all([requireAccess('frm-entrainement'), searchParams])
  const scope = SCOPES.find((s) => s === classement) ?? 'semaine'
  // Pas de `await` ici : la requête part pendant que le squelette s'affiche (streaming).
  const data = getMe(profile.id, scope)
  return (
    // `.gla` = thème repris de l'app Good Luck Agency (cf. `formation-theme.css`) : les chatteurs
    // formés là-bas doivent retrouver leur écran, pas découvrir un design de CRM.
    <div className="gla gla-page flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-[-0.3px]">Ma formation</h1>
      {/* Encart de reprise GLA — SON PROPRE boundary, et pas celui de `getMe` : c'est une seule
          ligne à lire, elle n'a aucune raison d'attendre les six requêtes de la progression.
          Fallback `null` : rien ne clignote quand il n'y a rien à proposer. */}
      <Suspense fallback={null}>
        <LegacySlot profileId={profile.id} />
      </Suspense>
      {/* Le `<h1>` est déjà rendu ci-dessus (il ne dépend d'aucune donnée) → squelette sans titre. */}
      <Suspense fallback={<MeSkeleton withTitle={false} />}>
        <MeContent data={data} myProfileId={profile.id} />
      </Suspense>
    </div>
  )
}

/**
 * La page récupère la donnée (via le service de la feature) et la passe EN PROPS au composant —
 * aucun fetch dans une feature. L'encart est rendu ici plutôt que dans `MeTemplate` : la frontière
 * ESLint interdit à `features/training-me` d'importer `features/training-legacy`.
 */
async function LegacySlot({ profileId }: { profileId: string }) {
  return <LegacyClaimCard claim={await getLegacyClaim(profileId)} />
}

async function MeContent({ data, myProfileId }: { data: Promise<MeData>; myProfileId: string }) {
  return <MeTemplate data={await data} myProfileId={myProfileId} />
}
