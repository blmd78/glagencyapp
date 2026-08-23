-- Un tour de roue OFFERT à chaque trophée débloqué (décision produit du 2026-08-22).
--
-- CE QUI REND ÇA POSSIBLE SANS NOUVELLE TABLE : 0118 a remplacé l'ancienne contrainte
-- `unique (profile_id, week)` par un index PARTIEL (`where granted_by is null`). Plusieurs tickets
-- peuvent donc déjà coexister sur une même semaine. Il ne manquait qu'un moyen de dire « ce
-- ticket-ci vient de tel trophée » — et de garantir qu'un trophée ne paie qu'une fois.
--
-- `trophy_key` porte les deux : la traçabilité ET l'unicité. Une table d'attribution séparée
-- aurait dupliqué une information que le ticket porte déjà.
--
-- COÛT : les 8 trophées sont récompensés, y compris « Premier pas » (1 cas validé), et l'octroi
-- est RÉTROACTIF — au premier passage, chacun reçoit un tour par trophée déjà acquis. Avec la
-- config par défaut (espérance ≈ 5,20 € le tour), compter ~42 € par chatter sur sa vie, dont
-- l'essentiel le jour du déploiement. Choix assumé, tracé ici pour la compta.

alter table public.training_wheel_tickets
  add column if not exists trophy_key text
    check (trophy_key is null or trophy_key in
      ('first_case', 'streak_3', 'streak_7', 'gold_5', 'gold_15', 'module_complete', 'all_done', 'boss'));

comment on column public.training_wheel_tickets.trophy_key is
$cmt$trophée qui a offert ce tour (null = classement hebdo ou tour offert par un encadrant)$cmt$;

-- Un trophée ne paie qu'une fois, pour toujours. C'est CET index qui rend l'octroi idempotent :
-- la fonction peut être rejouée à chaque visite sans jamais doubler un tour.
create unique index if not exists training_wheel_tickets_trophee_uidx
  on public.training_wheel_tickets (profile_id, trophy_key)
  where trophy_key is not null;

-- L'unicité « un seul ticket SYSTÈME par semaine » (0118) ne doit couvrir que le classement :
-- sans ce `trophy_key is null`, le premier ticket-trophée de la semaine bloquerait le ticket de
-- classement de cette même semaine (les deux ont `granted_by is null`) — et le chatter perdrait
-- une récompense qu'il a gagnée, EN SILENCE (l'octroi insère en `on conflict do nothing`).
drop index if exists public.training_wheel_tickets_semaine_systeme_uidx;
create unique index training_wheel_tickets_semaine_systeme_uidx
  on public.training_wheel_tickets (profile_id, week)
  where granted_by is null and trophy_key is null;

-- Octroi des tours de trophées. Les trophées sont calculés en TypeScript (`computeTrophies`,
-- @glagency/core) : les recoder en SQL créerait deux vérités qui divergeraient au premier
-- changement de seuil. Cette fonction ne DÉCIDE donc rien — elle matérialise les tickets manquants
-- pour les trophées qu'on lui annonce, et l'index d'unicité fait le reste.
--
-- SÉCURITÉ : appelée en service-role uniquement (aucun `grant` à `authenticated`, et 0088 a déjà
-- révoqué `public`/`anon` par défaut). C'est indispensable — la fonction ne vérifie PAS que le
-- profil possède réellement le trophée, elle fait confiance à son appelant. Exposée à
-- `authenticated`, elle laisserait n'importe qui s'offrir huit tours.
create or replace function public.training_trophy_grant(p_profile uuid, p_trophies jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_granted integer := 0;
  v_week    date := (date_trunc('week', (now() at time zone 'Europe/Paris'))::date);
  v_item    jsonb;
  v_key     text;
  v_label   text;
begin
  if p_profile is null or p_trophies is null then
    return 0;
  end if;

  for v_item in select * from jsonb_array_elements(p_trophies) loop
    v_key := v_item->>'key';
    v_label := coalesce(v_item->>'label', v_key);
    -- Le `check` de la colonne rejetterait une clé inconnue en levant : on filtre avant, pour
    -- qu'un catalogue de trophées enrichi côté TS ne fasse pas planter la page de formation.
    if v_key in ('first_case', 'streak_3', 'streak_7', 'gold_5', 'gold_15', 'module_complete', 'all_done', 'boss') then
      insert into public.training_wheel_tickets (profile_id, week, reason, trophy_key)
      values (p_profile, v_week, left('Trophée — ' || v_label, 120), v_key)
      on conflict do nothing;
      if found then
        v_granted := v_granted + 1;
      end if;
    end if;
  end loop;

  return v_granted;
end;
$$;

revoke execute on function public.training_trophy_grant(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.training_trophy_grant(uuid, jsonb) to service_role;
