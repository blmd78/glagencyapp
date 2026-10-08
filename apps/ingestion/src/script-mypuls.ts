import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { matchCreatorByName, normalizeDraft, summarizeDraft, validateScriptDraft } from '@glagency/core'
import { createAdminClient, fetchAll } from '@glagency/db'
import { login } from '@glagency/mypuls'
import { convertToDraft, describeFailure, describeMedia, fetchNotionPage, formatReport, notionPageId, sendScript, studioWriter } from '@glagency/scripts'
import { loadEnv } from './env'

// Usage : pnpm --filter @glagency/ingestion script-mypuls <lien page Notion> --modele=<prénom> [--envoyer]
//         pnpm --filter @glagency/ingestion script-mypuls --fichier=<chemin> --modele=<prénom> [--envoyer]
//
// Lit un script rédigé dans Notion (OUTILS MANAGERS), le convertit avec Claude en brouillon, vérifie
// les règles du Studio MyPuls et affiche un rapport — SANS rien écrire. Avec --envoyer et zéro
// erreur : crée le script DÉSACTIVÉ sur la modèle, que le manager relit puis active dans le Studio.
// Brouillon, rapport et erreurs enregistrés dans apps/ingestion/raw/scripts/<date>/ (gitignoré).
// --fichier : un texte déjà extrait (1re ligne = titre), pour rejouer sans NOTION_TOKEN.
// Design : docs/superpowers/specs/2026-10-06-script-mypuls-design.md.

export function parseArgs(argv: string[]): { source: string | null; fichier: string | null; modele: string; envoyer: boolean } {
  const opt = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null
  const source = argv.find((a) => !a.startsWith('--')) ?? null
  const fichier = opt('fichier')
  const modele = opt('modele')
  if (!modele) throw new Error('--modele=<prénom> manquant')
  if (!source && !fichier) throw new Error('lien de la page Notion ou --fichier=<chemin> manquant')
  if (source && fichier) throw new Error('un lien Notion OU --fichier, pas les deux')
  return { source, fichier, modele, envoyer: argv.includes('--envoyer') }
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()

export function resolveCreator(
  rows: Array<{ name: string; mypuls_creator_id: string | null }>,
  modele: string,
): { name: string; mypulsId: string } {
  const m = matchCreatorByName(rows, modele)
  if (m.kind === 'none') throw new Error(`modèle « ${modele} » introuvable dans creators`)
  if (m.kind === 'ambiguous') {
    throw new Error(`« ${modele} » ambigu : ${m.rows.map((h) => `${h.name} (${h.mypuls_creator_id ?? '—'})`).join(', ')}`)
  }
  const c = m.row
  if (!c.mypuls_creator_id) throw new Error(`« ${c.name} » n’a pas d’id MyPuls (creators.mypuls_creator_id)`)
  return { name: c.name, mypulsId: c.mypuls_creator_id }
}

const slug = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

async function run(): Promise<void> {
  const root = loadEnv()
  const args = parseArgs(process.argv.slice(2))

  const db = createAdminClient()
  const { data: creators, error } = await fetchAll<{ name: string; mypuls_creator_id: string | null }>((from, to) =>
    db.from('creators').select('name, mypuls_creator_id').order('name').range(from, to),
  )
  if (error) throw new Error(`creators : ${error.message}`)
  const creator = resolveCreator(creators, args.modele)

  let page: { title: string; text: string }
  if (args.fichier) {
    const [first = '', ...rest] = readFileSync(resolve(root, args.fichier), 'utf8').split('\n')
    page = { title: first.replace(/^#+\s*/, '').trim(), text: rest.join('\n') }
  } else {
    const token = process.env.NOTION_TOKEN
    if (!token) throw new Error('NOTION_TOKEN manquant (.env racine) — ou passer --fichier=<chemin>')
    page = await fetchNotionPage(token, notionPageId(args.source ?? ''))
  }
  console.log(`[script] « ${page.title} » → ${creator.name} (MyPuls ${creator.mypulsId})`)

  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manquante (.env racine)')
  const converted = await convertToDraft(new Anthropic(), page)
  const { usage } = converted
  const { draft, notes } = normalizeDraft(converted.draft)
  const errors = validateScriptDraft(draft)
  const summary = summarizeDraft(draft)
  const report = formatReport(summary, errors, notes)

  const dir = resolve(root, 'apps/ingestion/raw/scripts', new Date().toISOString().slice(0, 10))
  mkdirSync(dir, { recursive: true })
  const file = resolve(dir, `${slug(creator.name)}-${slug(page.title)}.json`)
  writeFileSync(file, JSON.stringify({ page: page.title, modele: creator, usage, summary, notes, errors, draft }, null, 1) + '\n')
  console.log(`${report}\n[script] conversion : ${usage.input} tokens lus, ${usage.output} écrits · brouillon : ${file}`)

  if (errors.length > 0) {
    process.exitCode = 1
    return
  }
  if (!args.envoyer) {
    console.log('[script] rapport seul — relancer avec --envoyer pour créer le script (désactivé) dans MyPuls.')
    return
  }
  const { cookie } = await login()
  const result = await sendScript(studioWriter(cookie), creator.mypulsId, draft, undefined, { scriptTitle: page.title })
  console.log(`[script] la session MyPuls du .env est maintenant sur ${creator.name} (modèle courante d'un navigateur qui la partage).`)
  if (result.ok) {
    console.log(
      `[script] créé et DÉSACTIVÉ : script ${result.scriptId} sur ${creator.name} — à relire puis activer dans le Studio (https://mypuls.app/scripts).`,
    )
    const media = describeMedia(result.media)
    if (media) console.log(`[script] médias : ${media}.`)
  } else {
    process.exitCode = 1
    console.error(`[script] ${describeFailure(result, draft.name).replace('\n', '\n[script] ')}`)
  }
}

const isCli = process.argv[1]?.endsWith('script-mypuls.ts')
if (isCli) {
  run().catch((e: unknown) => {
    console.error(`[script] ${(e as Error).message}`)
    process.exit(1)
  })
}
