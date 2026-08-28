'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { todayParis } from '@glagency/core'
import { deleteSession, rateSkill, saveSession } from '../actions'
import { completeOneToOne } from '@/lib/tracking/complete-one-to-one'
import { useRouter } from 'next/navigation'
import { sessionForm, type SessionFormInput, type SessionFormValues } from '../schema'
import { CoachNotes } from './coach-notes'
import type { ChatterCoaching } from '../types'

/** Étoiles : cliquables quand on peut écrire, en lecture seule dans l'historique. */
function Stars({
  value,
  onPick,
}: {
  value: number | null
  onPick?: (n: number) => void
}) {
  return (
    <span className={onPick ? 'rate stars' : 'stars'}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button
            key={n}
            type="button"
            className={value != null && n <= value ? 'star on' : 'star'}
            title={`${n}/5`}
            onClick={(e) => {
              e.preventDefault()
              onPick(n)
            }}
          >
            ★
          </button>
        ) : (
          <span key={n} className={value != null && n <= value ? 'star ro on' : 'star ro'}>
            ★
          </span>
        ),
      )}
    </span>
  )
}

/**
 * La fiche de suivi d'un chatteur — port de `/notes/:id`.
 *
 * Les avertissements de leur en-tête ne sont PAS repris (décision du 2026-08-27) : les sanctions
 * relèvent du Tracker police, pas du coaching.
 */
