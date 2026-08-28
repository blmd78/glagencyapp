'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { deleteHabit, renameHabit, saveHabit, setHabitActive } from '../actions'
import type { TodoHabit } from '../types'

/** Jours ISO, dans l'ordre de la semaine — 1 = lundi, comme les `weekdays` en base. */
const DAYS = [
  { n: 1, long: 'Lundi', short: 'L' },
  { n: 2, long: 'Mardi', short: 'M' },
  { n: 3, long: 'Mercredi', short: 'M' },
  { n: 4, long: 'Jeudi', short: 'J' },
  { n: 5, long: 'Vendredi', short: 'V' },
  { n: 6, long: 'Samedi', short: 'S' },
  { n: 7, long: 'Dimanche', short: 'D' },
] as const

/**
 * Les HABITUDES : les gabarits qui recréent leur tâche chaque jour choisi.
 *
 * Reprise de leur 3ᵉ onglet (todo.html:1354-1370). Tout existait chez nous — la table, la lecture,
 * les Server Actions — SAUF ce panneau : rien ne permettait d'en créer une, et les deux actions
 * étaient donc du code mort. Le sous-titre est le leur, parce qu'il dit exactement ce que ça fait.
 *
 * Écart de forme assumé : leur renommage passe par un `prompt()` natif et leur suppression par un
 * `confirm()`. On reste sur des champs et des boutons — même geste, sans dialogue bloquant du
 * navigateur (cf. la règle du projet sur les modales natives).
 */
export function HabitsPanel({
  ownerId,
  habits,
  sections,
  canWrite,
}: {
  ownerId: string
  habits: TodoHabit[]
  /** Sections existantes de la semaine, pour rattacher l'habitude — « Sans section » possible. */
  sections: string[]
  canWrite: boolean
}) {
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState('')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string): void => {
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        if (ok) toast.success(ok)
      } else toast.error(res.error ?? 'Erreur inattendue')
    })
  }

  const create = (): void => {
    // Leurs deux validations, dans leur ordre (todo.html:1423-1429).
    if (!label.trim()) {
      toast.error('Il faut un intitulé.')
      return
    }
    if (days.length === 0) {
      toast.error('Choisis au moins un jour.')
      return
    }
    run(() => saveHabit({ ownerId, label: label.trim(), category, weekdays: days }), 'Habitude créée')
    setLabel('')
    setCategory('')
    setDays([1, 2, 3, 4, 5, 6, 7])
  }

  return (
    <div className="card">
      <div className="blockh">
        <h2>Habitudes</h2>
        <span className="cnt">Une habitude crée sa tâche automatiquement, chaque jour choisi.</span>
        {canWrite ? (
          <button type="button" className="btn sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Fermer' : 'Nouvelle habitude'}
          </button>
        ) : null}
      </div>

      {open && canWrite ? (
        <div className="cardpad hform">
          <div className="field">
            <label htmlFor="ht">Nouvelle habitude</label>
            <input
              id="ht"
              value={label}
              placeholder="ex. vérifier les chatters à sanctionner"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="hc">Section</label>
            <select id="hc" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Sans section</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Quels jours</label>
            <div className="hdays">
              {DAYS.map((d) => (
                <label key={d.n} className="hd">
                  <input
                    type="checkbox"
                    checked={days.includes(d.n)}
                    onChange={(e) =>
                      setDays((prev) =>
                        e.target.checked ? [...prev, d.n].sort() : prev.filter((x) => x !== d.n),
                      )
                    }
                  />{' '}
                  {d.long}
                </label>
              ))}
            </div>
          </div>
          <button type="button" className="btn" onClick={create}>
            Créer l’habitude
          </button>
        </div>
      ) : null}

      {habits.length === 0 ? (
        <p className="empty">Aucune habitude pour l’instant.</p>
      ) : (
        <div className="cardpad">
          {habits.map((h) => (
            // `off` = en pause : leur liste les GRISE au lieu de les cacher, pour qu'on sache
            // qu'elles existent (`.grow.off{opacity:.5}`).
            <div key={h.id} className={h.active ? 'grow' : 'grow off'}>
              {renaming === h.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setRenaming(null)
                    if (e.key !== 'Enter') return
                    const v = draft.trim()
                    if (v) run(() => renameHabit({ ownerId, habitId: h.id, label: v }), 'Habitude renommée')
                    setRenaming(null)
                  }}
                  onBlur={() => setRenaming(null)}
                />
              ) : (
                <span className="hn">
                  {h.label}
                  {h.category ? <em className="cnt"> · {h.category}</em> : null}
                </span>
              )}
              <span className="hdots" aria-label={`Jours : ${h.weekdays.map((n) => DAYS[n - 1].long).join(', ')}`}>
                {DAYS.map((d) => (
                  <span key={d.n} className={h.weekdays.includes(d.n) ? 'dot on' : 'dot'} aria-hidden>
                    {d.short}
                  </span>
                ))}
              </span>
              {canWrite ? (
                <span className="hact">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      setRenaming(h.id)
                      setDraft(h.label)
                    }}
                  >
                    Renommer
                  </button>
                  {/* Leur endpoint `habit-active` existait sans aucun bouton pour l'appeler. Mettre
                      en pause sans perdre l'historique est plus utile que de supprimer. */}
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() =>
                      run(
                        () => setHabitActive({ ownerId, habitId: h.id, active: !h.active }),
                        h.active ? 'Habitude en pause' : 'Habitude reprise',
                      )
                    }
                  >
                    {h.active ? 'Mettre en pause' : 'Reprendre'}
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    title="Ce qui est déjà coché reste dans l’historique."
                    onClick={() => run(() => deleteHabit({ ownerId, habitId: h.id }), 'Habitude supprimée')}
                  >
                    Supprimer
                  </button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
