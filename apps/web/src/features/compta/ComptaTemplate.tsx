// Template de la feature « compta » — reçoit les données en props et appelle les composants.
// Convention archi-web : AUCUN fetch ici (la récup se fait dans app/(dash)/compta/page.tsx).

export interface ComptaTemplateProps {
  data?: unknown // TODO: typer (cf. ./types)
}

export function ComptaTemplate({ data: _data }: ComptaTemplateProps = {}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Compta</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « compta »</p>
    </section>
  )
}
