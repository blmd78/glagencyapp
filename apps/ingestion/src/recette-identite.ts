import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createAdminClient, fetchAll } from '@glagency/db'
import { compareReplay, type ReplayDayDiff, type ReplayIssue, type ReplaySnapshot } from '@glagency/core'
import { loadEnv } from './env'
import { rows } from './ops-utils'

// Recette de non-régression de l'identité chatteur — spec § 8 (D14), procédure : plan, Task 14.
//
// Usage :
//   tsx src/recette-identite.ts photo <AAAA-MM-JJ> <dossier>   photo du jour → <dossier>/<jour>.json
//   tsx src/recette-identite.ts compare <avant> <apres> <rapport.md>
//       compare chaque jour présent dans <apres> ; écrit le rapport ; sort en code 1 si un jour
//       est refusé (mouvement inexpliqué ou total qui change).
// Chemins relatifs à la racine du dépôt (comme identity-backfill) ; les chemins absolus passent aussi.
// Base visée = SUPABASE_URL / SUPABASE_SECRET_KEY (la recette tourne sur l'UAT : préfixer `uat`).
//
// Les photos sont en JSON (pas en CSV) : `toCsv` écrit un BOM et préfixe d'une apostrophe les libellés
// qui commencent par = + - @ — une relecture CSV devrait défaire les deux. Le JSON relit exactement ce
// qui a été écrit.

interface Photo {
  snapshot: ReplaySnapshot
  issues: ReplayIssue[]
  check: { status: string; checks: { code: string; ok: boolean; detail: string }[] } | null
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const cents = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100)
const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',')
/** Une cellule de tableau Markdown : les libellés viennent de MyPuls, un `|` casserait la ligne. */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')

async function photo(day: string, dir: string): Promise<void> {
  // Un jour mal tapé donnerait une photo vide, que la comparaison lirait comme « 0 € des deux côtés ».
  if (!DAY_RE.test(day)) throw new Error(`jour invalide « ${day} » (attendu AAAA-MM-JJ)`)
  const db = createAdminClient()
  const [cd, ccd, chatters, issues, check] = await Promise.all([
    rows('chatter_daily', fetchAll((f, t) =>
      db.from('chatter_daily').select('chatter_id, ca').eq('date', day).order('chatter_id').range(f, t))),
    rows('chatter_creator_daily', fetchAll((f, t) =>
      db.from('chatter_creator_daily').select('chatter_id, creator_id, ca').eq('date', day)
        .order('chatter_id').order('creator_id').range(f, t))),
    rows('chatters', fetchAll((f, t) =>
      db.from('chatters').select('id, display_name, mypuls_user_id').order('id').range(f, t))),
    rows('chatter_identity_issues', fetchAll((f, t) =>
      db.from('chatter_identity_issues').select('id, kind, mypuls_user_id, chatter_id, other_chatter_id, day, label, amount')
        .is('resolved_at', null).order('id').range(f, t))),
    db.from('ingest_day_checks').select('status, checks').eq('day', day).maybeSingle(),
  ])
  if (check.error) throw new Error(`ingest_day_checks : ${check.error.message}`)
  const sumBy = (rs: { chatter_id: string; ca: number | string | null }[]) => {
    const out: Record<string, number> = {}
    for (const r of rs) out[r.chatter_id] = (out[r.chatter_id] ?? 0) + cents(r.ca)
    return out
  }
  const p: Photo = {
    snapshot: {
      day,
      cd: sumBy(cd),
      ccd: sumBy(ccd),
      fiches: Object.fromEntries(chatters.map((c) => [c.id, { name: c.display_name, mypulsUserId: c.mypuls_user_id ?? null }])),
    },
    issues: issues.map((i) => ({
      kind: i.kind as ReplayIssue['kind'],
      mypulsUserId: i.mypuls_user_id,
      chatterId: i.chatter_id,
      otherChatterId: i.other_chatter_id,
      day: i.day,
      label: i.label,
      amount: i.amount === null ? null : Number(i.amount),
    })),
    check: (check.data as Photo['check']) ?? null,
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `${day}.json`), JSON.stringify(p))
  console.log(`[recette] photo ${day} → ${dir} (${Object.keys(p.snapshot.cd).length} fiches résumé, ${Object.keys(p.snapshot.ccd).length} fiches ventes)`)
}

