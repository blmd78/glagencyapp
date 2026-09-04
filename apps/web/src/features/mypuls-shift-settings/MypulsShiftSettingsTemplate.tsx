import Link from 'next/link'
import { SettingsForm, SettingsReadOnly } from './components/settings-form'
import { SlotWindows } from './components/slot-windows'
import { RunJournal } from './components/run-journal'
import { OrphanBin } from './components/orphan-bin'
import type { ShiftSettingsPage } from './types'

/**
 * Créneaux & réglages — Server Component qui ne fetch RIEN : `page.tsx` lui passe la donnée.
 *
 * Écran de MAINTENANCE, volontairement hors sidebar : on y arrive par le lien « Réglages » en
 * haut à droite du relevé. On l'ouvre quand on se demande d'où sort un chiffre, et l'ordre des
 * blocs suit cette question.
 *
 * D'ABORD le journal, parce que c'est la réponse dans la grande majorité des cas : la nuit
 * manque, ou le réglage a bougé. Ensuite les réglages eux-mêmes. Enfin les gens que le relevé
 * ne peut pas compter, qui ne sont pas un réglage mais du travail à faire — d'où le titre
 * « À rattacher » et non « Orphelins ».
 *
 * Les fenêtres de créneau sont REPLIÉES : trois lignes qui ne bougent jamais, utiles le seul
 * jour où quelqu'un déplace une fenêtre chez MyPuls. Dépliées, elles occupaient le tiers de
 * l'écran pour ne rien apprendre.
 */
export function MypulsShiftSettingsTemplate({ data }: { data: ShiftSettingsPage }) {
  const aRattacher = data.orphans.length + data.noAccount.length + data.noShift.length

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        D’où sortent les chiffres du{' '}
        <Link href="/chatter/presence" className="underline underline-offset-4">
          Relevé d’équipe
        </Link>{' '}
        : quand la lecture MyPuls a tourné, avec quels seuils, et qui elle ne sait pas encore
        nommer.
      </p>

      <Section
        title="Journal des relevés"
        subtitle="La première chose à regarder quand un chiffre surprend : la nuit a-t-elle été lue ?"
      >
        <RunJournal runs={data.runs} missingDays={data.missingDays} />
      </Section>

      <Section
        title="Réglages de mesure"
        subtitle="Ce que MyPuls compte, et à partir de quand un poste est tenu."
      >
        {data.canEdit ? (
          <SettingsForm settings={data.settings} />
        ) : (
          <>
            <SettingsReadOnly settings={data.settings} />
            <p className="mt-3 text-xs text-muted-foreground">
              Modification réservée aux administrateurs : ces valeurs décident du temps mesuré
              pour toute l’agence.
            </p>
          </>
        )}
      </Section>

      <Section
        title={`À rattacher${aRattacher > 0 ? ` (${aRattacher})` : ''}`}
        subtitle="Du travail à faire, pas un réglage : ce qui manque au relevé pour compter tout le monde."
      >
        <OrphanBin
          orphans={data.orphans}
          noAccount={data.noAccount}
          noShift={data.noShift}
          from={data.from}
          to={data.to}
        />
      </Section>

      {/* Replié : trois lignes statiques. `<details>` natif — l'ouverture ne coûte pas un octet
          de JavaScript et la page reste un Server Component de bout en bout. */}
      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Fenêtres de créneau appliquées
          <span className="ml-2 font-normal text-muted-foreground">
            {data.windows.length} relevée{data.windows.length > 1 ? 's' : ''} sur la période
          </span>
        </summary>
        <div className="border-t p-4">
          <SlotWindows windows={data.windows} />
        </div>
      </details>
    </div>
  )
}

/** Une carte de section — la grammaire du relevé, sans filet décoratif. */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}
