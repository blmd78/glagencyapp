-- 0126 — Recrutement : e-mails et Discord normalisés en base (check lower).
--
-- Revue de 0125 : `recruit_candidates.email`/`recruit_blocklist.email` (et `discord`) sont en
-- `text` simple, avec pour seule garantie un commentaire « stocké en minuscules par l'app ».
-- La blocklist est le garde-fou anti-triche (un seul essai, e-mail + Discord ajoutés à la
-- soumission) : un `lower()` oublié dans une future Server Action laisserait passer un doublon
-- SILENCIEUSEMENT (ex: `Nom@Gmail.com` vs `nom@gmail.com` ne matchent jamais dans la blocklist).
-- Précédent repo : `citext` sur `profiles.email`. Ici on garde `text` (décidé en 0125) mais on
-- fait respecter la normalisation par un `check` — toute écriture avec de la casse échoue au
-- lieu de s'insérer silencieusement.
alter table public.recruit_candidates
  add constraint recruit_candidates_email_lower_check check (email = lower(email));
alter table public.recruit_candidates
  add constraint recruit_candidates_discord_lower_check check (discord is null or discord = lower(discord));

alter table public.recruit_blocklist
  add constraint recruit_blocklist_email_lower_check check (email is null or email = lower(email));
alter table public.recruit_blocklist
  add constraint recruit_blocklist_discord_lower_check check (discord is null or discord = lower(discord));
