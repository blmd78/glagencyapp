import { SLOT_LABEL, fmtDuration } from '@glagency/core'
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
          day={data.day}
          canReport={data.canReport}
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
 * QUATRE tuiles, choisies sur ce qu'elles apprennent réellement, et calculées sur LE MÊME
 * périmètre que le tableau en dessous : le créneau choisi et les modèles de l'appelant. Le
 * libellé de portée le rappelle sur chaque tuile — un chiffre d'agence et un chiffre de
 * périmètre ne se distinguent pas à l'œil.
 *
 * MyPuls en affiche six ; deux ne disent rien ici. « Créneaux tenus » vaut 3/3 tous les jours
 * de la semaine mesurée — une constante n'informe pas. « Modèles travaillés » vaut 17/18 six
 * jours sur sept ; il est rétrogradé en sous-titre de « Messages », là où il coûte zéro place.
 * « Vacations » est un compte technique, corrélé au nombre de chatteurs : même traitement, sous
 * « Temps actif ».
 *
 * À leur place, « Postes tenus » : le nombre de personnes au-dessus du seuil sur le total.
 * C'est la seule qui bouge vraiment (25/284 à 36/269 sur la semaine) et la seule sur laquelle
 * on agit.
 */
function buildKpis(data: ShiftReport): Kpi[] {
  const k = data.kpi!
  const heldPct = k.total > 0 ? Math.round((k.held / k.total) * 100) : 0
  // La portée, en clair. Avant, la tuile disait « Sur toute la journée, tous créneaux » alors
  // que le tableau montrait un créneau : le lecteur devait deviner lequel des deux mentait.
  const scope = data.slot === 'all' ? 'Journée complète' : `Créneau ${SLOT_LABEL[data.slot]}`

  return [
    {
      key: 'chatteurs',
      label: 'Chatteurs actifs',
      value: int(k.chatters),
      deltaPct: null,
      trendLabel: 'Ont envoyé au moins un message',
      hint: scope,
      info: "Compté sur les lignes affichées : le créneau choisi, et les modèles de ton périmètre. Ce n'est pas l'effectif théorique.",
    },
    {
      key: 'temps',
      label: 'Temps actif cumulé',
      value: fmtDuration(k.activeMinutes),
      deltaPct: null,
      trendLabel: `${int(k.vacations)} vacation${k.vacations > 1 ? 's' : ''}`,
      hint: scope,
      info: "Le « Chatting actif » de MyPuls : une pause est comptée dès le seuil d'inactivité. Ce n'est PAS le temps connecté, qui est plus large.",
    },
    {
      key: 'messages',
      label: 'Messages envoyés',
      value: int(k.messages),
      deltaPct: null,
      trendLabel: `${int(k.models)} modèle${k.models > 1 ? 's' : ''} travaillé${k.models > 1 ? 's' : ''}`,
      hint: scope,
      info: 'La seule mesure directe du travail — les autres tuiles sont des durées.',
    },
    {
      key: 'postes',
      label: 'Postes tenus',
      value: `${int(k.held)}/${int(k.total)}`,
      deltaPct: null,
      trendLabel: `${heldPct} % au-dessus du seuil`,
      hint: `Couverture ≥ ${data.threshold} %`,
      info: 'Une ligne = une personne sur un créneau. Ne bouge pas avec les deux bascules ci-dessus : filtrer sur les écarts afficherait sinon 0 sur N.',
    },
  ]
}
