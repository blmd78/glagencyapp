'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDown } from 'lucide-react'
import { Cell, Label, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { LtvGauge } from '@/components/ltv-gauge'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { modelColor } from '@/lib/model-color'
import { conv, eur, num, pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiGrid } from '@/components/kpi-card'
import { setLinkType } from '../actions'
import { typeBadge } from '@/lib/type-badge'
import { CRITERES, groupBySource, valeur, type Critere, type SourceGroup } from '../rank'
import type { MktLinkRow } from '@/lib/types/marketing'
import type { MktLinksData } from '../types'

const TYPE_LABELS = { twitter: 'Twitter', instagram: 'Instagram', telegram: 'Telegram', other: 'Autre' } as const

// Les couleurs viennent de SOURCES (rank.ts, passées au validateur dataviz) ; ce config ne sert
// qu'à satisfaire ChartContainer, qui exige une clé par série.
const donutConfig = {
  value: { label: 'Part' },
} satisfies ChartConfig

/** Sélecteur de type inline (correction manuelle — remplace link_type_overrides legacy).
 *  Changer le type déplace le lien de section : c'est le geste de rangement de la page. */
function TypeCell({ link }: { link: MktLinkRow }) {
  const [, startTransition] = useTransition()
  return (
    <Select
      value={link.type}
      onValueChange={(t) =>
        startTransition(async () => {
          const res = await setLinkType({ linkId: link.id, type: t })
          if (!res.success) toast.error(`${link.name} : type non modifié — ${res.error}`)
        })
      }
    >
      <SelectTrigger className="h-7 w-28 border-0 bg-transparent shadow-none">
        <SelectValue asChild>
          <Badge className={typeBadge(link.type)}>{TYPE_LABELS[link.type]}</Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(['twitter', 'instagram', 'telegram', 'other'] as const).map((t) => (
          <SelectItem key={t} value={t} className="text-xs">
            {TYPE_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** La valeur du critère, formatée — « — » quand elle n'a pas de sens. */
const fmt = (v: number | null, c: Critere) =>
  v === null ? '—' : c === 'revenus' ? eur(v) : c === 'taux' ? pct(v) : num(v)

/** Une ligne de lien : rang, identité, et la barre de performance relative à sa source. */
function LinkRow({ l, rang, best, critere }: { l: MktLinkRow; rang: number; best: number; critere: Critere }) {
  const v = valeur(l, critere)
  const largeur = best > 0 && v !== null ? Math.max((v / best) * 100, 1.5) : 0
  return (
    <div className="flex items-center gap-3 border-t px-4 py-2 first:border-t-0 hover:bg-accent/30">
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {rang > 0 ? rang : '·'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={l.name}>
            {l.name}
          </span>
          {!l.active && (
            <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
              disparu
            </Badge>
          )}
        </div>
        {/* La barre dit le poids du lien DANS sa source : une longueur se compare, pas une teinte. */}
        <div className="mt-1 h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${largeur}%` }} />
        </div>
      </div>
      <div className="hidden w-28 shrink-0 md:block">
        {l.creator ? (
          <Badge className={modelColor(l.creator)}>{l.creator}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="hidden shrink-0 lg:block">
        <TypeCell link={l} />
      </div>
      <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
        {fmt(v, critere)}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground sm:block">
        {num(l.clicks)} clics
      </span>
      <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground xl:block">
        {l.ltv === null ? '—' : `${eur(l.ltv)}/ab.`}
      </span>
    </div>
  )
}

/** Une métrique du résumé d'un canal : libellé au-dessus, valeur en dessous. */
function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', strong ? 'text-base font-semibold' : 'text-sm')}>
        {value}
      </span>
    </span>
  )
}

/**
 * Un canal : son RÉSUMÉ complet, et ses liens à la demande.
 *
 * Replié par défaut (décision Benoit 2026-09-10 : « ça fait long à descendre ») — les quatre
 * canaux tiennent alors sur un écran, et on ouvre celui qu'on veut fouiller. Ouvrir les 91
 * liens actifs d'office noyait la seule question qui se pose d'abord : quel canal marche.
 */
function SourceSection({
  g,
  critere,
  partAgence,
  ltvAgence,
}: {
  g: SourceGroup
  critere: Critere
  partAgence: number | null
  /** Repère de la jauge : la LTV de TOUS les liens sur la période. Un canal au-dessus sature —
   *  le chiffre exact reste écrit au centre. C'est la seule comparaison qui ait du sens ici :
   *  la cible LTV de la page Santé (10 €) vaut pour une modèle entière, pas pour un lien. */
  ltvAgence: number
}) {
  const [voirMuets, setVoirMuets] = useState(false)
  return (
    <Collapsible className="overflow-hidden rounded-lg border bg-card">
      <CollapsibleTrigger className="group w-full px-4 py-3 text-left hover:bg-accent/30">
        <div className="flex items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
          <span className="font-medium">{g.label}</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {g.links.length} lien{g.links.length > 1 ? 's' : ''}
            {g.dormants.length > 0 && ` · ${g.dormants.length} muet${g.dormants.length > 1 ? 's' : ''}`}
          </span>
          {partAgence !== null && (
            <Badge variant="secondary" className="tabular-nums">
              {pct(partAgence)} de l&apos;agence
            </Badge>
          )}
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
        {/* Le résumé : tout ce qu'on veut savoir d'un canal sans l'ouvrir. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2">
          <Stat label="Abonnés" value={num(g.conversions)} strong />
          <Stat label="Revenus" value={eur(g.revenueEur)} strong />
          <Stat label="Clics" value={num(g.clicks)} />
          <Stat label="Taux de conversion" value={g.taux === null ? '—' : pct(g.taux)} />
          {/* La LTV passe en jauge : remplie par rapport à la moyenne de tous les liens, on
              voit d'un coup d'œil quel canal amène des abonnés qui dépensent. */}
          <span className="ml-auto flex flex-col items-center">
            <LtvGauge value={g.ltv} max={ltvAgence} color={g.color} size="sm" />
            <span className="-mt-1 text-xs text-muted-foreground">LTV</span>
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t">
          {g.links.map((l, i) => (
            <LinkRow key={l.id} l={l} rang={i + 1} best={g.best} critere={critere} />
          ))}
        </div>
        {/* Les liens muets sur la période sont ANNONCÉS puis dépliables — les afficher d'office
            noierait le classement sous des lignes à zéro, les cacher sans le dire serait pire. */}
        {g.dormants.length > 0 && (
          <div className="border-t">
            <button
              type="button"
              onClick={() => setVoirMuets((v) => !v)}
              className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:bg-accent/30"
            >
              {voirMuets ? 'Masquer' : 'Afficher'} les {g.dormants.length} lien
              {g.dormants.length > 1 ? 's' : ''} sans activité sur la période
            </button>
            {voirMuets &&
              g.dormants.map((l) => (
                <LinkRow key={l.id} l={l} rang={0} best={0} critere={critere} />
              ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Page Liens : TOUS les liens de tracking de l'agence, groupés par SOURCE DE TRAFIC et
 * classés par le critère choisi (abonnés / revenus / taux — les trois, décision Benoit
 * 2026-09-08).
 *
 * Le tri par colonne de l'ancienne table est remplacé par le sélecteur de critère : sur une
 * page dont la question est « quels liens marchent », trois lectures explicites valent mieux
 * que neuf colonnes triables dont personne ne sait laquelle regarder.
 */
export function LiensView({ data }: { data: MktLinksData }) {
  const [critere, setCritere] = useState<Critere>('subs')
  const [q, setQ] = useState('')

  const links = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? data.links.filter((l) => l.name.toLowerCase().includes(t)) : data.links
  }, [data.links, q])

  const groups = useMemo(() => groupBySource(links, critere), [links, critere])

  const totals = useMemo(
    () => ({
      clicks: links.reduce((s, l) => s + l.clicks, 0),
      conversions: links.reduce((s, l) => s + l.conversions, 0),
      revenueEur: Math.round(links.reduce((s, l) => s + l.revenueEur, 0) * 100) / 100,
    }),
    [links],
  )

  // La barre de répartition suit le critère quand il est ADDITIF. Le taux ne l'est pas :
  // « 12 % des taux » ne veut rien dire, on retombe alors sur les abonnés — et le libellé
  // le dit, plutôt que de laisser croire à une part du taux.
  const partBase: 'subs' | 'revenus' = critere === 'revenus' ? 'revenus' : 'subs'
  const partTotal = partBase === 'revenus' ? totals.revenueEur : totals.conversions
  const partOf = (g: SourceGroup) => (partBase === 'revenus' ? g.revenueEur : g.conversions)

  // Repère des jauges LTV : la moyenne de TOUS les liens de la période (Σrevenus ÷ Σabonnés),
  // jamais la moyenne des LTV par canal. `0.01` en garde-fou pour ne pas diviser par zéro.
  const ltvAgence = totals.conversions > 0 ? totals.revenueEur / totals.conversions : 0.01

  // Dérivés des groupes, pas de `links` : seuls les liens qui ont bougé sont classés.
  const nbClasses = groups.reduce((n, g) => n + g.links.length, 0)
  // Sur TOUS les liens filtrés, pas sur les groupes : une source dont aucun lien n'a bougé
  // est retirée de l'affichage, ses muets doivent quand même être comptés ici.
  const nbMuets = links.length - nbClasses

  const base = { deltaPct: null, trendLabel: '' }
  const kpis = [
    {
      ...base,
      key: 'conv',
      label: 'Abonnés',
      value: num(totals.conversions),
      hint: 'tous liens, toutes sources',
      info: 'Somme des conversions de tous les liens de tracking de l’agence sur la période — la colonne « Abonnés (Conv.) » de MyPuls. C’est ce que le pôle apporte : le CA vient ensuite, par les chatters.',
    },
    {
      ...base,
      key: 'rev',
      label: 'Revenus',
      value: eur(totals.revenueEur),
      hint: 'attribués aux liens',
      info: 'Somme des revenus quotidiens de tous les liens sur la période — source MyPuls.',
    },
    {
      ...base,
      key: 'clicks',
      label: 'Clics',
      value: num(totals.clicks),
      hint: 'sur la période',
      info: 'Somme des clics quotidiens de tous les liens (source MyPuls).',
    },
    {
      ...base,
      key: 'taux',
      label: 'Taux de conversion',
      value: totals.clicks > 0 ? pct(conv(totals.conversions, totals.clicks)) : '—',
      hint: 'abonnés ÷ clics',
      info: 'Conversions ÷ clics sur la période, tous liens confondus — recalculé Σ/Σ, jamais la moyenne des taux par lien.',
    },
  ]

  return (
    <>
      <KpiGrid kpis={kpis} />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={critere} onValueChange={(v) => setCritere(v as Critere)}>
          <TabsList>
            {CRITERES.map((c) => (
              <TabsTrigger key={c.key} value={c.key} title={c.hint}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {/* Ce compteur ne dit QUE les liens réellement classés : afficher le total (335)
            à côté d'un classement qui en montre 91 était un mensonge par arrondi. Les muets
            sont annoncés à part, section par section. */}
        <span className="text-sm text-muted-foreground">
          {nbClasses} lien{nbClasses > 1 ? 's' : ''} classé{nbClasses > 1 ? 's' : ''} par{' '}
          {CRITERES.find((c) => c.key === critere)?.label.toLowerCase()}
          {nbMuets > 0 && (
            <span className="opacity-70">
              {' '}· {nbMuets} sans activité
            </span>
          )}
        </span>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrer par nom…"
          className="ml-auto h-9 w-56"
        />
      </div>

      {/* Camembert de répartition (demande Benoit 2026-09-10). Quatre parts est la limite haute
          d'un anneau lisible : chacune porte donc son libellé ET sa valeur en dessous, jamais la
          couleur seule. Il suit le critère quand celui-ci est additif — le taux ne l'étant pas,
          on retombe sur les abonnés et le titre le dit. */}
      {partTotal > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Répartition {partBase === 'revenus' ? 'des revenus' : 'des abonnés'} par canal
          </p>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <ChartContainer config={donutConfig} className="aspect-square h-[200px] shrink-0">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(v, name) => (
                        <span className="flex w-full items-baseline justify-between gap-3">
                          <span className="text-muted-foreground">{String(name)}</span>
                          <span className="tabular-nums">
                            {partBase === 'revenus' ? eur(Number(v)) : num(Number(v))}
                          </span>
                        </span>
                      )}
                    />
                  }
                />
                <Pie
                  data={groups.map((g) => ({ key: g.label, value: partOf(g), color: g.color }))}
                  dataKey="value"
                  nameKey="key"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {groups.map((g) => (
                    <Cell key={g.type} fill={g.color} />
                  ))}
                  <Label
                    content={({ viewBox }) =>
                      viewBox && 'cx' in viewBox && 'cy' in viewBox ? (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan className="fill-foreground text-lg font-semibold tabular-nums">
                            {partBase === 'revenus' ? eur(partTotal) : num(partTotal)}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) + 20}
                            className="fill-muted-foreground text-xs"
                          >
                            {partBase === 'revenus' ? 'au total' : 'abonnés'}
                          </tspan>
                        </text>
                      ) : null
                    }
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            {/* La légende porte toutes les infos du canal : la couleur ne fait que rappeler
                quelle part de l'anneau est laquelle. */}
            <div className="grid w-full gap-x-6 gap-y-2 sm:grid-cols-2">
              {groups.map((g) => (
                <div key={g.type} className="flex items-baseline gap-2">
                  <span className="size-2 shrink-0 translate-y-1 rounded-full" style={{ background: g.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{g.label}</span>
                      <span className="text-sm tabular-nums">
                        {pct((partOf(g) / partTotal) * 100)}
                      </span>
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {num(g.conversions)} ab. · {eur(g.revenueEur)} · LTV{' '}
                      {g.ltv === null ? '—' : eur(g.ltv)} · {g.taux === null ? '—' : pct(g.taux)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <SourceSection
            key={g.type}
            g={g}
            critere={critere}
            partAgence={partTotal > 0 ? (partOf(g) / partTotal) * 100 : null}
            ltvAgence={ltvAgence}
          />
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun lien sur cette période.</p>
        )}
      </div>
    </>
  )
}
