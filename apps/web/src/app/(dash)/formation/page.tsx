// /formation (basePath seul) : jamais lié depuis la nav (workspaceHome = 1ʳᵉ entrée = Overview),
// mais l'URL doit exister — même filet que /marketing/page.tsx.
export default function FormationHome() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Formation</h1>
        <p className="text-sm text-muted-foreground">Entraînement</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Face Formation — contenu à définir.
      </div>
    </div>
  )
}
