import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { CANDIDATE_STATUS_LABELS, type CandidateRow, type RecruitGates } from '../types'

// Formateur hoisté (un `toLocaleDateString` avec options reconstruit un Intl.DateTimeFormat à
// chaque appel). TZ explicite : le SSR (UTC) et le navigateur doivent rendre LE MÊME jour.
const FR_DAY = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })
const FR_FULL = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })

/** Mesure d'une épreuve, en muted si elle passe le seuil, en rouge sinon (gate en échec). */
function Gate({ value, ok, unit }: { value: string; ok: boolean; unit?: string }) {
  return (
    <span className={cn('tabular-nums', ok ? 'text-muted-foreground' : 'font-medium text-red-600 dark:text-red-400')}>
      {value}
      {unit && <span className="text-xs"> {unit}</span>}
    </span>
  )
}

const STATUS_CLASS: Record<string, string> = {
  nouveau: 'bg-primary/10 text-primary',
  valide: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  refuse: 'bg-muted text-muted-foreground',
}

/**
 * File des candidats — Server Component (aucun état, que des liens). Nouveaux d'abord (tri du
 * service). Chaque ligne mène à `?dossier=<id>` (état partageable par URL, guidelines §6).
 *
 * Les gates sont colorés avec les seuils COURANTS ; le ✓/✗ du score global, lui, vient du `passed`
 * FIGÉ à la soumission — c'est le verdict qui a été rendu au candidat ce jour-là, il ne bouge pas
 * si un seuil change ensuite.
 */
export function CandidatesTable({ rows, gates }: { rows: CandidateRow[]; gates: RecruitGates }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun candidat pour l’instant — envoie le lien du test.</p>
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidat</TableHead>
            <TableHead className="w-20">Reçu</TableHead>
            <TableHead className="w-24 text-center">Score</TableHead>
            <TableHead className="w-40" title="Orthographe · Cohérence · Relance · Vente (sur 25)">
              Conversation
            </TableHead>
            <TableHead className="w-44">Épreuves</TableHead>
            <TableHead className="w-28">Statut</TableHead>
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
              <TableCell className="tabular-nums text-muted-foreground" title={FR_FULL.format(new Date(c.createdAt))}>
                {FR_DAY.format(new Date(c.createdAt))}
              </TableCell>
              <TableCell className="text-center">
                <span className={cn('font-medium tabular-nums', !c.passed && 'text-muted-foreground')}>{c.global}</span>
                <span className="text-xs text-muted-foreground">/100</span>{' '}
                <span
                  aria-hidden
                  className={cn(c.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}
                >
                  {c.passed ? '✓' : '✗'}
                </span>
                <span className="sr-only">{c.passed ? 'reçu' : 'refusé'}</span>
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {c.orthographe} · {c.coherence} · {c.relance} · {c.vente}
                <span className="text-xs"> ({c.botTotal}/100)</span>
              </TableCell>
              <TableCell className="text-sm">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <Gate value={`${c.qiScore}/5`} ok={c.qiScore >= gates.qiMin} unit="QI" />
                  <Gate value={String(c.typingWpm)} ok={c.typingWpm >= gates.frappeMin} unit="mots/min" />
                  <Gate value={String(c.connectionMbps)} ok={c.connectionMbps >= gates.connexionMin} unit="Mb/s" />
                </div>
              </TableCell>
              <TableCell>
                <Badge className={STATUS_CLASS[c.status]}>{CANDIDATE_STATUS_LABELS[c.status]}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
