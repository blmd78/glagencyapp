import { BOSS_PASS } from '@glagency/core'
import type { Json } from '@glagency/db'
import { BOSS_STEPS } from '@/lib/ai/schema'
import { buildCaseSnapshot } from '@/lib/training/case-snapshot'
import { LIMITS, LegacySourceError, clampInt, finiteOrNull } from './bounds'
import { cleanMoments } from './moments'
import { buildThreadMessages, glaBossDetailZod, glaScoreZod, isoFromCreatedMs, record } from './parse'
import type {
  GlaSessionRow, LegacyAnomaly, LegacyCaseRow, LegacyCatalog, LegacyRows, LegacySkip, LegacyTransformResult,
} from './types'
import { glaMessageId, glaSessionId, glaThreadId } from './uuid5'

export type { LegacyAnomaly, LegacyRows, LegacySkip, LegacyTransformResult } from './types'

/**
 * Seuil de §9.7 : une session boss notée au-dessus SANS `boss_details` n'a pas pu être jouée — la
 * moyenne mesurée des 1 990 fils de boss réels est 42,5 et leur maximum 73. Un tel score signe un
 * POST direct sur `/api/formation/boss-save`, qui ne valide rien (`serveur.py:1157-1160`). On garde
 * la ligne (elle peut être un artefact d'un vieux code) mais on la remonte.
 */
const BOSS_FORGED_TOTAL = 90

/**
 * GLA → nos cinq tables. Module NEUTRE, PUR, zéro I/O, testable en Vitest.
 *
 * Il VALIDE AVANT DE TRANSFORMER (`bounds.ts`) et construit tout le lot en mémoire : l'appelant
 * n'écrit qu'une fois la fonction revenue. C'est ce qui tient la règle §5.9 — « la validation passe
 * avant la première écriture » : une ligne hors bornes découverte à la 300ᵉ session laisserait un
 * import à moitié écrit qu'il faudrait ensuite expliquer.
 *
 * Le discriminant de forme n'est PAS une clé `type` de `score` (elle n'existe que sur 100 lignes,
 * avec les valeurs `good`/`bad` — c'est une fuite d'un objet `moments` aplati à la racine) : c'est
 * le CAS, via son `kind` dans NOTRE catalogue. Les notes sont lues en LISTE BLANCHE, jamais « tout
 * ce qui reste » : 102 sessions portent `type`/`cite`/`probleme`/`indice` à la racine de `score` et
 * 4 des clés fantômes (`moments2`, `commentaire2`, `commentaire_fin`, `moments_note`).
 */
