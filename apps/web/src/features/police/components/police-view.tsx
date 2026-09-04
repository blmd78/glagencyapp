'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { eur2max as eur } from '@/lib/format'
import { SanctionDialog, type SanctionPrefill } from './sanction-dialog'
import { PoliceTable } from './police-table'
import type { PoliceData, PoliceEntry } from '../types'

/** KPIs de la période au format des cartes partagées (cohérent avec Overview/Santé) — calculés
 *  sur les entrées AFFICHÉES : déjà bornées au périmètre par le serveur, et filtrées par la
 *  recherche chatter (les cartes et la table racontent la même chose). */
function policeKpis(entries: PoliceEntry[], periodLabel: string): Kpi[] {
  const totalMalus = entries.filter((e) => e.kind === 'malus').reduce((s, e) => s + e.amountEur, 0)
  const warnings = entries.filter((e) => e.kind === 'warning').length
  const concerned = new Set(entries.map((e) => e.chatterId)).size
  return [
    { key: 'malus', label: 'Total malus', value: eur(totalMalus), deltaPct: null, trendLabel: 'Sanctions de la période', hint: periodLabel },
    { key: 'avert', label: 'Avertissements', value: String(warnings), deltaPct: null, trendLabel: 'Fautes relevées', hint: periodLabel },
    { key: 'chatters', label: 'Chatters concernés', value: String(concerned), deltaPct: null, trendLabel: 'Contrôlés sur la période', hint: periodLabel },
  ]
}

const POLICE_ACCENTS = ['border-t-red-500', 'border-t-amber-500', 'border-t-blue-500']

/** Contenu du Tracker : KPIs + saisie (dialog, avec sa propre date) + journal. La PÉRIODE vient
 *  du datepicker global du header (`?from&to`) — plus de bascule Jour/Mois locale (2026-08-17).
 *  La recherche chatter (barre de la table, contrôlée ici) filtre KPIs ET historique ensemble. */
export function PoliceView({
  data,
  canWrite,
  prefill,
}: {
  data: PoliceData
  canWrite: boolean
  /** Sanction amorcée depuis le Relevé d'équipe (`?signalement=…`) — le dialog s'ouvre dessus. */
  prefill?: SanctionPrefill
}) {
  const [search, setSearch] = useState('')
  // Même sémantique que le filtre de colonne TanStack qu'elle remplace (`includesString`) :
  // sous-chaîne insensible à la casse sur le nom du chatteur.
  const entries = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data.entries
    return data.entries.filter((e) => e.chatterName.toLowerCase().includes(q))
  }, [data.entries, search])

  return (
    <div className="flex flex-col gap-6">
      <KpiGrid kpis={policeKpis(entries, data.period.label)} accents={POLICE_ACCENTS} />

      {/* Saisie en DIALOG, bouton à GAUCHE (écrivains). La sanction porte SA date (datepicker du
          formulaire, défaut aujourd'hui) — la période affichée n'est qu'un filtre de consultation.
          Le sélecteur de modèles a été retiré (demande Benoit 2026-08-06, « pour le moment ») —
          le PÉRIMÈTRE par rôle, lui, reste appliqué côté serveur (getPolice). */}
      {canWrite && (
        <div className="flex items-center">
          <SanctionDialog
            data={data}
            prefill={prefill}
            openOnMount={!!prefill}
            trigger={
              <Button type="button" className="gap-1.5">
                <Plus className="size-4" />
                Ajouter une sanction
              </Button>
            }
          />
        </div>
      )}

      <PoliceTable
        data={data}
        entries={entries}
        canWrite={canWrite}
        search={search}
        onSearchChange={setSearch}
      />
    </div>
  )
}
