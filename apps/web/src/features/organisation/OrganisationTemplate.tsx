import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import type { OrgChatter, OrganisationData } from './types'

// Libellés des colonnes de shift (valeurs CRM_SHIFTS) + « sans shift » à part.
const SHIFT_LABELS = [
  ['matin', 'Matin'],
  ['aprem', 'Après-midi'],
  ['soir', 'Soir'],
] as const

function Names({ chatters }: { chatters: OrgChatter[] }) {
  if (!chatters.length) return <span className="text-xs text-muted-foreground/40">—</span>
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      {chatters.map((c) => (
        <span key={c.id} className="text-sm">
          {c.name}
        </span>
      ))}
    </div>
  )
}

/**
 * Vue d'orga de l'agence (miroir de la sheet « organisation ») : une section par manager,
 * une ligne par (sous-manager, modèle), chatters groupés par shift. Tout est DÉRIVÉ de
 * Membres/Chatters (cf. get-organisation) — modifier là-bas met à jour ici.
 */
export function OrganisationTemplate({ data }: { data: OrganisationData }) {
  const { sections, orphanModels, counts } = data
  return (
    <div className="flex flex-col gap-8">
      <p className="-mt-4 text-sm text-muted-foreground">
        {counts.chatteurs} chatters · {counts.sousManagers} sous-managers · {counts.managers}{' '}
        équipes · {counts.modeles} modèles actifs — dérivé de Membres (assignations,
        rattachements) et des fiches Chatters (shift), à jour en permanence.
      </p>

      {sections.map((s) => (
        <section key={s.managerName} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{s.managerName}</h2>
            <span className="text-sm tabular-nums text-muted-foreground">
              {s.total} chatter{s.total > 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2">Sous-manager</th>
                  <th className="px-3 py-2">Modèle</th>
                  {SHIFT_LABELS.map(([key, label]) => (
                    <th key={key} className="px-3 py-2">
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-2">Sans shift</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, i) => (
                  <tr key={`${r.sousManagerName ?? ''}:${r.modelName}`} className={i ? 'border-t' : ''}>
                    <td className="px-3 py-2 align-top font-medium">
                      {r.sousManagerName ?? (
                        <span className="text-xs italic text-muted-foreground">direct</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge className={modelColor(r.modelName)}>{r.modelName}</Badge>
                    </td>
                    {SHIFT_LABELS.map(([key]) => (
                      <td key={key} className="px-3 py-2 align-top">
                        <Names chatters={r.byShift[key]} />
                      </td>
                    ))}
                    <td className="px-3 py-2 align-top">
                      <Names chatters={r.sansShift} />
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums">{r.total}</td>
                  </tr>
                ))}
                {s.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-sm text-muted-foreground">
                      Aucun modèle assigné à cette équipe — à régler dans Membres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {orphanModels.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Modèles actifs sans équipe (aucun manager/sous-manager assigné) :{' '}
          {orphanModels.join(', ')} — à régler dans Membres.
        </p>
      )}
    </div>
  )
}
