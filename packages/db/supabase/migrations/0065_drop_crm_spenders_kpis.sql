-- 0065 — Suppression de crm_spenders_kpis (code mort). Jamais appelée : les KPIs du tracker
-- (actifs, CA cumulé, à relancer, alertes R10, orphelins) sont recalculés côté app dans
-- SpendersTemplate.tsx depuis les lignes INTÉGRALEMENT paginées par fetchAll
-- (features/spenders/services/get-spenders.ts). La fonction avait été introduite (0045/0046)
-- pour un chargement en deux temps (1ʳᵉ page + KPIs exacts en base) qui n'a jamais été branché.
-- Aucun appelant dans apps/web/src (seul crm_spenders_tracker est appelé). Suppression sûre.
drop function if exists public.crm_spenders_kpis(numeric);
