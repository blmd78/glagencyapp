import type { GlaSessionRow, LegacyCatalog } from './types'

/**
 * Jeux d'essai de la reprise GLA. Les VALEURS DE STRUCTURE sont réelles — codes de cas, `case_id`,
 * `created_ms`, `date_label`, notes d'axes, `plafond`, prix de médias, formes de `boss_details`,
 * anomalies de `moments` — relevées le 2026-08-24 sur la base Good Luck Agency.
 *
 * Les TEXTES sont réécrits : aucun login, aucun nom, aucune adresse e-mail, aucun extrait de
 * conversation réelle n'entre dans ce dépôt. Les identifiants de notre catalogue sont des UUID
 * fabriqués ; leurs valeurs métier (kind, max_turns, clés et libellés d'axes, noms des fans du
 * boss) sont celles de l'UAT.
 */

const CASE = {
  renc: '11111111-1111-4111-8111-111111111111',
  trans: '22222222-2222-4222-8222-222222222222',
  set: '33333333-3333-4333-8333-333333333333',
  boss: '44444444-4444-4444-8444-444444444444',
} as const
const MODULE = {
  renc: 'aaaaaaaa-0000-4000-8000-000000000001',
  trans: 'aaaaaaaa-0000-4000-8000-000000000002',
  set: 'aaaaaaaa-0000-4000-8000-000000000003',
  boss: 'aaaaaaaa-0000-4000-8000-000000000004',
} as const
export const CASE_IDS = CASE
export const MODULE_IDS = MODULE
export const BOSS_FAN_IDS = {
  Kevin: 'bbbbbbbb-0000-4000-8000-000000000001',
  Thomas: 'bbbbbbbb-0000-4000-8000-000000000002',
  Julien: 'bbbbbbbb-0000-4000-8000-000000000003',
  Marc: 'bbbbbbbb-0000-4000-8000-000000000004',
  Alex: 'bbbbbbbb-0000-4000-8000-000000000005',
} as const

export const PROFILE_ID = 'cccccccc-0000-4000-8000-000000000001'

export const catalog: LegacyCatalog = {
  casesByCode: new Map([
    [
      'renc_01',
      {
        id: CASE.renc, module_id: MODULE.renc, section_id: null, kind: 'solo' as const, fan_name: 'Pascal',
        code: 'renc_01', title: 'Niveau 1 — Envie spontanée et légère', phase: 'Envie légère', difficulty: 1,
        context: 'Contexte du cas.', objective: 'Objectif du cas.', max_turns: 8, reaction_max_s: null, is_sale: false,
        training_modules: { code: 'rencontre', title: 'Demande de rencontre', objective_label: 'L’esprit de ta réponse' },
      },
    ],
    [
      'trans_07',
      {
        id: CASE.trans, module_id: MODULE.trans, section_id: null, kind: 'solo' as const, fan_name: 'Sofiane',
        code: 'trans_07', title: 'Conv complète jusqu’au 1er payant', phase: 'Conversation complète', difficulty: 4,
        context: 'Contexte du cas.', objective: 'Objectif du cas.', max_turns: 12, reaction_max_s: null, is_sale: true,
        training_modules: { code: 'transitions', title: 'Transitions', objective_label: 'Étape de script à amener' },
      },
    ],
    [
      'set_mefiance_3',
      {
        id: CASE.set, module_id: MODULE.set, section_id: null, kind: 'solo' as const, fan_name: 'Maxime',
        code: 'set_mefiance_3', title: 'Niveau 3 — Demande de preuve', phase: 'Preuve précise', difficulty: 3,
        context: 'Contexte du cas.', objective: 'Objectif du cas.', max_turns: 10, reaction_max_s: null, is_sale: false,
        training_modules: { code: 'setting', title: 'Setting & Qualification', objective_label: 'Ce que tu dois obtenir' },
      },
    ],
    [
      'boss_final',
      {
        id: CASE.boss, module_id: MODULE.boss, section_id: null, kind: 'boss' as const, fan_name: null,
        code: 'boss_final', title: 'Boss final — 5 tunnels complets en simultané', phase: 'Boss final', difficulty: 5,
        context: 'Contexte du boss.', objective: 'Objectif du boss.', max_turns: 32, reaction_max_s: 120, is_sale: false,
        training_modules: { code: 'boss', title: 'Boss final', objective_label: 'Objectif' },
      },
    ],
  ]),
  axesByModule: new Map([
    [MODULE.renc, [
      { key: 'validation', name: 'Validation émotionnelle' },
      { key: 'justification', name: 'Cohérence de la justification' },
      { key: 'compensation', name: 'Compensation / alternative' },
      { key: 'maintien', name: 'Maintien du fan' },
    ]],
    [MODULE.trans, [
      { key: 'coherence', name: 'Cohérence' },
      { key: 'liaison', name: 'Liaison / naturel' },
      { key: 'patience', name: 'Patience / timing' },
      { key: 'progression', name: 'Progression' },
    ]],
    [MODULE.set, [
      { key: 'naturel', name: 'Naturel / fluidité' },
      { key: 'lecture', name: 'Lecture & adaptation' },
      { key: 'personnalisation', name: 'Personnalisation' },
      { key: 'progression', name: 'Progression vers l’objectif' },
    ]],
    [MODULE.boss, []],
  ]),
  bossFanIds: new Map(Object.entries(BOSS_FAN_IDS)),
}

