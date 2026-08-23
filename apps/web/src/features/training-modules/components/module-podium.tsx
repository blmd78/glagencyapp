import { Podium } from '@/components/training/podium'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ModuleRankRow } from '../services/get-module-ranking'

/**
 * Le top 3 DE CE MODULE, visible dès l'ouverture — sans changer d'onglet. Un classement général
 * ne dit pas grand-chose à quelqu'un qui vient travailler la négociation ; savoir qui domine LE
 * module qu'on ouvre, si.
 *
 * Les 0 point sont déjà écartés côté SQL : une marche à zéro n'est pas une performance.
 */
export function ModulePodium({ rows, myProfileId }: { rows: ModuleRankRow[]; myProfileId: string }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1 p-5 text-center text-sm text-muted-foreground">
          <span aria-hidden className="text-3xl opacity-50">🏆</span>
          <p>Personne n’a encore marqué de points sur ce module.</p>
          <p className="font-semibold text-foreground">Sois le premier 🔥</p>
        </CardContent>
      </Card>
    )
  }
  const myIndex = rows.findIndex((r) => r.profileId === myProfileId)
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">
          <span aria-hidden className="mr-1.5">🏆</span> Top 3 du module
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Podium rows={rows} myProfileId={myProfileId} />
        <p className="border-t border-dashed pt-3 text-center text-xs font-medium text-muted-foreground">
          {myIndex < 0 ? (
            'Joue un cas de ce module pour entrer au classement'
          ) : myIndex > 2 ? (
            <>
              Toi : <span className="font-bold text-foreground">#{myIndex + 1}</span> —{' '}
              {rows[myIndex]?.points.toLocaleString('fr-FR')} pts
            </>
          ) : (
            'Tu es sur le podium 🔥'
          )}
        </p>
      </CardContent>
    </Card>
  )
}
