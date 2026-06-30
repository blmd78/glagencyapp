// Template de la feature « insights » — reçoit les données en props et appelle les composants.
// Convention archi-web : AUCUN fetch ici (la récup se fait dans app/(dash)/insights/page.tsx).

export interface InsightsTemplateProps {
  data?: unknown // TODO: typer (cf. ./types)
}

export function InsightsTemplate({ data: _data }: InsightsTemplateProps = {}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Insights</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « insights »</p>
    </section>
  )
}
