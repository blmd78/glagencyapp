import Link from 'next/link'
import { frDateTimeLongParis } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STATUS_COLORS } from '@/lib/status-color'
import { cn } from '@/lib/utils'
import { CANDIDATE_STATUS_LABELS, type CandidateRow, type RecruitGates } from '../types'

// Formateur hoisté (un `toLocaleDateString` avec options reconstruit un Intl.DateTimeFormat à
// chaque appel). TZ explicite : le SSR (UTC) et le navigateur doivent rendre LE MÊME jour.
// La date longue du `title`, elle, vient de `@glagency/core` (`frDateTimeLongParis`).
const FR_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' })

/**
 * Couleur d'une note selon sa part du maximum : ≥ 70 % vert, ≥ 50 % orange, sinon rouge — le 70 %
 * fait écho au seuil global du verdict, le reste n'est qu'un repère de lecture (pas un gate).
 */
function noteClass(value: number, max: number) {
  const ratio = value / max
  if (ratio >= 0.7) return 'text-emerald-600 dark:text-emerald-400'
  if (ratio >= 0.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** Mesure d'une épreuve : vert si elle passe le seuil, rouge sinon (gate en échec). */
function Gate({ value, ok, unit }: { value: string; ok: boolean; unit?: string }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        ok ? 'text-emerald-600 dark:text-emerald-400' : 'font-medium text-red-600 dark:text-red-400',
      )}
    >
      {value}
      {unit && <span className="text-xs text-muted-foreground"> {unit}</span>}
    </span>
  )
}

// Teintes prises sur `status-color.ts` (source unique) — mêmes équivalences que les Insights :
// un dossier neuf est une INFO à traiter, un dossier refusé est neutre (écarté, pas critique).
const STATUS_CLASS: Record<string, string> = {
  nouveau: STATUS_COLORS.info,
  valide: STATUS_COLORS.positive,
  refuse: STATUS_COLORS.neutral,
}

/**
 * File des candidats — Server Component (aucun état, que des liens). Nouveaux d'abord (tri du
 * service). Chaque ligne mène à `?dossier=<id>` (état partageable par URL, guidelines §6).
 *
 * Les gates sont colorés avec les seuils COURANTS ; le badge du score global, lui, vient du
 * `passed` FIGÉ à la soumission — c'est le verdict qui a été rendu au candidat ce jour-là, il ne
 * bouge pas si un seuil change ensuite.
 */
export function CandidatesTable({ rows, gates }: { rows: CandidateRow[]; gates: RecruitGates }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun candidat pour l’instant — envoie le lien du test.</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidat</TableHead>
            <TableHead className="w-24 text-center">Score</TableHead>
            <TableHead className="w-40" title="Orthographe · Cohérence · Relance · Vente (sur 25)">
              Conversation
            </TableHead>
            <TableHead className="w-56">Épreuves</TableHead>
            <TableHead className="w-28">Statut</TableHead>
            <TableHead className="w-28">Reçu</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={{ pathname: '/formation/recrutement', query: { dossier: c.id } }}
                  className="flex flex-wrap items-center gap-2 font-medium hover:underline"
                >
                  {c.firstName} {c.lastName}
                  {c.repeat && (
                    <Badge variant="outline" title="Cet e-mail portait déjà un dossier">
                      2ᵉ passage
                    </Badge>
                  )}
                  {c.isMember && <Badge variant="secondary">devenu membre</Badge>}
                </Link>
                <span className="text-xs text-muted-foreground">{c.email}</span>
              </TableCell>
              <TableCell className="text-center">
                <Badge className={cn('tabular-nums', c.passed ? STATUS_COLORS.positive : STATUS_COLORS.danger)}>
                  {c.global}/100
                </Badge>
                <span className="sr-only">{c.passed ? 'reçu' : 'refusé'}</span>
              </TableCell>
              <TableCell className="tabular-nums whitespace-nowrap">
                <span className={noteClass(c.orthographe, 25)}>{c.orthographe}</span>
                <span className="text-muted-foreground"> · </span>
                <span className={noteClass(c.coherence, 25)}>{c.coherence}</span>
                <span className="text-muted-foreground"> · </span>
                <span className={noteClass(c.relance, 25)}>{c.relance}</span>
                <span className="text-muted-foreground"> · </span>
                <span className={noteClass(c.vente, 25)}>{c.vente}</span>
                <span className={cn('text-xs', noteClass(c.botTotal, 100))}> ({c.botTotal}/100)</span>
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                <div className="flex gap-x-3">
                  {/* Dénominateur = le nombre de questions de SA tentative (la banque est
                      réglable), pas celui de la banque du jour. */}
                  <Gate value={`${c.qiScore}/${c.qiTotal}`} ok={c.qiScore >= gates.qiMin} unit="QI" />
                  <Gate value={String(c.typingWpm)} ok={c.typingWpm >= gates.frappeMin} unit="mots/min" />
                  <Gate value={String(c.connectionMbps)} ok={c.connectionMbps >= gates.connexionMin} unit="Mb/s" />
                </div>
              </TableCell>
              <TableCell>
                <Badge className={STATUS_CLASS[c.status]}>{CANDIDATE_STATUS_LABELS[c.status]}</Badge>
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground" title={frDateTimeLongParis(c.createdAt)}>
                {FR_DATE.format(new Date(c.createdAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
