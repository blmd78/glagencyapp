-- 0024 — Les canaux Telegram deviennent des « comptes sociaux » comme Instagram/Twitter
-- (relevés quotidiens : membres, vues) — même page, même DA, même circuit de saisie.
alter table mkt_social_accounts drop constraint mkt_social_accounts_platform_check;
alter table mkt_social_accounts add constraint mkt_social_accounts_platform_check
  check (platform in ('instagram', 'twitter', 'telegram'));
