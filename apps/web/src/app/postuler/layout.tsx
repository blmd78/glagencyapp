import type { Metadata } from 'next'

// Layout du test de recrutement PUBLIC. Volontairement minimal : `<html>`/`<body>`, le thème et
// le `<Toaster>` viennent du layout racine — ici on ne pose qu'une colonne centrée et le nom de
// l'agence. Ni sidebar, ni garde d'auth (le candidat n'a pas de compte, cf. `proxy.ts`).
export const metadata: Metadata = {
  title: 'Rejoins l’équipe — GL Agency',
  description: 'Test de recrutement chatter — environ 10 minutes.',
}

export default function PostulerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center gap-8 px-4 py-10 sm:py-16">
      <p className="text-sm font-semibold tracking-tight">GL Agency</p>
      <main className="w-full max-w-xl">{children}</main>
    </div>
  )
}
