'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { addNote, deleteNote } from '../actions'
import type { ChatterCoaching } from '../types'

/**
 * Le bloc-notes de l'encadrement sur un chatteur.
 *
 * Séparé de la fiche (règle des 300 lignes) et surtout séparé par le SENS : ces notes ne sont pas
 * visibles du chatteur — c'est ce qu'on écrit pour soi, pas ce qu'on lui dit en 1:1. La RLS de
 * 0128 le garantit côté base ; ce composant n'est simplement jamais rendu sans droit d'écriture.
 */
export function CoachNotes({ data }: { data: ChatterCoaching }) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok: string): void => {
    startTransition(async () => {
      const res = await fn()
      if (res.success) toast.success(ok)
      else toast.error(res.error ?? 'Erreur inattendue')
    })
  }

  return (
    <div className="card">
      <div className="blockh">
        <h2>Notes de l’encadrement</h2>
        <span className="cnt">non visibles du chatteur</span>
      </div>
      <div className="cardpad addnote">
        <textarea
          rows={2}
          placeholder="Ce qu'on note pour soi…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          className="btn sm"
          disabled={pending || note.trim() === ''}
          onClick={() => {
            run(() => addNote({ chatterId: data.profileId, body: note }), 'Note ajoutée')
            setNote('')
          }}
        >
          Ajouter
        </button>
      </div>
      {data.notes.map((n) => (
        <div key={n.id} className="note">
          <div className="chrow">
            <span className="chd">{frDate(n.date)}</span>
            <span className="cha">{n.author}</span>
            <button
              type="button"
              className="x"
              title="Supprimer"
              onClick={() => run(() => deleteNote({ noteId: n.id }), 'Note supprimée')}
            >
              ✕
            </button>
          </div>
          <p className="cdesc">{n.body}</p>
        </div>
      ))}
    </div>
  )
}

const frDate = (day: string): string =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
