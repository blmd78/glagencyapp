-- 0114 — Index des FK `updated_by` du catalogue de formation (oubli de 0113, relevé en revue).
-- Convention repo (0055) : toute FK est indexée sauf couverture par un unique en tête —
-- `updated_by → profiles(id) on delete set null` doit l'être (comme todos 0069, compta 0084/0085).
create index training_modules_updated_by_idx on public.training_modules (updated_by);
create index training_cases_updated_by_idx on public.training_cases (updated_by);
