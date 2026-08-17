import { MKT_PAGE_CHOICES, PAGE_CHOICES } from '@/config/workspaces'
import type { MemberForm } from '../schema'
import type { Member } from '../types'

/**
 * Valeurs initiales du formulaire membre — SOURCE UNIQUE.
 *
 * Ce bloc vivait en DOUBLE dans `member-dialog.tsx` : une fois dans `useForm.defaultValues` (qui
 * ne sème le form qu'au MONTAGE) et une fois dans le `reset()` de l'effet d'ouverture (le seul qui
 * compte à la RÉOUVERTURE). Chaque champ ajouté devait l'être aux deux endroits — l'oubli du
 * second ne casse rien à la compilation et se manifeste par un dialog qui affiche les valeurs du
 * membre précédemment ouvert. C'est arrivé, et c'est exactement ce que cette fonction rend
 * impossible.
 *
 * Les listes (`pages`, `creatorIds`) sont filtrées sur ce que l'appelant peut RÉELLEMENT éditer :
 * une valeur hors de son périmètre serait refusée côté serveur, autant ne pas la mettre dans le
 * formulaire. Le serveur, lui, préserve ces valeurs invisibles (`mergePages`, `authz.ts`).
 */
export function memberDefaults({
  member,
  scope,
  viewer,
  creators,
}: {
  member?: Member
  scope: 'chatter' | 'marketing'
  viewer: 'admin' | 'manager'
  creators: { id: string; name: string }[]
}): MemberForm {
  const scopeSlugs = new Set(
    (scope === 'marketing' ? MKT_PAGE_CHOICES : PAGE_CHOICES).map((c) => c.slug as string),
  )
  const creatorSet = new Set(creators.map((c) => c.id))

  return {
    scope,
    email: member?.email ?? '',
    displayName: member?.displayName ?? '',
    // Un appelant MANAGER ne pose que des chatteurs (le serveur le force aussi) ; sinon on
    // reprend le rôle en base, avec repli sur `chatteur` pour les valeurs hors liste (le `user`
    // transitoire de 0059).
    role:
      viewer === 'manager'
        ? 'chatteur'
        : member?.role === 'admin'
          ? 'admin'
          : member?.role === 'manager'
            ? 'manager'
            : member?.role === 'sous-manager'
              ? 'sous-manager'
              : member?.role === 'police'
                ? 'police'
                : 'chatteur',
    pages: (member?.pages ?? []).filter((p) => scopeSlugs.has(p)),
    creatorIds: (member?.creatorIds ?? []).filter((id) => creatorSet.has(id)),
    // Le serveur force le rattachement au créateur pour un appelant manager, et l'ignore sur ses
    // éditions (il ne peut pas déplacer un chatteur).
    managerIds: member?.managerIds ?? [],
    workLink: member?.workLink ?? '',
    closingRole: member?.closingRole ?? null,
    closingTeam: member?.closingTeam ?? null,
    shift: member?.shift ?? null,
    isNew: member?.isNew ?? false,
    arrivedAt: member?.arrivedAt ?? null,
    chatterId: member?.chatterId ?? '',
    orgExcluded: member?.orgExcluded ?? false,
    // Les pages HORS scope du membre (préservées par mergePages, invisibles de ce form) —
    // comptées par le refine atLeastOnePage pour ne pas exiger une page de CETTE face à un
    // membre qui vit sur l'autre. À la création : pas de membre, donc false.
    hasOtherFacePages: member ? member.pages.some((p) => !scopeSlugs.has(p)) : false,
  }
}
