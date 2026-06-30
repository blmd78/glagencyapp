// Template de la feature « members » — reçoit les données en props et appelle les composants.
// Convention archi-web : AUCUN fetch ici (la récup se fait dans app/(dash)/members/page.tsx).

export interface MembersTemplateProps {
  data?: unknown // TODO: typer (cf. ./types)
}

export function MembersTemplate({ data: _data }: MembersTemplateProps = {}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Members</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « members »</p>
    </section>
  )
}
