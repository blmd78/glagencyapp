import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { frDayLong } from '@glagency/core'
import type { IntegrationMonth } from '../types'

/**
 * Les entrées à l'agence, mois par mois : qui a fini sa formation et rejoint, et quand.
 *
 * La file des dossiers répond à « qui recruter » ; cette vue répond à « combien on fait entrer »,
 * ce qui n'est pas la même unité de temps — d'où deux onglets plutôt qu'un écran mixte.
 *
 * Une personne apparaît ici dès que son compte est rattaché à une modèle (`integrated_at`). Un
 * candidat devenu membre mais sans modèle n'y est pas : il est encore en formation.
 */
export function IntegrationsView({ months }: { months: IntegrationMonth[] }) {
  if (months.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune entrée enregistrée. La date d&apos;intégration se pose au premier rattachement à une
        modèle — un candidat devenu membre mais sans modèle est encore en formation.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {months.map((m) => (
        <section key={m.month}>
          <header className="flex items-baseline gap-3 pb-2">
            <h3 className="text-base font-medium capitalize">{m.label}</h3>
            <span className="text-sm text-muted-foreground tabular-nums">
              {m.rows.length} entrée{m.rows.length > 1 ? 's' : ''}
            </span>
          </header>
          <div className="overflow-hidden rounded-lg border bg-card">
            {m.rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 first:border-t-0"
              >
                <Link
                  href={{ pathname: '/formation/recrutement', query: { dossier: r.id } }}
                  className="font-medium hover:underline"
                  title={`${r.firstName} ${r.lastName}`}
                >
                  {/* Pseudo Discord d'abord — le nom civil reste au survol. */}
                  {r.discord ?? `${r.firstName} ${r.lastName}`}
                </Link>
                {/* Le score du test, pour mémoire : il ne conditionne pas l'entrée (52 des
                    comptes créés viennent de dossiers en échec), mais il la contextualise. */}
                <Badge variant={r.passed ? 'secondary' : 'outline'} className="text-xs">
                  {r.global}/100
                </Badge>
                <span className="flex flex-wrap gap-1">
                  {r.models.map((name) => (
                    <Badge key={name} className={modelColor(name)}>
                      {name}
                    </Badge>
                  ))}
                  {r.models.length === 0 && (
                    <span
                      className="text-xs text-muted-foreground"
                      title="Entré puis détaché : la date d'intégration ne se réécrit jamais."
                    >
                      plus de modèle
                    </span>
                  )}
                </span>
                <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                  {r.integratedAt ? frDayLong(r.integratedAt) : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
