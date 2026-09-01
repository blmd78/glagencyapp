'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { addLink, deleteLink, saveDaily, saveNotes } from '../actions-content'
import {
  dailyForm, linkForm, notesForm,
  type DailyFormValues, type LinkFormValues, type NotesFormValues,
} from '../schema'
import type { TodoWeek } from '../types'

const DAILY_FIELDS = [
  { key: 'focus', label: "Sur quoi tu as passé le plus de temps aujourd'hui", ph: 'ex. les 1:1 et la reprise des scripts de Lena' },
  { key: 'problem', label: 'Ton plus gros problème de la journée', ph: 'ex. trois chatters injoignables tout l’après-midi' },
  { key: 'positive', label: 'Un point positif de la journée', ph: 'ex. Kevin a tenu son prix sur deux objections' },
  { key: 'negative', label: 'Un point négatif de la journée', ph: 'ex. personne n’a relancé les spenders du week-end' },
  { key: 'notes', label: 'Notes libres', ph: '' },
] as const

/**
 * Bilan du jour — port de leur `.card.bilan` : ce qui est coché, ce qui ne l'est pas, et le
 * débrief en cinq champs, replié dans un `<details>` comme chez eux.
 */
export function DebriefCard({ week }: { week: TodoWeek }) {
  // ⚠️ React Hook Form + React Compiler : sans ça `formState` est mémoïsé et les erreurs comme
  // l'état de chargement restent muets. Règle du dépôt.
  'use no memo'

  const [pending, startTransition] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DailyFormValues>({ resolver: zodResolver(dailyForm), defaultValues: week.daily })
  const filled = Object.values(week.daily).some((v) => v.trim() !== '')

  const save = handleSubmit((values) => {
    startTransition(async () => {
      const res = await saveDaily({ ownerId: week.ownerId, date: week.today, ...values })
      if (res.success) toast.success('Débrief enregistré')
      else toast.error(res.error ?? 'Erreur inattendue')
    })
  })

  const dayLabel = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(`${week.today}T12:00:00Z`))

  return (
    <div className="card bilan">
      <div className="blockh">
        <h2>Bilan du jour</h2>
        <span className="cnt">{dayLabel}</span>
      </div>
      <div className="bsplit">
        <div className="bcol ok">
          <div className="bclab">
            Tâches faites<em>{week.doneToday.length}</em>
          </div>
          {week.doneToday.length === 0 ? (
            <p className="bnone">Rien de coché aujourd’hui.</p>
          ) : (
            <div className="blist">
              {week.doneToday.map((t, i) => (
                <div key={`${t}-${i}`} className="bn">{t}</div>
              ))}
            </div>
          )}
        </div>
        <div className="bcol ko">
          <div className="bclab">
            Pas faites<em>{week.pendingToday.length}</em>
          </div>
          {week.pendingToday.length === 0 ? (
            <p className="bnone">Rien en attente aujourd’hui.</p>
          ) : (
            <div className="blist">
              {week.pendingToday.map((t, i) => (
                <div key={`${t}-${i}`} className="bn">{t}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!week.journalLisible ? (
        <div className="cardpad">
          <p className="bnone">Le débrief du jour est personnel : seuls son auteur et la direction le lisent.</p>
        </div>
      ) : (
      <details className="bself">
        <summary>
          <span className="blab">Mon débrief</span>
          <span className="bstate">{filled ? 'rempli' : 'à remplir'}</span>
        </summary>
        <form className="cardpad bform" onSubmit={save} noValidate>
          {DAILY_FIELDS.map((f) => (
            <div key={f.key} className="field">
              <label htmlFor={`d-${f.key}`}>{f.label}</label>
              <textarea
                id={`d-${f.key}`}
                rows={2}
                placeholder={f.ph}
                disabled={!week.canWrite}
                {...register(f.key)}
              />
              {errors[f.key] ? <p className="msg ko">{errors[f.key]?.message}</p> : null}
            </div>
          ))}
          {week.canWrite ? (
            <div className="saverow">
              <button type="submit" className="btn sm" disabled={pending}>
                {pending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          ) : null}
        </form>
      </details>
      )}
    </div>
  )
}

/** Bloc-notes de la semaine — « ce qui ne rentre pas dans une case ». */
export function WeekNotes({ week }: { week: TodoWeek }) {
  'use no memo'

  const [pending, startTransition] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NotesFormValues>({
    resolver: zodResolver(notesForm),
    defaultValues: { body: week.notes },
  })

  const save = handleSubmit((values) => {
    startTransition(async () => {
      const res = await saveNotes({ ownerId: week.ownerId, week: week.weekStart, body: values.body })
      if (res.success) toast.success('Bloc-notes enregistré')
      else toast.error(res.error ?? 'Erreur inattendue')
    })
  })

  return (
    <div className="card">
      <div className="blockh">
        <h2>Bloc-notes de la semaine</h2>
        <span className="cnt">ce qui ne rentre pas dans une case</span>
        {week.canWrite ? (
          <button type="submit" form="weeknotes" className="btn sm" disabled={pending}>
            {pending ? '…' : 'Enregistrer'}
          </button>
        ) : null}
      </div>
      {!week.journalLisible ? (
        <div className="cardpad">
          <p className="bnone">Bloc-notes personnel : seuls son auteur et la direction le lisent.</p>
        </div>
      ) : (
        <form id="weeknotes" className="cardpad" onSubmit={save} noValidate>
          <textarea
            className="scratch"
            placeholder="Idées, points à remonter, à creuser la semaine prochaine…"
            disabled={!week.canWrite}
            {...register('body')}
          />
          {errors.body ? <p className="msg ko">{errors.body.message}</p> : null}
        </form>
      )}
    </div>
  )
}

/** Liens utiles — raccourcis personnels. */
export function LinksCard({ week }: { week: TodoWeek }) {
  'use no memo'

  const [pending, startTransition] = useTransition()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkForm),
    defaultValues: { label: '', url: '' },
  })

  const add = handleSubmit((values) => {
    startTransition(async () => {
      const res = await addLink({ ownerId: week.ownerId, ...values })
      if (res.success) reset()
      else toast.error(res.error ?? 'Erreur inattendue')
    })
  })

  const remove = (linkId: string): void => {
    startTransition(async () => {
      const res = await deleteLink({ ownerId: week.ownerId, linkId })
      if (!res.success) toast.error(res.error ?? 'Erreur inattendue')
    })
  }

  return (
    <div className="card">
      <div className="blockh">
        <h2>Liens utiles</h2>
        <span className="cnt">
          {week.links.length} raccourci{week.links.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="links">
        {week.links.map((l) => (
          <div key={l.id} className="lrow">
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
            <span className="lu">{l.url.replace(/^https?:\/\//, '')}</span>
            {week.canWrite ? (
              <button type="button" className="x on" onClick={() => remove(l.id)} title="Supprimer">
                ✕
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {week.canWrite ? (
        <form className="cardpad laddrow" onSubmit={add} noValidate>
          <input placeholder="Nom (ex. Infloww)" {...register('label')} />
          <input placeholder="adresse du site" {...register('url')} />
          <button type="submit" className="btn sm" disabled={pending}>
            Ajouter
          </button>
          {errors.label ? <p className="msg ko">{errors.label.message}</p> : null}
          {errors.url ? <p className="msg ko">{errors.url.message}</p> : null}
        </form>
      ) : null}
    </div>
  )
}
