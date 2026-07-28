'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { z } from 'zod'
import { frDateNumeric } from '@glagency/core'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionButton } from '@/components/action-button'
import { eur2 } from '@/lib/format'
import { paySettingsInput, payMoney } from '@/lib/pay-settings'
import { saveMemberPaySettings, saveMemberPrime } from '../actions-pay'
import type { MemberPay } from '../types'

/**
 * Ce que l'onglet édite : les réglages ET la prime, dans un seul formulaire à UN SEUL bouton
 * « Enregistrer ». Deux tables et deux Server Actions côté serveur (`compta_settings` /
 * `compta_primes`), un seul geste à l'écran.
 *
 * `paySettingsInput.extend(...)` et non un objet réécrit : les contraintes du taux et du fixe
 * ne peuvent pas diverger de ce que l'action valide.
 */
const payFormInput = paySettingsInput.extend({ primeAmount: payMoney })
type PayFormInput = z.infer<typeof payFormInput>
type PayFormValues = z.input<typeof payFormInput>

/**
 * Onglet « Compta » du dialog de membre — ADMIN seul. DÉPLACÉ ICI depuis l'engrenage de la
 * table Compta le 2026-07-28 (demande du propriétaire : « je pense que tout va dans membre, tu
 * mets un tab dans le dialog direct ») ; champs, libellés, bornes et phrases d'aide INCHANGÉS.
 * Le taux, le fixe et la prime sont des attributs de la PERSONNE, pas de la période — les tenir
 * dans deux écrans était la même erreur que le fixe qui vivait en double (tâche 19).
 *
 * TROIS RÉGLAGES, UN SEUL BOUTON (demande du propriétaire, 2026-07-27) :
 *  - le TAUX de commission, toujours appliqué ;
 *  - le FIXE de la période, qui S'AJOUTE à la commission dès qu'il est non nul — il ne la
 *    remplace pas (le choix `% du CA` / `Fixe hebdo` a disparu, migration 0089) ;
 *  - la PRIME nouveau chatteur, un MONTANT et rien d'autre — **0 € = pas de prime**.
 *
 * FORMULAIRE À PART de celui du membre, et non trois champs de plus dedans. Deux raisons :
 *  1. Ce sont deux frontières de privilèges — le membre s'édite aussi par un manager (client
 *     service-role + `authz.ts`), la paie est admin-seule sous RLS.
 *  2. Une prime ne doit jamais s'écrire « en passant ». Fondus dans le bouton du membre, ils
 *     partiraient à chaque changement de pages : `compta_primes` gagnerait une ligne à 100 €
 *     « à verser » pour tout membre édité, alors que l'ABSENCE de ligne est une information
 *     (l'onglet Suivi de la Compta la lit comme « le montant n'a jamais été décidé »).
 * Un seul bouton est visible à la fois — chaque onglet a le sien.
 *
 * DEUX TABLES, DEUX SERVER ACTIONS, mais UN SEUL geste à l'écran : `saveMemberPaySettings`
 * écrit `compta_settings`, `saveMemberPrime` écrit `compta_primes`. Le sous-titrage de l'échec
 * est donc OBLIGATOIRE — une erreur sur l'une ne doit jamais laisser croire que l'autre est
 * passée (`submit` ci-dessous nomme ce qui a été enregistré et ce qui ne l'a pas été).
 *
 * Patron habituel : `'use no memo'` (le React Compiler casse `formState`), `zodResolver`, et le
 * triple générique `useForm<Input, unknown, Output>` — les champs `z.coerce.number()` ont un
 * type d'ENTRÉE `unknown`, donc input ≠ output.
 */
export function MemberPayForm({ memberId, pay }: { memberId: string; pay: MemberPay }) {
  'use no memo'

  // Une prime déjà VERSÉE est figée : `status`/`paid_at` sont la trace du virement posée par
  // `payPeriod`, et `writePrime` refuse de la réécrire côté serveur. Son champ cède la place à
  // la trace, et le submit ne l'envoie pas.
  const primeFrozen = pay.prime?.status === 'paid'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PayFormValues, unknown, PayFormInput>({
    resolver: zodResolver(payFormInput),
    defaultValues: {
      chatterId: memberId,
      rate: pay.rate,
      fixedAmount: pay.fixedAmount,
      // 100 € = le défaut de la colonne `compta_primes.amount`, repris ici pour que le montant
      // usuel n'ait pas à être ressaisi à chaque création.
      primeAmount: pay.prime?.amount ?? 100,
    },
  })

  const submit = handleSubmit(async (v) => {
    const settings = await saveMemberPaySettings({
      chatterId: v.chatterId,
      rate: v.rate,
      fixedAmount: v.fixedAmount,
    })
    // La prime part MÊME SI les réglages ont échoué : les deux écritures sont indépendantes, et
    // renoncer à la seconde parce que la première a échoué ferait perdre une saisie valide.
    const prime = primeFrozen
      ? null
      : await saveMemberPrime({ chatterId: v.chatterId, amount: v.primeAmount })

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
    // Ce `<form>` est le FRÈRE de celui de l'onglet Général, jamais son enfant : le dialog place
    // les deux dans deux `<TabsContent>` distincts. Un `<form>` imbriqué dans un `<form>` est
    // invalide en HTML et le navigateur en soumettrait un pour l'autre.
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`rate-${memberId}`}>Commission %</Label>
          <Input
            id={`rate-${memberId}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            {...register('rate')}
          />
          {errors.rate && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.rate.message}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fixed-${memberId}`}>Fixe par période €</Label>
          <Input
            id={`fixed-${memberId}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            {...register('fixedAmount')}
          />
          {errors.fixedAmount && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.fixedAmount.message}</p>
          )}
        </div>
      </div>
      {/* Ce que le fixe fait, dit là où on le saisit : il s'ajoute, et il vaut pour la période
          entière. Sans cette phrase, « Fixe par période » se lit encore comme l'ancien « fixe
          au lieu du pourcentage ». */}
      <p className="text-xs text-muted-foreground">
        Le fixe s&apos;ajoute à la commission et vaut pour la période entière (14 jours).
      </p>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Prime nouveau chatteur
        </p>
        {primeFrozen ? (
          <p className="text-xs text-muted-foreground">
            {eur2(pay.prime?.amount ?? 0)} déjà versée
            {pay.prime?.paidAt ? ` le ${frDateNumeric(pay.prime.paidAt)}` : ''} — elle
            n&apos;est plus modifiable.
          </p>
        ) : (
          // La grille à 2 colonnes est CONSERVÉE avec un seul champ : le montant garde la
          // largeur des deux champs du dessus. Un champ pleine largeur ici serait un style
          // nouveau pour rien.
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`prime-amount-${memberId}`}>Montant €</Label>
              <Input
                id={`prime-amount-${memberId}`}
                type="number"
                step="0.01"
                disabled={isSubmitting}
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

/** Onglet « Compta » en CRÉATION : le membre n'a pas encore d'`id`, donc `compta_settings.
 *  chatter_id` (FK → `profiles.id`, migration 0085) n'a rien à référencer. On le dit au lieu de
 *  monter des champs qui ne pourraient pas s'enregistrer, et on annonce les défauts appliqués
 *  en attendant. */
export function MemberPayPlaceholder() {
  return (
    <p className="text-sm text-muted-foreground">
      Les réglages de paie s&apos;enregistrent une fois le membre créé. En attendant, il compte
      pour 10 % de commission, aucun fixe, et aucune prime décidée.
    </p>
  )
}
