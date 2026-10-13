/**
 * Les jours d'une section, tels que la base les stocke : du TEXTE, « 1,2,5 » (0127).
 *
 * `saveSection` faisait un upsert qui REMPLAÇAIT cette chaîne par le seul jour cliqué. Or le
 * seul appelant est le « + section récurrente » d'une colonne, qui n'envoie jamais qu'un jour :
 * retaper le nom d'une section existante depuis un autre jour la DÉPLAÇAIT au lieu de l'étendre,
 * et le jour d'origine perdait sa section sans que rien ne le dise. Aucune UI ne permettait de
 * rattraper le coup — il n'existe pas d'écran d'édition des jours d'une section.
 *
 * On fusionne donc. Conséquence assumée : on n'enlève pas un jour par ce chemin ; on ne le
 * pouvait pas davantage avant, et « Retirer la section » reste là pour tout enlever.
 */
export function mergeWeekdays(existing: string, add: readonly number[]): string {
  const days = new Set<number>()
  for (const part of existing.split(',')) {
    const n = Number(part.trim())
    // Une chaîne vide (section ponctuelle) ou mal formée ne doit pas produire un `NaN` qui
    // ressortirait tel quel dans la colonne.
    if (Number.isInteger(n) && n >= 1 && n <= 7) days.add(n)
  }
  for (const n of add) if (Number.isInteger(n) && n >= 1 && n <= 7) days.add(n)
  return [...days].sort((a, b) => a - b).join(',')
}

/**
 * La date de début d'une section quand on la retape depuis une colonne (0194, #163). Une section
 * importée avant 0196 n'apparaît qu'à partir du 1er jour du fichier ; la redemander depuis un jour ANTÉRIEUR
 * réussissait sans rien afficher. On ramène donc sa date de début à ce jour-là. Rend `undefined`
 * quand rien ne change — sans date (partout, comme toute section d'avant 0194) ou déjà visible.
 */
export function startAfterAdd(current: string | null | undefined, fromDate: string | undefined): string | undefined {
  if (!current || !fromDate) return undefined
  return fromDate < current ? fromDate : undefined
}