/**
 * Solo PLAFONNÉ. Réel : `renc_01`, Σaxes = 67 > total = 65, `objectif_atteint = false`,
 * `plafond = 70` → cap = min(65, 70) = 65 → `capped = true`.
 * `date_label` est en UTC (10:14) alors que l'instant réel est 12:14 à Paris : le piège de §5.7.
 */
export const soloCapped: GlaSessionRow = {
  id: 's178618406845274a9c2',
  caseId: 'renc_01',
  module: 'rencontre',
  createdMs: 1786184068452,
  dateLabel: '08/08/2026 10:14',
  score: {
    total: 65,
    plafond: 70,
    validation: 14,
    justification: 18,
    compensation: 17,
    maintien: 18,
    objectif_atteint: false,
    commentaire: 'Bonne validation de l’envie, la justification tient mais la compensation arrive trop tard.',
    moments: [
      { cite: 'on se verra un jour promis', type: 'good', probleme: 'Entretient l’espoir sans fixer.', indice: '' },
      // Alias mesurés : `mieux` (~310 occurrences) et `problème` accentué (~14).
      { cite: 'je peux pas ce week-end', type: 'bad', 'problème': 'Refus sec, sans alternative.', mieux: 'Propose une contrepartie à la place du refus.' },
      // Clés non canoniques mesurées (`cite2`, `type_field`…) : écartées, sans faire échouer la note.
      { cite2: 'ignorée', type_field: 'bad', probleme2: 'ignorée' },
    ],
  },
  history: [
    { who: 'them', t: 'on se voit quand alors ?' },
    { who: 'me', t: 'j’adorerais, mais je bouge beaucoup en ce moment 😅' },
    { who: 'them', t: 'ah bon, t’es jamais dispo' },
    { who: 'me', t: 'promis on trouvera, en attendant je te garde quelque chose 😏' },
    { who: 'them', t: 'ok ça marche' },
    { who: 'me', t: 'parfait, je te tiens au courant 😘' },
  ],
}

/**
 * Solo AVEC MÉDIAS. Réel : `trans_07`, Σaxes = 44 = total, `plafond = 50`, objectif non atteint
 * → cap = min(65, 50) = 50, 44 > 50 est faux → `capped = false`.
 * Les trois prix couvrent les trois cas mesurés : un prix courant, les 196 gratuits (0 €), et le
 * seul prix non entier du corpus (8,5 € → 9).
 */
export const soloMedia: GlaSessionRow = {
  id: 's1786175274341065088',
  caseId: 'trans_07',
  module: 'transitions',
  createdMs: 1786175274341,
  dateLabel: '08/08/2026 07:47',
  score: {
    total: 44, plafond: 50, coherence: 12, liaison: 10, patience: 14, progression: 8,
    objectif_atteint: false, commentaire: 'Transition correcte, le premier payant arrive trop tôt.',
    moments: [],
  },
  history: [
    { who: 'them', t: 'coucou' },
    { who: 'me', t: 'hey toi 😊 bien rentré ?' },
    { who: 'me', media: true, price: 6 },
    { who: 'them', t: 'j’ai pas trop de budget là' },
    { who: 'me', media: true, price: 0 },
    { who: 'me', media: true, price: 8.5 },
  ],
}

