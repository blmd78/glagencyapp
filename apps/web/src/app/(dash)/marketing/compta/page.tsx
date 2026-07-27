import { requireAccess } from '@/lib/auth'

// TODO — compta marketing : la vraie page (paie du staff) part avec le wagon compta
// chatteurs. Placeholder local (depuis la Task 6, `ComptaTemplate` de `features/compta` est
// la vraie page /chatter/compta, entièrement typée — elle ne peut plus servir de bouche-trou
// ici).
export default async function MktComptaPage() {
  await requireAccess('mkt-compta')
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Compta</h1>
      <p className="text-sm text-muted-foreground">TODO — feature « compta » (marketing)</p>
    </section>
  )
}
