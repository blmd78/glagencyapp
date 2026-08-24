import { matchMomentIndex } from '@glagency/core'
import { MessageBubble } from '@/components/training/message-bubble'
import { cn } from '@/lib/utils'
import type { SessionThread } from '../types'

/**
 * « Reprise de ta conversation » — la conv rejouée avec les remarques du correcteur COLLÉES aux
 * messages qui les ont provoquées, reprise de l'écran de résultat de l'app Good Luck Agency
 * (`render.trainResult`, bloc `timeline`).
 *
 * C'est le cœur pédagogique de l'écran : la même remarque listée dans un encadré à part ne dit pas
 * QUEL message a coûté les points. Ici, le message fautif est cerclé de rouge avec « ça coûte des
 * points » juste dessous, le bon geste en vert.
 *
 * L'appariement (`matchMomentIndex`, domaine pur et testé) est nécessairement approximatif : le
 * correcteur cite le message sans toujours le recopier au caractère près. Les moments qui ne
 * retrouvent pas leur message sont listés SOUS la conversation — perdre une remarque du correcteur
 * parce qu'une citation était imprécise serait le pire des deux mondes.
 */
export function AnnotatedTranscript({ thread }: { thread: SessionThread }) {
  const moments = thread.score?.moments ?? []
  const cites = moments.map((m) => m.cite)
  const matched = new Set(
    thread.messages.flatMap((m) => {
      if (m.speaker === 'fan') return []
      const i = matchMomentIndex(m.body, cites)
      return i == null ? [] : [i]
    }),
  )
  const orphans = moments.filter((_, i) => !matched.has(i))

  return (
    <section className="gla-cardbox flex flex-col gap-1 p-5">
      <h3 className="text-[15px] font-bold">Reprise de ta conversation</h3>
      <p className="mb-3 text-xs text-[var(--gla-muted)]">
        Ta conv rejouée — <span className="font-semibold text-green-600">vert = bien joué</span>,{' '}
        <span className="font-semibold text-red-600">rouge = points perdus</span>
      </p>

      {thread.messages.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">La conversation n’a pas commencé.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {thread.messages.map((m) => {
            // Le fan n'est jamais noté : seuls les messages du chatter portent une annotation.
            const index = m.speaker === 'fan' ? null : matchMomentIndex(m.body, cites)
            const moment = index == null ? null : moments[index]
            const good = moment?.type === 'good'
            return (
              <li key={m.id} className={cn('flex flex-col gap-1', m.speaker === 'fan' ? 'items-start' : 'items-end')}>
                <span
                  className={cn(
                    'rounded-lg',
                    moment && (good ? 'ring-2 ring-green-600/60' : 'ring-2 ring-red-600/60'),
                  )}
                >
                  <MessageBubble message={m} />
                </span>
                {moment && (
                  <div
                    className={cn(
                      'max-w-[46ch] rounded-lg border p-2.5 text-xs',
                      good ? 'border-green-600/40 bg-green-50 dark:bg-green-950' : 'border-red-600/40 bg-red-50 dark:bg-red-950',
                    )}
                  >
                    <p className={cn('font-semibold', good ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')}>
                      {good ? '✅ Bien joué' : '⚠️ Ça coûte des points'}
                    </p>
                    {moment.probleme && <p className="mt-1">{moment.probleme}</p>}
                    {moment.indice && <p className="mt-1 text-muted-foreground">💡 {moment.indice}</p>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {orphans.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-[var(--gla-border)] pt-3">
          {orphans.map((m, i) => (
            <li
              key={i}
              className={cn(
                'rounded-lg border p-2.5 text-xs',
                m.type === 'good'
                  ? 'border-green-600/40 bg-green-50 dark:bg-green-950'
                  : 'border-red-600/40 bg-red-50 dark:bg-red-950',
              )}
            >
              <p className={cn('font-semibold', m.type === 'good' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')}>
                {m.type === 'good' ? '✅ Bien joué' : '⚠️ Ça coûte des points'} — « {m.cite} »
              </p>
              {m.probleme && <p className="mt-1">{m.probleme}</p>}
              {m.indice && <p className="mt-1 text-muted-foreground">💡 {m.indice}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
