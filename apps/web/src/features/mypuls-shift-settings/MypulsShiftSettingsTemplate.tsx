import { SettingsForm, SettingsReadOnly } from './components/settings-form'
import { SlotWindows } from './components/slot-windows'
import { RunJournal } from './components/run-journal'
import { OrphanBin } from './components/orphan-bin'
import type { ShiftSettingsPage } from './types'

/**
 * Créneaux & réglages — Server Component qui ne fetch RIEN : `page.tsx` lui passe la donnée.
 *
 * L'ordre des blocs suit la question qu'on se pose en arrivant : « pourquoi ce chiffre ? ».
 * D'abord les réglages qui l'ont produit, puis les fenêtres qui ont servi de dénominateur,
 * puis le journal qui dit si la nuit a été lue, et enfin les gens que le relevé ne peut pas
 * compter.
 */
export function MypulsShiftSettingsTemplate({ data }: { data: ShiftSettingsPage }) {
  return (
    <div className="flex flex-col gap-6">
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
        title="Fenêtres de créneau"
        subtitle="Les bornes qui ont réellement servi, relevées jour par jour."
      >
        <SlotWindows windows={data.windows} />
      </Section>

      <Section
        title="Journal des relevés"
        subtitle="Quand la lecture MyPuls a tourné, ce qu’elle a écrit, et avec quels réglages."
      >
        <RunJournal runs={data.runs} missingDays={data.missingDays} />
      </Section>

      <Section
        title="À rattacher"
        subtitle="Ce qui manque au relevé pour compter tout le monde, rangé par geste de réparation."
      >
        <OrphanBin
          orphans={data.orphans}
          noAccount={data.noAccount}
          noShift={data.noShift}
          from={data.from}
          to={data.to}
        />
      </Section>
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