export function ChatterFile({
  data,
  bilanTaskId,
  viewerId,
}: {
  data: ChatterCoaching
  /**
   * Non nul = on arrive d'une tâche « 1:1 » de la To-Do. Le formulaire s'ouvre d'office, et
   * l'enregistrement clôt la tâche au lieu de créer une session isolée — c'est l'aller-retour
   * du legacy (`/notes/:id?bilan=<taskId>` puis retour sur `/todo`).
   */
  bilanTaskId?: string | null
  /** Id du VISITEUR — c'est lui le titulaire de la tâche 1:1 qu'on vient clôturer. */
  viewerId?: string
}) {
  // ⚠️ OBLIGATOIRE avec React Hook Form : le React Compiler mémoïse `formState`, qui devient muet
  // — plus d'erreurs sous les champs, plus d'état de chargement. Règle du dépôt.
  'use no memo'

  const [pending, startTransition] = useTransition()
  const [openSession, setOpenSession] = useState(!!bilanTaskId)
  const router = useRouter()
  /**
   * Les compétences COCHÉES pour cette session, avec leur note et leur « pourquoi ». Une clé
   * absente = compétence non travaillée : elle n'est pas transmise et garde son niveau.
   * Décocher SUPPRIME la saisie (étoiles remises à zéro, champ vidé) — c'est leur `toggleCat`
   * (notes-67.html:1009-1015), et ça évite d'envoyer une note qu'on croyait avoir retirée.
   */
  const [picks, setPicks] = useState<Record<string, { stars: number; comment: string }>>({})
  const togglePick = (skillId: string, on: boolean) =>
    setPicks((p) => {
      const next = { ...p }
      if (on) next[skillId] = { stars: 0, comment: '' }
      else delete next[skillId]
      return next
    })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SessionFormInput, unknown, SessionFormValues>({
    resolver: zodResolver(sessionForm),
    defaultValues: { date: todayParis(), score: '', summary: '', general: '' },
  })

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string): void => {
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        if (ok) toast.success(ok)
      } else toast.error(res.error ?? 'Erreur inattendue')
    })
  }

  // La saisie est déjà validée et convertie par le resolver : `values.score` est un nombre ou
  // `null`, plus une chaîne à rattraper à la main.
  const submitSession = handleSubmit((values) => {
    // « Mets une note à « X », ou décoche-la. » — leur validation (notes-67.html:1084). Une
    // compétence cochée sans étoile n'a aucun sens : on ne l'envoie pas en silence.
    const sansNote = data.skills.find((sk) => picks[sk.id] && picks[sk.id].stars === 0)
    if (sansNote) {
      toast.error(`Mets une note à « ${sansNote.name} », ou décoche-la.`)
      return
    }
    const ratings = Object.entries(picks).map(([skillId, p]) => ({ skillId, stars: p.stars, comment: p.comment }))
    if (bilanTaskId) {
      // Arrivée depuis la To-Do : la session ET la coche partent ensemble, puis on rend la main à
      // la to-do — comme leur `saveBilan`, qui poste sur `/api/todo/done` et repart sur `/todo`.
      startTransition(async () => {
        const res = await completeOneToOne({ ownerId: viewerId, taskId: bilanTaskId, ...values, ratings })
        if (!res.success) {
          toast.error(res.error ?? 'Erreur inattendue')
          return
        }
        toast.success('1:1 clôturé — le bilan est dans sa fiche')
        router.push('/chatter/presence/todo')
      })
      return
    }
    run(
      () => saveSession({ chatterId: data.profileId, ...values, ratings }),
      'Session enregistrée',
    )
    setOpenSession(false)
    reset()
    setPicks({})
  })

  return (
    <div className="wrap">
      <div className="fhead">
        <div className={data.average == null ? 'fscore' : data.average >= 14 ? 'fscore good' : data.average >= 10 ? 'fscore mid' : 'fscore bad'}>
          <b>{data.average == null ? '·' : data.average.toFixed(2).replace(/\.00$/, '')}</b>
          <span>moyenne / 20</span>
          <em>
            {data.scoredSessions} session{data.scoredSessions > 1 ? 's' : ''} notée
            {data.scoredSessions > 1 ? 's' : ''}
          </em>
        </div>
        <div className="fstat">
          <b>{data.lastSessionDate ? frDate(data.lastSessionDate) : '—'}</b>
          <span>dernier 1:1</span>
          <em>{data.gapDays == null ? 'jamais' : `il y a ${data.gapDays} j`}</em>
        </div>
        <div className="fstat">
          <b>{data.totalSessions}</b>
          <span>sessions au total</span>
          <em>{data.models.join(', ') || 'sans modèle'}</em>
        </div>
      </div>

      {data.canWrite ? (
        <div className="card">
          <div className="blockh">
            <h2>{openSession ? 'Nouvelle session 1:1' : 'Session 1:1'}</h2>
            <span className="cnt">tout est enregistré d’un bloc</span>
            <button type="button" className="btn sm" onClick={() => setOpenSession((v) => !v)}>
              {openSession ? 'Annuler' : 'Démarrer'}
            </button>
          </div>
          {openSession ? (
            <form className="cardpad bform" onSubmit={submitSession} noValidate>
              <div className="field" style={{ maxWidth: 200 }}>
                <label htmlFor="bd">Date du 1:1</label>
                <input id="bd" type="date" {...register('date')} />
                {errors.date ? <p className="msg ko">{errors.date.message}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="bs">Note de la session, sur 20</label>
                <input id="bs" inputMode="decimal" placeholder="ex. 13,5" {...register('score')} />
                {errors.score ? <p className="msg ko">{errors.score.message}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="bt">Ce qui s’est passé pendant l’appel</label>
                <textarea id="bt" rows={3} {...register('summary')} />
                {errors.summary ? <p className="msg ko">{errors.summary.message}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="gen">Tout ce qui n’entre dans aucune compétence</label>
                <textarea id="gen" rows={2} {...register('general')} />
                {errors.general ? <p className="msg ko">{errors.general.message}</p> : null}
              </div>
              <div className="field">
                <label>Compétences travaillées pendant cette session</label>
                <p className="cnt">Coche seulement celles que tu as vues. Les autres gardent leur niveau.</p>
              </div>
              <div className="rategrid">
                {data.skills.map((s) => (
                  <span key={s.id} className={picks[s.id] ? 'rchip on' : 'rchip'}>
                    <label title={s.description ?? undefined}>
                      <input
                        type="checkbox"
                        checked={!!picks[s.id]}
                        onChange={(e) => togglePick(s.id, e.target.checked)}
                      />{' '}
                      {s.name}
                    </label>
                    {picks[s.id] ? (
                      <>
                        <Stars
                          value={picks[s.id].stars || null}
                          onPick={(n) => setPicks((p) => ({ ...p, [s.id]: { ...p[s.id], stars: n } }))}
                        />
                        <input
                          className="why"
                          placeholder="Pourquoi cette note ?"
                          value={picks[s.id].comment}
                          onChange={(e) =>
                            setPicks((p) => ({ ...p, [s.id]: { ...p[s.id], comment: e.target.value } }))
                          }
                        />
                      </>
                    ) : null}
                  </span>
                ))}
              </div>
              <div className="saverow">
                <button type="submit" className="btn" disabled={pending}>
                  {pending ? 'Enregistrement…' : 'Enregistrer la session'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <div className="blockh">
          <h2>Compétences</h2>
          <span className="cnt">la note la plus récente fait foi</span>
        </div>
        {data.skills.length === 0 ? (
          <p className="empty">La grille de compétences est vide.</p>
        ) : (
          data.skills.map((s) => (
            <details key={s.id} className="cat">
              <summary className="cath">
                <span className="caret">▸</span>
                <span className="nm">{s.name}</span>
                <span className="nb">
                  {s.history.length} note{s.history.length > 1 ? 's' : ''}
                </span>
                <Stars
                  value={s.current}
                  onPick={
                    data.canWrite
                      ? (n) =>
                          run(
                            () => rateSkill({ chatterId: data.profileId, skillId: s.id, stars: n, comment: '', sessionId: null }),
                            'Note ajoutée',
                          )
                      : undefined
                  }
                />
              </summary>
              <div className="catbody">
                {s.description ? <p className="cdesc">{s.description}</p> : null}
                <div className="chist">
                  <div className="chlab">Historique des notes</div>
                  {s.history.length === 0 ? (
                    <p className="bnone">Jamais notée.</p>
                  ) : (
                    s.history.map((h) => (
                      <div key={h.id} className="chrow">
                        <span className="chd">{frDate(h.date)}</span>
                        <Stars value={h.stars} />
                        <span className="cha">{h.author}</span>
                        <span className="chc">{h.comment}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </details>
          ))
        )}
      </div>

      <div className="card">
        <div className="blockh">
          <h2>Sessions</h2>
          <span className="cnt">{data.totalSessions} au total</span>
        </div>
        {data.sessions.length === 0 ? (
          <p className="empty">Aucune session pour l’instant.</p>
        ) : (
          data.sessions.map((s) => (
            <div key={s.id} className="sess">
              <div className="chrow">
                <span className="chd">{frDate(s.date)}</span>
                <span className="cha">{s.author}</span>
                <b>{s.score == null ? '—' : `${s.score}/20`}</b>
                {data.canWrite ? (
                  <button
                    type="button"
                    className="x"
                    title="Supprimer la session"
                    onClick={() => run(() => deleteSession({ sessionId: s.id }), 'Session supprimée')}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
              {s.summary ? <p className="cdesc">{s.summary}</p> : null}
              {s.general ? <p className="cdesc">{s.general}</p> : null}
            </div>
          ))
        )}
      </div>

      {data.canWrite ? <CoachNotes data={data} /> : null}
    </div>
  )
}

const frDate = (day: string): string =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
