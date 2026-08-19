-- 0123 — Correctif de revue sur 0122 (roue des récompenses).
-- 0122 est déjà appliquée ET enregistrée sur UAT : on ne la réécrit pas.
--
-- 1) `training_wheel_tickets_pending_idx` n'était qu'un index PARTIEL non-unique : rien
--    n'empêchait en base plusieurs tickets non utilisés pour la même personne, alors que la
--    règle métier est « un seul ticket non utilisé par personne » (même précédent que
--    `training_sessions_one_active_idx`, 0117 : une seule session ACTIVE par chatter). On
--    remplace par un index UNIQUE partiel du même nom que l'invariant qu'il porte.
-- 2) Durcissement symétrique côté tirages : un « Raté » ne doit jamais porter de montant —
--    `check (won = (prize_label is not null))` (0122) garantit déjà prize_label, on ajoute la
--    même garde sur amount_eur.

drop index if exists public.training_wheel_tickets_pending_idx;
create unique index training_wheel_tickets_one_pending_idx on public.training_wheel_tickets (profile_id) where used_at is null;
alter table public.training_wheel_spins add constraint training_wheel_spins_amount_won_check check (won or amount_eur is null);
