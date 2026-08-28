// Import de l'historique du tracker Good Luck Agency (chatterstracker.duckdns.org) vers nos tables
// `tracker_todo_*` et le suivi. Outil PONCTUEL, sur le modèle de `lib/gla/` de la reprise Formation.
//
// La source n'est pas une base joignable mais une APP sur un VPS : on se connecte en HTTP comme un
// humain (login admin → cookie → lecture des pages), on parse le HTML, on transpose. Rien n'est
// écrit sur leur serveur — que de la lecture.
//
//   node --env-file=.env packages/db/scripts/tracker-import.mjs --test            # parseurs sur fichiers sauvegardés, 0 réseau
//   node --env-file=.env packages/db/scripts/tracker-import.mjs --scan            # login + lecture throttlée, inventaire, 0 écriture
//   node --env-file=.env packages/db/scripts/tracker-import.mjs --scan --apply    # écrit sur la base (UAT par défaut, cf. --prod)
//
// PÉRIMÈTRE STRICT (demande Benoit) : To-Do, Suivi chatters, Récap. Rien de la présence.
// La to-do importée atterrit dans `/chatter/presence/todo` (décision : celle du tracker, au design repris).

import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────── config
const TRACKER = 'https://chatterstracker.duckdns.org'
const ADMIN_USER = 'goodluck'
const ADMIN_PASS = '125487deded874554@@'
// Une seconde entre deux requêtes : le scan brutal de 214 fiches a fait décrocher leur serveur.
const THROTTLE_MS = 1000
// Les semaines réellement remplies (relevées dans /todo et /recap). Élargir si besoin.
const WEEKS = ['2026-08-17', '2026-08-24', '2026-08-31']
// Comptes techniques à NE PAS importer (pas de vrais encadrants).
const SKIP_ACCOUNTS = new Set(['goodluck', 'benoitdev', 'flodev'])

const SCRATCH = '/private/tmp/claude-501/-Users-benoitgasnier-Documents-glagencyapp/a2408ebe-328c-4222-87d8-919514ef1e6f/scratchpad/tracker'

const flags = new Set(process.argv.slice(2))
const APPLY = flags.has('--apply')
const PROD = flags.has('--prod')

// ─────────────────────────────────────────────────────────── utilitaires HTML (pas de DOM en Node)
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' }
const decode = (s) => String(s ?? '').replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m) => ENT[m] ?? m)
const clean = (s) => decode(s).replace(/\s+/g, ' ').trim()
/** Ajoute N jours à une date ISO `YYYY-MM-DD` (calcul en UTC, pas de dérive de fuseau). */
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────── PARSEURS (purs, testables hors-ligne)

/**
 * Une page /todo?semaine=<lundi>&compte=<id>. Rend les tâches datées, par section.
 *
 * Structure réelle : `<div class="day"><h3>lundi …</h3> … <div class="glab"><span>SECTION</span></div>
 * <div class="task done" data-task="ID"><span class="tt">intitulé</span><span class="tm">
 * <span class="rec">habitude</span></span></div> …`. Les 7 jours sont dans l'ordre lundi→dimanche ;
 * la date de chaque colonne se déduit du lundi de l'URL.
 */
export function parseTodo(html, weekMonday) {
  const tasks = []
  // Découpe en colonnes de jour. `class="day"`, `day now`, `day we` — on capture jusqu'au prochain
  // `<div class="day` ou la fin du bloc semaine.
  const dayChunks = html.split(/<div class="day(?:\s+\w+)?">/).slice(1)
  dayChunks.forEach((chunk, dayIndex) => {
    if (dayIndex > 6) return // garde-fou : jamais plus de 7 jours
    const date = addDays(weekMonday, dayIndex)
    // À l'intérieur d'une colonne, les sections se succèdent : `glab` puis ses tâches.
    // On parcourt les marqueurs dans l'ordre pour rattacher chaque tâche à sa section courante.
    let section = ''
    const re = /class="glab">\s*<span>([^<]*)<\/span>|class="task(\s+done)?"[^>]*data-task="(\d+)"[\s\S]*?<span class="tt">([\s\S]*?)<\/span>\s*<span class="tm">([\s\S]*?)<\/span>/g
    let m
    while ((m = re.exec(chunk))) {
      if (m[1] !== undefined) {
        section = clean(m[1])
        continue
      }
      const done = !!m[2]
      const id = m[3]
      const label = clean(m[4])
      const recurring = /class="rec"/.test(m[5])
      if (!label) continue
      tasks.push({ sourceId: id, date, section, label, done, recurring })
    }
  })
  // Bloc-notes de la semaine (readonly `scratch`) — une seule zone par page.
  const scratch = html.match(/id="scratch"[^>]*>([\s\S]*?)<\/textarea>/)
  const weekNote = scratch ? clean(scratch[1]) : ''
  return { tasks, weekNote }
}

