'use client'

import { Controller, useForm, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveRecruitConfig } from '../actions-config'
import { configForm, type ConfigFormValues, type ConfigInput } from '../schema'
import type { RecruitConfigData } from '../types'
import { FieldError } from './field-error'
import { QiBankEditor } from './qi-bank-editor'

/**
 * Valeurs du formulaire depuis la config en base. Les nombres et la bonne réponse du QI partent en
 * CHAÎNES : un `<input>` ne rend que du texte, et Zod les recoerce (même parti pris que le dialog
 * de la Roue).
 */
const toForm = (c: RecruitConfigData): ConfigFormValues => ({
  open: c.open,
  botMessages: String(c.botMessages),
  qiTimer: String(c.qiTimer),
  frappeMin: String(c.frappeMin),
  connexionMin: String(c.connexionMin),
  qiMin: String(c.qiMin),
  globalThreshold: String(c.globalThreshold),
  discordLink: c.discordLink,
  typingText: c.typingText,
  qiBank: c.qiBank.map((s) => ({ slot: s.slot, variants: s.variants.map((v) => ({ q: v.q, opts: v.opts, a: String(v.a) })) })),
})

/** Les six champs numériques de la config (déroulé + seuils). */
type NumberName = 'botMessages' | 'qiTimer' | 'frappeMin' | 'connexionMin' | 'qiMin' | 'globalThreshold'

/** Champ numérique borné, avec son aide sous le champ. */
function NumberField({
  name,
  label,
  hint,
  min,
  max,
  disabled,
  error,
  register,
}: {
  name: NumberName
  label: string
  hint: string
  min: number
  max: number
  disabled: boolean
  error?: string
  register: UseFormRegister<ConfigFormValues>
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type="number" min={min} max={max} disabled={disabled} aria-invalid={!!error} {...register(name)} />
      <p className="text-xs text-muted-foreground">{hint}</p>
      <FieldError message={error} />
    </div>
  )
}

/**
 * Formulaire de la config du test (admin). Une seule ligne en base, un seul bouton : tout part
 * ensemble (`saveRecruitConfig`). Les seuils sont les GATES CACHÉS du verdict — le candidat ne les
 * voit jamais, ni avant ni après.
 *
 * `'use no memo'` obligatoire : le React Compiler casse le `formState` de RHF (règle projet).
 */
export function ConfigForm({ config }: { config: RecruitConfigData }) {
  'use no memo'
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ConfigFormValues, unknown, ConfigInput>({
    resolver: zodResolver(configForm),
    defaultValues: toForm(config),
  })

  const submit = handleSubmit(async (values) => {
    const res = await saveRecruitConfig(values)
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Configuration enregistrée')
    // Le texte de frappe est NORMALISÉ côté serveur : on resynchronise le formulaire sur ce qui a
    // réellement été enregistré, sinon l'écran garde la saisie brute (majuscules, doubles espaces).
    // Repasser par `toForm` n'est pas cosmétique : un radio RHF compare des CHAÎNES, un `a`
    // numérique décocherait toutes les bonnes réponses de la banque.
    reset(toForm({ ...config, ...values }))
  })

  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-3xl flex-col gap-6">
      <label className="flex items-start gap-3 rounded-md border p-3">
        <Controller
          control={control}
          name="open"
          render={({ field }) => (
            <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={isSubmitting} />
          )}
        />
        <span className="grid gap-1">
          <span className="text-sm font-medium">Test ouvert</span>
          <span className="text-xs text-muted-foreground">
            Décoché, la page /postuler affiche « Le recrutement est fermé pour le moment » — effet immédiat, y compris sur les tests en cours.
          </span>
        </span>
      </label>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Déroulé du test</legend>
        <NumberField name="botMessages" label="Échanges avec le client" hint="Nombre de réponses du fan IA avant la fin (1 à 50). C’est le plafond de coût." min={1} max={50} disabled={isSubmitting} error={errors.botMessages?.message} register={register} />
        <NumberField name="qiTimer" label="Secondes par question de logique" hint="5 à 120. Temps écoulé = réponse fausse." min={5} max={120} disabled={isSubmitting} error={errors.qiTimer?.message} register={register} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Seuils du verdict (jamais montrés au candidat)</legend>
        <NumberField name="qiMin" label="Logique minimum (sur 5)" hint="0 à 5. En dessous, refus — sans dire le chiffre." min={0} max={5} disabled={isSubmitting} error={errors.qiMin?.message} register={register} />
        <NumberField name="frappeMin" label="Frappe minimum (mots/min)" hint="1 à 200. Mesure déclarée par le navigateur du candidat." min={1} max={200} disabled={isSubmitting} error={errors.frappeMin?.message} register={register} />
        <NumberField name="connexionMin" label="Connexion minimum (Mb/s)" hint="1 à 1000. Mesure déclarée par le navigateur du candidat." min={1} max={1000} disabled={isSubmitting} error={errors.connexionMin?.message} register={register} />
        <NumberField name="globalThreshold" label="Score global minimum (sur 100)" hint="0 à 100. Global = logique/5×30 + conversation/100×70." min={0} max={100} disabled={isSubmitting} error={errors.globalThreshold?.message} register={register} />
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="discordLink">Lien Discord (envoyé aux candidats reçus)</Label>
        <Input id="discordLink" placeholder="https://discord.gg/…" disabled={isSubmitting} aria-invalid={!!errors.discordLink} {...register('discordLink')} />
        <p className="text-xs text-muted-foreground">Vide = l’écran de réussite n’affiche aucun lien.</p>
        <FieldError message={errors.discordLink?.message} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="typingText">Texte de l’épreuve de frappe</Label>
        <Textarea id="typingText" rows={4} disabled={isSubmitting} aria-invalid={!!errors.typingText} {...register('typingText')} />
        <p className="text-xs text-muted-foreground">
          Enregistré en minuscules, espaces compactés (c’est le texte exact que le candidat recopie). 50 caractères minimum.
        </p>
        <FieldError message={errors.typingText?.message} />
      </div>

      <QiBankEditor control={control} register={register} errors={errors} disabled={isSubmitting} />

      {errors.root && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.root.message}
        </p>
      )}

      <ActionButton type="submit" className="self-start" pending={isSubmitting}>
        Enregistrer
      </ActionButton>
    </form>
  )
}