/**
 * BOSS avec transcription : 5 fils, barème /100, étapes souvent nulles (le fan n'a pas sollicité la
 * compétence). `sessions.history = []` sur les 1 789 sessions boss — `serveur.py:1173` l'écrit en
 * dur : toute la matière est dans `boss_details`.
 */
export const bossWithDetails: GlaSessionRow = {
  id: 's1787327466999f6447d',
  caseId: 'boss_final',
  module: 'boss',
  createdMs: 1787327466999,
  dateLabel: '21/08/2026 15:51',
  score: {
    total: 35,
    objectif_atteint: false,
    commentaire: 'Cinq tunnels ouverts, aucun mené au bout.',
    boss_details: [
      { fan: 'Kevin', total: 30, axes: { setting: 25, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null }, commentaire: 'Accroche répétitive.', history: [{ who: 'them', t: 'salut' }, { who: 'me', t: 'coucou toi 😊' }, { who: 'them', t: 'ça va ?' }] },
      { fan: 'Thomas', total: 55, axes: { setting: 55, transition: 40, sexting: null, rencontre: null, nego: null, relationnel: null }, commentaire: 'Bonne relance.', history: [{ who: 'them', t: 'c’est payant ici ?' }, { who: 'me', t: 'ça dépend de ce que tu cherches 😏' }] },
      { fan: 'Julien', total: 60, axes: { setting: 60, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null }, commentaire: 'Qualification amorcée.', history: [{ who: 'them', t: 'je m’ennuie ce soir' }, { who: 'me', t: 'raconte-moi 😌' }] },
      { fan: 'Marc', total: 15, axes: { setting: 20, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null }, commentaire: 'Le fan est pressé, réponse plate.', history: [{ who: 'them', t: 'tu proposes quoi ?' }] },
      // `axes: null` en bloc — 16 éléments mesurés : aucune ligne d'axe ne doit être écrite.
      { fan: 'Alex', total: 0, axes: null, commentaire: 'Conversation morte.', history: [] },
    ],
  },
  history: [],
}

/**
 * BOSS SANS transcription : `boss_details: null` (1 211 sessions) — la session existe et compte
 * (`boss_best` / `boss_done`), mais SANS aucun fil ni message.
 */
export const bossWithoutDetails: GlaSessionRow = {
  id: 's1786115070282f8d5a7',
  caseId: 'boss_final',
  module: 'boss',
  createdMs: 1786115070282,
  dateLabel: '07/08/2026 15:04',
  score: { total: 47, commentaire: 'Reactivite validee.', boss_details: null, objectif_atteint: true },
  history: [],
}

/**
 * `moments` en **`string`** (111 sessions) + les clés d'un moment APLATIES à la racine de `score`
 * (102 sessions : `type`, `cite`, `probleme`, `indice`) + une clé fantôme (`moments_note`, 4 lignes).
 * Aucune de ces clés ne doit devenir un axe.
 */
export const soloMomentsString: GlaSessionRow = {
  id: 's17861739814237bef79',
  caseId: 'set_mefiance_3',
  module: 'setting',
  createdMs: 1786173981423,
  dateLabel: '08/08/2026 07:26',
  score: {
    total: 45, plafond: 65, naturel: 10, lecture: 12, personnalisation: 11, progression: 12,
    objectif_atteint: false,
    commentaire: 'Bon accueil de la digression, rebond léger vers le chaud.',
    moments: '<parameter name="cite">une chaîne, pas un tableau',
    type: 'good',
    cite: 'fuite d’un moment aplati',
    probleme: 'Ne doit pas devenir un axe.',
    indice: '',
    moments_note: 3,
  },
  history: [
    { who: 'them', t: 'prouve-moi que c’est bien toi' },
    { who: 'me', t: 'je fais pas de photo avec le prénom sur papier 😅' },
  ],
}
