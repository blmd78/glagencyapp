'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { frDateNumeric } from '@glagency/core'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionButton } from '@/components/action-button'
import { eur2 } from '@/lib/format'
import { saveComptaSettings, savePrime } from '../actions'
import { settingsFormInput, type SettingsFormInput, type SettingsFormValues } from '../schema'
import type { ComptaRow } from '../types'

/**
 * Réglages de paie d'un membre — ADMIN seul (`canConfigure`). Sans cet écran, la colonne garde
 * ses défauts pour tout le monde : 10 % de commission et aucun fixe.
 *
 * TROIS RÉGLAGES, UN SEUL BOUTON (demande du propriétaire, 2026-07-27 : « y'a toujours le champ
 * setter dans paramètres et on peut pas mettre un fixe + com ») :
 *
 *  - le TAUX de commission, toujours appliqué ;
 *  - le FIXE de la période, qui S'AJOUTE à la commission dès qu'il est non nul — il ne la
 *    remplace pas. Le choix `% du CA` / `Fixe hebdo` a disparu (migration 0089) : il décrivait
 *    un mode que la feuille du propriétaire ne pratique nulle part ;
 *  - la PRIME nouveau chatteur, un MONTANT et rien d'autre.
 *
 * Le statut de la prime (« à verser » / « renoncée ») a quitté cet écran le 2026-07-28
 * (tâche 20). L'onglet « SUIVI PRIMES NVX CHATTEURS » du propriétaire ne connaît que deux
 * états — payée ou en attente : sur ses 71 lignes, 30 payées et 41 en attente, AUCUNE renoncée.
 * « Renoncée » ne décrivait donc aucune pratique. Le montant seul gouverne : **0 € = pas de
 * prime**. `'paid'` reste posé par `payPeriod` au moment du virement, et `savePrime` refuse
 * toujours de réécrire une prime déjà versée.
 *
 * La case « Setter » a disparu du même geste. Le statut de setter vit dans **Membres**
 * (`profiles.closing_role`) et ne commande RIEN ici : conditionner le versement du fixe à ce
 * champ le rendrait inopérant pour presque tout le monde en silence (mesuré le 2026-07-27 :
 * `closing_role = 'setter'` sur 1 seul profil en prod, alors que la feuille verse un fixe à
 * 59 personnes).
 *
 * DEUX TABLES, DEUX SERVER ACTIONS, mais UN SEUL geste à l'écran : `saveComptaSettings` écrit
 * `compta_settings`, `savePrime` écrit `compta_primes`. Le sous-titrage de l'échec est donc
 * OBLIGATOIRE — une erreur sur l'une ne doit jamais laisser croire que l'autre est passée
 * (`submit` ci-dessous nomme systématiquement ce qui a été enregistré et ce qui ne l'a pas été).
 *
 * Patron habituel : `'use no memo'` (le React Compiler casse `formState`), `zodResolver`, et le
 * triple générique `useForm<Input, unknown, Output>` — les champs `z.coerce.number()` ont un
 * type d'ENTRÉE `unknown`, donc input ≠ output.
 */
