// Template de la feature « health » — reçoit les données en props et appelle les composants.
// Convention archi-web : AUCUN fetch ici (la récup se fait dans app/(dash)/health/page.tsx).

export interface HealthTemplateProps {
  data?: unknown // TODO: typer (cf. ./types)
}

export function HealthTemplate({ data: _data }: HealthTemplateProps = {}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Health</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « health »</p>
    </section>
  )
}
