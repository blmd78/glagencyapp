// Template de la feature « chatters » — reçoit les données en props et appelle les composants.
// Convention archi-web : AUCUN fetch ici (la récup se fait dans app/(dash)/chatters/page.tsx).

export interface ChattersTemplateProps {
  data?: unknown // TODO: typer (cf. ./types)
}

export function ChattersTemplate({ data: _data }: ChattersTemplateProps = {}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Chatters</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « chatters »</p>
    </section>
  )
}
