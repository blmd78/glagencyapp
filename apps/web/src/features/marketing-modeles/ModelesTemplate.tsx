import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { UrlTabs } from '@/components/url-tabs'
import { eur, num, pct } from '@/lib/format'
import { MktAgencySplit } from './components/agency-split.client'
import { MktCreatorSection } from './components/creator-section.client'
import { MktSourcesView } from './components/sources-view.client'
import type { MktModelesData, MktModelesVue, SourceNotes } from './types'
import type { MktGroup } from '@/lib/types/marketing'

/**
 * Page Modèles : ce que les liens de tracking apportent à CHAQUE modèle, rapporté à son CA
 * et à ses abonnés. Le pôle marketing sait déjà ce que ses liens gagnent (page Liens,
 * Overview) — ce qu'il ignorait, c'est ce que ça pèse.
 */
export function MktModelesTemplate({
  data,
  groups,
  notes,
  vue,
}: {
  data: MktModelesData
  groups: MktGroup[]
  /** Les notes des sources (0170), pour l'onglet « Sources de trafic ». */
  notes: SourceNotes
  vue: MktModelesVue
}) {
  const t = data.totals
  const base = { deltaPct: null as number | null, trendLabel: '', hint: '' }
  // Pas de badge « vs période précédente » : même raison que le dashboard marketing — avec un
  // historique court et une journée en cours partielle, le % induit en erreur.
  const kpis: Kpi[] = [
    {
      ...base,
      key: 'ca',
      label: 'CA total',
      value: eur(t.caTotal),
      hint: 'toutes sources confondues',
      info: "Somme du CA quotidien de toutes les modèles sur la période (source : MyPuls, table creator_daily). Les comptes privés sont comptés avec leur modèle principale.",
    },
    {
      ...base,
      key: 'ca-liens',
      label: 'CA via liens',
      value: data.hasLinkData ? eur(t.caLiens) : 'indisponible',
      hint: data.hasLinkData ? `${t.partCa === null ? '—' : pct(t.partCa)} du CA total` : 'aucun relevé sur la période',
      info: "Revenus attribués par MyPuls aux liens de tracking sur la période. C'est une part faible du CA (3 à 5 % en général) : le CA se fait ensuite, par les chatters — la part des ABONNÉS dit mieux ce que le pôle apporte.",
    },
    {
      ...base,
      key: 'subs',
      label: 'Nouveaux abonnés',
      value: num(t.newSubs),
      hint: 'toutes sources confondues',
      info: 'Somme des nouveaux abonnés quotidiens de toutes les modèles sur la période (source MyPuls).',
    },
    {
      ...base,
      key: 'subs-liens',
      label: 'Abonnés via liens',
      value: data.hasLinkData ? num(t.subsLiens) : 'indisponible',
      hint: data.hasLinkData
        ? `${t.partSubs === null ? '—' : pct(t.partSubs)} des nouveaux abonnés`
        : 'aucun relevé sur la période',
      info: "Conversions des liens de tracking sur la période — la colonne « Abonnés (Conv.) » de MyPuls. C'est LE chiffre du pôle : un clic devenu abonnement.",
    },
  ]

  // Invariant : un relevé manquant s'annonce, il ne se déguise pas en zéro. Sinon « l'ingestion
  // est coupée » et « le marketing n'a rien rapporté » sont indiscernables. Partagé par les deux
  // onglets : les sources de trafic viennent du même relevé.
  const sansReleve = (
    <div className="rounded-lg border bg-card p-6">
      <p className="text-sm font-medium">Aucun relevé de liens sur cette période.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Les chiffres de CA et d&apos;abonnés restent valables — seule la part venue des liens de
        tracking est indisponible. Choisissez une autre période, ou vérifiez l&apos;ingestion
        marketing.
      </p>
    </div>
  )

  const stats = (
    <div className="flex flex-col gap-6">
      <KpiGrid kpis={kpis} />

      {!data.hasLinkData ? sansReleve : <MktAgencySplit data={data} />}

      <div className="flex flex-col gap-2">
        {data.modeles.map((m) => (
          <MktCreatorSection key={m.creatorId} m={m} groups={groups} />
        ))}
        {data.modeles.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune modèle sur cette période.</p>
        )}
      </div>
    </div>
  )

  // Deux lectures de la même page, l'onglet dans l'URL (`?vue=sources`) comme sur les Liens :
  // « Stats » répond à « que pèsent les liens chez chaque modèle ? », « Sources de trafic » à
  // « de quels réseaux viennent ses abonnés ? ».
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">{data.period}</p>
      <UrlTabs
        value={vue}
        defaultValue="stats"
        items={[
          { value: 'stats', label: 'Stats', content: stats },
          {
            value: 'sources',
            label: 'Sources de trafic',
            content: !data.hasLinkData ? sansReleve : <MktSourcesView modeles={data.modeles} groups={groups} notes={notes} />,
          },
        ]}
      />
    </div>
  )
}
