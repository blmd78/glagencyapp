-- 0101 — « Nouvel arrivant » : un drapeau MANUEL sur le membre, et sa date d'arrivée réelle.
--
-- POURQUOI MANUEL. `profiles.created_at` ne dit pas quand la personne est arrivée dans l'agence :
-- un chatteur peut être créé tardivement dans le CRM alors qu'il travaille depuis deux mois, ou
-- l'inverse. Dériver le badge de la date de création aurait donc affiché « nouveau » à des anciens
-- et rien à des nouveaux. C'est une saisie humaine, assumée comme telle.
--
-- POURQUOI DEUX COLONNES ET PAS UNE `new_since date`. Décocher le drapeau ne doit pas effacer la
-- date d'arrivée : c'est la donnée d'entrée du suivi de turnover (ancienneté = sortie − arrivée),
-- chantier suivant. Avec une colonne unique, chaque décochage la détruirait.
--
-- DROITS : inchangés. `profiles` n'a pas de policy par colonne — l'écriture suit les droits
-- d'édition d'un membre déjà en place (admin, ou manager sur un compte chatteur, cf. 0095), et
-- `authz.ts` reste la garde applicative. Même famille que `shift` (0099) et `closing_role` (0077) :
-- des données CRM saisies à la main, portées par le membre.

alter table profiles
  add column if not exists arrived_at date,
  add column if not exists is_new boolean not null default false;

comment on column profiles.arrived_at is
  'Date d''arrivée RÉELLE dans l''agence (saisie à la main, 0101). Conservée même après retrait du drapeau is_new — base du calcul d''ancienneté/turnover.';
comment on column profiles.is_new is
  'Drapeau manuel « nouvel arrivant » (0101). Chatteurs uniquement côté app. Au-delà de 30 jours, l''UI réclame son retrait.';

-- Un drapeau sans date ne pourrait ni s'afficher correctement ni déclencher le rappel de retrait :
-- l'écran dirait « nouveau depuis on ne sait quand », c'est-à-dire nouveau pour toujours.
alter table profiles
  drop constraint if exists profiles_is_new_needs_arrived_at;
alter table profiles
  add constraint profiles_is_new_needs_arrived_at
    check (not is_new or arrived_at is not null);

-- Le compteur « N à revoir » de la page Membres interroge ce drapeau à chaque rendu ; PARTIEL,
-- l'index ne pèse que le nombre de nouveaux (une poignée), pas les 109 chatteurs.
create index if not exists profiles_is_new_idx on profiles (is_new) where is_new;
