import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildSeed, htmlToMarkdown, renderSql, sqlLit, uuidV5, validate } from './gen-training-seed.mjs'

test('uuidV5 : déterministe, format v5', () => {
  const a = uuidV5('module:setting')
  assert.equal(a, uuidV5('module:setting'))
  assert.notEqual(a, uuidV5('module:relance'))
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('sqlLit : null / booléens / nombres / quotes doublées', () => {
  assert.equal(sqlLit(null), 'null')
  assert.equal(sqlLit(undefined), 'null')
  assert.equal(sqlLit(true), 'true')
  assert.equal(sqlLit(12), '12')
  assert.equal(sqlLit("c'est"), "'c''est'")
})

test('htmlToMarkdown : titres, gras/italique, br, listes, table, entités', () => {
  assert.equal(htmlToMarkdown('<h4>Le principe</h4><p>Un <b>mot</b> et <i>autre</i>.</p>'), '## Le principe\n\nUn **mot** et *autre*.')
  assert.equal(htmlToMarkdown('<p>Fan : cc<br>Toi : hey</p>'), 'Fan : cc\nToi : hey')
  assert.equal(htmlToMarkdown('<ul><li>a</li><li><b>b</b> — c</li></ul>'), '- a\n- **b** — c')
  assert.equal(htmlToMarkdown('<ol><li>un</li><li>deux</li></ol>'), '1. un\n2. deux')
  assert.equal(
    htmlToMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>x | y</td></tr></table>'),
    '| A | B |\n| --- | --- |\n| 1 | x \\| y |',
  )
  assert.equal(htmlToMarkdown('<p>R &amp; D</p>'), 'R & D')
  assert.equal(htmlToMarkdown(''), null)
  assert.equal(htmlToMarkdown(null), null)
})

test('htmlToMarkdown : espaces aux bords d’un <b> sortent des ** (sinon Markdown ne ferme pas)', () => {
  assert.equal(htmlToMarkdown('<p>a<b> b </b>c</p>'), 'a **b** c')
  assert.equal(htmlToMarkdown('<p><u>QUE</u> ça</p>'), '*QUE* ça')
})

test('htmlToMarkdown : texte brut échappé, début de ligne neutralisé, balise inconnue refusée', () => {
  assert.equal(htmlToMarkdown('<p>2*3 et a_b</p>'), '2\\*3 et a\\_b')
  assert.equal(htmlToMarkdown('<p>Fan<br>- pas une liste</p>'), 'Fan\n\\- pas une liste')
  assert.throws(() => htmlToMarkdown('<p><span>x</span></p>'), /balise non gérée/)
  assert.throws(() => htmlToMarkdown('<ul><li>a<ul><li>b</li></ul></li></ul>'), /imbriqu/)
})

// Fixture minimale mais complète : 1 module (2 axes, 1 section, 5 solos, 1 défi), 1 module boss (1 fan).
const solo = (id, module, extra = {}) => ({
  id, module, titre: `Cas ${id}`, phase: 'Qualification', difficulte: 2, tours_max: 6, vente: false,
  contexte: 'ctx', objectif: 'obj', ligne_cible: 'lc', fan_name: 'Tony', consigne_fan: 'brief', attendu: 'att',
  seed: [{ who: 'me', t: 'coucou' }, { who: 'them', t: 'cc' }], ...extra,
})
const fixture = () => ({
  modules: [
    { id: 'setting', titre: 'Setting', emoji: '🧲', actif: true, cible_label: 'Objectif', description: 'd', consigne_notation: 'cn',
      sous_categories: [{ id: 'kyc', titre: 'KYC', emoji: '📇', desc: 'sd' }],
      bareme: { axes: [{ cle: 'naturel', nom: 'Naturel', desc: 'a1' }, { cle: 'lecture', nom: 'Lecture', desc: 'a2' }] },
      cours: '<h4>T</h4><p>x</p>' },
    { id: 'boss', titre: 'Boss final', emoji: '🏆', actif: true, cible_label: 'Objectif', description: 'b', consigne_notation: '',
      sous_categories: [], bareme: { axes: [] }, cours: '' },
  ],
  cas: [
    solo('s1', 'setting', { sous_cat: 'kyc' }), solo('s2', 'setting'), solo('s3', 'setting'), solo('s4', 'setting'), solo('s5', 'setting'),
    { id: 'set_arena', module: 'setting', titre: 'Défi', phase: 'Défi simultané', difficulte: 5, tours_max: 0, vente: false,
      arena: ['s1', 's2', 's3', 's4', 's5'], fans: ['A', 'B', 'C', 'D', 'E'], reaction_max_s: 120,
      contexte: 'ctx', objectif: 'obj', ligne_cible: 'lc' },
    { id: 'boss_final', module: 'boss', titre: 'Boss', phase: 'Boss final', difficulte: 5, tours_max: 0, vente: false, boss_mode: true,
      reaction_max_s: 120, contexte: 'ctx', objectif: 'obj', ligne_cible: 'lc', arena: ['s1'],
      fans: [{ id: 'kevin', name: 'Kevin', age: 34, job: 'plombier', city: 'Lyon', color: '#ff6b9d', persona: 'p', cap: 60, nego: 6,
        negoWhere: 'nw', rencontre: 'r', rencontreWhere: 'rw', derails: 'd', seed: [{ who: 'them', t: 'salut' }] }] },
  ],
})

test('buildSeed : comptages, sortes, valeurs converties', () => {
  const s = buildSeed(fixture())
  assert.deepEqual(s.counts, { modules: 2, axes: 2, sections: 1, cases: 7, solo: 5, arena: 1, boss: 1, messages: 10, slots: 5, fans: 1 })
  const m = s.modules[0]
  assert.equal(m.code, 'setting'); assert.equal(m.course_md, '## T\n\nx'); assert.equal(m.position, 0); assert.equal(m.objective_label, 'Objectif')
  assert.equal(s.modules[1].course_md, null); assert.equal(s.modules[1].scoring_notes, null)
  const s1 = s.cases.find((c) => c.code === 's1')
  assert.equal(s1.kind, 'solo'); assert.equal(s1.max_turns, 6); assert.equal(s1.reaction_max_s, null); assert.equal(s1.section_id, s.sections[0].id)
  assert.equal(s.cases.find((c) => c.code === 's2').section_id, null)
  const arena = s.cases.find((c) => c.code === 'set_arena')
  assert.equal(arena.kind, 'arena'); assert.equal(arena.max_turns, 8); assert.equal(arena.reaction_max_s, 120); assert.equal(arena.fan_name, null)
  assert.deepEqual(s.slots.map((x) => x.display_name), ['A', 'B', 'C', 'D', 'E'])
  assert.equal(s.slots[0].ref_case_id, s1.id)
  const boss = s.cases.find((c) => c.code === 'boss_final')
  assert.equal(boss.kind, 'boss'); assert.equal(boss.max_turns, 32)
  assert.equal(s.fans[0].opening_message, 'salut'); assert.equal(s.fans[0].budget_cap, 60); assert.equal(s.fans[0].nego_threshold, 6); assert.equal(s.fans[0].meet_when, 'r')
  assert.deepEqual(s.messages.filter((x) => x.case_id === s1.id).map((x) => x.speaker), ['creator', 'fan'])
  // Ordre dans le module : position 0, 10, 20… selon l'ordre du JSON.
  assert.deepEqual(s.cases.filter((c) => c.module_id === m.id).map((c) => c.position), [0, 10, 20, 30, 40, 50])
})

test('validate : refuse un défi qui référence un cas d’un autre module ou non solo, un solo sans fan', () => {
  const bad = fixture(); bad.cas[5].arena[0] = 'boss_final'
  assert.throws(() => validate(bad), /set_arena/)
  const bad2 = fixture(); delete bad2.cas[0].fan_name
  assert.throws(() => validate(bad2), /s1.*fan_name/)
  const bad3 = fixture(); bad3.cas[0].sous_cat = 'nope'
  assert.throws(() => validate(bad3), /sous_cat/)
})

test('renderSql : un insert par table, dans l’ordre des FK, quotes échappées', () => {
  const sql = renderSql(buildSeed(fixture()))
  const order = ['training_modules', 'training_module_axes', 'training_module_sections', 'training_cases', 'training_case_messages', 'training_case_arena_slots', 'training_case_boss_fans']
    .map((t) => sql.indexOf(`insert into public.${t} (`))
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `ordre : ${order}`)
  assert.match(sql, /^-- Seed du catalogue/)
  assert.doesNotMatch(sql, /on conflict/)
})

const REAL = join(homedir(), 'Documents/good-luck-agency/formation.json')
test('formation.json réel : comptages attendus, aucun HTML résiduel', { skip: !existsSync(REAL) && 'formation.json absent' }, () => {
  const s = buildSeed(JSON.parse(readFileSync(REAL, 'utf8')))
  assert.deepEqual(s.counts, { modules: 7, axes: 24, sections: 10, cases: 85, solo: 79, arena: 5, boss: 1, messages: 229, slots: 25, fans: 5 })
  for (const m of s.modules) if (m.course_md) assert.doesNotMatch(m.course_md, /<\/?[a-z]/, `HTML résiduel dans ${m.code}`)
  const ids = new Set(s.cases.map((c) => c.id))
  assert.ok(s.slots.every((x) => ids.has(x.ref_case_id)))
})