export function transformLegacySessions(input: {
  profileId: string
  sessions: readonly GlaSessionRow[]
  catalog: LegacyCatalog
}): LegacyTransformResult {
  const { profileId, sessions: source, catalog } = input
  if (source.length > LIMITS.sessionsPerClaim) {
    throw new LegacySourceError(`${source.length} sessions à reprendre (plafond ${LIMITS.sessionsPerClaim})`)
  }

  const rows: LegacyRows = { sessions: [], threads: [], messages: [], threadScores: [], axisScores: [] }
  const skipped: LegacySkip[] = []
  const anomalies: LegacyAnomaly[] = []
  const caseCodes = new Set<string>()

  // Poids cumulé : le relâchement de 0123 ouvre un plafond PAR LIGNE sans plafond AGRÉGÉ.
  let weight = 0
  const spend = (n: number, glaId: string) => {
    weight += n
    if (weight > LIMITS.importChars) {
      throw new LegacySourceError(`poids cumulé > ${LIMITS.importChars} caractères`, glaId)
    }
  }

  for (const s of source) {
    const glaId = typeof s.id === 'string' ? s.id.trim() : ''
    if (!glaId || glaId.length > LIMITS.legacyIdChars) {
      skipped.push({ glaId: String(s.id ?? ''), reason: 'identifiant de session absent ou aberrant' })
      continue
    }
    const at = isoFromCreatedMs(s.createdMs)
    if (!at) {
      skipped.push({ glaId, reason: 'created_ms absent ou hors bornes' })
      continue
    }
    const code = typeof s.caseId === 'string' ? s.caseId.trim() : ''
    const kase: LegacyCaseRow | undefined = catalog.casesByCode.get(code)
    if (!kase) {
      // 80/80 codes joués existent aujourd'hui dans `training_cases` : garde défensive contre une
      // divergence future de catalogue. On écarte LA SESSION, jamais tout l'import.
      skipped.push({ glaId, reason: `cas inconnu du catalogue (${code || '—'})` })
      continue
    }

    const raw = record(s.score)
    const score = glaScoreZod.safeParse(raw).data ?? {}
    const objective = score.objectif_atteint ?? null
    const sessionId = glaSessionId(glaId)
    // Déjà la valeur PLAFONNÉE côté GLA (`total > Σaxes` = 0 ligne) : ne pas recalculer.
    const totalClamped = clampInt(score.total, 0, LIMITS.totalMax, 0)
    caseCodes.add(kase.code)

    rows.sessions.push({
      id: sessionId,
      legacy_id: glaId,
      // JAMAIS une valeur venue du client : le profil vient de la garde de la Server Action.
      profile_id: profileId,
      case_id: kase.id,
      // Le module du CAS, pas `sessions.module` : les codes coïncident, la FK doit rester cohérente.
      module_id: kase.module_id,
      // Conséquence assumée : les 1 789 lignes `boss_final` partent toutes en `boss`, les 704
      // arènes de module comprises — `boss-save` force `caseId="boss_final"` pour les deux modes.
      kind: kase.kind,
      // 'scored' DÈS L'INSERT : passer par 'active' sérialiserait l'import par chatter
      // (`training_sessions_one_active_idx` est un unique partiel sur (profile_id) where active).
      status: 'scored',
      case_snapshot: buildCaseSnapshot(kase) as unknown as Json,
      total: totalClamped,
      objective_reached: objective,
      started_at: at,
      // Aucune durée en GLA. `scored_at` est obligatoire EN PRATIQUE : `training_refresh_stats` et
      // `active_days` le lisent — le laisser nul rendrait tout l'import invisible.
      ended_at: at,
      scored_at: at,
    })

    const detailsRaw = raw.boss_details
    const isBoss = kase.kind === 'boss'
    if (isBoss && Array.isArray(detailsRaw) && detailsRaw.length > 0) {
      buildBossThreads({ rows, spend, catalog, kase, glaId, sessionId, at, details: detailsRaw })
      continue
    }
    if (isBoss) {
      // 1 211 sessions `boss_details: null` + 180 sans la clé : `serveur.py:1173` écrit
      // `"history": []` en dur. La session existe et compte (`boss_best` / `boss_done`), mais SANS
      // aucun fil ni message — l'écran de résultat s'ouvre vide, sans crash (`result-view.tsx`
      // n'accède au fil qu'en `single?.`).
      //
      // §9.7 : une note haute SANS la moindre transcription est le seul signal exploitable qu'on
      // ait contre un score fabriqué. On importe quand même (bloquer punirait un historique
      // légitime pour un artefact de vieux code), on alerte.
      if (totalClamped >= BOSS_FORGED_TOTAL) {
        anomalies.push({ glaId, reason: `session boss notée ${totalClamped}/100 sans aucune transcription` })
      }
      continue
    }

    // ── Solo : un seul fil, position 0 ────────────────────────────────────────────────────────
    const threadId = glaThreadId(glaId, 0)
    const msgs = buildThreadMessages({
      glaId, sessionId, threadId, position: 0, history: s.history, at, messageId: glaMessageId, spend,
    })
    rows.messages.push(...msgs.rows)
    rows.threads.push({
      id: threadId,
      session_id: sessionId,
      position: 0,
      boss_fan_id: null,
      // Aucune session GLA ne porte un code d'arène : les 5 codes d'arène sont exactement les 5
      // seuls codes du catalogue jamais joués.
      ref_case_id: null,
      fan_name: (kase.fan_name ?? '').trim().slice(0, LIMITS.fanNameChars) || 'Fan',
      // `lost_reason` est absent de GLA (aucun token `[[ELIM:` dans les 282 k messages) : tous les
      // fils importés sont 'done', jamais 'lost'.
      status: 'done',
      lost_reason: null,
      turns_used: msgs.turns,
      // Absent de GLA → repiqué sur le cas.
      max_turns: kase.max_turns,
      next_due_at: null,
    })

    // Les 4 axes du MODULE, en liste blanche.
    const axes = catalog.axesByModule.get(kase.module_id) ?? []
    let sumAxes = 0
    for (const axis of axes) {
      const v = finiteOrNull(raw[axis.key])
      if (v === null) continue
      const score25 = clampInt(v, 0, LIMITS.axisModuleMax, 0)
      sumAxes += score25
      rows.axisScores.push({ thread_id: threadId, axis_key: axis.key, axis_name: axis.name, score: score25 })
    }

    // `capped` : GLA stocke un NOMBRE (`plafond`, 0..89), pas un booléen — il faut le reconstruire.
    //
    // ÉCART ASSUMÉ AVEC LA SPEC (§5.4), tranché par la mesure. La spec prescrit
    // `Σaxes > min(objectif_atteint ? 100 : 65, plafond ?? 100)`, reconstruction du plafonnement
    // serveur (`serveur.py:1045-1052`). Confrontée aux 15 570 sessions non-boss le 2026-08-24, elle
    // rend 456 lignes plafonnées — alors que la spec mesure elle-même 426 écarts `total < Σaxes`.
    // Les 30 lignes de trop sont toutes du 30/07 au 02/08, toutes sans la clé `plafond`, toutes à
    // `objectif_atteint = false` et `total = Σaxes > 65` : la règle des 65 n'était pas encore en
    // vigueur côté serveur. La formule est la reconstruction d'une règle qui a changé.
    //
    // On prend donc la PREUVE DIRECTE que la note a été rabotée : `total < Σaxes`. Exact sur
    // 15 570/15 570 (`total > Σaxes` n'existe pas : 0 ligne), et insensible aux règles passées.
    const comment = score.commentaire ?? ''
    spend(comment.length, glaId)
    rows.threadScores.push({
      thread_id: threadId,
      total: totalClamped,
      objective_reached: objective ?? false,
      capped: sumAxes > 0 && totalClamped < sumAxes,
      comment,
      moments: cleanMoments(raw.moments) as unknown as Json,
      // La date GLA, pas `now()`.
      scored_at: at,
    })
  }

  return {
    rows,
    stats: {
      read: source.length,
      sessions: rows.sessions.length,
      threads: rows.threads.length,
      messages: rows.messages.length,
      cases: caseCodes.size,
      skipped,
      anomalies,
    },
  }
}

