-- 0034 — Lien « outil de travail » par membre (Notion, groupe Telegram, drive…).
-- Posé par l'admin depuis la page Membres ; le membre le retrouve dans le menu
-- utilisateur en bas de sidebar. Vide = pas d'entrée dans le menu.
-- RLS existante suffisante : lecture soi-même/admin, écriture admin (0008).
alter table profiles add column work_link text not null default '';
