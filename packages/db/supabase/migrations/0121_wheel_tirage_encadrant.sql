-- Roue : le tour n'est plus GAGNÉ, il est DONNÉ (nouvelle règle du 2026-08-24).
--
-- L'encadrant ouvre la roue, choisit un chatteur et lance le tirage pour lui — en partage d'écran.
-- Fini le top 3 hebdo, fini les tours de trophées : c'est l'encadrant qui juge, hors application.
--
-- SÛRE À APPLIQUER AVANT LE DÉPLOIEMENT : purement additive. `ticket_id` devient nullable (le code
-- actuel le remplit toujours, donc il continue de fonctionner) et `spun_by` est facultative. Le
-- ménage des fonctions d'octroi devenues mortes est dans 0122, à appliquer APRÈS le déploiement —
-- les supprimer maintenant casserait la page Roue actuellement en ligne.

-- Plus de ticket : un tirage n'en consomme plus. La colonne reste (l'historique éventuel y renvoie,
-- et un futur écran « offrir un tour » la remplirait de nouveau) mais elle devient facultative.
alter table public.training_wheel_spins alter column ticket_id drop not null;

comment on column public.training_wheel_spins.ticket_id is
$cmt$ticket consommé — null depuis 0121 : un tirage est lancé par un encadrant, sans ticket$cmt$;

-- QUI a lancé le tirage. C'est le SEUL garde-fou du nouveau modèle : il n'y a plus de limite au
-- nombre de tours, donc chaque versement doit être imputable à quelqu'un.
-- `on delete set null` (et pas cascade) : le départ d'un encadrant ne doit jamais effacer la trace
-- comptable d'un gain versé à un chatteur.
alter table public.training_wheel_spins
  add column if not exists spun_by uuid references public.profiles(id) on delete set null;

comment on column public.training_wheel_spins.spun_by is
$cmt$encadrant qui a lancé le tirage (0121) — null pour les tirages d'avant la règle$cmt$;

create index if not exists training_wheel_spins_spun_by_idx on public.training_wheel_spins (spun_by);
