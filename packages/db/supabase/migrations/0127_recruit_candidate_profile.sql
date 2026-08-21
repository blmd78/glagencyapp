-- 0127 — profil candidat étendu (questions du formulaire GLA reprises le 2026-08-21) :
-- âge, localisation, téléphone, shifts souhaités, « comment tu as connu l'agence ».
-- Posées à la FIN avec l'identité (écart voulu vs GLA, spec §1) → colonnes sur recruit_candidates.
-- NULLABLE : les dossiers soumis avant cette migration n'en ont pas (la fiche affiche « — »).
-- Les valeurs de `shifts` sont validées côté action (liste fermée applicative) — pas de check SQL
-- d'appartenance pour laisser l'admin faire évoluer les libellés sans migration.

alter table public.recruit_candidates
  add column age int check (age is null or age between 18 and 99),
  add column location text check (location is null or char_length(location) between 2 and 120),
  add column phone text check (phone is null or char_length(phone) between 6 and 30),
  add column shifts text[] check (shifts is null or array_length(shifts, 1) between 1 and 10),
  add column source text check (source is null or char_length(source) between 2 and 500);

comment on column public.recruit_candidates.age is 'Âge déclaré (majeur exigé par le formulaire).';
comment on column public.recruit_candidates.location is 'Localisation déclarée (ville, pays — texte libre).';
comment on column public.recruit_candidates.phone is 'Numéro de téléphone déclaré (texte libre, format non imposé).';
comment on column public.recruit_candidates.shifts is 'Shifts souhaités (libellés GLA : Matin (5h–13h) / Après-midi (13h–21h) / Nuit (21h–5h)).';
comment on column public.recruit_candidates.source is 'Comment le candidat a connu l''agence (texte libre).';
