import Link from 'next/link'
import { Podium } from '@/components/training/podium'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MeData, RankScope } from '../types'

const SCOPE_LABEL: Record<RankScope, string> = {
  semaine: 'cette semaine',
  'semaine-derniere': 'semaine dernière',
  global: 'général',
}

type Standing = { profileId: string; displayName: string; points: number }

/**
 * Podium à marches — reprise de `paintHomePodium` de l'app Good Luck Agency : 2e à gauche, 1er au
 * centre sur la marche haute avec sa couronne, 3e à droite. Un tableau à trois lignes dit la même
 * chose ; un podium la fait RESSENTIR, et c'est la comparaison sociale qui fait revenir.
 *
 * Seuls les chatteurs ayant marqué au moins un point y figurent (règle GLA) : une marche à 0 point
 * n'est pas une performance, et le classement hebdo en compterait beaucoup.
 *
 * Extrait de la MÊME liste que l'onglet Classement (`rankingScope`, une seule RPC par requête) :
 * jamais de second chargement pour trois lignes.
 */
export function MePodium({ data, myProfileId }: { data: MeData; myProfileId: string }) {
  const { rankingScope, ranking, weeklyRanking } = data
  const rows: Standing[] = (rankingScope === 'global' ? ranking : (weeklyRanking ?? []))
    .map((r) => ({ profileId: r.profileId, displayName: r.displayName, points: r.points }))
    .filter((r) => r.points > 0)

  // Rang recalculé sur la liste FILTRÉE : `myRank` (serveur) compte aussi les 0 point, il ne
  // correspondrait pas à ce qui est affiché ici.
  const myIndex = rows.findIndex((r) => r.profileId === myProfileId)

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-2 space-y-0 pb-4">
        <CardTitle className="text-base">
          <span aria-hidden className="mr-1.5">🏆</span> Podium
        </CardTitle>
        <span className="text-xs text-muted-foreground">{SCOPE_LABEL[rankingScope]}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-4 text-center text-sm text-muted-foreground">
            <span aria-hidden className="text-3xl opacity-50">🏆</span>
            <p>Personne n’a encore marqué de points.</p>
            <p className="font-semibold text-foreground">Sois le premier 🔥</p>
          </div>
        ) : (
          <>
            <Podium rows={rows} myProfileId={myProfileId} />
            <p className="border-t border-dashed pt-3 text-center text-xs font-medium text-muted-foreground">
              {myIndex < 0 ? (
                'Joue un cas pour marquer tes premiers points'
              ) : myIndex > 2 ? (
                <>
                  Toi : <span className="font-bold text-foreground">#{myIndex + 1}</span> —{' '}
                  {rows[myIndex]?.points.toLocaleString('fr-FR')} pts
                </>
              ) : (
                'Tu es sur le podium 🔥'
              )}
            </p>
          </>
        )}

        <Link href="/formation/ma-formation?vue=classement" className="text-center text-sm font-medium hover:underline">
          Voir le classement complet →
        </Link>
      </CardContent>
    </Card>
  )
}
