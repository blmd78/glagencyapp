-- Intégration à l'agence — reprise du CRM Good Luck Agency (`serveur.py:1117-1123`).
--
-- Là-bas, remplir `chatters.modele` posait `integrated_at` au jour du PREMIER rattachement, et un
-- changement de modèle ultérieur ne touchait plus la date. On reprend exactement cette règle.
--
-- La date vit sur `profiles`, PAS sur `profile_creators` : les lignes d'assignation sont
-- détruites/recréées par le board Organisation (0099, 0110) — une date portée par la ligne serait
-- perdue au premier déplacement de case. Le legacy la portait aussi par personne (`db.py:125-139`).
--
-- À ne pas confondre avec `arrived_at` (0101) : celle-ci dit quand la personne est ENTRÉE dans
-- l'agence (création du compte, sortie du test de recrutement) ; `integrated_at` dit quand elle a
-- été mise en production sur une modèle. Entre les deux il y a la formation.
alter table public.profiles
  add column if not exists integrated_at date;

comment on column public.profiles.integrated_at is
  'Jour de mise en production sur une modèle (« intégré à l''agence »). Posé au PREMIER rattachement, jamais réécrit ensuite. Null = encore en formation. Distinct de arrived_at (entrée dans l''agence).';
