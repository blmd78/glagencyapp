import { Suspense } from 'react'
import Link from 'next/link'
import { MarkdownView } from '@/components/markdown-view'
import { Skeleton } from '@/components/ui/skeleton'
import { CasesList } from './components/cases-list'
import { ModulePodium } from './components/module-podium'
import { PersonaCard } from './components/persona-card'
import type { MyBest } from './services/get-my-bests'
import type { ModuleRankRow } from './services/get-module-ranking'
import type { ModuleDetail } from './types'
import type { TrainingPersona } from '@/lib/types/training-public'

/**
 * Un module — structure de l'app Good Luck Agency (`render.formationModule`) : bouton de retour, le
 * classement du module, puis un bloc encadré qui porte le titre, la description et le cours DÉPLIÉ
 * À LA DEMANDE, et enfin la liste des exercices.
 *
 * Aucun onglet, volontairement : GLA met le cours et les cas sur le même écran, le cours replié.
 * Des onglets obligeaient à choisir entre lire et jouer, alors que la lecture est censée précéder
 * l'exercice — replié, le cours reste à portée sans barrer le chemin.
 *
 * Le classement arrive en `Promise` NON attendue : le cours et les cas s'affichent tout de suite,
 * le podium streame dans son propre boundary quand la RPC répond.
 */
export function ModuleTemplate({
  module,
  canPlay,
  bests,
  avgTotal,
  ranking,
  myProfileId,
  competenceId,
  persona,
}: {
  module: ModuleDetail
  canPlay: boolean
  /** Meilleurs résultats du visiteur par cas — vide sans droit Entraînement. */
  bests: Map<string, MyBest>
  avgTotal: number | null
  ranking: Promise<ModuleRankRow[]>
  myProfileId: string
  /** Compétence ouverte (`?competence=`) — `null` = vue du module. */
  competenceId: string | null
  /** Fiche modèle globale — `null` si aucune n'est configurée (le volet disparaît alors). */
  persona: TrainingPersona | null
}) {
  const hasCourse = Boolean(module.courseMd?.trim())

  // Dans une COMPÉTENCE, l'écran ne porte que ses exercices (GLA `formationSousCat` remplace la
  // page entière) : ni podium, ni cours — on est venu travailler une compétence précise.
  if (competenceId) {
    return <CasesList module={module} canPlay={canPlay} bests={bests} avgTotal={avgTotal} competenceId={competenceId} />
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/formation/modules" className="gla-back w-fit">
        ← Mes modules
      </Link>

      <Suspense fallback={<Skeleton className="h-[248px] rounded-[18px]" />}>
        <PodiumSection ranking={ranking} myProfileId={myProfileId} />
      </Suspense>

      <section className="gla-clist">
        <div className="gla-csec cursor-default">
          <p className="flex items-center gap-2 text-[19px] font-bold leading-tight">
            {module.emoji && <span aria-hidden>{module.emoji}</span>}
            {module.title}
          </p>
          {module.description && (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--gla-muted)]">{module.description}</p>
          )}
        </div>
        {/* La fiche AU-DESSUS du cours — l'ordre de GLA, dont le commentaire le dit explicitement :
            « puis la fiche modele, puis le cours (fiche AU-DESSUS du cours) » (index.html:1531). */}
        {persona && <PersonaCard persona={persona} />}
        {hasCourse && (
          <details className="gla-csec">
            <summary>Le cours du module</summary>
            <div className="gla-cours mt-3">
              <MarkdownView source={module.courseMd ?? ''} />
            </div>
          </details>
        )}
      </section>

      <CasesList module={module} canPlay={canPlay} bests={bests} avgTotal={avgTotal} competenceId={null} />
    </div>
  )
}

async function PodiumSection({ ranking, myProfileId }: { ranking: Promise<ModuleRankRow[]>; myProfileId: string }) {
  return <ModulePodium rows={await ranking} myProfileId={myProfileId} />
}
