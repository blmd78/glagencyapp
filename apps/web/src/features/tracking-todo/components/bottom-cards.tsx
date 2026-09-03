'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { frWeekdayDate } from '@glagency/core'
import { addLink, deleteLink, saveDaily, saveNotes } from '../actions-content'
import { debriefLists } from '../debrief-day'
import {
  dailyForm, linkForm, notesForm,
  type DailyFormValues, type LinkFormValues, type NotesFormValues,
} from '../schema'
import type { TodoDaily, TodoWeek } from '../types'

const DAILY_FIELDS = [
  { key: 'focus', label: 'Sur quoi tu as passé le plus de temps dans la journée', ph: 'ex. les 1:1 et la reprise des scripts de Lena' },
  { key: 'problem', label: 'Ton plus gros problème de la journée', ph: 'ex. trois chatters injoignables tout l’après-midi' },
  { key: 'positive', label: 'Un point positif de la journée', ph: 'ex. Kevin a tenu son prix sur deux objections' },
  { key: 'negative', label: 'Un point négatif de la journée', ph: 'ex. personne n’a relancé les spenders du week-end' },
  { key: 'notes', label: 'Notes libres', ph: '' },
] as const

const EMPTY_DAILY: TodoDaily = { focus: '', problem: '', positive: '', negative: '', notes: '' }

/**
 * Bilan du jour — port de leur `.card.bilan` : ce qui est coché, ce qui ne l'est pas, et le
 * débrief en cinq champs, replié dans un `<details>` comme chez eux.
 *
 * Le JOUR se choisit (sélecteur des sept jours de la semaine affichée), là où chez eux c'était
 * « toujours celui du jour ». Un encadrant qui finit à 3 h débriefe la journée qu'il vient de
 * faire ; avec le jour civil, tout basculait sur le lendemain à minuit — débrief vide, listes du
 * lendemain, enregistrement sur la mauvaise date. Pas de règle d'heure imposée : il choisit.
 * Le `<select>` natif est celui du thème (`.trk select`, repris du tracker d'origine), le même
 * que les filtres de la liste coaching (`coaching-list.tsx`). Les jours à venir sont grisés : on
 * ne débriefe pas une journée qui n'a pas eu lieu, et le Récap compterait un débrief de trop.
 */
export function DebriefCard({ week }: { week: TodoWeek }) {
  const [day, setDay] = useState(week.debriefDay)
  const lists = debriefLists(week.days, day)
  const initial = week.dailyByDay[day] ?? EMPTY_DAILY
  const filled = Object.values(initial).some((v) => v.trim() !== '')

  return (
    <div className="card bilan">
      <div className="blockh">
        <h2>Bilan du jour</h2>
        <select aria-label="Jour du bilan" value={day} onChange={(e) => setDay(e.target.value)}>
          {week.days.map((d) => (
            <option key={d.date} value={d.date} disabled={d.date > week.today}>
              {d.weekdayLabel} {d.dayLabel}
            </option>
          ))}
        </select>
      </div>
      <div className="bsplit">
        <div className="bcol ok">
          <div className="bclab">
            Tâches faites<em>{lists.done.length}</em>
          </div>
          {lists.done.length === 0 ? (
            <p className="bnone">Rien de coché ce jour-là.</p>
          ) : (
            <div className="blist">
              {lists.done.map((t, i) => (
                <div key={`${t}-${i}`} className="bn">{t}</div>
              ))}
            </div>
          )}
        </div>
        <div className="bcol ko">
          <div className="bclab">
            Pas faites<em>{lists.pending.length}</em>
          </div>
          {lists.pending.length === 0 ? (
            <p className="bnone">Rien en attente ce jour-là.</p>
          ) : (
            <div className="blist">
              {lists.pending.map((t, i) => (
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
        {/* PAS de clé par jour : remonter le formulaire à chaque changement jetterait le texte
            en cours de frappe — et corriger le jour APRÈS avoir écrit est justement le geste de
            celui qui débriefe à 3 h. Le formulaire décide lui-même quoi garder (voir DebriefForm). */}
        <DebriefForm week={week} day={day} initial={initial} />
      </details>
      )}
    </div>
  )
}

function DebriefForm({ week, day, initial }: { week: TodoWeek; day: string; initial: TodoDaily }) {
  // ⚠️ React Hook Form + React Compiler : sans ça `formState` est mémoïsé et les erreurs comme
  // l'état de chargement restent muets. Règle du dépôt.
  'use no memo'

  const [pending, startTransition] = useTransition()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DailyFormValues>({ resolver: zodResolver(dailyForm), defaultValues: initial })

  // Changement de jour, ou données rafraîchies après un geste sur la grille : CHAMP PAR CHAMP,
  // ce qu'on a tapé reste (`keepDirtyValues`), tout le reste suit le jour choisi — corriger le
  // jour après avoir écrit est le geste de celui qui débriefe à 3 h, et rien ne doit se perdre.
  // Une garde globale « formulaire sale » ne suffisait pas : les champs NON touchés gardaient le
  // débrief de l'ancien jour et écrasaient, à l'enregistrement, celui du jour cible. `initial`
  // change d'identité à chaque re-rendu serveur : mêmes valeurs rechargées, sans effet visible.
  useEffect(() => {
    reset(initial, { keepDirtyValues: true })
  }, [day, initial, reset])

  // Une journée à venir se sélectionne si c'est le jour proposé d'une semaine future (l'option
  // est grisée, mais déjà choisie) : on ne débriefe pas une journée qui n'a pas eu lieu.
  const future = day > week.today

  const save = handleSubmit((values) => {
    startTransition(async () => {
      const res = await saveDaily({ ownerId: week.ownerId, date: day, ...values })
      // Le toast NOMME le jour : après minuit, c'est la seule confirmation que le débrief est
      // parti sur la bonne journée. `reset(values)` : ce qui vient d'être enregistré devient la
      // référence — le formulaire redevient « intact », prêt à suivre un autre jour.
      if (res.success) {
        reset(values)
        toast.success(`Débrief du ${frWeekdayDate(day)} enregistré`)
      } else toast.error(res.error ?? 'Erreur inattendue')
    })
  })

  return (
    <form className="cardpad bform" onSubmit={save} noValidate>
      {DAILY_FIELDS.map((f) => (
        <div key={f.key} className="field">
          <label htmlFor={`d-${f.key}`}>{f.label}</label>
          <textarea
            id={`d-${f.key}`}
            rows={2}
            placeholder={f.ph}
            disabled={!week.canWrite || future}
            {...register(f.key)}
          />
          {errors[f.key] ? <p className="msg ko">{errors[f.key]?.message}</p> : null}
        </div>
      ))}
      {week.canWrite && !future ? (
        <div className="saverow">
          <button type="submit" className="btn sm" disabled={pending}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      ) : null}
    </form>
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
