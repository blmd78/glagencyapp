import { Button } from '@/components/ui/button'
import type { SubmitResult } from '../types'

/**
 * Écran final — copie reprise de `render.result` (GLA), à la sobriété du CRM près (pas d'encadré
 * rouge : un bloc neutre suffit à nommer l'épreuve).
 *
 * Dans les DEUX issues, aucun chiffre : ni score, ni seuil, ni note par axe. Un refus nomme
 * l'épreuve et donne la raison qualitative écrite par `computeVerdict`.
 */
export function StepDone({ result }: { result: SubmitResult }) {
  if (result.passed) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-3xl" aria-hidden>
          🎉
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Bienvenue ! Ta candidature est validée</h1>
        <p className="text-sm text-muted-foreground">
          Tu as réussi les tests haut la main et tu as tout ce qu’il faut pour cartonner chez nous. Bienvenue dans
          l’équipe.
        </p>
        {result.discordLink ? (
          <>
            <Button asChild className="w-full">
              <a href={result.discordLink} target="_blank" rel="noopener noreferrer">
                Rejoindre le Discord de formation
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">Connecte-toi vite : un formateur va te contacter.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">On revient vers toi par e-mail très vite.</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="text-3xl" aria-hidden>
        🙏
      </span>
      <h1 className="text-xl font-semibold tracking-tight">Merci d’avoir tenté ta chance</h1>
      <p className="text-sm text-muted-foreground">
        Cette fois, ton profil n’a pas été retenu. Voici l’étape qui n’a pas atteint notre niveau :
      </p>
      <div className="w-full rounded-md border p-4 text-left">
        <p className="text-sm font-medium">{result.refusalStep ?? 'Le test dans son ensemble'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.refusalReason ?? 'le profil ne correspond pas à ce qu’on cherche en ce moment'}.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Ce n’est rien de personnel — on te souhaite une excellente continuation dans tes projets.
      </p>
    </div>
  )
}
