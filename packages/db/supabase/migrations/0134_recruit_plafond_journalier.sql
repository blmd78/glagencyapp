-- Plafond de dépense du test de recrutement — la seule borne était par IP.
--
-- `/postuler` est PUBLIQUE et sans authentification, et `sendToBot` n'exige aucune épreuve
-- préalable : démarrer une tentative puis envoyer les 14 messages autorisés brûle du crédit IA
-- sans avoir passé ni le QI, ni la frappe, ni le test de connexion. La seule limite existante
-- (5 tentatives par IP sur 24 h, `recruit_start_attempt`) se contourne avec un pool de proxys :
-- la dépense pire-cas était donc LINÉAIRE en nombre d'adresses IP, c'est-à-dire non bornée.
--
-- On ajoute un plafond GLOBAL, toutes IP confondues. Il ne remplace pas la limite par IP (qui
-- protège de l'acharnement d'une personne) : il borne la facture d'une journée.
--
-- Le chemin n'a encore jamais tourné en prod (3 tentatives, 0 message échangé) — c'est une
-- assurance posée avant l'ouverture, pas la réponse à un incident.
alter table public.recruit_config
  add column if not exists daily_max integer check (daily_max is null or daily_max > 0);

comment on column public.recruit_config.daily_max is
  'Tentatives maximum sur 24 h, TOUTES IP confondues. Null = aucun plafond global (la limite par IP s''applique toujours). Borne la dépense IA d''un endpoint public.';

-- 200 tentatives/jour : très au-dessus d'un flux de recrutement réel (le pic observé est de
-- quelques dossiers par jour), assez bas pour qu'un abus coûte des centimes et non des centaines
-- d'euros. À 0,027 $ la tentative complète, le pire cas journalier est plafonné à ≈ 5,40 $.
update public.recruit_config set daily_max = 200 where id = 1 and daily_max is null;

-- ---------------------------------------------------------------------------- garde du démarrage
--
-- Le plafond global est testé AVANT la limite par IP : quand la journée est pleine, le motif du
-- refus est le même pour tout le monde, et inutile de sérialiser par IP pour l'apprendre.
create or replace function public.recruit_start_attempt(
  p_device       text,
  p_ip           text,
  p_persona      text,
  p_qi_answers   jsonb,
  p_qi_timer     smallint,
  p_bot_messages smallint,
  p_max          integer,
  p_window       interval,
  p_daily_max    integer default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_id    uuid;
begin
  -- PLAFOND GLOBAL. Un seul verrou pour tout le monde : la fenêtre est commune, deux démarrages
  -- simultanés doivent voir le même compte (même raison de TOCTOU que le verrou par IP ci-dessous).
  if p_daily_max is not null then
    perform pg_advisory_xact_lock(hashtext('recruit_attempt:global'));
    select count(*) into v_count
      from public.recruit_attempts
     where created_at >= now() - interval '24 hours';
    if v_count >= p_daily_max then
      raise exception 'RECRUIT_DAILY_CAP' using errcode = 'P0001';
    end if;
  end if;

  -- IP inconnue (dev local, en-tête absent) : aucune limite applicable — on ne bloque pas tous les
  -- candidats derrière un `null` commun.
  if p_ip is not null then
    -- Sérialise les démarrages de CETTE IP jusqu'au commit. `hashtext` : l'advisory lock prend un
    -- bigint, pas du texte. Sans ce verrou, compte et insert restent un TOCTOU même en une seule
    -- fonction (READ COMMITTED : deux transactions lisent le même compte avant que l'une insère).
    perform pg_advisory_xact_lock(hashtext('recruit_attempt:' || p_ip));
    select count(*) into v_count
      from public.recruit_attempts
     where ip = p_ip
       and created_at >= now() - p_window;
    if v_count >= p_max then
      -- Message stable : l'appelant le reconnaît pour rendre le refus métier du plafond.
      raise exception 'RECRUIT_RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.recruit_attempts (device, ip, persona, qi_answers, qi_timer, bot_messages)
  values (p_device, p_ip, p_persona, p_qi_answers, p_qi_timer, p_bot_messages)
  returning id into v_id;

  return v_id;
end;
$$;

-- `create or replace` conserve les droits d'une fonction de MÊME signature ; celle-ci en gagne un
-- argument, donc Postgres crée une NOUVELLE fonction et l'ancienne survivrait avec ses droits.
drop function if exists public.recruit_start_attempt(text, text, text, jsonb, smallint, smallint, integer, interval);

revoke all on function public.recruit_start_attempt(text, text, text, jsonb, smallint, smallint, integer, interval, integer) from public, anon, authenticated;
