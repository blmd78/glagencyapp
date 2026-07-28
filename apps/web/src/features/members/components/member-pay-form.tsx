'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { z } from 'zod'
import { DEFAULT_RATE, frDateNumeric } from '@glagency/core'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionButton } from '@/components/action-button'
import { eur2 } from '@/lib/format'
import { paySettingsInput, payRateInput, payMoney } from '@/lib/pay-settings'
import { saveMemberPaySettings, saveMemberPrime, saveMemberRate } from '../actions-pay'
import { MemberRateHistory } from './member-rate-history'
import type { MemberPay } from '../types'

/**
 * Ce que l'onglet édite : le taux daté, le fixe ET la prime, dans un seul formulaire à UN SEUL
 * bouton « Enregistrer ». Trois tables et trois Server Actions côté serveur (`compta_rates` /
 * `compta_settings` / `compta_primes`), un seul geste à l'écran.
 *
 * Les deux `.extend(...)` et non un objet réécrit : les contraintes du taux, de sa date d'effet
 * et du fixe ne peuvent pas diverger de ce que les actions valident.
 */
const payFormInput = paySettingsInput
  .extend(payRateInput.omit({ chatterId: true }).shape)
  .extend({ primeAmount: payMoney })
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
 *  - le TAUX de commission, toujours appliqué, et DATÉ depuis la tâche 27 (« à partir du ») ;
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
 * TROIS TABLES, TROIS SERVER ACTIONS, mais UN SEUL geste à l'écran : `saveMemberRate` écrit
 * `compta_rates`, `saveMemberPaySettings` écrit `compta_settings`, `saveMemberPrime` écrit
 * `compta_primes`. Le sous-titrage de l'échec est donc OBLIGATOIRE — une erreur sur l'une ne
 * doit jamais laisser croire que les autres sont passées (`submit` ci-dessous nomme ce qui a
 * été enregistré et ce qui ne l'a pas été).
 *
 * ⚠️ LE TAUX N'EST ÉCRIT QUE S'IL CHANGE. Le champ est pré-rempli avec le taux courant et la
 * date avec le lundi de la semaine ; sans garde, corriger le fixe déposerait une ligne
 * d'historique de plus à chaque enregistrement. Le garde est CÔTÉ SERVEUR (`writeRate` compare
 * au taux en vigueur à cette date) et non ici : un test côté client sur des nombres saisis à la
 * main serait le genre de contrôle qu'on croit avoir.
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
      rate: pay.currentRate.rate,
      // Le lundi de la semaine en cours, calculé côté SERVEUR (cf. `get-members.ts`) — pas
      // `new Date()` ici, qui dépendrait de l'horloge du poste sur une date qui décide de la paie.
      effectiveFrom: pay.defaultEffectiveFrom,
      fixedAmount: pay.fixedAmount,
      // 100 € = le défaut de la colonne `compta_primes.amount`, repris ici pour que le montant
      // usuel n'ait pas à être ressaisi à chaque création.
      primeAmount: pay.prime?.amount ?? 100,
    },
  })

  const submit = handleSubmit(async (v) => {
    // LES TROIS ÉCRITURES SONT INDÉPENDANTES et partent toutes, même si l'une échoue : renoncer
    // aux suivantes parce que la première a échoué ferait perdre des saisies valides.
    const rate = await saveMemberRate({
      chatterId: v.chatterId,
      effectiveFrom: v.effectiveFrom,
      rate: v.rate,
    })
    const settings = await saveMemberPaySettings({
      chatterId: v.chatterId,
      fixedAmount: v.fixedAmount,
    })
    const prime = primeFrozen
      ? null
      : await saveMemberPrime({ chatterId: v.chatterId, amount: v.primeAmount })

    const rateError = rate.success ? null : rate.error
    const settingsError = settings.success ? null : settings.error
    const primeError = prime == null || prime.success ? null : prime.error

    if (!rateError && !settingsError && !primeError) {
      // Le message DIT si le taux a bougé. `saveMemberRate` renvoie `false` quand le taux
      // demandé était déjà celui en vigueur à cette date : annoncer « nouveau taux enregistré »
      // dans ce cas ferait croire à une augmentation qui n'a pas eu lieu.
      toast.success(
        rate.success && rate.data
          ? `Taux de ${v.rate} % enregistré à partir du ${frDateNumeric(v.effectiveFrom)}.`
          : 'Réglages enregistrés',
      )
      return
    }

    // Message qui NOMME ce qui est passé et ce qui ne l'est pas. Un seul bouton à l'écran, trois
    // écritures derrière : « Erreur » tout court laisserait l'admin croire que rien n'a été
    // enregistré alors qu'une partie l'a peut-être été — sur des règles de paie, c'est le genre
    // de malentendu qui se paie deux semaines plus tard.
    const echecs = [
      rateError && `Taux : ${rateError}`,
      settingsError && `Fixe : ${settingsError}`,
      primeError && `Prime : ${primeError}`,
    ].filter((x): x is string => Boolean(x))
    const passes = [
      !rateError && 'le taux',
      !settingsError && 'le fixe',
      prime != null && !primeError && 'la prime',
    ].filter((x): x is string => Boolean(x))
    const message =
      passes.length === 0
        ? `Rien n'a été enregistré. ${echecs.join(' ')}`
        : `${echecs.join(' ')} En revanche, ${passes.join(' et ')} ${passes.length > 1 ? 'ont' : 'a'} bien été enregistré(e).`

    setError('root.serverError', { message })
    toast.error(message)
  })

  return (
    // Ce `<form>` est le FRÈRE de celui de l'onglet Général, jamais son enfant : le dialog place
    // les deux dans deux `<TabsContent>` distincts. Un `<form>` imbriqué dans un `<form>` est
    // invalide en HTML et le navigateur en soumettrait un pour l'autre.
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* LE TAUX ET SA DATE D'EFFET, CÔTE À CÔTE — c'est un seul réglage en deux champs, et les
          séparer inviterait à changer l'un sans regarder l'autre. Grille à 2 colonnes déjà en
          place ici, aucun style nouveau. */}
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
          <Label htmlFor={`from-${memberId}`}>À partir du</Label>
          <Input
            id={`from-${memberId}`}
            type="date"
            disabled={isSubmitting}
            {...register('effectiveFrom')}
          />
          {errors.effectiveFrom && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.effectiveFrom.message}</p>
          )}
        </div>
      </div>
      {/* CE QUE LA DATE FAIT, dit là où on la saisit. Sans cette phrase, « À partir du » se lit
          comme une date de saisie et non comme une date d'EFFET : l'admin croirait que changer
          le taux repaie toute la période, ce qui était vrai avant la tâche 27 et ne l'est plus. */}
      <p className="text-xs text-muted-foreground">
        {pay.currentRate.fallback
          ? `Aucun taux n'a jamais été réglé : ${DEFAULT_RATE} % s'appliquent par défaut, y compris aux jours d'avant cette date.`
          : `En vigueur aujourd'hui : ${pay.currentRate.rate} %. Les jours d'avant cette date restent payés au taux précédent.`}
      </p>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Historique du taux
        </p>
        <MemberRateHistory memberId={memberId} history={pay.rateHistory} />
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        Le fixe s&apos;ajoute à la commission et vaut pour la période entière (14 jours). Il
        n&apos;est PAS daté : le changer vaut pour toutes les périodes.
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
      pour {DEFAULT_RATE} % de commission, aucun fixe, et aucune prime décidée.
    </p>
  )
}