/**
 * Le boss = CINQ conversations en parallèle, chacune un fil. `sessions.history` est vide sur les
 * 1 789 sessions boss : toute la matière est dans `boss_details`, écrit par le NAVIGATEUR
 * (`/api/formation/boss-save` ne valide rien) — d'où les bornes.
 */
function buildBossThreads(ctx: {
  rows: LegacyRows
  spend: (chars: number, glaId: string) => void
  catalog: LegacyCatalog
  kase: LegacyCaseRow
  glaId: string
  sessionId: string
  at: string
  details: unknown[]
}): void {
  const { rows, spend, catalog, kase, glaId, sessionId, at, details } = ctx
  if (details.length > LIMITS.threadsPerSession) {
    throw new LegacySourceError(`${details.length} fils de boss (plafond ${LIMITS.threadsPerSession})`, glaId)
  }
  details.forEach((d, i) => {
    const det = record(d)
    const parsed = glaBossDetailZod.safeParse(det).data ?? {}
    const fan = (parsed.fan ?? '').trim()
    if (fan.length > LIMITS.fanNameChars) {
      throw new LegacySourceError(`nom de fan de ${fan.length} caractères (plafond ${LIMITS.fanNameChars})`, glaId)
    }
    const threadId = glaThreadId(glaId, i)
    const msgs = buildThreadMessages({
      glaId, sessionId, threadId, position: i, history: det.history, at, messageId: glaMessageId, spend,
    })
    rows.messages.push(...msgs.rows)
    rows.threads.push({
      id: threadId,
      session_id: sessionId,
      position: i,
      // Les 5 noms GLA (Kevin, Thomas, Julien, Marc, Alex) correspondent aux 5 fans du cas
      // `boss_final`. Pas de correspondance → `null` : on ne bloque pas l'import pour un libellé.
      boss_fan_id: catalog.bossFanIds.get(fan) ?? null,
      ref_case_id: null,
      fan_name: fan || `Fan ${i + 1}`,
      status: 'done',
      lost_reason: null,
      turns_used: msgs.turns,
      max_turns: kase.max_turns,
      next_due_at: null,
    })
    const total = clampInt(parsed.total, 0, LIMITS.totalMax, 0)
    const comment = parsed.commentaire ?? ''
    spend(comment.length, glaId)
    rows.threadScores.push({
      thread_id: threadId,
      total,
      // Absent de GLA au niveau du fil → la règle du boss (`BOSS_PASS`, rules.ts:11).
      objective_reached: total >= BOSS_PASS,
      // Pas de plafond au niveau d'un fil de boss.
      capped: false,
      comment,
      moments: [],
      scored_at: at,
    })
    // Étapes du boss : barème /100 (échelle DIFFÉRENTE des /25 des axes de module) et souvent
    // `null` — le fan n'a pas sollicité la compétence. « Non sollicité » n'est pas « raté » : on
    // N'INSÈRE PAS la ligne, sinon `training_axis_profile` (0113:1247), qui fait une moyenne sur
    // les lignes EXISTANTES, tomberait mécaniquement. La PK (thread_id, axis_key) autorise l'absence.
    const axes = record(det.axes)
    for (const step of BOSS_STEPS) {
      const v = finiteOrNull(axes[step.key])
      if (v === null) continue
      rows.axisScores.push({
        thread_id: threadId,
        axis_key: step.key,
        axis_name: step.name,
        score: clampInt(v, 0, LIMITS.axisBossMax, 0),
      })
    }
  })
}
