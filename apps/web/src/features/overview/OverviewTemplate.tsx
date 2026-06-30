// Template de la feature « overview » — reçoit les données en props et appelle les composants.
// Convention archi-web : AUCUN fetch ici (la récup se fait dans app/(dash)/overview/page.tsx).

export interface OverviewTemplateProps {
  data?: unknown // TODO: typer (cf. ./types)
}

export function OverviewTemplate({ data: _data }: OverviewTemplateProps = {}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Overview</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « overview »</p>
    </section>
  )
}
