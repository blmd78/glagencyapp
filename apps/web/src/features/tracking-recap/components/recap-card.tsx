import type { RecapPerson } from '../services/get-week-recap'

/** Palier de complétion — leur `.bstat.low` sous 50 %. */
const statClass = (percent: number): string => (percent < 50 ? 'bstat low' : 'bstat')

/** Débriefs : tous déposés, une partie, aucun. */
const debClass = (done: number, expected: number): string =>
  done >= expected && expected > 0 ? 'rdeb ok' : done > 0 ? 'rdeb part' : 'rdeb ko'

/**
 * Une carte d'encadrant : sa complétion, ses compteurs, ses débriefs — et le détail jour par jour
 * quand on la déplie. `<details>` natif, comme partout ailleurs.
 */
export function RecapCard({ person }: { person: RecapPerson }) {
  return (
    <details className="rcard">
      <summary className="rhead">
        <span className="rn">
          {person.name}
          <em>{person.role}</em>
        </span>
        <span className={statClass(person.percent)}>
          <span className="bbar">
            <i style={{ width: `${person.percent}%` }} />
          </span>
          <span className="bv">{person.percent} %</span>
        </span>
        <span className="rnums">
          <b>{person.planned}</b>
          <em>prévues</em>
          <b className="ok">{person.done}</b>
          <em>faites</em>
          <b className="ko">{person.notDone}</b>
          <em>pas faites</em>
        </span>
        <span className={debClass(person.debriefs, person.expectedDebriefs)}>
          {person.debriefs}/{person.expectedDebriefs} débriefs
        </span>
      </summary>
      <div className="rdays">
        {person.days.map((d) => (
          <div key={d.date} className={d.filled ? 'rday' : 'rday vide'}>
            <div className="rdlab">{d.label}</div>
            {!d.filled ? (
              <p className="bnone">Pas de débrief.</p>
            ) : (
              <div className="rdetail">
                {d.focus ? <p><b>Temps passé :</b> {d.focus}</p> : null}
                {d.problem ? <p><b>Problème :</b> {d.problem}</p> : null}
                {d.positive ? <p><b>Positif :</b> {d.positive}</p> : null}
                {d.negative ? <p><b>Négatif :</b> {d.negative}</p> : null}
                {d.notes ? <p><b>Notes :</b> {d.notes}</p> : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}
