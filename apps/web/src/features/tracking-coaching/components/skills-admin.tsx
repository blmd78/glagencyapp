'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { archiveSkill, saveSkill } from '../actions'
import { skillForm, type SkillFormValues } from '../schema'

export interface SkillLine {
  id: string
  name: string
  description: string
}

/**
 * Gestion de la grille de compétences — ADMIN.
 *
 * Sans elle, la grille reste bloquée sur la seule compétence relevée dans leurs pages : les six
 * autres existent chez eux, mais leurs libellés n'apparaissent nulle part dans ce qu'on a capturé.
 * Les inventer aurait donné une grille fausse ; c'est donc ici qu'on les saisit.
 *
 * On ARCHIVE au lieu de supprimer : effacer une compétence emporterait tout l'historique des notes
 * qui y pointent, et ce sont des évaluations de personnes.
 */
export function SkillsAdmin({ skills }: { skills: SkillLine[] }) {
  // ⚠️ React Hook Form + React Compiler : sans ça, `formState` est mémoïsé et les erreurs
  // n'apparaissent jamais sous les champs. Règle du dépôt.
  'use no memo'

  const [pending, startTransition] = useTransition()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SkillFormValues>({
    resolver: zodResolver(skillForm),
    defaultValues: { name: '', description: '' },
  })

  const submit = handleSubmit((values) => {
    run(() => saveSkill({ skillId: null, ...values }), 'Compétence ajoutée')
    reset()
  })

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok: string): void => {
    startTransition(async () => {
      const res = await fn()
      if (res.success) toast.success(ok)
      else toast.error(res.error ?? 'Erreur inattendue')
    })
  }

  return (
    <details className="card">
      <summary className="blockh">
        <h2>Grille de compétences</h2>
        <span className="cnt">
          {skills.length} compétence{skills.length > 1 ? 's' : ''} · admin
        </span>
      </summary>

      <div className="modlist">
        {skills.map((s) => (
          <div key={s.id} className="lrow">
            <input
              defaultValue={s.name}
              aria-label={`Nom de « ${s.name} »`}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== s.name) {
                  run(() => saveSkill({ skillId: s.id, name: v, description: s.description }), 'Compétence renommée')
                }
              }}
            />
            <span className="lu">{s.description}</span>
            <button
              type="button"
              className="x on"
              title="Retirer de la grille (l’historique est conservé)"
              onClick={() => run(() => archiveSkill({ skillId: s.id }), 'Compétence retirée')}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <form className="cardpad laddrow" onSubmit={submit} noValidate>
        <input placeholder="Nom (ex. Closing)" {...register('name')} />
        <input placeholder="Ce qu'on attend sur cette compétence" {...register('description')} />
        <button type="submit" className="btn sm" disabled={pending}>
          Ajouter
        </button>
        {errors.name ? <p className="msg ko">{errors.name.message}</p> : null}
        {errors.description ? <p className="msg ko">{errors.description.message}</p> : null}
      </form>
    </details>
  )
}
