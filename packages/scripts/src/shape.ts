/**
 * Garde-fou AVANT la conversion par Claude : la page a-t-elle la forme d'un script ? Une détection par
 * le nom peut proposer une mauvaise page (sommaire, page média, fiche) ; on la refuse ici plutôt que de
 * payer une conversion qui ne trouvera rien. VOLONTAIREMENT TOLÉRANT — refuser un vrai script est pire
 * que laisser passer une page douteuse, que la vérification du brouillon arrête ensuite (« aucun
 * message trouvé », `validateScriptDraft`).
 *
 * Marques d'un script (format des scripts de l'agence, texte de `blocksToText`) : bulle en citation
 * (« > »), étape numérotée (« #12 — … », « N1 », « E2 · »), enchaînement (⏩ ⏸️ ⏱️), média (PPV,
 * « PHOTO 2 », « VOCAL 1 », 🎙️, 🖼️). Une bulle en citation suffit (script d'une seule bulle) ; sinon
 * il faut des marques sur au moins DEUX lignes. Les lignes de sous-page ou de page liée ne comptent pas
 * (un dossier « PPV 1, PPV 2 » n'est pas un script).
 */
const BUBBLE = /^>\s*\S/
const MARKS = [
  /(^|[\s(·])#\d{1,3}\b/,
  /^(#{1,3}\s+)?[NE]\d{1,2}\b/,
  /[⏩⏸⏱🎙🖼]/u,
  /\bPPV\b/i,
  /\b(PHOTO|VID[ÉE]O|VOCAL|TEASER)\s*\d/i,
]
const LINK_LINE = /^\[(sous-page|page liée|base) /

export function looksLikeScript(text: string): boolean {
  let marked = 0
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || LINK_LINE.test(line)) continue
    if (BUBBLE.test(line)) return true
    if (MARKS.some((m) => m.test(line)) && ++marked >= 2) return true
  }
  return false
}
