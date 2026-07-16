-- 0056 — Fixe `search_path` sur les 2 fonctions app qui l'avaient laissé mutable
-- (advisor Supabase `function_search_path_mutable`). Un search_path mutable permet à un
-- objet injecté dans un schéma prioritaire de détourner un nom non qualifié. Les autres
-- fonctions app (is_admin, has_page, *_report…) l'avaient déjà. Idempotent.
alter function public.chatter_first_seen() set search_path = public;
alter function public.log_spender_assignment_change() set search_path = public;
