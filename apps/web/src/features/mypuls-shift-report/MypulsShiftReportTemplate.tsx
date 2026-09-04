import { fmtDuration } from '@glagency/core'
import { int } from '@/lib/format'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { ReportFilters } from './components/report-filters'
import { ModelGroup } from './components/model-group'
import { SilentChatters } from './components/silent-chatters'
import { RunNotice } from './components/run-notice'
import type { ShiftReport } from './types'

/**
 * Relevé d'équipe — Server Component qui ne fetch RIEN : `page.tsx` lui passe la donnée.
 * L'interactivité (filtres d'URL, tri du tableau) vit dans les feuilles client.
 */
export function MypulsShiftReportTemplate({ data }: { data: ShiftReport }) {
  return (
    <div className="flex flex-col gap-6">
      <ReportFilters
        day={data.day}
        slot={data.slot}
        dayOptions={data.dayOptions}
        onlyExpected={data.onlyExpected}
        belowOnly={data.belowOnly}
      />

      <RunNotice run={data.run} available={data.available} day={data.day} />

      {/* EN HAUT, avant les chiffres : ceux qui n'ont rien fait sont ce qu'on cherche en
          ouvrant l'écran. En bas de page il fallait scroller au-delà de 258 lignes pour les
          voir — autant dire qu'on ne les voyait pas. */}
      {data.available && <SilentChatters chatters={data.silent} slot={data.slot} />}

      {data.available && data.kpi && <KpiGrid kpis={buildKpis(data)} accents={ACCENTS} />}

      {data.available && <Groups data={data} />}
    </div>
  )
}

/**
 * Les cartes par modèle — la mise en page de l'ancien board. Un message explicite quand les
 * filtres masquent tout : une page vide sans explication se lit « personne n'a travaillé ».
 */
function Groups({ data }: { data: ShiftReport }) {
  if (data.groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {data.totalRows === 0
          ? 'Aucune activité relevée sur ce créneau.'
          : `Les filtres masquent les ${data.totalRows} chatteur(s) de ce créneau.`}
      </p>
    )
  }
  // Cartes dépliées seulement quand la vue est courte. En journée complète (15 modèles, 258
  // lignes), tout ouvrir portait le DOM à 12 687 éléments — 9× le seuil d'alerte Lighthouse,
  // pour un contenu que personne ne lit d'un bloc. Sur un créneau précis, on veut voir.
  const rows = data.groups.reduce((n, g) => n + g.rows.length, 0)
  const openByDefault = rows <= 60

  return (
    <div className="flex flex-col gap-3">
      {data.groups.map((g) => (
        <ModelGroup
          key={g.model}
          group={g}
          threshold={data.threshold}
          showSlot={data.slot === 'all'}
          open={openByDefault}
        />
      ))}
    </div>
  )
}

// Quatre liserés, quatre tuiles — la grille cycle sur ce tableau (cf. KpiGrid).
const ACCENTS = [
  'border-t-blue-500',
  'border-t-emerald-500',
  'border-t-violet-500',
  'border-t-amber-500',
]

/**
 * QUATRE tuiles, choisies sur ce qu'elles apprennent réellement.
 *
 * MyPuls en affiche six ; deux ne disent rien ici. « Créneaux tenus » vaut 3/3 tous les jours
 * de la semaine mesurée — une constante n'informe pas. « Modèles travaillés » vaut 17/18 six
 * jours sur sept. « Vacations » est un compte technique, corrélé au nombre de chatteurs.
 *
 * À leur place, « Postes tenus » : le nombre de personnes au-dessus du seuil sur le total.
 * C'est la seule qui bouge vraiment (25/284 à 36/269 sur la semaine) et la seule sur laquelle
 * on agit.
 */
function buildKpis(data: ShiftReport): Kpi[] {
  const k = data.kpi!
  const heldPct = data.totalRows > 0 ? Math.round((data.heldRows / data.totalRows) * 100) : 0

  return [
    {
      key: 'chatteurs',
      label: 'Chatteurs actifs',
      value: int(k.chatters_actifs),
      deltaPct: null,
      trendLabel: 'Ont envoyé au moins un message',
      hint: 'Sur toute la journée, tous créneaux',
      info: "Compté sur les segments d'activité MyPuls du jour, pas sur l'effectif théorique.",
    },
    {
      key: 'temps',
      label: 'Temps actif cumulé',
      value: fmtDuration(k.active_minutes),
      deltaPct: null,
      trendLabel: 'Chatting actif',
      hint: 'Minutes porteuses de messages',
      info: "Le « Chatting actif » de MyPuls : une pause est comptée dès le seuil d'inactivité. Ce n'est PAS le temps connecté, qui est plus large.",
    },
    {
      key: 'messages',
      label: 'Messages envoyés',
      value: int(k.messages),
      deltaPct: null,
      trendLabel: 'Sur la journée',
      hint: 'Tous modèles confondus',
      info: 'La seule mesure directe du travail — les autres tuiles sont des durées.',
    },
    {
      key: 'postes',
      label: 'Postes tenus',
      value: `${int(data.heldRows)}/${int(data.totalRows)}`,
      deltaPct: null,
      trendLabel: `${heldPct} % au-dessus du seuil`,
      hint: `Couverture ≥ ${data.threshold} %`,
      info: 'Une ligne = une personne sur un créneau. Remplace le « Créneaux tenus » de MyPuls, qui vaut 3/3 tous les jours et n’apprend donc rien.',
    },
  ]
}
