-- Renouvellements d'abonnement au grain (modèle, jour) : NOMBRE de ré-abos/auto-renew
-- (source dashboard/subscriptions.renewals) — distinct de ca_renew qui est le montant en €.
alter table creator_daily
  add column if not exists renew_subs integer not null default 0 check (renew_subs >= 0);