/**
 * Une fiche /notes/<id>. Les SESSIONS 1:1 vivent dans un dict JS `var PAST = {...}` (source fiable :
 * date ISO complète, `score:null` distinct de 0, commentaires par compétence). L'auteur et les NOMS
 * des compétences ne sont pas dans PAST — on les lit dans le HTML rendu.
 */
export function parseNotes(html) {
  // Fiche vide / chatteur inexistant : la page fait ~60 octets.
  if (html.length < 500) return { sessions: [], skills: new Map(), generalNote: '' }

  // 1. Le dict PAST.
  let past = {}
  const pm = html.match(/var PAST\s*=\s*(\{[\s\S]*?\});/)
  if (pm) {
    try {
      past = JSON.parse(pm[1])
    } catch {
      past = {}
    }
  }

  // 2. Les noms de compétences de CETTE page : `id="cat-13"` … `<span class="nm">Setting…</span>`.
  //    Les ids sont PROPRES au chatteur (13-18 ici, 1-6 ailleurs) → on résout par nom.
  const skills = new Map() // catId → nom
  const catRe = /id="cat-(\d+)"[\s\S]*?class="nm">([^<]*)</g
  let cm
  while ((cm = catRe.exec(html))) skills.set(cm[1], clean(cm[2]))

  // 3. L'auteur de chaque session : `<div class="sess" id="sess-3"> … <span class="sa">par goodluck</span>`.
  const author = new Map() // sessionId → username
  const saRe = /id="sess-(\d+)"[\s\S]*?class="sa">par\s+([^<]*)</g
  let am
  while ((am = saRe.exec(html))) author.set(am[1], clean(am[2]))

  const sessions = Object.entries(past).map(([sid, v]) => ({
    sourceId: sid,
    date: v.date ?? null,
    score: v.score === null || v.score === undefined ? null : Number(v.score),
    summary: clean(v.summary ?? ''),
    author: author.get(sid) ?? null,
    ratings: Object.entries(v.ratings ?? {}).map(([catId, r]) => ({
      skill: skills.get(catId) ?? null,
      stars: Number(r.r),
      comment: clean(r.c ?? ''),
    })),
  }))

  // 4. Note générale libre (une par fiche).
  const gm = html.match(/id="gen"[^>]*>([\s\S]*?)<\/textarea>/)
  const generalNote = gm ? clean(gm[1]) : ''

  return { sessions, skills, generalNote }
}

/** Le sélecteur de comptes de /todo : `<option value="5">axel</option>`. */
export function parseAccounts(html) {
  const out = []
  const re = /<option value="(\d+)"[^>]*>([^<]+)<\/option>/g
  let m
  while ((m = re.exec(html))) out.push({ id: m[1], username: clean(m[2]) })
  return out
}

/** La liste /notes : `<a class="crow" href="/notes/94"> … <span class="cn">Nom</span>`. */
export function parseChatterList(html) {
  const out = []
  const re = /href="\/notes\/(\d+)"[\s\S]*?class="cn">([^<]*)</g
  let m
  while ((m = re.exec(html))) out.push({ id: m[1], name: clean(m[2]) })
  return out
}

