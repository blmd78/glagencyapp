import type { RecapPerson } from '../services/get-week-recap'

/** Palier de complétion — leur `.bstat.low` sous 50 %. */
const statClass = (percent: number): string => (percent < 50 ? 'bstat low' : 'bstat')

/**
 * Débriefs : tous déposés, une partie, aucun — et NEUTRE quand rien n'est encore attendu.
 * `expected` vaut 0 sur une semaine qui n'a pas commencé : « 0/0 » en rouge reprocherait un retard
 * sur du travail qui n'est pas dû.
 */
const debClass = (done: number, expected: number): string =>
  expected === 0 ? 'rdeb' : done >= expected ? 'rdeb ok' : done > 0 ? 'rdeb part' : 'rdeb ko'

/**
 * Une carte d'encadrant : sa complétion, ses compteurs, ses débriefs — et le détail jour par jour
 * quand on la déplie. `<details>` natif, comme partout ailleurs.
 *
 * Le détail n'existe que pour un admin et pour son propre journal (`person.verbatim`, miroir de
 * la RPC 0137). Un manager lit les COMPTEURS de ses sous-managers, jamais le texte : on le dit
 * en clair plutôt que de servir sept colonnes « Pas de débrief » qui contrediraient le compteur.
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
        {!person.verbatim ? (
          <div className="rday vide">
            <p className="bnone">Détail des débriefs réservé à la direction.</p>
          </div>
        ) : null}
        {person.days.map((d) => (
          <div key={d.date} className={d.filled ? 'rday' : 'rday vide'}>
            <div className="rdlab">{d.label}</div>
            {/* `rdbrief` et NON `rdetail` : cette dernière est un `display:flex` en ligne, posé
                pour la saisie des compétences du suivi — les cinq champs du débrief s'y
                affichaient côte à côte sur une seule ligne au lieu de s'empiler. */}
            {!d.filled ? (
              <p className="bnone">Pas de débrief.</p>
            ) : (
              <div className="rdbrief">
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
