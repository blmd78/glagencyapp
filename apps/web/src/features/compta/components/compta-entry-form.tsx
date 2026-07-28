'use client'

import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ENTRY_GRID_COLS, EntryField, EntryStatus, type SaveStatus } from './compta-entry-grid'
import { saveWeekEntry } from '../actions'
import { weekEntryInput, type WeekEntryInput, type WeekEntryFormValues } from '../schema'

/** Les 3 champs SAISIS. `chatterId`/`weekStart` identifient la ligne, `note` n'a pas d'input. */
const AMOUNT_FIELDS = ['bonus', 'malus', 'handoffs'] as const
type AmountField = (typeof AMOUNT_FIELDS)[number]

/**
 * Saisie hebdomadaire (bonus, malus, handoffs). Une semaine appartient entièrement à la période
 * de son lundi — elle n'est jamais découpée.
 *
 * ── POURQUOI PLUS DE « FIXE SETTER » ICI (2026-07-28, tâche 19) ─────────────────────────────
 * Le champ existait, en quatrième position, et REMPLAÇAIT pour la période le fixe des réglages.
 * Il était faux par construction : le fixe est un montant PAR PÉRIODE (il n'est rempli qu'une
 * fois par paie sur la feuille du propriétaire), alors que cette ligne est HEBDOMADAIRE — le
 * champ s'affichait donc DEUX FOIS par période, et `compta-rows.ts` SOMMAIT les deux. Saisir
 * 75 € sur les deux lignes, ce que deux champs identiques invitent à faire, versait 150 €.
 * Le fixe se règle maintenant à un seul endroit : l'engrenage de la ligne (`compta_settings`).
 *
 * UNE LIGNE par semaine depuis le 2026-07-27 (« simplifie l'affichage ») : c'était un encadré
 * titré par semaine, soit 2 cartes empilées répétant les mêmes champs.
 *
 * ── ENREGISTREMENT AUTOMATIQUE (2026-07-28) ────────────────────────────────────────────────
 * Le bouton « Enregistrer » a disparu : 2 semaines × ~100 chatteurs faisaient 200 boutons pour
 * une saisie qui n'a qu'un geste (« met pas le bouton enregistré en face de chaque ligne ça
 * fait trop de friction »).
 *
 * QUAND ÇA PART — quand le focus QUITTE LA LIGNE (`focusout` du `<form>` dont le
 * `relatedTarget` sort du formulaire), ou sur `Entrée`. Trois choix, tous délibérés :
 *
 *  1. PAS à chaque frappe. Taper « 150 » écrirait 1, puis 15, puis 150 : deux montants faux
 *     dans une table de paie, et un « 15 » définitif si la frappe s'interrompt là. Un debounce
 *     ne fait que raccourcir la fenêtre — il n'empêche pas d'écrire une valeur intermédiaire.
 *  2. PAS à chaque champ, mais à chaque LIGNE. `saveWeekEntry` fait un upsert de la ligne
 *     ENTIÈRE (`chatter_id,week_start` → bonus + malus + handoffs + note) :
 *     l'unité d'écriture EST la semaine. Écrire 3 fois pour la remplir n'apporte rien et
 *     multiplierait par 3 le `revalidatePath('/chatter/compta')` de l'action — qui rejoue tout
 *     `getCompta` (une dizaine de requêtes, dont plusieurs `fetchAll` sur des milliers de
 *     lignes). Passer d'un champ à l'autre DANS la même semaine n'écrit donc rien : le coût
 *     serveur reste exactement celui de l'ancien bouton — une écriture et un rechargement par
 *     ligne remplie, pas un par champ.
 *  3. SEULEMENT si la valeur a changé (`changed()`, comparaison numérique au dernier
 *     instantané réellement écrit). Traverser une ligne sans rien y toucher n'écrit rien.
 *
 * CE QUI RESTE À LA CHARGE DE L'UTILISATEUR : une valeur tapée puis abandonnée sans jamais
 * quitter la ligne (onglet fermé, doigt encore dans le champ) n'est pas enregistrée. C'est le
 * prix du « aucune écriture intermédiaire » ; le témoin « Non enregistré » le dit à l'écran tant
 * que ça n'est pas parti.
 *
 * ÉCRITURES CONCURRENTES : deux `saveWeekEntry` de la MÊME ligne qui se croiseraient
 * s'écraseraient l'un l'autre (upsert de la ligne entière — le retardataire gagne, avec des
 * valeurs périmées). Elles sont donc SÉRIALISÉES par ligne (`queue`), et chaque envoi lit les
 * valeurs au moment où il S'EXÉCUTE, pas au moment où il est demandé : le second écrit donc le
 * dernier état connu. Deux semaines = deux `week_start` = deux lignes distinctes : aucun
 * conflit possible entre elles, rien à sérialiser à ce niveau.
 *
 * LE NET est recalculé PAR LE SERVEUR (`revalidatePath` de l'action → nouveau rendu RSC →
 * `computePayslip`), jamais ici : une seconde implémentation de la formule finirait par
 * diverger de celle qui fait foi au paiement. Le prix, c'est que le net se met à jour à la fin
 * de l'enregistrement de la ligne, pas sous les doigts.
 */
