'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import type { CoachingRow } from '../types'

type Sort = 'seen' | 'score' | 'name'

/** Deux initiales, comme leur pastille `.av`. */
const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

/** Palier de fraîcheur du dernier 1:1 — vert récent, orange qui traîne, rouge oublié. */
const seenClass = (gap: number | null): string =>
  gap == null ? 'cseen never' : gap <= 14 ? 'cseen ok' : gap <= 30 ? 'cseen mid' : 'cseen bad'

const scoreClass = (score: number | null): string =>
  score == null ? 'cscore' : score >= 14 ? 'cscore good' : score >= 10 ? 'cscore mid' : 'cscore bad'

/**
 * La liste du suivi. Filtrage et tri CÔTÉ CLIENT : deux cents lignes tiennent en mémoire, et
 * chercher un chatteur doit répondre à la frappe, pas au bout d'un aller-retour serveur. C'est ce
 * que fait leur écran, et c'est le bon choix à cette échelle.
 */
export function CoachingList({ rows, models }: { rows: CoachingRow[]; models: string[] }) {
  const [q, setQ] = useState('')
  const [model, setModel] = useState('')
  const [sort, setSort] = useState<Sort>('seen')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = rows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle)) return false
      if (model && !r.models.includes(model)) return false
      return true
    })
    out.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'fr')
      if (sort === 'score') {
        // Jamais noté d'abord : c'est ce qui appelle une action, pas une bonne note.
        if (a.score == null && b.score == null) return a.name.localeCompare(b.name, 'fr')
        if (a.score == null) return -1
        if (b.score == null) return 1
        return a.score - b.score
      }
      // « pas vus depuis longtemps » : jamais vus en tête, puis du plus ancien au plus récent.
      if (a.gapDays == null && b.gapDays == null) return a.name.localeCompare(b.name, 'fr')
      if (a.gapDays == null) return -1
      if (b.gapDays == null) return 1
      return b.gapDays - a.gapDays
    })
    return out
  }, [rows, q, model, sort])

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <span className="i">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un chatter…"
            autoComplete="off"
            aria-label="Chercher un chatter"
          />
        </div>
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Filtrer par modèle">
          <option value="">Tous les modèles</option>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier">
          <option value="seen">Trier : pas vus depuis longtemps</option>
          <option value="score">Trier : moyenne la plus basse</option>
          <option value="name">Trier : nom</option>
        </select>
        <span className="cnt">
          {shown.length} chatter{shown.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="clist">
        {shown.length === 0 ? (
          <p className="empty">Aucun chatter ne correspond.</p>
        ) : (
          shown.map((r) => (
            <Link key={r.profileId} className="crow" href={`/chatter/presence/suivi/${r.profileId}` as Route}>
              <span className="av">{initials(r.name)}</span>
              <span className="cmain">
                <span className="cn">{r.name}</span>
                <span className="cm">
                  {r.models.map((m) => (
                    <em key={m}>{m}</em>
                  ))}
                </span>
              </span>
              <span className={scoreClass(r.score)}>
                <b>{r.score == null ? '·' : r.score.toFixed(2).replace(/\.00$/, '')}</b>
                <em>{r.score == null ? 'jamais noté' : `${r.sessions} session${r.sessions > 1 ? 's' : ''}`}</em>
              </span>
              <span className={seenClass(r.gapDays)}>
                <b>{r.lastSeen ? frDate(r.lastSeen) : '—'}</b>
                <em>{r.gapDays == null ? 'jamais vu' : `il y a ${r.gapDays} j`}</em>
              </span>
              <span className="cflags" />
            </Link>
          ))
        )}
      </div>
    </>
  )
}

const frDate = (day: string): string =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