// ─────────────────────────────────────────────────────────── mode --test (hors-ligne)
function runTest() {
  console.log('TEST des parseurs sur les fichiers sauvegardés (aucun réseau)\n')
  const todo = parseTodo(readFileSync(`${SCRATCH}/full.html`, 'utf8'), '2026-08-24')
  console.log(`/todo (compte 2, semaine 24) : ${todo.tasks.length} tâches`)
  const bySection = {}
  for (const t of todo.tasks) bySection[t.section] = (bySection[t.section] ?? 0) + 1
  console.log('   par section :', bySection)
  console.log('   dont cochées :', todo.tasks.filter((t) => t.done).length, '· récurrentes :', todo.tasks.filter((t) => t.recurring).length)
  console.log('   3 exemples :', todo.tasks.slice(0, 3).map((t) => `${t.date} [${t.section}] ${t.label.slice(0, 30)}${t.done ? ' ✓' : ''}`))
  console.log('   note de semaine :', todo.weekNote ? `« ${todo.weekNote.slice(0, 60)}… »` : '(vide)')

  for (const id of ['67', '94']) {
    const n = parseNotes(readFileSync(`${SCRATCH}/notes-${id}.html`, 'utf8'))
    console.log(`\n/notes/${id} : ${n.sessions.length} session(s) · ${n.skills.size} compétences · note générale ${n.generalNote ? 'oui' : 'non'}`)
    for (const s of n.sessions) {
      console.log(`   ${s.date} · note ${s.score ?? '—'}/20 · par ${s.author} · « ${s.summary.slice(0, 30)} » · ${s.ratings.length} compétence(s) notée(s)`)
      for (const r of s.ratings) console.log(`      → ${r.skill}: ${r.stars}★${r.comment ? ` (${r.comment})` : ''}`)
    }
  }
}

// ─────────────────────────────────────────────────────────── mode --scan (login + lecture live)
async function login() {
  const body = new URLSearchParams({ username: ADMIN_USER, password: ADMIN_PASS })
  const res = await fetch(`${TRACKER}/login`, { method: 'POST', body, redirect: 'manual' })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  if (!cookie || (res.status !== 302 && res.status !== 200)) throw new Error(`login échoué : HTTP ${res.status}`)
  return cookie
}

async function get(cookie, path) {
  await sleep(THROTTLE_MS)
  const res = await fetch(`${TRACKER}${path}`, { headers: { cookie } })
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`)
  return res.text()
}

async function runScan() {
  console.log(`SCAN du tracker (throttle ${THROTTLE_MS} ms)${APPLY ? '  ***ÉCRITURE***' : '  (inventaire seul)'}\n`)
  const cookie = await login()
  console.log('✅ connecté\n')

  // Comptes → to-dos.
  const accounts = parseAccounts(await get(cookie, `/todo?semaine=${WEEKS[0]}&compte=`))
    .filter((a) => a.id && !SKIP_ACCOUNTS.has(a.username))
  console.log(`${accounts.length} encadrant(s) à importer : ${accounts.map((a) => a.username).join(', ')}\n`)

  const todosByAccount = new Map()
  for (const acc of accounts) {
    const all = []
    for (const wk of WEEKS) {
      const { tasks } = parseTodo(await get(cookie, `/todo?semaine=${wk}&compte=${acc.id}`), wk)
      all.push(...tasks)
    }
    todosByAccount.set(acc.username, all)
    console.log(`  ${acc.username.padEnd(10)} ${all.length} tâches (${all.filter((t) => t.done).length} cochées)`)
  }

  // Fiches de suivi (throttlé — c'est le scan qui avait fait décrocher le serveur).
  const chatters = parseChatterList(await get(cookie, '/notes'))
  console.log(`\n${chatters.length} chatteurs — lecture des fiches…`)
  const notesByChatter = new Map()
  let withData = 0
  for (const c of chatters) {
    const n = parseNotes(await get(cookie, `/notes/${c.id}`))
    if (n.sessions.length || n.generalNote) {
      withData++
      notesByChatter.set(c.id, { name: c.name, ...n })
    }
  }
  const totalSessions = [...notesByChatter.values()].reduce((s, n) => s + n.sessions.length, 0)
  console.log(`  ${withData} fiches avec des données · ${totalSessions} sessions 1:1 au total\n`)

  if (!APPLY) {
    console.log('Inventaire terminé. Aucune écriture (ajouter --apply).')
    return { accounts, todosByAccount, notesByChatter }
  }
  console.log('--apply : import à implémenter une fois la correspondance des comptes validée.')
  // L'écriture (mapping comptes → profiles, insert idempotent) vient après validation du tableau.
}

// ─────────────────────────────────────────────────────────── entrée
if (flags.has('--test')) runTest()
else if (flags.has('--scan')) await runScan()
else {
  console.log('Usage : --test (hors-ligne) | --scan [--apply] [--prod]')
}