export function ComptaEntryForm({
  chatterId,
  weekStart,
  weekLabel,
  initial,
  onSaved,
}: {
  chatterId: string
  weekStart: string
  weekLabel: string
  initial: { bonus: number; malus: number; handoffs: number; note: string | null }
  onSaved?: () => void
}) {
  'use no memo'

  // Triple générique (Input, Context, Output) : `weekEntryInput` a des champs `z.coerce.number()`
  // dont l'input est `unknown` → input ≠ output. Même patron que `report-form.tsx`
  // (police-reports) pour la même raison.
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<WeekEntryFormValues, unknown, WeekEntryInput>({
    resolver: zodResolver(weekEntryInput),
    defaultValues: { chatterId, weekStart, ...initial },
  })

  const [status, setStatus] = useState<SaveStatus>('idle')

  /**
   * Dernier instantané RÉELLEMENT écrit — la référence de « ça a changé ». Initialisé sur ce
   * que le serveur a rendu, puis remplacé par les valeurs ENVOYÉES (`values` du submit), jamais
   * par un `getValues()` d'après-coup : entre l'envoi et la réponse l'utilisateur a pu retaper,
   * et retenir ces valeurs-là comme « écrites » les perdrait sans que rien ne le signale.
   */
  const saved = useRef<Record<AmountField, unknown>>({
    bonus: initial.bonus,
    malus: initial.malus,
    handoffs: initial.handoffs,
  })

  /** File d'attente de la ligne — cf. « ÉCRITURES CONCURRENTES » ci-dessus. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  // Comparaison NUMÉRIQUE et non textuelle : un `<input type="number">` rend une chaîne
  // (« 150 »), le défaut du formulaire est un nombre (150), et un champ vidé rend '' — que
  // `z.coerce.number()` écrit 0, exactement comme `Number('')`. Les deux bords disent donc la
  // même chose, et vider un champ déjà à 0 n'écrit pas.
  const changed = () => {
    const v = getValues()
    return AMOUNT_FIELDS.some((f) => Number(v[f] ?? 0) !== Number(saved.current[f] ?? 0))
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
        const res = await saveWeekEntry(values)
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
        saved.current = {
          bonus: values.bonus,
          malus: values.malus,
          handoffs: values.handoffs,
        }
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
   * `onChange` du `<form>` = l'événement `input` remonté de ses champs, donc à chaque frappe.
   * Il ne DÉCLENCHE aucune écriture, il ne fait qu'afficher « Non enregistré ». `saving` n'est
   * jamais écrasé : un envoi en cours reste annoncé comme tel, et sa fin re-teste elle-même si
   * la ligne a bougé entre-temps.
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
        // `handleSubmit` relaie ce que jette son callback : ici l'échec RÉSEAU de la Server
        // Action (l'action elle-même ne jette pas — `runAction` renvoie un `ActionResult`).
        const message = 'Enregistrement impossible — vérifie ta connexion, la saisie n’est pas partie.'
        setError('root.serverError', { message })
        setStatus('error')
        toast.error(message)
      }
    })
  }

  /**
   * `onBlur` posé sur le `<form>` = le `focusout` REMONTÉ de ses champs. `relatedTarget` est
   * l'élément qui PREND le focus : encore dans le formulaire → l'utilisateur passe d'un champ à
   * l'autre de la même semaine, on n'écrit pas. Ailleurs, ou `null` (clic dans le vide, repli de
   * l'accordéon, changement de période, fenêtre qui perd le focus) → il a quitté la ligne, on
   * écrit.
   */
  const handleBlur = (e: FocusEvent<HTMLFormElement>) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return
    commit()
  }

  /**
   * `Entrée` = valider la ligne sans la quitter. Ce n'est PAS le comportement natif : la
   * soumission implicite d'un formulaire sans bouton de submit est abandonnée dès qu'il contient
   * plus d'un champ « bloquant » (spec HTML), et `number` en fait partie — nos 3 champs la
   * neutralisent. Sans ce raccourci, taper une valeur puis appuyer sur Entrée ne ferait rien,
   * ce qui est exactement le genre de silence qu'on cherche à éviter.
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    commit()
  }

  const err = (f: AmountField) => errors[f]?.message

  return (
    <form
      // Conservé bien qu'aucun bouton ne le déclenche plus : un submit natif (extension,
      // navigateur, futur bouton) doit passer par le même chemin que le reste, pas recharger
      // la page en GET.
      onSubmit={(e) => {
        e.preventDefault()
        commit()
      }}
      onChange={markDirty}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn('grid', ENTRY_GRID_COLS)}
    >
      <span className="col-span-2 text-sm font-medium sm:col-span-1">Semaine du {weekLabel}</span>

      <EntryField
        id={`bonus-${weekStart}`}
        label="Bonus €"
        step="0.01"
        error={err('bonus')}
        registration={register('bonus')}
      />
      <EntryField
        id={`malus-${weekStart}`}
        label="Malus €"
        step="0.01"
        error={err('malus')}
        registration={register('malus')}
      />
      <EntryField
        id={`handoffs-${weekStart}`}
        label="Handoffs"
        error={err('handoffs')}
        registration={register('handoffs')}
      />

      <EntryStatus status={status} weekLabel={weekLabel} />

      {errors.root?.serverError && (
        <p role="alert" className="col-span-2 text-sm text-red-600 sm:col-span-full dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
    </form>
  )
}
