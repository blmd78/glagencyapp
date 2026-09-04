import { fmtDuration } from '@glagency/core'
import { int } from '@/lib/format'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { ReportFilters } from './components/report-filters'
import { ModelGroup } from './components/model-group'
import { DayModelGroup } from './components/day-model-group'
import { SilentChatters } from './components/silent-chatters'
import { RunNotice } from './components/run-notice'
import type { ShiftReport, ShiftReportDay, ShiftReportPeriod } from './types'

/**
 * Relevé d'équipe — Server Component qui ne fetch RIEN : `page.tsx` lui passe la donnée.
 *
 * DEUX GRAINS, choisis à la main dans la barre de filtres. « Période » suit le sélecteur de
 * dates du header et compte des JOURS TENUS ; « Un jour » ignore le header, et retrouve la jauge
 * en minutes, la timeline des sessions et les attendus sans activité. Les deux questions sont
 * différentes, et une jauge en minutes ne veut rien dire sur trente jours.
 */
export function MypulsShiftReportTemplate({ data }: { data: ShiftReport }) {
  return (
    <div className="flex flex-col gap-6">
      <ReportFilters
        mode={data.mode}
        day={data.mode === 'day' ? data.day : undefined}
        dayOptions={data.mode === 'day' ? data.dayOptions : undefined}
        slot={data.slot}
        onlyExpected={data.onlyExpected}
        belowOnly={data.belowOnly}
      />

      <RunNotice
        run={data.run}
        available={data.available}
        periodLabel={data.mode === 'day' ? 'cette journée' : data.periodLabel}
        missingDays={data.missingDays}
        // Le plafond à hier ne se dit qu'en mode Période : en mode Jour, le sélecteur ne propose
        // déjà que des jours relevables, il n'y a rien à expliquer.
        clampedToYesterday={data.mode === 'period' && data.clampedToYesterday}
      />

      {/* EN HAUT, avant les chiffres : ceux qui n'ont rien fait sont ce qu'on cherche en ouvrant
          l'écran. Réservé au grain JOUR — sur un mois, « aucune activité » désigne surtout des
          congés et des départs, et la formule neutre qui le rendait honnête devient du bruit. */}
      {data.available && data.mode === 'day' && (
        <SilentChatters chatters={data.silent} slot={data.slot} />
      )}

      {data.available && (
        <KpiGrid
          kpis={data.mode === 'day' ? dayKpis(data) : periodKpis(data)}
          accents={ACCENTS}
        />
      )}

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
          ? `Aucune activité relevée sur ${data.mode === 'day' ? 'cette journée' : 'cette période'}.`
          : `Les filtres masquent les ${data.totalRows} chatteur(s) ${data.mode === 'day' ? 'du jour' : 'de la période'}.`}
      </p>
    )
  }

  // Dépliées seulement quand la vue est courte. Tout ouvrir portait le DOM à 12 687 éléments
  // (mesuré), soit 9× le seuil d'alerte Lighthouse, pour un contenu que personne ne lit d'un bloc.
  const rows = data.groups.reduce((n, g) => n + g.rows.length, 0)
  const openByDefault = rows <= (data.mode === 'day' ? 60 : 40)

  return (
    <div className="flex flex-col gap-3">
      {data.mode === 'day'
        ? data.groups.map((g) => (
            <DayModelGroup
              key={g.model}
              group={g}
              threshold={data.threshold}
              showSlot={data.slot === 'all'}
              open={openByDefault}
              day={data.day}
              canReport={data.canReport}
            />
          ))
        : data.groups.map((g) => (
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
 * Les tuiles, calculées sur les lignes affichées — le créneau filtré et les modèles du périmètre
 * de l'appelant. Chacune porte sa portée : un chiffre d'agence et un chiffre de périmètre ne se
 * distinguent pas à l'œil.
 *
 * « Postes tenus » ne compte QUE le créneau ATTENDU de chacun, dans les deux grains. Compter
 * toutes les lignes revenait à juger le renfort — dont la couverture est minuscule par
 * construction, 16 % de moyenne en production — et à annoncer un désastre qui n'existe pas.
 */
function periodKpis(data: ShiftReportPeriod): Kpi[] {
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
        k.expectedDays > 0 ? `${heldPct} % des jours attendus` : 'aucun créneau attendu renseigné',
      hint:
        k.unjudgeable > 0
          ? `${int(k.unjudgeable)} personne(s) sans créneau, hors verdict`
          : `Couverture ≥ ${data.threshold} %`,
      info: 'Un jour attendu = un jour travaillé sur SON créneau. Le renfort sur un autre créneau n’entre jamais dans ce compte : sa couverture est minuscule par construction, et le compter reviendrait à sanctionner le zèle.',
    },
  ]
}

/** Les mêmes quatre tuiles, au grain d'UNE journée. */
function dayKpis(data: ShiftReportDay): Kpi[] {
  const k = data.kpi
  const heldPct = k.total > 0 ? Math.round((k.held / k.total) * 100) : 0

  return [
    {
      key: 'chatteurs',
      label: 'Chatteurs actifs',
      value: int(k.chatters),
      deltaPct: null,
      trendLabel: 'Ont envoyé au moins un message',
      hint: 'Sur la journée',
      info: "Compté sur les lignes affichées : le créneau filtré, et les modèles de ton périmètre. Ce n'est pas l'effectif théorique.",
    },
    {
      key: 'temps',
      label: 'Temps actif cumulé',
      value: fmtDuration(k.activeMinutes),
      deltaPct: null,
      trendLabel: `${int(k.vacations)} vacation${k.vacations > 1 ? 's' : ''}`,
      hint: 'Sur la journée',
      info: "Le « Chatting actif » de MyPuls : une pause est comptée dès le seuil d'inactivité. Ce n'est PAS le temps connecté, qui est plus large.",
    },
    {
      key: 'messages',
      label: 'Messages envoyés',
      value: int(k.messages),
      deltaPct: null,
      trendLabel: `${int(k.models)} modèle${k.models > 1 ? 's' : ''} travaillé${k.models > 1 ? 's' : ''}`,
      hint: 'Sur la journée',
      info: 'La seule mesure directe du travail — les autres tuiles sont des durées.',
    },
    {
      key: 'postes',
      label: 'Postes tenus',
      value: k.total > 0 ? `${int(k.held)}/${int(k.total)}` : '—',
      deltaPct: null,
      trendLabel: k.total > 0 ? `${heldPct} % au-dessus du seuil` : 'aucun créneau attendu ce jour',
      hint:
        k.unjudgeable > 0
          ? `${int(k.unjudgeable)} personne(s) sans créneau, hors verdict`
          : `Couverture ≥ ${data.threshold} %`,
      info: 'Une ligne = une personne SUR SON CRÉNEAU. Le renfort sur un autre créneau n’entre jamais dans ce compte : sa couverture est minuscule par construction, et le compter reviendrait à sanctionner le zèle.',
    },
  ]
}
