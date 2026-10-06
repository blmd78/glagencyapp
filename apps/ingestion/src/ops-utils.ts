// Petits utilitaires partagés par les CLI ops (identity-backfill, recette-identite).

/**
 * CSV simple (séparateur `,`), valeurs objet en JSON, guillemets échappés.
 * - `columns` explicite : l'en-tête est écrit même sans ligne (un rapport vide se distingue d'un
 *   rapport raté) ; sans lui, les colonnes sont l'union des clés des lignes.
 * - Une valeur TEXTE qui commence par `=`, `+`, `-`, `@` (ou tabulation / retour chariot) est
 *   préfixée d'une apostrophe : les libellés viennent d'utilisateurs MyPuls et un tableur les
 *   exécuterait comme une formule. Les nombres ne sont pas touchés (« -12.5 » reste un nombre).
 * - Le texte commence par un BOM UTF-8 : sans lui Excel lit les accents en Latin-1.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))]
  if (!cols.length) return ''
  const quote = (s: string): string => (/[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const cell = (v: unknown): string => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return quote(s)
  }
  return '﻿' + [cols.map(quote).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
}

/** Déballe un résultat `fetchAll` : lève avec le nom de la table plutôt que de rendre des maps vides. */
export async function rows<T>(
  what: string,
  p: PromiseLike<{ data: T[]; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await p
  if (error) throw new Error(`${what} : ${error.message}`)
  return data
}