function render(results: { diff: ReplayDayDiff; check: Photo['check'] }[], sansApres: string[]): string {
  const refused = results.filter((r) => !r.diff.ok)
  const toCheck = results.filter((r) => r.check?.status !== 'ok')
  const unexplained = results.flatMap((r) => r.diff.moves.filter((m) => m.reason === null))
  const lines = [
    '# Recette de non-régression — identité chatteur',
    '',
    `**Verdict : ${refused.length ? 'REFUSÉE' : 'ACCEPTABLE'}** — ${results.length} jour(s), ${refused.length} refusé(s), ${unexplained.length} mouvement(s) INEXPLIQUÉ(S), ${toCheck.length} jour(s) « à vérifier » ou non vérifié(s) par le nouveau code.`,
    '',
    'Règle (spec § 8) : aucun mouvement inexpliqué, aucun écart de total non expliqué ; chaque jour « à vérifier » listé avec sa cause et accepté par Benoit. Sinon, pas de déploiement.',
    '',
  ]
  if (sansApres.length) {
    lines.push(`**Attention** : ${sansApres.length} jour(s) photographié(s) « avant » sans photo « après », donc NON comparé(s) : ${sansApres.join(', ')}.`, '')
  }
  for (const { diff: d, check } of results) {
    lines.push(`## ${d.day} — ${d.ok ? 'OK' : 'REFUSÉ'} · fiabilité : ${check?.status ?? 'non vérifié'}`)
    lines.push('')
    lines.push(`- chatter_daily : ${eur(d.cdBefore)} € avant → ${eur(d.cdAfter)} € après${d.asideCents ? ` (dont ${eur(d.asideCents)} € mis de côté)` : ''}`)
    lines.push(`- chatter_creator_daily : ${eur(d.ccdBefore)} € avant → ${eur(d.ccdAfter)} € après${d.totalsOk ? '' : ' — **ÉCART DE TOTAL**'}`)
    if (!d.cdBefore && !d.cdAfter && !d.ccdBefore && !d.ccdAfter) {
      lines.push('- **Aucun chiffre ce jour, ni avant ni après** : rejeu raté ou jour non ingéré ? La comparaison ne prouve rien.')
    }
    for (const c of check?.checks.filter((x) => !x.ok) ?? []) lines.push(`- contrôle **${c.code}** en échec : ${c.detail}`)
    if (d.moves.length) {
      lines.push('', '| Fiche | Id MyPuls | Δ résumé | Δ ventes | Raison |', '|---|---|---|---|---|')
      for (const m of d.moves) {
        lines.push(`| ${cell(m.name)} | ${m.mypulsUserId ?? '—'} | ${eur(m.dCd)} € | ${eur(m.dCcd)} € | ${m.reason === null ? '**INEXPLIQUÉ**' : cell(m.reason)} |`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

function readPhoto(dir: string, file: string): Photo {
  const path = resolve(dir, file)
  if (!existsSync(path)) throw new Error(`photo absente : ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Photo
  } catch (e) {
    throw new Error(`photo illisible : ${path} (${e instanceof Error ? e.message : String(e)})`)
  }
}

function compare(avant: string, apres: string, out: string): boolean {
  const jsons = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  const days = jsons(apres)
  // Une comparaison sans aucun jour ne prouve rien : ni « acceptable », ni code 0.
  if (!days.length) throw new Error(`aucune photo .json dans ${apres}`)
  const sansApres = jsons(avant).filter((f) => !days.includes(f)).map((f) => f.replace(/\.json$/, ''))
  if (sansApres.length) console.warn(`[recette] ATTENTION : pas de photo « après » pour ${sansApres.join(', ')} — jours non comparés`)
  const results = days.map((f) => {
    const before = readPhoto(avant, f)
    const after = readPhoto(apres, f)
    if (before.snapshot.day !== after.snapshot.day) {
      throw new Error(`${f} : jour « avant » ${before.snapshot.day} ≠ jour « après » ${after.snapshot.day}`)
    }
    return { diff: compareReplay(before.snapshot, after.snapshot, after.issues), check: after.check }
  })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, render(results, sansApres))
  const ok = results.every((r) => r.diff.ok)
  console.log(`[recette] ${results.length} jour(s) comparé(s) — ${ok ? 'aucun refus' : 'REFUS'} → ${out}`)
  return ok
}

async function main(): Promise<void> {
  const root = loadEnv()
  const [cmd, a, b, c] = process.argv.slice(2)
  if (cmd === 'photo' && a && b) return photo(a, resolve(root, b))
  if (cmd === 'compare' && a && b && c) {
    if (!compare(resolve(root, a), resolve(root, b), resolve(root, c))) process.exit(1)
    return
  }
  throw new Error('usage : recette-identite photo <jour> <dossier> | compare <avant> <apres> <rapport.md>')
}

const isCli = process.argv[1]?.endsWith('recette-identite.ts')
if (isCli) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
