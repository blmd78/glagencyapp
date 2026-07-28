/**
 * Le strict nécessaire pour AFFICHER une personne dans un sélecteur ou une pile de noms.
 * `PlanningMember` et `ReportMember` s'y conforment structurellement, sans conversion.
 *
 * Vit ici et non dans `components/member-select.tsx` : `members-accordion.tsx` en a besoin
 * aussi, et un composant partagé qui importe un type d'un AUTRE composant partagé crée une
 * dépendance croisée que rien ne justifie (audit 2026-07-27).
 */
export interface SelectableMember {
  id: string
  name: string
  /** Rôle brut (`profiles.role`). `''` = soi-même → pas de badge. */
  role: string
}
