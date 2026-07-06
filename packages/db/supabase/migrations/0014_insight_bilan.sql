-- 0014 — Bilan structuré de résolution (repris du modal « bilan » du CRM legacy) :
-- date/durée du call, état détecté, résumé, actions engagées, objectifs, sanction,
-- prochain checkpoint, notes. Stocké sur l'état (clé stable) — survit aux régénérations.
alter table insight_states add column if not exists bilan jsonb;
