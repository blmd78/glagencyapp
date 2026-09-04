import { fmtDuration } from '@glagency/core'
import { int } from '@/lib/format'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { ReportFilters } from './components/report-filters'
import { ModelGroup } from './components/model-group'
import { RunNotice } from './components/run-notice'
import type { ShiftReport } from './types'

/**
 * Relevé d'équipe — Server Component qui ne fetch RIEN : `page.tsx` lui passe la donnée.
 *
 * L'écran raisonne sur la PÉRIODE du sélecteur de dates du header, comme le reste du CRM.
 * L'interactivité (filtres d'URL) vit dans une feuille client.
 */
export function MypulsShiftReportTemplate({ data }: { data: ShiftReport }) {
  return (
    <div className="flex flex-col gap-6">
      <ReportFilters
        slot={data.slot}
        onlyExpected={data.onlyExpected}
        belowOnly={data.belowOnly}
      />

      <RunNotice
        run={data.run}
        available={data.available}
        periodLabel={data.periodLabel}
        missingDays={data.missingDays}
        clampedToYesterday={data.clampedToYesterday}
      />

      {data.available && <KpiGrid kpis={buildKpis(data)} accents={ACCENTS} />}

      {data.available && <Groups data={data} />}
    </div>
  )
}

/**
 * Les cartes par modèle. Un message explicite quand les filtres masquent tout : une page vide
 * sans explication se lit « personne n'a travaillé ».
 */
function Groups({ data }: { data: ShiftReport }) {
  if (data.groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {data.totalRows === 0
          ? 'Aucune activité relevée sur cette période.'
          : `Les filtres masquent les ${data.totalRows} chatteur(s) de la période.`}
      </p>
    )
  }
  // Dépliées seulement quand la vue est courte. Sur un mois, tout ouvrir portait le DOM bien
  // au-delà du seuil d'alerte Lighthouse, pour un contenu que personne ne lit d'un bloc.
  const rows = data.groups.reduce((n, g) => n + g.rows.length, 0)
  const openByDefault = rows <= 40

  return (
    <div className="flex flex-col gap-3">
      {data.groups.map((g) => (
        <ModelGroup
          key={g.model}
          group={g}
          threshold={data.threshold}
          open={openByDefault}
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
 * QUATRE tuiles, calculées sur les lignes affichées — le créneau filtré et les modèles du
 * périmètre de l'appelant. Chacune porte sa portée, parce qu'un chiffre d'agence et un chiffre
 * de périmètre ne se distinguent pas à l'œil.
 *
 * « Postes tenus » ne compte QUE les jours du créneau ATTENDU de chacun. C'est la correction
 * centrale de cet écran : compter toutes les lignes revenait à juger le renfort — dont la
 * couverture est minuscule par construction, 16 % de moyenne en production — et à annoncer un
 * désastre qui n'existe pas. La tuile dit combien de personnes échappent au verdict faute de
 * créneau renseigné, plutôt que de les compter comme fautives.
 */
function buildKpis(data: ShiftReport): Kpi[] {
  const k = data.kpi
  const heldPct = k.expectedDays > 0 ? Math.round((k.heldDays / k.expectedDays) * 100) : 0

  return [
    {
      key: 'chatteurs',
      label: 'Chatteurs actifs',
      value: int(k.chatters),
      deltaPct: null,
      trendLabel: 'Ont envoyé au moins un message',
      hint: data.periodLabel,
      info: "Compté sur les lignes affichées : le créneau filtré, et les modèles de ton périmètre. Ce n'est pas l'effectif théorique.",
    },
    {
      key: 'temps',
      label: 'Temps actif cumulé',
      value: fmtDuration(k.activeMinutes),
      deltaPct: null,
      trendLabel: `${int(k.models)} modèle${k.models > 1 ? 's' : ''} travaillé${k.models > 1 ? 's' : ''}`,
      hint: data.periodLabel,
      info: "Le « Chatting actif » de MyPuls : une pause est comptée dès le seuil d'inactivité. Ce n'est PAS le temps connecté, qui est plus large.",
    },
    {
      key: 'messages',
      label: 'Messages envoyés',
      value: int(k.messages),
      deltaPct: null,
      trendLabel: 'Tous créneaux, renfort compris',
      hint: data.periodLabel,
      info: 'La seule mesure directe du travail — les autres tuiles sont des durées.',
    },
    {
      key: 'postes',
      label: 'Postes tenus',
      value: k.expectedDays > 0 ? `${int(k.heldDays)}/${int(k.expectedDays)}` : '—',
      deltaPct: null,
      trendLabel:
        k.expectedDays > 0
          ? `${heldPct} % des jours attendus`
          : 'aucun créneau attendu renseigné',
      hint:
        k.unjudgeable > 0
          ? `${int(k.unjudgeable)} personne(s) sans créneau, hors verdict`
          : `Couverture ≥ ${data.threshold} %`,
      info: 'Un jour attendu = un jour travaillé sur SON créneau. Le renfort sur un autre créneau n’entre jamais dans ce compte : sa couverture est minuscule par construction, et le compter reviendrait à sanctionner le zèle.',
    },
  ]
}
