-- 0012 — Cartes « saines » : une carte par chatteur même quand tous les quotas sont
-- atteints (severity 'ok'), demandé pour voir critiques + moyens + sains sur la page.
alter table insights drop constraint insights_severity_check;
alter table insights add constraint insights_severity_check
  check (severity in ('critical','warning','ok'));
