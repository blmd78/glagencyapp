'use client'

import { DataTable } from '@/components/data-table/data-table'
import { MemberSelect } from '@/components/member-select'
import type { SelectableMember } from '@/lib/types/member'
import type { MemberEvent } from '../types'
import { activityColumns } from './activity-columns'

/** '2026-07-30' → '30/07/2026'. */
const fr = (iso: string) => iso.split('-').reverse().join('/')

/**
 * Onglet « Activité » (0104) — le MÊME historique que la fiche membre, lu par l'autre bout : la
 * fiche répond à « qu'est-il arrivé à Mehdi ? », ce flux à « qui a bougé quoi cette semaine ? ».
 *
 * DATATABLE et non timeline (demande Benoit 2026-08-03) : mêmes colonnes triables, même toolbar,
 * même pagination et même compte de lignes que l'onglet Comptes. Deux onglets d'une même page
 * doivent se manipuler pareil — une liste libre à côté d'un tableau se lit comme deux écrans
 * étrangers. La fiche membre, elle, garde sa timeline : dans un dialog étroit, six colonnes ne
 * tiennent pas, et « Membre » y serait la même valeur sur toutes les lignes.
 *
 * DEUX FILTRES, ET DEUX SEULEMENT, tous deux dans l'URL donc partageables (guidelines §6) : la
 * PÉRIODE via le sélecteur de dates du header (`?from=&to=`) et le MEMBRE via `?membre=`. Pas de
 * recherche texte (retour Benoit) : un troisième filtre, local et non partageable celui-là,
 * demandait de choisir entre chercher un nom (doublon du sélecteur) ou un changement — deux
 * réponses également défendables, signe qu'il n'avait pas sa place.
 */
export function ActivityView({
  events,
  members,
  selectedMember,
  from,
  to,
  limit,
}: {
  events: MemberEvent[]
  /** Tous les profils, PARTIS COMPRIS — leur historique est justement celui qu'on vient relire. */
  members: SelectableMember[]
  /** `?membre=` validé côté serveur (appartenance à `members`), ou null = tout le monde. */
  selectedMember: string | null
  from: string
  to: string
  /** Plafond de la lecture — sert à dire quand la liste est tronquée. */
  limit: number
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Du {fr(from)} au {fr(to)} — la période suit le sélecteur de dates en haut de page.
        {/* AUCUNE TRONCATURE SILENCIEUSE : au plafond, la liste ne montre pas tout et doit le
            dire — sinon « rien après le 12 » se lit comme « rien ne s'est passé ». */}
        {events.length >= limit &&
          ` · plafond de ${limit} atteint, resserre les dates ou choisis un membre pour voir les plus anciens`}
      </p>

      <DataTable
        data={events}
        columns={activityColumns}
        initialSorting={[{ id: 'at', desc: true }]}
        pageSize={20}
        getRowId={(e) => String(e.id)}
        countLabel={(n) => `${n} changement(s)`}
        toolbar={<MemberSelect members={members} value={selectedMember} allowAll />}
      />
    </div>
  )
}
