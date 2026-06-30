// Template de la feature « teams » — reçoit les données en props et appelle les composants.
// Convention archi-web : AUCUN fetch ici (la récup se fait dans app/(dash)/teams/page.tsx).

export interface TeamsTemplateProps {
  data?: unknown // TODO: typer (cf. ./types)
}

export function TeamsTemplate({ data: _data }: TeamsTemplateProps = {}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Teams</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « teams »</p>
    </section>
  )
}
