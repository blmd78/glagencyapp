import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { frDateTimeLongParis } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ATTEMPT_STATUS_LABELS, CANDIDATE_STATUS_LABELS, type CandidateFileData, type RecruitGates } from '../types'
import { CandidateActions, CopyValue } from './recruit-actions'

/** Une mesure d'épreuve avec son seuil : vert si le gate passe, rouge sinon. */
function Measure({ label, value, min, ok }: { label: string; value: string; min: string; ok: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">
        minimum {min} {ok ? '· atteint' : '· non atteint'}
      </p>
    </div>
  )
}

/** Un axe de la notation IA, sur 25. */
function Axis({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">
        {value}
        <span className="text-sm font-normal text-muted-foreground">/25</span>
      </p>
    </div>
  )
}

/** Ligne d'une liste de détails techniques. */
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 font-medium">{children}</dd>
    </div>
  )
}

/**
 * Fiche complète d'un candidat (`?dossier=<id>`) — Server Component : tout est affiché, seules les
 * commandes (`CandidateActions`) sont une feuille cliente.
 *
 * Ordre de lecture voulu : le verdict D'ABORD (c'est la décision à prendre), puis ce qui l'explique
 * (épreuves, axes de la conversation), puis la transcription (la preuve), puis la technique.
 */
export function CandidateFile({ candidate, gates }: { candidate: CandidateFileData; gates: RecruitGates }) {
  const { attempt } = candidate
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/formation/recrutement"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Tous les candidats
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">
            {candidate.firstName} {candidate.lastName}
          </h2>
          <Badge variant={candidate.status === 'nouveau' ? 'default' : 'secondary'}>
            {CANDIDATE_STATUS_LABELS[candidate.status]}
          </Badge>
          {candidate.repeat && <Badge variant="outline">2ᵉ passage</Badge>}
          {candidate.isMember && <Badge variant="secondary">devenu membre</Badge>}
          {/* Badge réservé au blocage ADMIN : le blocage automatique de la soumission vise TOUS
              les candidats du flux nominal, l'afficher ne dirait rien. */}
          {candidate.blockedByAdmin && <Badge variant="outline">bloqué</Badge>}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Meta label="E-mail">{candidate.email}</Meta>
          <Meta label="Discord">{candidate.discord ?? '—'}</Meta>
          <Meta label="Téléphone">{candidate.phone ?? '—'}</Meta>
          <Meta label="Âge">{candidate.age !== null ? `${candidate.age} ans` : '—'}</Meta>
          <Meta label="Localisation">{candidate.location ?? '—'}</Meta>
          <Meta label="Shifts souhaités">{candidate.shifts?.length ? candidate.shifts.join(' · ') : '—'}</Meta>
          <Meta label="A connu l’agence via">{candidate.source ?? '—'}</Meta>
          <Meta label="Reçu le">{frDateTimeLongParis(candidate.createdAt)}</Meta>
        </dl>
      </div>

      <CandidateActions
        candidate={{
          id: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          status: candidate.status,
          blockedByAdmin: candidate.blockedByAdmin,
          hasBlocklistLines: candidate.hasBlocklistLines,
        }}
      />

      {/* Verdict FIGÉ à la soumission : c'est ce que le candidat a lu à l'écran, il ne bouge pas si
          un seuil change ensuite. La raison est qualitative (jamais un chiffre) — GLA. */}
      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h3 className="text-sm font-medium text-muted-foreground">Verdict rendu au candidat</h3>
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{candidate.global}</span>
          <span className="text-sm text-muted-foreground">/100</span>
          <span className={cn('font-medium', candidate.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {candidate.passed ? 'Reçu' : 'Refusé'}
          </span>
          <span className="text-sm text-muted-foreground">(seuil actuel : {gates.globalThreshold})</span>
        </p>
        {!candidate.passed && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{candidate.refusalStep ?? 'Refus'}</span> — {candidate.refusalReason ?? '—'}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Épreuves <span className="font-normal">(seuils actuels — un dossier ancien a été jugé avec ceux de son époque)</span>
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Measure
            label="Test de logique"
            value={`${candidate.qiScore}/5`}
            min={`${gates.qiMin}/5`}
            ok={candidate.qiScore >= gates.qiMin}
          />
          <Measure
            label="Vitesse de frappe"
            value={`${candidate.typingWpm} mots/min`}
            min={`${gates.frappeMin} mots/min`}
            ok={candidate.typingWpm >= gates.frappeMin}
          />
          <Measure
            label="Connexion"
            value={`${candidate.connectionMbps} Mb/s`}
            min={`${gates.connexionMin} Mb/s`}
            ok={candidate.connectionMbps >= gates.connexionMin}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Conversation notée par l’IA — {candidate.botTotal}/100
        </h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Axis label="Orthographe" value={candidate.orthographe} />
          <Axis label="Cohérence" value={candidate.coherence} />
          <Axis label="Relance" value={candidate.relance} />
          <Axis label="Vente" value={candidate.vente} />
        </div>
      </section>

      <Transcript candidate={candidate} />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Tentative</h3>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Meta label="Commencée le">{frDateTimeLongParis(attempt.startedAt)}</Meta>
          <Meta label="État">{ATTEMPT_STATUS_LABELS[attempt.status] ?? attempt.status}</Meta>
          <Meta label="Navigateur">
            <span className="font-mono text-xs">{attempt.device}</span>
            <CopyValue value={attempt.device} label="Identifiant du navigateur" />
          </Meta>
          <Meta label="IP">
            {attempt.ip ? (
              <>
                <span className="font-mono text-xs">{attempt.ip}</span>
                <CopyValue value={attempt.ip} label="IP" />
              </>
            ) : (
              '—'
            )}
          </Meta>
          <Meta label="Coût IA">
            <span className="tabular-nums">
              {attempt.inputTokens.toLocaleString('fr-FR')} entrée · {attempt.outputTokens.toLocaleString('fr-FR')} sortie
            </span>
          </Meta>
        </dl>
      </section>
    </div>
  )
}

/**
 * Transcription serveur de la conversation avec le fan IA, dans l'ordre (`position`). Rendu chat
 * minimal, sans librairie : le fan à gauche (c'est lui qui mène), le candidat à droite. Un média
 * verrouillé (mécanique GLA `[MEDIA VERROUILLE - X€]`) est rendu comme tel, avec son prix.
 */
function Transcript({ candidate }: { candidate: CandidateFileData }) {
  const { messages, attempt } = candidate
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Conversation avec « {attempt.persona} » — {attempt.botReplies} réponses du client
      </h3>
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun message enregistré.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                m.speaker === 'client' ? 'self-start bg-muted' : 'self-end border',
              )}
            >
              <p className="mb-0.5 text-xs text-muted-foreground">{m.speaker === 'client' ? attempt.persona : 'Candidat'}</p>
              {m.mediaPrice === null ? (
                <p className="whitespace-pre-wrap">{m.body}</p>
              ) : (
                <p className="italic text-muted-foreground">Média verrouillé — {m.mediaPrice} €</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
