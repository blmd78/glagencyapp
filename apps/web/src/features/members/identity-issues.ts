import type {
  IdentityData,
  IdentityIssueRow,
  ReliabilityDay,
  UnattributedSale,
  UnrankedChatter,
} from './types'

/**
 * Assemblage pur de l'onglet « Fiches MyPuls » (spec § 7). `Record` sur le type d'anomalie : un
 * type ajouté en base sans section ici casse le typecheck au lieu de disparaître de l'écran.
 */
const SECTION: Record<IdentityIssueRow['kind'], 'doubles' | 'nouvelles' | 'montants'> = {
  doublon: 'doubles',
  membres_multiples: 'doubles',
  homonyme: 'doubles',
  conflit_id: 'doubles',
  fiche_creee: 'nouvelles',
  resume_mis_de_cote: 'montants',
  ecart_invariant: 'montants',
}

/** Libellés des contrôles de fiabilité (codes de `ingest_day_checks.checks`, 0183). */
export const CHECK_LABEL: Record<string, string> = {
  a_resume_ventes: 'Résumé = ventes, par compte',
  b_resume_ecrit: 'Résumé écrit en base',
  b_ventes_ecrites: 'Ventes écrites en base',
  b_total_page: 'Total de la page MyPuls',
  c_fiche_compte: 'Une fiche = un compte',
  c_lien_refuse: 'Id MyPuls non posé',
}

export function buildIdentityData(input: {
  rows: IdentityIssueRow[]
  sales: UnattributedSale[]
  days: ReliabilityDay[]
  unranked: UnrankedChatter[]
}): IdentityData {
  // Du plus récent au plus ancien, quel que soit l'ordre reçu : le « dernier relevé » est le jour
  // MAX, pas le premier élément renvoyé par le RPC (l'ordre SQL n'est pas un contrat du type).
  const history = [...input.days].sort((a, b) => b.day.localeCompare(a.day))
  const out: IdentityData = {
    reliability: { latest: history[0] ?? null, history },
    unranked: [...input.unranked].sort((a, b) => b.ca - a.ca || a.name.localeCompare(b.name)),
    doubles: [],
    nouvelles: [],
    montants: [],
    ventesSansChatteur: { total: 0, rows: [] },
  }
  for (const r of input.rows) out[SECTION[r.kind]].push(r)
  for (const k of ['doubles', 'nouvelles', 'montants'] as const) {
    out[k].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id))
  }
  const ventes = [...input.sales].sort((a, b) => b.ca - a.ca || a.creatorName.localeCompare(b.creatorName))
  out.ventesSansChatteur = { total: Math.round(ventes.reduce((s, r) => s + r.ca, 0) * 100) / 100, rows: ventes }
  return out
}
