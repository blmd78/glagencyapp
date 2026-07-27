-- 0089 — Le fixe S'AJOUTE à la commission : plus de mode de rémunération, plus de statut setter
-- dupliqué.
--
-- POURQUOI (mesuré le 2026-07-27 sur la feuille de paie de juillet du propriétaire, qui est LA
-- référence du modèle) :
--
--   * `compta_settings.mode` (`percent` | `fixed`) faisait REMPLACER la commission par le fixe.
--     Personne ne travaille comme ça : les 95 chatteurs de la semaine S1 ont tous un net =
--     `CA × taux` (86 à 10 %, 5 à 11 %, 4 à 10,5 %), et 59 d'entre eux touchent EN PLUS un fixe
--     de 37,50 / 40 / 75 €. Le mode venait d'une ancienne branche WIP, pas d'une pratique.
--
--   * `compta_settings.is_setter` dupliquait `profiles.closing_role` (réglé depuis Membres).
--     Deux sources pour un même fait finissent toujours par diverger. Le versement du fixe ne
--     dépend désormais d'AUCUN drapeau : il s'applique dès que `fixed_amount > 0`. Conditionner
--     ce versement à `closing_role` aurait été pire que la duplication — la colonne vaut
--     `'setter'` pour UN SEUL profil en prod (13 `closer`, 91 non renseignés) alors que la
--     feuille verse un fixe à 59 personnes : le fixe aurait été inopérant, en silence.
--
--   * `compta_payments.mode_applied` était l'instantané de ce mode. Sans mode, c'est une colonne
--     `not null` qu'aucun code ne peut plus remplir.
--
-- SANS RISQUE — vérifié sur l'UAT le 2026-07-27 juste avant d'écrire ce fichier :
-- `compta_settings` = 0 ligne, `compta_payments` = 0 ligne. Aucune donnée à reprendre, aucun
-- défaut à recalculer. (`compta_week_entries` et `compta_primes`, qui ont des lignes, ne sont
-- PAS touchées.) La prod n'a pas été ouverte pour cette tâche : 0085 y purge déjà
-- `compta_payments`, et il faudra revérifier `compta_settings` au moment de la pousser.
--
-- `fixed_amount` change de SENS sans changer de type : montant HEBDOMADAIRE du mode fixe → fixe
-- de la PÉRIODE de paie, qui s'ajoute à la commission. La feuille ne le remplit qu'une fois par
-- paie (bloc S2), jamais par semaine : il n'est donc plus multiplié par le nombre de semaines.
-- Renommage volontairement écarté (`fixed_amount` → `fixe_periode`) : la colonne est vide, mais
-- le renommage n'apporterait rien qu'un commentaire ne dise mieux, et casserait les requêtes
-- ad hoc écrites jusqu'ici.

-- ── compta_settings ──────────────────────────────────────────────────────────────────────
-- `drop column` emporte le `check (mode = any (array['percent','fixed']))` de 0084 : c'est une
-- contrainte de colonne, Postgres la supprime avec elle.
alter table public.compta_settings drop column if exists mode;
alter table public.compta_settings drop column if exists is_setter;

comment on column public.compta_settings.rate is
  'Taux de commission en %, TOUJOURS appliqué au CA du chatteur (Σ par modèle).';
comment on column public.compta_settings.fixed_amount is
  'Fixe versé UNE FOIS PAR PÉRIODE de paie, qui S''AJOUTE à la commission. S''applique dès qu''il est > 0 — aucun drapeau ne le commande. Une saisie compta_week_entries.fixe_setter non nulle le remplace pour cette période.';

-- ── compta_payments ──────────────────────────────────────────────────────────────────────
-- La contrainte est nommée (0085) et porte sur la seule colonne supprimée ; `drop column`
-- suffirait, mais l'expliciter rend la migration lisible sans aller lire 0085.
alter table public.compta_payments drop constraint if exists compta_payments_mode_check;
alter table public.compta_payments drop column if exists mode_applied;
