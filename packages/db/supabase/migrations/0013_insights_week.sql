-- 0013 — Restructuration des cartes : le suivi « semaine en cours » devient une donnée
-- structurée (bloc séparé dans l'UI) au lieu d'être noyé dans le texte du body.
alter table insights add column if not exists week jsonb;
