-- 0102 — SORTIE D'UN MEMBRE : on désactive, on ne détruit plus.
--
-- CE QU'ON RÉPARE. `profiles_id_fkey` est en ON DELETE CASCADE : supprimer le compte auth efface
-- le profil — nom, rôle, modèles, date d'arrivée. Aucune trace ne restait qu'une personne ait
-- travaillé ici, donc aucun turnover mesurable. Chaque départ traité avant cette migration est
-- définitivement perdu ; à partir d'ici, un départ est une DONNÉE.
--
-- LE MEMBRE PARTI GARDE SON `role`. C'est ce qui permet de dire « 4 chatteurs et 1 manager sont
-- partis en août » — écraser le rôle à la sortie détruirait la statistique qu'on vient créer.
-- Il garde aussi ses `profile_creators` : elles racontent ce qui était vrai quand il était là.
--
-- `arrived_at` (0101) trouve ici son usage réel : ancienneté = left_at − arrived_at.
--
-- LA DÉSACTIVATION N'EST PAS ICI : elle se fait côté GoTrue (`ban_duration`, Server Action), qui
-- invalide session, API et RLS ensemble. Cette migration ne porte que la MÉMOIRE du départ.

alter table profiles
  add column if not exists left_at     date,
  add column if not exists left_reason text
    check (left_reason is null or left_reason in
      ('vire', 'demission', 'fin_essai', 'abandon', 'autre')),
  add column if not exists left_note   text,
  add column if not exists left_by     uuid references profiles(id) on delete set null;

comment on column profiles.left_at is
  'Date de sortie de l''agence (0102). Null = membre en poste. Le compte auth est banni en parallèle, jamais supprimé.';
comment on column profiles.left_reason is
  'Motif : vire | demission | fin_essai | abandon | autre. « abandon » (part sans prévenir) n''est ni un renvoi ni une démission — fréquent en agence, il ne se compte pas pareil.';
comment on column profiles.left_note is
  'Commentaire libre sur le départ (0102). Lisible en relecture, inutilisable en statistique — c''est `left_reason` qui compte.';
comment on column profiles.left_by is
  'Profil qui a acté le départ. on delete set null : si cet encadrant part à son tour, le départ enregistré survit.';

-- Les détails n'ont de sens qu'avec une date : un motif seul décrirait un départ qui n'a pas eu lieu.
alter table profiles drop constraint if exists profiles_left_fields_need_left_at;
alter table profiles add constraint profiles_left_fields_need_left_at
  check (left_at is not null or (left_reason is null and left_note is null and left_by is null));

-- Et une sortie DOIT porter un motif : sans lui le taux se calcule mais ne s'interprète pas
-- (subi ou choisi ? c'est toute la question qu'on pose au turnover).
alter table profiles drop constraint if exists profiles_left_needs_reason;
alter table profiles add constraint profiles_left_needs_reason
  check (left_at is null or left_reason is not null);

-- Partiel : l'écrasante majorité des lignes est en poste (`left_at` null) et n'a rien à peser dans
-- l'index. Sert le filtre `left_at is null` des écrans opérationnels et l'agrégat du turnover.
create index if not exists profiles_left_at_idx on profiles (left_at) where left_at is not null;
