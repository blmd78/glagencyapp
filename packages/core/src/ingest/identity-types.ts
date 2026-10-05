/**
 * Identité chatteur — briques partagées par le rattrapage, la résolution d'une journée et les
 * contrôles du jour. Pures : aucun accès base.
 * Spec : docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md.
 */

/** Une paire (id MyPuls, libellé) — annuaire d'une page, d'une vente, d'un relevé. */
export interface IdentityDirectoryEntry {
  mypulsUserId: string
  label: string
}

/** Types d'anomalie — miroir EXACT du `check` de `chatter_identity_issues.kind` (0183). */
export type IdentityIssueKind =
  | 'doublon'
  | 'membres_multiples'
  | 'homonyme'
  | 'conflit_id'
  | 'fiche_creee'
  | 'resume_mis_de_cote'
  | 'ecart_invariant'

export interface IdentityIssue {
  /** Clé stable d'idempotence (upsert) : une même anomalie revue chaque nuit reste UNE ligne. */
  issueKey: string
  kind: IdentityIssueKind
  mypulsUserId: string | null
  label: string | null
  chatterId: string | null
  otherChatterId: string | null
  day: string | null
  /** Euros (résumé mis de côté, écart à l'invariant), sinon null. */
  amount: number | null
  detail: string
}

// `type` et non `interface` : supabase-js type `p_issues` en `Json`, qui n'accepte que des types
// objets littéraux (une interface n'a pas de signature d'index).
export type IdentityIssueDbRow = {
  issue_key: string
  kind: IdentityIssueKind
  mypuls_user_id: string | null
  label: string | null
  chatter_id: string | null
  other_chatter_id: string | null
  day: string | null
  amount: number | null
  detail: string
  source: 'ingestion' | 'rattrapage'
}

export function identityIssueRow(i: IdentityIssue, source: IdentityIssueDbRow['source']): IdentityIssueDbRow {
  return {
    issue_key: i.issueKey,
    kind: i.kind,
    mypuls_user_id: i.mypulsUserId,
    label: i.label,
    chatter_id: i.chatterId,
    other_chatter_id: i.otherChatterId,
    day: i.day,
    amount: i.amount,
    detail: i.detail,
    source,
  }
}

/**
 * Libellé MyPuls d'une vente sans chatteur. Sa pseudo-fiche porte les ventes non attribuées de
 * TOUT un modèle : jamais d'id, jamais reliée ni fusionnée (décision Benoit 2026-10-01).
 */
export const UNDETERMINED_LABEL = /^Indéterminé \(/

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Index libellé → ids MyPuls. `idsOf` rend la correspondance EXACTE quand elle désigne un seul
 * compte, sinon la clé normalisée (qui peut en désigner plusieurs) : « yann » vaut 1163 alors que
 * « yann (accès révoqué) » normalisé désigne 243 ET 1163.
 */
export function labelIndex(
  entries: Iterable<IdentityDirectoryEntry>,
  norm: (s: string) => string,
): { idsOf(label: string): ReadonlySet<string> } {
  const exact = new Map<string, Set<string>>()
  const loose = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, k: string, id: string): void => {
    if (!k) return
    let s = m.get(k)
    if (!s) m.set(k, (s = new Set()))
    s.add(id)
  }
  for (const e of entries) {
    add(exact, e.label.trim(), e.mypulsUserId)
    add(loose, norm(e.label), e.mypulsUserId)
  }
  return {
    idsOf(label: string): ReadonlySet<string> {
      const ex = exact.get(label.trim())
      if (ex && ex.size === 1) return ex
      return loose.get(norm(label)) ?? ex ?? EMPTY
    },
  }
}
