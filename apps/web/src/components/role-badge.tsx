import { Badge } from '@/components/ui/badge'
import { CRM_ROLES, type CrmRole } from '@/lib/types/chatters'

/**
 * Badge de rôle closing. Source unique du rendu (Chatteurs, Stat chatteur, Membres) — évite la
 * duplication du markup et des classes. `null`/`undefined` (chatteur sans désignation) → ne rend
 * rien ; l'appelant gère l'absence.
 *
 * TABLES INDEXÉES SUR `CrmRole`, et non un ternaire. Jusqu'au 2026-07-28 ce composant s'écrivait
 * `role === 'closer' ? 'Closer' : 'Setter'` : il étiquetait donc « Setter » TOUTE valeur qui
 * n'était pas `'closer'`. Tant que la colonne n'en acceptait que deux (`check` de
 * `profiles.closing_role`) c'était sans conséquence ; la migration 0090 en accepte quatre, et un
 * membre `'nouveau'` se serait affiché FAUX — pire qu'un badge absent, parce que rien ne l'aurait
 * signalé. Avec un `Record<CrmRole, …>`, ajouter une valeur à `CRM_ROLES` sans passer ici ne
 * compile pas.
 *
 * COULEURS — aucune teinte nouvelle, elles viennent toutes de la palette déjà en place :
 *  - `setter` violet et `closer` orange sont INCHANGÉS ;
 *  - `hybride` (les deux à la fois) prend le vert, la seule teinte de rôle encore libre — le
 *    rouge et le bleu sont ceux de `TeamBadge` (équipe rouge/bleue), affiché juste à côté, et
 *    l'ambre celui du rôle fonctionnel Police (`ROLE_TONE`) ;
 *  - `nouveau` prend le gris neutre : un arrivant n'a pas encore de spécialité de closing, et le
 *    gris dit exactement ça dans le reste de l'app (`STATUS_COLORS.neutral`).
 */
const ROLE_LABEL: Record<CrmRole, string> = {
  closer: 'Closer',
  setter: 'Setter',
  hybride: 'Hybride',
  nouveau: 'Nouveau',
}

const ROLE_CLASS: Record<CrmRole, string> = {
  closer: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  setter: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  hybride: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  nouveau: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

export function RoleBadge({ role }: { role: CrmRole | null | undefined }) {
  // Garde de VALEUR et pas seulement de nullité : cette colonne se remplit aussi en SQL direct, et
  // une valeur hors liste (contrainte élargie un jour sans passer ici) rendrait sinon un badge
  // sans libellé ni couleur. Mieux vaut ne rien afficher que d'afficher un mauvais rôle.
  if (!role || !(CRM_ROLES as readonly string[]).includes(role)) return null
  return <Badge className={ROLE_CLASS[role]}>{ROLE_LABEL[role]}</Badge>
}
