'use client'

import { useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import type { ActionResult } from '@/lib/actions'
import type { SaveStatus } from './compta-entry-grid'

/**
 * L'ENREGISTREMENT AUTOMATIQUE D'UNE LIGNE — le motif posé le 2026-07-28 par la saisie
 * hebdomadaire, extrait ici parce que le lot final lui ajoute DEUX autres formulaires du même
 * genre : la saisie de la période (report + prime du mois) et le barème setter.
 *
 * POURQUOI L'EXTRACTION PLUTÔT QUE LA COPIE. La logique tient en quatre décisions subtiles
 * (ci-dessous) dont chacune protège de l'argent. Trois copies auraient divergé — c'est
 * exactement le raisonnement de `loadComptaRows` (un seul calcul du net) et de `recordPayment`
 * (une seule écriture), appliqué à la saisie. Colocalisé dans `components/` et non dans
 * `src/hooks/` (réservé à l'app-wide, `use-mobile`) : ses trois usages sont ici.
 *
 * ── LES QUATRE DÉCISIONS, INCHANGÉES ─────────────────────────────────────────────────────────
 *
 *  1. PAS À CHAQUE FRAPPE. Taper « 150 » écrirait 1, puis 15, puis 150 : deux montants faux dans
 *     une table de paie, et un « 15 » définitif si la frappe s'interrompt là. Un debounce ne fait
 *     que raccourcir la fenêtre — il n'empêche pas d'écrire une valeur intermédiaire.
 *  2. À LA LIGNE, PAS AU CHAMP. Les trois actions concernées font un upsert de la ligne ENTIÈRE
 *     sur sa clé métier : l'unité d'écriture EST la ligne. Écrire une fois par champ
 *     multiplierait aussi le `revalidatePath` de l'action, qui rejoue tout `getCompta`.
 *  3. SEULEMENT SI LA VALEUR A CHANGÉ (`changed()`, comparaison NUMÉRIQUE au dernier instantané
 *     réellement écrit). Traverser une ligne sans rien y toucher n'écrit rien.
 *  4. SÉRIALISÉ PAR LIGNE (`queue`). Deux envois de la MÊME ligne qui se croiseraient
 *     s'écraseraient l'un l'autre — le retardataire gagnerait avec des valeurs périmées. Chaque
 *     envoi lit les valeurs au moment où il S'EXÉCUTE, pas au moment où il est demandé.
 *
 * CE QUI RESTE À LA CHARGE DE L'UTILISATEUR : une valeur tapée puis abandonnée sans jamais
 * quitter la ligne (onglet fermé, doigt encore dans le champ) n'est pas enregistrée. C'est le
 * prix du « aucune écriture intermédiaire » ; le témoin « Non enregistré » le dit à l'écran tant
 * que ce n'est pas parti.
 *
 * LE NET N'EST JAMAIS RECALCULÉ ICI : c'est le `revalidatePath` de l'action qui redonne la main
 * au serveur (`computePayslip`). Une seconde implémentation de la formule finirait par diverger
 * de celle qui fait foi au paiement.
 */
export function useRowAutosave<TIn extends FieldValues, TOut extends FieldValues>({
  form,
  fields,
  initial,
  save,
  onSaved,
}: {
  /** `useForm<TIn, unknown, TOut>` de l'appelant — input ≠ output, les champs `z.coerce.number()`
   *  ont un type d'entrée `unknown`. */
  form: UseFormReturn<TIn, unknown, TOut>
  /** Les champs NUMÉRIQUES comparés pour décider s'il y a quelque chose à écrire. Les colonnes
   *  d'identité (chatterId, weekStart, rank…) n'en font pas partie : elles ne changent jamais. */
  fields: readonly Path<TIn>[]
  /** Valeurs rendues par le serveur — la référence de départ de « ça a changé ». */
  initial: Readonly<Record<string, number>>
  save: (values: TOut) => Promise<ActionResult>
  onSaved?: () => void
}): {
  status: SaveStatus
  /** À étaler sur le `<form>` de la ligne. */
  rowProps: {
    onSubmit: (e: FormEvent<HTMLFormElement>) => void
    onChange: () => void
    onBlur: (e: FocusEvent<HTMLFormElement>) => void
    onKeyDown: (e: KeyboardEvent<HTMLFormElement>) => void
  }
} {
  // Même règle que les composants de formulaire de ce repo (`'use no memo'` sur tout form RHF) :
  // ce hook manipule les API de `react-hook-form`, que le React Compiler ne sait pas mémoïser
  // sans risquer un `formState` figé — un « Enregistrement… » qui ne se termine jamais, ou une
  // erreur qui ne s'affiche pas. Le coût est nul : trois `useRef`/`useState` et des
  // gestionnaires d'événements.
  'use no memo'

  const { getValues, handleSubmit, setError, clearErrors } = form
  const [status, setStatus] = useState<SaveStatus>('idle')

  /**
   * Dernier instantané RÉELLEMENT écrit. Remplacé par les valeurs ENVOYÉES, jamais par un
   * `getValues()` d'après-coup : entre l'envoi et la réponse l'utilisateur a pu retaper, et
   * retenir ces valeurs-là comme « écrites » les perdrait sans que rien ne le signale.
   */
  const saved = useRef<Record<string, unknown>>({ ...initial })
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  // Comparaison NUMÉRIQUE et non textuelle : un `<input type="number">` rend une chaîne (« 150 »),
  // le défaut du formulaire est un nombre (150), et un champ vidé rend '' — que
  // `z.coerce.number()` écrit 0, exactement comme `Number('')`. Les deux bords disent donc la
  // même chose, et vider un champ déjà à 0 n'écrit pas.
  const changed = () => {
    const v = getValues() as Record<string, unknown>
    return fields.some((f) => Number(v[f] ?? 0) !== Number(saved.current[f] ?? 0))
  }

  /**
   * Validation Zod puis écriture. `handleSubmit(...)` est construit ICI, à l'appel, et non au
   * rendu : ses deux callbacks lisent `saved`/`queue`, et fabriquer la fonction pendant le rendu
   * fait échouer la règle `react-hooks/refs` (« passer une ref à une fonction peut la lire
   * pendant le rendu »). Appelé uniquement depuis `commit`, donc toujours dans un gestionnaire
   * d'événement.
   */
  const persist = () =>
    handleSubmit(
      async (values) => {
        setStatus('saving')
        const res = await save(values)
        if (!res.success) {
          setError('root.serverError', { message: res.error })
          setStatus('error')
          // Toast EN PLUS du message de ligne, et c'est volontaire : quitter la ligne peut aussi
          // être un repli de l'accordéon ou un changement de période. La ligne — et son message —
          // sont alors démontés avant la réponse, et le toast est le seul survivant. Un refus RLS
          // (« Ce chatteur n'est pas dans ton périmètre ») ne doit jamais passer inaperçu.
          toast.error(res.error)
          return
        }
        clearErrors('root.serverError')
        const sent = values as Record<string, unknown>
        const next: Record<string, unknown> = {}
        for (const f of fields) next[f] = sent[f]
        saved.current = next
        // `changed()` de nouveau : si l'utilisateur a retapé pendant l'envoi, la ligne est encore
        // en attente — annoncer « Enregistré » serait faux. Le prochain `commit()` l'écrira.
        setStatus(changed() ? 'dirty' : 'saved')
        onSaved?.()
      },
      () => {
        // Zod client a refusé : RIEN n'est parti. Les messages sont sous les champs fautifs, et
        // la ligne le redit en clair — un refus de validation muet serait une saisie perdue.
        // Validation de TOUTE la ligne, pas du seul champ quitté : l'action upsert la ligne
        // entière, un champ voisin invalide partirait avec.
        setError('root.serverError', {
          message: 'Saisie invalide — corrige le champ en rouge, rien n’a été enregistré.',
        })
        setStatus('error')
      },
    )()

  /**
   * `onChange` du `<form>` = l'événement `input` remonté de ses champs, donc à chaque frappe. Il
   * ne DÉCLENCHE aucune écriture, il ne fait qu'afficher « Non enregistré ». `saving` n'est
   * jamais écrasé : un envoi en cours reste annoncé comme tel, et sa fin re-teste elle-même si la
   * ligne a bougé entre-temps.
   */
  const markDirty = () => {
    const dirty = changed()
    setStatus((s) => (s === 'saving' ? s : dirty ? 'dirty' : 'idle'))
  }

  const commit = () => {
    if (!changed()) {
      // Efface un « Non enregistré » laissé par un aller-retour (valeur retapée à l'identique).
      // Un « Enregistré » antérieur, lui, reste affiché : il est toujours vrai.
      setStatus((s) => (s === 'dirty' ? 'idle' : s))
      return
    }
    queue.current = queue.current.then(async () => {
      try {
        await persist()
      } catch {
        // `handleSubmit` relaie ce que jette son callback : ici l'échec RÉSEAU de la Server Action
        // (l'action elle-même ne jette pas — `runAction` renvoie un `ActionResult`).
        const message = 'Enregistrement impossible — vérifie ta connexion, la saisie n’est pas partie.'
        setError('root.serverError', { message })
        setStatus('error')
        toast.error(message)
      }
    })
  }

  return {
    status,
    rowProps: {
      // Conservé bien qu'aucun bouton ne le déclenche : un submit natif (extension, navigateur,
      // futur bouton) doit passer par le même chemin que le reste, pas recharger la page en GET.
      onSubmit: (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        commit()
      },
      onChange: markDirty,
      /**
       * `onBlur` posé sur le `<form>` = le `focusout` REMONTÉ de ses champs. `relatedTarget` est
       * l'élément qui PREND le focus : encore dans le formulaire → l'utilisateur passe d'un champ
       * à l'autre de la même ligne, on n'écrit pas. Ailleurs, ou `null` (clic dans le vide, repli
       * de l'accordéon, changement de période, fenêtre qui perd le focus) → il a quitté la ligne,
       * on écrit.
       */
      onBlur: (e: FocusEvent<HTMLFormElement>) => {
        if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return
        commit()
      },
      /**
       * `Entrée` = valider la ligne sans la quitter. Ce n'est PAS le comportement natif : la
       * soumission implicite d'un formulaire sans bouton de submit est abandonnée dès qu'il
       * contient plus d'un champ « bloquant » (spec HTML), et `number` en fait partie. Sans ce
       * raccourci, taper une valeur puis appuyer sur Entrée ne ferait rien — exactement le genre
       * de silence qu'on cherche à éviter.
       */
      onKeyDown: (e: KeyboardEvent<HTMLFormElement>) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        commit()
      },
    },
  }
}
