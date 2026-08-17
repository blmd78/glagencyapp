// Génère la migration de SEED du catalogue de formation depuis le formation.json de Good Luck
// Agency (repo axel-vrnl/good-luck-agency). Le SQL émis est L'ARTEFACT (migration 0115) ; ce
// script est commité, ré-exécutable, JAMAIS appelé en prod.
//   node packages/db/scripts/gen-training-seed.mjs ~/Documents/good-luck-agency/formation.json \
//     > packages/db/supabase/migrations/0115_training_catalog_seed.sql
// Règles de conversion : spec 2026-08-17-formation-catalogue-design.md §4. Tests : node --test.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/** Namespace UUID v5 du seed — arbitraire et FIXE (le changer changerait tous les ids). */
const NAMESPACE = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
/** GLA : ARENA_CAP (front) et plafond du boss — constantes reprises telles quelles. */
const ARENA_MAX_TURNS = 8
const BOSS_MAX_TURNS = 32
const CODE_RE = /^[a-z0-9_-]{2,40}$/
const KEY_RE = /^[a-z0-9_]{2,30}$/

/** UUID v5 (SHA-1) déterministe : même `name` ⇒ même id à chaque génération, sans extension Postgres. */
export function uuidV5(name) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest()
  h[6] = (h[6] & 0x0f) | 0x50 // version 5
  h[8] = (h[8] & 0x3f) | 0x80 // variante RFC 4122
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

/** Littéral SQL : null / booléen / nombre / texte (quotes doublées ; pas de E'' — standard_conforming_strings). */
export function sqlLit(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`nombre invalide : ${v}`)
    return String(v)
  }
  return `'${String(v).replace(/'/g, "''")}'`
}

