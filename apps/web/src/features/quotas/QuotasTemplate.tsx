// Template de la feature « quotas » — reçoit les données en props et appelle les composants.
// Convention archi-web : AUCUN fetch ici (la récup se fait dans app/(dash)/quotas/page.tsx).

export interface QuotasTemplateProps {
  data?: unknown // TODO: typer (cf. ./types)
}

export function QuotasTemplate({ data: _data }: QuotasTemplateProps = {}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Quotas</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « quotas »</p>
    </section>
  )
}
