// Crée des comptes CRM en lot, exactement comme le bouton « Ajouter au CRM » d'un dossier de
// recrutement (`features/recruit-admin/actions.ts`, `addCandidateToCrm`).
//
//   node --env-file=.env packages/db/scripts/add-members.mjs /tmp/emails.txt            # simulation
//   node --env-file=.env packages/db/scripts/add-members.mjs /tmp/emails.txt --apply    # écrit
//
// SANS `--apply`, RIEN N'EST ÉCRIT : le script montre ce qu'il ferait, ligne par ligne. C'est
// voulu — il crée de vrais comptes sur la PRODUCTION, et un compte créé ne se « décrée » pas
// proprement (il faut passer par Membres).
//
// Format d'entrée, une personne par ligne, souple :
//   jean.dupont@mail.com
//   jean.dupont@mail.com Jean Dupont
//   Jean Dupont <jean.dupont@mail.com>
// Sans nom, il est déduit de l'adresse (`jean.dupont` → « Jean Dupont »).
//
// Ce que chaque compte reçoit, à l'identique du bouton :
//   • compte auth avec e-mail CONFIRMÉ → connexion par code OTP, sans mot de passe ;
//   • rôle `chatteur` (posé par le trigger `on_auth_user_created`, rien à forcer) ;
//   • droits `frm-entrainement` + `formation` — le second EST le droit de face, sans lui la face
//     entière reste invisible ;
//   • « nouvel arrivant » avec sa date d'arrivée (le check `profiles_is_new_needs_arrived_at` de
//     0101 refuse le drapeau sans date, et fait alors échouer TOUTE la pose des droits) ;
//   • `created_by` / `updated_by` = le compte admin de Benoit, sinon l'historique attribue la
//     création à « système » (on écrit en service-role, où `auth.uid()` est null).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'blmd8345@gmail.com'
const PAGES = ['frm-entrainement', 'formation']

const [file, ...flags] = process.argv.slice(2)
const apply = flags.includes('--apply')
if (!file) {
  console.error('Usage : node --env-file=.env packages/db/scripts/add-members.mjs <fichier> [--apply]')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY manquants.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const host = new URL(url).host
console.log(`Cible : ${host}${apply ? '  ***ÉCRITURE***' : '  (simulation)'}\n`)

/** Jour courant à Paris — `arrived_at` est une date métier, pas un instant UTC. */
const todayParis = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())

/**
 * « jean.dupont » → « Jean Dupont ». Un repli LISIBLE, pas une vérité : les chiffres de fin sont
 * retirés (`harindranto09` donnerait « Harindranto09 »), mais une adresse d'un seul tenant reste
 * d'un seul tenant — on ne devine pas où couper un nom qu'on ne connaît pas. À corriger depuis
 * Membres quand la personne se présente.
 */
function nameFromEmail(email) {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .map((w) => w.replace(/\d+$/, ''))
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function parseLine(raw) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) return null

  // « Nom <email> »
  const angled = /^(.*)<([^>]+)>$/.exec(line)
  if (angled) {
    const email = angled[2].trim().toLowerCase()
    return { email, name: angled[1].trim() || nameFromEmail(email) }
  }
  const parts = line.split(/\s+/)
  const emailPart = parts.find((p) => p.includes('@'))
  if (!emailPart) return { error: `pas d'adresse : « ${line} »` }
  const email = emailPart.trim().toLowerCase().replace(/[,;]$/, '')
  const name = parts.filter((p) => p !== emailPart).join(' ').trim()
  return { email, name: name || nameFromEmail(email) }
}

const rows = []
for (const raw of readFileSync(file, 'utf8').split('\n')) {
  const parsed = parseLine(raw)
  if (!parsed) continue
  if (parsed.error) {
    console.log(`  ⚠️  ${parsed.error}`)
    continue
  }
  rows.push(parsed)
}
if (rows.length === 0) {
  console.error('Aucune adresse lue.')
  process.exit(1)
}

// Qui sera crédité de la création.
const { data: adminProfile, error: aErr } = await db
  .from('profiles').select('id, display_name').eq('email', ADMIN_EMAIL).maybeSingle()
if (aErr) throw new Error(aErr.message)
if (!adminProfile) {
  console.error(`Profil admin ${ADMIN_EMAIL} introuvable — impossible de tracer l'auteur.`)
  process.exit(1)
}

// Les comptes déjà présents : on ne les touche pas, et surtout on ne les écrase pas.
const { data: existing, error: eErr } = await db
  .from('profiles').select('email').in('email', rows.map((r) => r.email))
if (eErr) throw new Error(eErr.message)
const known = new Set((existing ?? []).map((p) => (p.email ?? '').toLowerCase()))

console.log(`${rows.length} adresse(s) lue(s) · auteur : ${adminProfile.display_name}\n`)

let created = 0
let skipped = 0
let failed = 0

for (const { email, name } of rows) {
  if (known.has(email)) {
    console.log(`  ⏭  ${email.padEnd(38)} déjà membre — ignoré`)
    skipped += 1
    continue
  }
  if (!apply) {
    console.log(`  →  ${email.padEnd(38)} « ${name} »`)
    continue
  }

  const { data: acc, error: cErr } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  if (cErr) {
    // Code structuré de GoTrue, pas un test sur le message : celui-ci change de langue et de
    // formulation d'une version à l'autre.
    const why = cErr.code === 'email_exists' ? 'compte auth déjà existant' : cErr.message
    console.log(`  ✗  ${email.padEnd(38)} ${why}`)
    failed += 1
    continue
  }

  const uid = acc.user.id
  // `.select('id')` : un UPDATE qui ne matche aucune ligne ne renvoie PAS d'erreur. Sans ce
  // contrôle, un compte partirait sans droits ni « nouvel arrivant », en silence — le défaut
  // constaté en recette le 2026-08-25.
  const { data: patched, error: pErr } = await db
    .from('profiles')
    .update({
      display_name: name,
      pages: PAGES,
      is_new: true,
      arrived_at: todayParis(),
      created_by: adminProfile.id,
      updated_by: adminProfile.id,
    })
    .eq('id', uid)
    .select('id')
  if (pErr || !patched?.length) {
    console.log(`  ⚠️  ${email.padEnd(38)} compte créé MAIS droits non posés — à terminer depuis Membres (${uid})`)
    failed += 1
    continue
  }
  console.log(`  ✓  ${email.padEnd(38)} « ${name} »`)
  created += 1
}

console.log(
  `\n${apply ? 'Créés' : 'À créer'} : ${apply ? created : rows.length - skipped} · ignorés : ${skipped}` +
    (failed ? ` · en échec : ${failed}` : ''),
)
if (!apply) console.log('\nRien n’a été écrit. Relance avec --apply pour créer.')