export function ComptaSettingsForm({ row }: { row: ComptaRow }) {
  'use no memo'

  // Une prime déjà VERSÉE est figée : `status`/`paid_at` sont la trace du virement posée par
  // `payPeriod`, et `savePrime` refuse de la réécrire côté serveur. Son champ cède la place à
  // la trace, et le submit ne l'envoie pas.
  const primeFrozen = row.prime?.status === 'paid'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues, unknown, SettingsFormInput>({
    resolver: zodResolver(settingsFormInput),
    defaultValues: {
      chatterId: row.id,
      rate: row.rate,
      fixedAmount: row.fixedAmount,
      // 100 € = le défaut de la colonne `compta_primes.amount`, repris ici pour que le montant
      // usuel n'ait pas à être ressaisi à chaque création.
      primeAmount: row.prime?.amount ?? 100,
    },
  })

  const submit = handleSubmit(async (v) => {
    const settings = await saveComptaSettings({
      chatterId: v.chatterId,
      rate: v.rate,
      fixedAmount: v.fixedAmount,
    })
    // La prime part MÊME SI les réglages ont échoué : les deux écritures sont indépendantes, et
    // renoncer à la seconde parce que la première a échoué ferait perdre une saisie valide.
    const prime = primeFrozen
      ? null
      : await savePrime({ chatterId: v.chatterId, amount: v.primeAmount })

    const settingsError = settings.success ? null : settings.error
    const primeError = prime == null || prime.success ? null : prime.error

    if (!settingsError && !primeError) {
      toast.success('Réglages enregistrés')
      return
    }

    // Message qui NOMME ce qui est passé et ce qui ne l'est pas. Un seul bouton à l'écran, deux
    // écritures derrière : « Erreur » tout court laisserait l'admin croire que rien n'a été
    // enregistré alors que la moitié l'a peut-être été — sur des règles de paie, c'est le genre
    // de malentendu qui se paie deux semaines plus tard.
    const message =
      settingsError && primeError
        ? `Rien n'a été enregistré. Taux et fixe : ${settingsError} Prime : ${primeError}`
        : settingsError
          ? `Taux et fixe NON enregistrés : ${settingsError}${prime == null ? '' : ' — la prime, elle, a bien été enregistrée.'}`
          : `Taux et fixe enregistrés, mais PAS la prime : ${primeError}`

    setError('root.serverError', { message })
    toast.error(message)
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`rate-${row.id}`}>Commission %</Label>
          <Input id={`rate-${row.id}`} type="number" step="0.01" {...register('rate')} />
          {errors.rate && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.rate.message}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fixed-${row.id}`}>Fixe par période €</Label>
          <Input id={`fixed-${row.id}`} type="number" step="0.01" {...register('fixedAmount')} />
          {errors.fixedAmount && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.fixedAmount.message}</p>
          )}
        </div>
      </div>
      {/* Ce que le fixe fait, dit là où on le saisit : il s'ajoute, et il vaut pour la période
          entière. Sans cette phrase, « Fixe par période » se lit encore comme l'ancien « fixe
          au lieu du pourcentage ». La mention d'une saisie hebdo qui le remplaçait a été
          retirée avec le champ lui-même : il était affiché DEUX fois (un par semaine) et les
          deux étaient additionnés — 75 € sur chaque ligne versaient 150 €. */}
      <p className="text-xs text-muted-foreground">
        Le fixe s&apos;ajoute à la commission et vaut pour la période entière (14 jours).
      </p>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Prime nouveau chatteur
        </p>
        {primeFrozen ? (
          <p className="text-xs text-muted-foreground">
            {eur2(row.prime?.amount ?? 0)} déjà versée
            {row.prime?.paidAt ? ` le ${frDateNumeric(row.prime.paidAt)}` : ''} — elle n&apos;est
            plus modifiable.
          </p>
        ) : (
          // La grille à 2 colonnes est CONSERVÉE avec un seul champ : le montant garde la
          // largeur des deux champs du dessus. Un champ pleine largeur ici serait un style
          // nouveau pour rien.
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`prime-amount-${row.id}`}>Montant €</Label>
              <Input
                id={`prime-amount-${row.id}`}
                type="number"
                step="0.01"
                {...register('primeAmount')}
              />
              {errors.primeAmount && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {errors.primeAmount.message}
                </p>
              )}
            </div>
          </div>
        )}
        {/* Comment dire « pas de prime » maintenant que « Renoncée » a disparu. Sans cette
            phrase, l'admin qui ne veut rien verser n'a plus aucun geste à sa disposition. */}
        {!primeFrozen && <p className="text-xs text-muted-foreground">0 € = pas de prime.</p>}
      </div>

      {errors.root?.serverError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
      <ActionButton type="submit" pending={isSubmitting} className="self-end">
        Enregistrer
      </ActionButton>
    </form>
  )
}
