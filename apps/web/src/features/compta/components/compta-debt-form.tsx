'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionButton } from '@/components/action-button'
import { saveDebt } from '../actions-config'
import { debtInput, type DebtInput, type DebtFormValues } from '../schema-config'

/**
 * Ajout d'un solde de partant — ADMIN seul. Trois champs sur une ligne et un bouton.
 *
 * ICI UN BOUTON, ET C'EST DÉLIBÉRÉ. Le reste de la compta s'enregistre tout seul parce qu'on y
 * CORRIGE des lignes qui existent déjà, une par chatteur : un bouton par ligne y ferait deux
 * cents boutons. Une dette, elle, se CRÉE — il n'y a pas de ligne à quitter, et un formulaire
 * vide qui partirait au blur écrirait une dette de 0 € au premier clic à côté. Le geste et le
 * risque ne sont pas les mêmes.
 *
 * `reset()` après succès : le formulaire redevient vide pour la dette suivante. Sans ça, un
 * second clic sur « Ajouter » créerait un doublon de la précédente — la table n'a aucune
 * contrainte d'unicité (elle ne peut pas en avoir : deux personnes peuvent porter le même nom).
 */
export function ComptaDebtForm() {
  'use no memo'

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DebtFormValues, unknown, DebtInput>({
    resolver: zodResolver(debtInput),
    defaultValues: { name: '', model: '', amount: 0 },
  })

  const submit = handleSubmit(async (v) => {
    const res = await saveDebt(v)
    if (!res.success) {
      setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    reset({ name: '', model: '', amount: 0 })
    toast.success('Solde ajouté')
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="debt-name">Nom</Label>
          <Input id="debt-name" {...register('name')} />
          {errors.name && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="debt-model">Modèle</Label>
          <Input id="debt-model" {...register('model')} />
          {errors.model && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.model.message}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="debt-amount">Montant €</Label>
          <Input id="debt-amount" type="number" step="0.01" {...register('amount')} />
          {errors.amount && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.amount.message}</p>
          )}
        </div>
        <ActionButton type="submit" pending={isSubmitting} variant="outline">
          Ajouter
        </ActionButton>
      </div>
      {errors.root?.serverError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
    </form>
  )
}
