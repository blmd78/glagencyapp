'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { fmtClock, fmtDuration } from '@glagency/core'
import { getRowDetail } from '../actions'
import type { RowDetail } from '../types'

/**
 * Le contenu déplié d'une ligne, chargé au PREMIER dépliage puis mémorisé.
 *
 * Monté à l'intérieur du `<details>` natif : c'est lui qui gère l'ouverture, on ne fait qu'écouter
 * `onToggle` sur le parent. Aucun état d'ouverture n'est dupliqué côté React — le navigateur reste
 * la source de vérité, et le clavier fonctionne sans qu'on écrive une ligne pour lui.
 */
export function RowDetailPanel({
  profileId,
  shiftKey,
  date,
}: {
  profileId: string
  shiftKey: string
  date: string
}) {
  const [detail, setDetail] = useState<RowDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const load = (): void => {
    if (detail || pending) return
    startTransition(async () => {
      try {
        setDetail(await getRowDetail({ profileId, shiftKey, date }))
      } catch {
        setFailed(true)
      }
    })
  }

  return (
    <div
      className="detail"
      // On écoute le `toggle` du <details> PARENT : le panneau se charge à l'ouverture, jamais
      // avant. Un `useEffect` se déclencherait au rendu de la page — pour les 97 lignes à la fois —
      // et annulerait tout le bénéfice. Pas de préchargement au survol non plus : passer la souris
      // sur une liste de 97 lignes déclencherait des dizaines de lectures pour rien.
      ref={(node) => {
        const parent = node?.closest('details')
        if (!parent) return
        const onToggle = (): void => {
          if (parent.open) load()
        }
        parent.addEventListener('toggle', onToggle)
        if (parent.open) load()
        return () => parent.removeEventListener('toggle', onToggle)
      }}
    >
      {failed ? (
        <p className="empty">Le détail n’a pas pu être chargé.</p>
      ) : !detail ? (
        <p className="empty">Chargement…</p>
      ) : (
        <>
          <div className="dlab">Sites &amp; apps</div>
          <div className="sites">
            {detail.sites.length === 0 && detail.untrackedMinutes === 0 ? (
              <span className="pill nt">aucun site relevé</span>
            ) : null}
            {detail.sites.map((s) => (
              <span key={`${s.kind}:${s.label}`} className={s.allowed ? 'pill tool' : 'pill'}>
                {s.label}
                <em>{fmtDuration(s.minutes)}</em>
              </span>
            ))}
            {detail.untrackedMinutes > 0 ? (
              <span className="pill nt">
                non identifié<em>{fmtDuration(detail.untrackedMinutes)}</em>
              </span>
            ) : null}
          </div>

          <div className="stats">
            <Stat value={fmtDuration(detail.stats.activeMinutes)} label="Actif" />
            <Stat value={fmtDuration(detail.stats.pauseMinutes)} label="Pause" />
            <Stat value={fmtDuration(detail.stats.idleMinutes)} label="Inactif" cls="mut" />
            <Stat value={fmtDuration(detail.stats.toolMinutes)} label="Mypuls" />
            <Stat value={fmtClock(detail.stats.startedAtMs)} label="Arrivée" />
          </div>

          <div className="dlab">Timeline</div>
          <div className="tl">
            {detail.timeline.map((row) => (
              <div
                key={`${row.startMs}-${row.kind}`}
                className={row.kind === 'active' ? 'trow ' : row.kind === 'pause' ? 'trow p' : 'trow i'}
              >
                <span className="t">
                  {fmtClock(row.startMs)} → {fmtClock(row.endMs)}
                </span>
                <span className="k">
                  {row.kind === 'active' ? 'Actif' : row.kind === 'pause' ? 'Pause' : 'Inactif'}
                </span>
                <span className="d">{fmtDuration(row.minutes)}</span>
                <span className="s">
                  {row.kind === 'idle' && row.sites.length === 0 ? 'PC pas touché' : null}
                  {row.sites.map((s, i) => (
                    <span key={s.label}>
                      {i > 0 ? ' · ' : ''}
                      {s.label}
                      <em> {fmtDuration(s.minutes)}</em>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>

          <Link className="moretab" href={`/chatter/presence/${profileId}`}>
            Voir la fiche semaine / mois →
          </Link>
        </>
      )}
    </div>
  )
}

function Stat({ value, label, cls }: { value: string; label: string; cls?: string }) {
  return (
    <div className={cls ? `stat ${cls}` : 'stat'}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}
