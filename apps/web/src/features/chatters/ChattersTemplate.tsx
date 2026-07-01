import { ChattersTable } from './components/chatters-table'
import type { ChattersData } from './types'

const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

// Références MyPuls juin 2026 (total compte, tous comptes/tous types) — sert à expliciter
// l'écart de PÉRIMÈTRE avec le CA attribué aux chatteurs. À dériver du scrape en base.
const MYPULS_ACCOUNT_TOTAL = 258853 // dont comptes privés + renew/médias hors messagerie
const GAP_PRIVATE = 3515 // carlaprive + juliepvv + alice_prvv
const GAP_NON_MESSAGING = 2482 // renew + media on-demand/push (non attribuables à un chatteur)

/** Template Chatteurs : compose la table à partir des données reçues. Aucun fetch. */
export function ChattersTemplate({ data }: { data: ChattersData }) {
  const totalCa = Math.round(data.chatters.reduce((sum, c) => sum + c.ca, 0))
  const active = data.chatters.filter((c) => c.active).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chatteurs</h1>
        <p className="text-sm text-muted-foreground">
          {data.period} · {data.chatters.length} chatteurs ({active} actifs) ·{' '}
          <span className="font-medium text-foreground">CA attribué {eur(totalCa)}</span>
        </p>
      </div>

      {/* Réconciliation de périmètre : explique le "décalage" avec le total MyPuls. */}
      <div className="rounded-xl border bg-muted/30 p-4 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span>
            CA attribué chatteurs{' '}
            <span className="font-semibold tabular-nums">{eur(totalCa)}</span>
          </span>
          <span className="text-muted-foreground">
            → Total compte MyPuls{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {eur(MYPULS_ACCOUNT_TOTAL)}
            </span>
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          L'écart (~{eur(MYPULS_ACCOUNT_TOTAL - totalCa)}) n'est <b>pas</b> une erreur : ={' '}
          comptes privés (~{eur(GAP_PRIVATE)} : carlaprive/juliepvv/alice_prvv) + renew &
          médias hors messagerie (~{eur(GAP_NON_MESSAGING)}), <b>non attribuables à un chatteur</b>.
          Les totaux par chatteur ci-dessous = chiffres MyPuls money-team.
        </p>
      </div>

      <ChattersTable chatters={data.chatters} />
    </div>
  )
}
