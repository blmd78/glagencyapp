import { frDateNumeric } from '@glagency/core'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { int, num } from '@/lib/format'
import { STATUS_COLORS } from '@/lib/status-color'
import { AiDailyChart } from './components/ai-daily-chart.client'
import type { AiCase, AiChatter, AiModelLine, AiUsageData } from './types'

const usd = (n: number) => `${n.toFixed(2)} $`
const KIND_LABELS: Record<string, string> = { fan: 'Fan', score: 'Notation' }

/**
 * Analytics IA de la Formation (admin) : ce que l'entraînement coûte, qui l'utilise, et POURQUOI
 * la facture est ce qu'elle est.
 *
 * Le bloc « Diagnostic du cache » est la raison d'être de la page : un prompt plus court que le
 * seuil du modèle n'est jamais mis en cache, et l'API ne le signale nulle part — elle ignore
 * `cache_control` en silence. C'est ce qui faisait payer plein tarif 264 millions de tokens
 * d'entrée par mois sans que personne ne puisse le voir.
 */
export function AiTemplate({ data }: { data: AiUsageData }) {
  const t = data.totals
  const base = { deltaPct: null as number | null, trendLabel: '', hint: '' }
  const kpis: Kpi[] = [
    {
      ...base,
      key: 'usd',
      label: 'Coût estimé',
      value: usd(t.usd),
      hint: `${usd(t.usdPerDay)}/jour sur ${t.activeDays} jour${t.activeDays > 1 ? 's' : ''} d'activité`,
      info: 'Prix liste Anthropic appliqués aux tokens relevés dans training_ai_calls. Estimation : la facture réelle peut être plus basse (remises), et un modèle absent de la table de prix compte 0.',
    },
    {
      ...base,
      key: 'fans',
      label: 'Fans actifs',
      value: num(t.activeCases),
      hint: `${num(t.chattersPerDay)} chatteurs/jour`,
      info: 'Exercices DISTINCTS joués sur la période — un exercice, un fan à affronter. Le détail par fan est plus bas : c’est lui qui dit sur quoi part la dépense.',
    },
    {
      ...base,
      key: 'fan',
      label: 'Consommation',
      value: `${int(t.fanInputTokens / 1e6)} M`,
      hint: `${num(t.fanCalls)} messages · ${num(t.scoreCalls)} notations`,
      info: 'Tokens d’ENTRÉE envoyés au fan sur la période (facturés plus lus en cache) — la taille cumulée des prompts. C’est le premier poste de la facture, très loin devant la sortie.',
    },
    {
      ...base,
      key: 'projection',
      label: 'Rythme mensuel',
      value: usd(t.projected30d),
      hint: 'au rythme des jours actifs',
      info: "Ce que coûterait un mois PLEIN au rythme actuel — pas un relevé, une trajectoire. La fenêtre de 30 jours contient des journées sans aucun entraînement (l'IA n'a démarré que le 27 août) : lire le coût total comme un coût mensuel le sous-estime de moitié.",
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">{data.period} · prix liste, estimation</p>

      <KpiGrid kpis={kpis} />

      {data.days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun appel IA sur la période.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardDescription>Coût par jour — fan et notation</CardDescription>
            </CardHeader>
            <CardContent>
              <AiDailyChart days={data.days} />
            </CardContent>
          </Card>

          <CacheDiagnostic models={data.models} />

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Jour par jour</h2>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Jour</TableHead>
                    <TableHead className="w-24 text-right">Chatteurs</TableHead>
                    <TableHead className="w-24 text-right">Sessions</TableHead>
                    <TableHead className="w-28 text-right">Messages</TableHead>
                    <TableHead className="w-28 text-right">Notations</TableHead>
                    <TableHead className="w-24 text-right">Échecs</TableHead>
                    <TableHead className="w-28 text-right">Latence p95</TableHead>
                    <TableHead className="w-24 text-right">Coût</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.days.map((d) => (
                    <TableRow key={d.day}>
                      <TableCell className="tabular-nums text-muted-foreground">{frDateNumeric(d.day)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{num(d.chatters)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{num(d.sessions)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{num(d.fanCalls)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{num(d.scoreCalls)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {d.failed === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge className={STATUS_COLORS.danger}>{num(d.failed)}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {d.p95LatencyMs === 0 ? '—' : `${(d.p95LatencyMs / 1000).toFixed(1)} s`}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{usd(d.usd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <CaseTable cases={data.cases} />
          <ChatterTable chatters={data.chatters} top10Pct={data.top10Pct} />
          <CacheDiagnostic models={data.models} />
        </>
      )}
    </div>
  )
}

/**
 * Pourquoi la facture est ce qu'elle est : par modèle, la taille du prompt face au SEUIL de mise
 * en cache. Sous le seuil, `cache_control` est ignoré sans le moindre message d'erreur.
 */
function CacheDiagnostic({ models }: { models: AiModelLine[] }) {
  if (models.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Diagnostic du cache</h2>
      <p className="text-sm text-muted-foreground">
        Un prompt plus court que le seuil du modèle n&apos;est jamais mis en cache — l&apos;API
        ignore la consigne sans rien signaler, et l&apos;entrée se paie plein tarif à chaque appel.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modèle</TableHead>
              <TableHead className="w-28">Sorte</TableHead>
              <TableHead className="w-24 text-right">Appels</TableHead>
              <TableHead className="w-32 text-right">Prompt moyen</TableHead>
              <TableHead className="w-28 text-right">Seuil cache</TableHead>
              <TableHead className="w-28 text-right">Cache utilisé</TableHead>
              <TableHead className="w-24 text-right">Coût</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => {
              const sousLeSeuil = m.cacheMinTokens != null && m.avgInputTokens < m.cacheMinTokens
              return (
                <TableRow key={`${m.model}|${m.kind}`}>
                  <TableCell className="font-mono text-xs">{m.model}</TableCell>
                  <TableCell className="text-muted-foreground">{KIND_LABELS[m.kind] ?? m.kind}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{num(m.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {int(m.avgInputTokens)}
                    {sousLeSeuil && (
                      <Badge className={`ml-2 ${STATUS_COLORS.danger}`}>sous le seuil</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {m.cacheMinTokens == null ? '—' : int(m.cacheMinTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={sousLeSeuil ? 'text-red-600 dark:text-red-400' : ''}>
                      {m.cacheHitPct} %
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{usd(m.usd)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

/** Les vingt plus gros consommateurs, et ce que la concentration dit du levier à actionner. */
function ChatterTable({ chatters, top10Pct }: { chatters: AiChatter[]; top10Pct: number }) {
  if (chatters.length === 0) return null
  const top = chatters.slice(0, 20)
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Par chatteur</h2>
      <p className="text-sm text-muted-foreground">
        {num(chatters.length)} chatteurs sur la période. Les dix plus gros portent{' '}
        <span className="font-medium text-foreground">{top10Pct} %</span> de la dépense —
        {top10Pct >= 60
          ? ' la consommation est concentrée, agir sur eux change la facture.'
          : ' la consommation est répartie, c’est le prompt qu’il faut traiter, pas les individus.'}
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chatteur</TableHead>
              <TableHead className="w-24 text-right">Jours</TableHead>
              <TableHead className="w-24 text-right">Sessions</TableHead>
              <TableHead className="w-28 text-right">Messages</TableHead>
              <TableHead className="w-28 text-right">$ / jour</TableHead>
              <TableHead className="w-24 text-right">Coût</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((c) => (
              <TableRow key={c.profileId}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{num(c.activeDays)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{num(c.sessions)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{num(c.fanCalls)}</TableCell>
                <TableCell className="text-right tabular-nums">{usd(c.usdPerDay)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{usd(c.usd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {chatters.length > top.length && (
        <p className="text-xs text-muted-foreground">
          Les {num(chatters.length - top.length)} autres chatteurs pèsent{' '}
          {usd(chatters.slice(20).reduce((s, c) => s + c.usd, 0))} au total.
        </p>
      )}
    </section>
  )
}

const KIND_BADGE: Record<string, string> = { solo: 'Solo', arena: 'Défi', boss: 'Boss' }

/**
 * Ce que chaque EXERCICE consomme, du plus gourmand au moins. C'est le grain qui permet d'agir :
 * un prompt se raccourcit cas par cas, et le « prompt moyen » dit lesquels sont les plus lourds.
 *
 * Un défi ou un boss n'a pas de fan unique (plusieurs en parallèle) : sa colonne Fan affiche
 * « — », ce qui est la vérité plutôt qu'un nom arbitraire pris parmi les cinq.
 */
function CaseTable({ cases }: { cases: AiCase[] }) {
  if (cases.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Par fan</h2>
      <p className="text-sm text-muted-foreground">
        Exercices classés par tokens envoyés au fan. Le prompt moyen est ce qu&apos;on paie à
        chaque message — c&apos;est lui qu&apos;il faut faire baisser, ou passer au-dessus du
        seuil de cache.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Fan</TableHead>
              <TableHead>Exercice</TableHead>
              <TableHead className="w-24">Sorte</TableHead>
              <TableHead className="w-24 text-right">Sessions</TableHead>
              <TableHead className="w-28 text-right">Messages</TableHead>
              <TableHead className="w-32 text-right">Prompt moyen</TableHead>
              <TableHead className="w-28 text-right">Tokens</TableHead>
              <TableHead className="w-24 text-right">Coût</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((c) => (
              <TableRow key={c.caseId}>
                <TableCell className="font-medium">{c.fanName}</TableCell>
                <TableCell className="max-w-[280px] truncate" title={`${c.moduleTitle} · ${c.caseTitle}`}>
                  {c.caseTitle}
                  <span className="block text-xs text-muted-foreground">{c.moduleTitle}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{KIND_BADGE[c.kind] ?? c.kind}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{num(c.sessions)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{num(c.fanCalls)}</TableCell>
                <TableCell className="text-right tabular-nums">{int(c.avgPromptTokens)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {(c.inputTokens / 1e6).toFixed(1)} M
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{usd(c.usd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
