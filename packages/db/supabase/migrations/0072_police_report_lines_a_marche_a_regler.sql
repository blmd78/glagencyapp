-- 0072 — Rapport du soir police : deux champs par chatteur (« a marché » / « à régler »)
-- remplacent la note unique `observation` de 0071 (révision design 2026-07-21 : chaque
-- chatteur suivi devient un mini-rapport). Forward-only — on ne réédite pas 0071, déjà
-- appliquée sur l'UAT. Aucune donnée à migrer (table neuve, `observation` jamais rempli).
alter table public.police_report_lines
  drop column observation,
  add column a_marche text,
  add column a_regler text;
