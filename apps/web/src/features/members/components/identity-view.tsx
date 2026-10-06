import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { frDateNumeric } from '@glagency/core'
import { eur } from '@/lib/format'
import { ReliabilityCard } from './reliability-card'
import { UnrankedTable } from './unranked-table.client'
import { IdentityIssuesTable } from './identity-issues-table.client'
import type { IdentityData, IdentityIssueRow } from '../types'

/**
 * Onglet « Fiches MyPuls » (admin) — Server Component, sans état : tout vient de
 * `get-fiches-mypuls.ts`. Spec docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 7.
 * Ordre : fiabilité du dernier relevé, CA sans membre (le problème qui a lancé le dossier : Lionel
 * absent du classement), les trois listes d'anomalies, puis la note INFORMATIVE des ventes sans
 * chatteur (aucun « Relier » : une pseudo-fiche porte tout un modèle).
 */
export function IdentityView({ data, period }: { data: IdentityData; period: { from: string; to: string } }) {
  const du = `du ${frDateNumeric(period.from)} au ${frDateNumeric(period.to)}`
  return (
    <div className="flex flex-col gap-6">
      <ReliabilityCard reliability={data.reliability} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fiches avec du CA sans membre — absentes du classement Stat chatter</CardTitle>
          <CardDescription>
            CA {du} sur des fiches MyPuls qu&apos;aucun membre au rôle chatteur ne porte : le classement ne les voit pas. À
            relier au bon membre, ou à fusionner si c&apos;est un doublon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.unranked.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune fiche avec du CA sans membre sur la période.</p>
          ) : (
            <UnrankedTable rows={data.unranked} />
          )}
        </CardContent>
      </Card>
      <IssuesCard
        title="Fiches MyPuls en double"
        description="Un même compte MyPuls coupé en plusieurs fiches : ses chiffres se partagent entre elles, et la paie du membre relié n'en voit qu'une. Se règle par une fusion validée."
        empty="Aucun doublon détecté."
        rows={data.doubles}
        variant="doubles"
      />
      <IssuesCard
        title="Nouvelles fiches à vérifier"
        description="Fiches créées par l'ingestion pour un compte ou un libellé inconnu."
        empty="Aucune nouvelle fiche."
        rows={data.nouvelles}
        variant="nouvelles"
      />
      <IssuesCard
        title="Montants non attribués"
        description="CA du résumé qu'aucun compte ne départage, ou écart entre le résumé et les ventes d'un même compte."
        empty="Aucun montant en attente."
        rows={data.montants}
        variant="montants"
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventes sans chatteur</CardTitle>
          <CardDescription>
            {eur(data.ventesSansChatteur.total)} {du}, que MyPuls n&apos;attribue à aucun chatteur. À attribuer dans MyPuls
            (« Éditer l&apos;attribution ») : elles ne se rattachent pas à un membre. Une correction faite dans MyPuls après coup
            ne remonte pas dans le CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.ventesSansChatteur.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune vente sans chatteur sur la période.</p>
          ) : (
            <ul className="flex flex-col">
              {data.ventesSansChatteur.rows.map((r) => (
                <li
                  key={`${r.creatorName}|${r.label}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-2 last:border-0"
                >
                  <span className="font-medium">{r.creatorName}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{eur(r.ca)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function IssuesCard({
  title,
  description,
  empty,
  rows,
  variant,
}: {
  title: string
  description: string
  empty: string
  rows: IdentityIssueRow[]
  variant: 'doubles' | 'nouvelles' | 'montants'
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <IdentityIssuesTable rows={rows} variant={variant} />}
      </CardContent>
    </Card>
  )
}