// ---------- HTML des cours GLA → Markdown GFM ----------
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
/** Texte brut : ce que Markdown interpréterait est échappé. */
const escapeText = (s) => s.replace(/[\\*_`]/g, (c) => `\\${c}`)
/** Une ligne de paragraphe qui commencerait comme une liste / un titre / une citation est neutralisée. */
const escapeLineStart = (line) =>
  line.replace(/^([-+*#>])(\s)/, '\\$1$2').replace(/^(\d+)([.)])(\s)/, '$1\\$2$3')
const INLINE = { b: '**', strong: '**', i: '*', em: '*', u: '*' }

/**
 * Convertit le HTML PLAT des cours GLA (h4 / p / b / i / u / br / ul / ol / li / table / tr /
 * th / td — sans attribut, sans imbrication de listes) en Markdown GFM. `<br>` → saut de ligne
 * simple (rendu par remark-breaks côté web). Balise inconnue ou structure imprévue ⇒ throw.
 */
export function htmlToMarkdown(html) {
  if (!html) return null
  const blocks = []
  let buf = ''         // texte inline du bloc courant (paragraphe, titre, item)
  let cell = null      // texte de la cellule courante (th/td) — prioritaire sur `buf`
  const inline = []    // pile { mark, start } des balises inline ouvertes
  let list = null      // { type: 'ul' | 'ol', items: [] }
  let table = null     // { rows: [{ header, cells }], row: null }
  let heading = false

  const cur = () => (cell !== null ? cell : buf)
  const set = (v) => { if (cell !== null) cell = v; else buf = v }
  const append = (t) => set(cur() + t)
  const openInline = (mark) => inline.push({ mark, start: cur().length })
  const closeInline = (mark) => {
    const open = inline.pop()
    if (!open || open.mark !== mark) throw new Error(`balise inline mal imbriquée (${mark})`)
    const text = cur()
    const inner = text.slice(open.start)
    const core = inner.trim()
    const lead = inner.slice(0, inner.length - inner.trimStart().length)
    const trail = inner.slice(inner.trimEnd().length)
    set(text.slice(0, open.start) + (core ? `${lead}${mark}${core}${mark}${trail}` : inner))
  }
  const takeBuf = (escapeStarts) => {
    const lines = buf.split('\n').map((l) => l.trim())
    buf = ''
    return (escapeStarts ? lines.map(escapeLineStart) : lines).join('\n').trim()
  }
  const flushPara = () => {
    if (inline.length) throw new Error('balise inline non fermée en fin de bloc')
    const text = takeBuf(true)
    if (text) blocks.push(text)
  }

  const tokens = html.match(/<\/?[a-z0-9]+[^>]*>|[^<]+/gi) ?? []
  for (const tok of tokens) {
    if (tok[0] !== '<') { append(escapeText(decode(tok))); continue }
    const m = /^<(\/?)([a-z0-9]+)/i.exec(tok)
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (tag in INLINE) { closing ? closeInline(INLINE[tag]) : openInline(INLINE[tag]); continue }
    switch (tag) {
      case 'h4':
        if (!closing) { flushPara(); heading = true }
        else { const t = takeBuf(false); if (t) blocks.push(`## ${t}`); heading = false }
        break
      case 'p':
        if (list || table) throw new Error(`<p> à l'intérieur d'une ${list ? 'liste' : 'table'} non géré`)
        flushPara()
        break
      case 'br':
        // Dans une cellule ou un titre, un <br> devient un espace (une table GFM / un titre tiennent sur une ligne).
        append(cell !== null || heading ? ' ' : '\n')
        break
      case 'ul': case 'ol':
        if (!closing) { if (list) throw new Error('listes imbriquées non gérées'); flushPara(); list = { type: tag, items: [] } }
        else {
          if (!list) throw new Error(`</${tag}> sans ouverture`)
          if (buf.trim()) throw new Error('texte hors <li> dans une liste')
          blocks.push(list.items.map((it, i) => (list.type === 'ol' ? `${i + 1}. ${it}` : `- ${it}`)).join('\n'))
          list = null
        }
        break
      case 'li':
        if (!list) throw new Error('<li> hors liste')
        if (!closing) buf = ''
        else list.items.push(takeBuf(true).replace(/\n/g, '\n  '))
        break
      case 'table':
        if (!closing) { flushPara(); table = { rows: [], row: null } }
        else {
          const [head, ...body] = table.rows
          if (!head?.header) throw new Error('table sans ligne d’en-tête (th)')
          const w = head.cells.length
          const line = (cells) => `| ${[...cells, ...Array(Math.max(0, w - cells.length)).fill('')].slice(0, w).join(' | ')} |`
          blocks.push([line(head.cells), `| ${Array(w).fill('---').join(' | ')} |`, ...body.map((r) => line(r.cells))].join('\n'))
          table = null
        }
        break
      case 'tr':
        if (!table) throw new Error('<tr> hors table')
        if (!closing) table.row = { header: false, cells: [] }
        else { table.rows.push(table.row); table.row = null }
        break
      case 'th': case 'td':
        if (!table?.row) throw new Error(`<${tag}> hors ligne de table`)
        if (!closing) { cell = ''; if (tag === 'th') table.row.header = true }
        else { table.row.cells.push(cell.trim().replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')); cell = null }
        break
      default:
        throw new Error(`balise non gérée : <${tag}>`)
    }
  }
  flushPara()
  if (heading || list || table || inline.length) throw new Error('structure HTML non refermée')
  return blocks.join('\n\n')
}

// ---------- Validation du JSON GLA (avant d'émettre quoi que ce soit) ----------
export function validate(json) {
  const errors = []
  const err = (m) => errors.push(m)
  const modules = Array.isArray(json?.modules) ? json.modules : []
  const cas = Array.isArray(json?.cas) ? json.cas : []
  if (!modules.length) err('aucun module')
  const modCodes = new Set()
  const sectionsByModule = new Map()
  for (const m of modules) {
    if (!CODE_RE.test(m.id ?? '')) err(`module ${m.id} : id invalide`)
    if (modCodes.has(m.id)) err(`module ${m.id} : id en double`)
    modCodes.add(m.id)
    if (!m.titre || m.titre.length > 80) err(`module ${m.id} : titre manquant ou > 80`)
    if (m.emoji && [...m.emoji].length > 8) err(`module ${m.id} : emoji > 8`)
    const keys = new Set()
    for (const a of m.bareme?.axes ?? []) {
      if (!KEY_RE.test(a.cle ?? '')) err(`module ${m.id} : axe ${a.cle} clé invalide`)
      if (keys.has(a.cle)) err(`module ${m.id} : axe ${a.cle} en double`)
      keys.add(a.cle)
      if (!a.nom || a.nom.length > 60) err(`module ${m.id} : axe ${a.cle} nom manquant ou > 60`)
      if (!a.desc) err(`module ${m.id} : axe ${a.cle} sans desc`)
    }
    const secs = new Set()
    for (const s of m.sous_categories ?? []) {
      if (!CODE_RE.test(s.id ?? '')) err(`module ${m.id} : sous_cat ${s.id} id invalide`)
      if (secs.has(s.id)) err(`module ${m.id} : sous_cat ${s.id} en double`)
      secs.add(s.id)
      if (!s.titre || s.titre.length > 80) err(`module ${m.id} : sous_cat ${s.id} titre manquant ou > 80`)
    }
    sectionsByModule.set(m.id, secs)
    try { const md = htmlToMarkdown(m.cours); if (md && /<\/?[a-z]/.test(md)) err(`module ${m.id} : HTML résiduel dans le cours`) }
    catch (e) { err(`module ${m.id} : cours — ${e.message}`) }
  }
  const byId = new Map()
  for (const c of cas) {
    if (!CODE_RE.test(c.id ?? '')) err(`cas ${c.id} : id invalide`)
    if (byId.has(c.id)) err(`cas ${c.id} : id en double`)
    byId.set(c.id, c)
  }
  for (const c of cas) {
    const kind = c.boss_mode ? 'boss' : c.arena ? 'arena' : 'solo'
    if (!modCodes.has(c.module)) err(`cas ${c.id} : module ${c.module} inconnu`)
    if (c.sous_cat && !sectionsByModule.get(c.module)?.has(c.sous_cat)) err(`cas ${c.id} : sous_cat ${c.sous_cat} inconnue du module ${c.module}`)
    if (!c.titre || c.titre.length > 80) err(`cas ${c.id} : titre manquant ou > 80`)
    if (!Number.isInteger(c.difficulte) || c.difficulte < 1 || c.difficulte > 10) err(`cas ${c.id} : difficulte hors 1-10`)
    if (!c.contexte || !c.objectif) err(`cas ${c.id} : contexte/objectif manquant`)
    for (const [i, s] of (c.seed ?? []).entries()) {
      if (s.who !== 'me' && s.who !== 'them') err(`cas ${c.id} : seed[${i}] who=${s.who}`)
      if (!s.t || s.t.length > 1000) err(`cas ${c.id} : seed[${i}] texte vide ou > 1000`)
    }
    if (kind === 'solo') {
      for (const k of ['fan_name', 'consigne_fan', 'attendu']) if (!c[k]) err(`cas ${c.id} : ${k} manquant (solo)`)
      if (c.fan_name && c.fan_name.length > 30) err(`cas ${c.id} : fan_name > 30`)
      if (!Number.isInteger(c.tours_max) || c.tours_max < 1 || c.tours_max > 50) err(`cas ${c.id} : tours_max hors 1-50`)
    } else {
      if (!Number.isInteger(c.reaction_max_s) || c.reaction_max_s < 10 || c.reaction_max_s > 600) err(`cas ${c.id} : reaction_max_s hors 10-600`)
    }
    if (kind === 'arena') {
      if (!Array.isArray(c.arena) || c.arena.length !== 5 || !Array.isArray(c.fans) || c.fans.length !== 5) err(`cas ${c.id} : défi sans 5 codes + 5 prénoms`)
      for (const code of c.arena ?? []) {
        const ref = byId.get(code)
        if (!ref) err(`cas ${c.id} : référence ${code} inconnue`)
        else if (ref.module !== c.module || ref.arena || ref.boss_mode) err(`cas ${c.id} : ${code} n'est pas un solo du module ${c.module}`)
      }
      for (const n of c.fans ?? []) if (typeof n !== 'string' || !n || n.length > 30) err(`cas ${c.id} : prénom de défi invalide`)
    }
    if (kind === 'boss') {
      if (!Array.isArray(c.fans) || c.fans.length < 1 || c.fans.length > 5) err(`cas ${c.id} : boss sans 1-5 fans`)
      for (const f of c.fans ?? []) {
        if (typeof f !== 'object' || !/^[a-z0-9_-]{2,30}$/.test(f.id ?? '')) err(`cas ${c.id} : fan ${f?.id} id invalide`)
        if (!f.name || f.name.length > 30 || !f.persona) err(`cas ${c.id} : fan ${f.id} name/persona`)
        if (!Array.isArray(f.seed) || f.seed.length !== 1 || !f.seed[0]?.t) err(`cas ${c.id} : fan ${f.id} doit avoir exactement 1 message d'ouverture`)
        if (f.color && !/^#[0-9a-fA-F]{6}$/.test(f.color)) err(`cas ${c.id} : fan ${f.id} couleur`)
      }
    }
  }
  if (errors.length) throw new Error(`formation.json invalide :\n- ${errors.join('\n- ')}`)
}

// ---------- Construction des lignes ----------
export function buildSeed(json) {
  validate(json)
  const moduleId = (code) => uuidV5(`module:${code}`)
  const caseId = (code) => uuidV5(`case:${code}`)
  const sectionId = (m, code) => uuidV5(`section:${m}:${code}`)
  const modules = [], axes = [], sections = [], cases = [], messages = [], slots = [], fans = []

  json.modules.forEach((m, mi) => {
    modules.push({
      id: moduleId(m.id), code: m.id, title: m.titre, emoji: m.emoji || null, description: m.description || null,
      objective_label: m.cible_label || 'Objectif', course_md: htmlToMarkdown(m.cours), scoring_notes: m.consigne_notation || null,
      position: mi * 10, active: m.actif !== false,
    })
    ;(m.bareme?.axes ?? []).forEach((a, i) => axes.push({
      id: uuidV5(`axis:${m.id}:${a.cle}`), module_id: moduleId(m.id), key: a.cle, name: a.nom, description: a.desc, position: i * 10,
    }))
    ;(m.sous_categories ?? []).forEach((s, i) => sections.push({
      id: sectionId(m.id, s.id), module_id: moduleId(m.id), code: s.id, title: s.titre, emoji: s.emoji || null, description: s.desc || null, position: i * 10,
    }))
  })

  const nextPos = new Map()
  for (const c of json.cas) {
    const kind = c.boss_mode ? 'boss' : c.arena ? 'arena' : 'solo'
    const solo = kind === 'solo'
    const position = nextPos.get(c.module) ?? 0
    nextPos.set(c.module, position + 10)
    const row = {
      id: caseId(c.id), module_id: moduleId(c.module), section_id: c.sous_cat ? sectionId(c.module, c.sous_cat) : null,
      code: c.id, kind, title: c.titre, phase: c.phase ?? '', difficulty: c.difficulte,
      max_turns: solo ? c.tours_max : kind === 'arena' ? ARENA_MAX_TURNS : BOSS_MAX_TURNS,
      reaction_max_s: solo ? null : c.reaction_max_s, is_sale: !!c.vente,
      context: c.contexte, objective: c.objectif, target_line: c.ligne_cible || null,
      fan_name: solo ? c.fan_name : null, fan_brief: solo ? c.consigne_fan : null, expected: solo ? c.attendu : null,
      position, active: true,
    }
    cases.push(row)
    ;(c.seed ?? []).forEach((s, i) => messages.push({
      id: uuidV5(`msg:${c.id}:${i}`), case_id: row.id, position: i * 10, speaker: s.who === 'me' ? 'creator' : 'fan', body: s.t,
    }))
    if (kind === 'arena') c.arena.forEach((code, i) => slots.push({
      id: uuidV5(`slot:${c.id}:${i}`), case_id: row.id, position: i * 10, ref_case_id: caseId(code), display_name: c.fans[i],
    }))
    if (kind === 'boss') c.fans.forEach((f, i) => fans.push({
      id: uuidV5(`fan:${c.id}:${f.id}`), case_id: row.id, position: i * 10, code: f.id, name: f.name,
      age: f.age ?? null, job: f.job || null, city: f.city || null, color: f.color || null, persona: f.persona,
      opening_message: f.seed[0].t, budget_cap: f.cap ?? null, nego_threshold: f.nego ?? null,
      nego_where: f.negoWhere || null, meet_when: f.rencontre || null, meet_where: f.rencontreWhere || null, derails: f.derails || null,
    }))
  }
  const counts = {
    modules: modules.length, axes: axes.length, sections: sections.length, cases: cases.length,
    solo: cases.filter((c) => c.kind === 'solo').length, arena: cases.filter((c) => c.kind === 'arena').length,
    boss: cases.filter((c) => c.kind === 'boss').length, messages: messages.length, slots: slots.length, fans: fans.length,
  }
  return { modules, axes, sections, cases, messages, slots, fans, counts }
}

// ---------- SQL ----------
function insertSql(table, rows) {
  if (!rows.length) return `-- ${table} : aucune ligne\n`
  const cols = Object.keys(rows[0])
  const values = rows.map((r) => `  (${cols.map((c) => sqlLit(r[c])).join(', ')})`).join(',\n')
  return `insert into public.${table} (${cols.join(', ')}) values\n${values};\n`
}

export function renderSql(seed) {
  const c = seed.counts
  return [
    '-- 0115 — Seed du catalogue de formation (reprise de Good Luck Agency).',
    '-- GÉNÉRÉ par packages/db/scripts/gen-training-seed.mjs depuis formation.json — NE PAS ÉDITER À LA MAIN',
    '-- (relancer le script). uuid v5 déterministes (namespace fixe) : re-génération = mêmes ids.',
    `-- Comptages : ${c.modules} modules, ${c.axes} axes, ${c.sections} sections, ${c.cases} cas (${c.solo} solo / ${c.arena} défis / ${c.boss} boss),`,
    `--             ${c.messages} messages d'ouverture, ${c.slots} créneaux de défi, ${c.fans} fans du boss. Migration one-shot (aucun upsert).`,
    '',
    insertSql('training_modules', seed.modules),
    insertSql('training_module_axes', seed.axes),
    insertSql('training_module_sections', seed.sections),
    insertSql('training_cases', seed.cases),
    insertSql('training_case_messages', seed.messages),
    insertSql('training_case_arena_slots', seed.slots),
    insertSql('training_case_boss_fans', seed.fans),
  ].join('\n')
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage : node gen-training-seed.mjs <formation.json> > 0115_training_catalog_seed.sql')
    process.exit(1)
  }
  const seed = buildSeed(JSON.parse(readFileSync(file, 'utf8')))
  process.stdout.write(renderSql(seed))
  console.error('seed généré :', JSON.stringify(seed.counts))
}
