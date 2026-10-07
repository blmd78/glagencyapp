-- 0185 — Jeton de renouvellement de la connexion Notion (import de scripts).
-- La doc OAuth de Notion (relue le 2026-10-07) renvoie un `refresh_token` avec la clé : la clé peut
-- expirer, le CRM la renouvelle sur un 401. Chiffré comme la clé (AES-256-GCM, SNAP_CODES_SECRET).
-- Nullable : Notion peut ne pas en renvoyer. Table toujours service-role only (RLS sans policy, 0184).
alter table public.notion_connection add column if not exists refresh_token_encrypted text;
