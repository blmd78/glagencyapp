-- 0115 — Test de recrutement : durcissement issu de l'audit du 2026-08-21.
--
-- DEUX défauts, une même racine : des règles servies au candidat au démarrage, mais REVÉRIFIÉES
-- plus tard contre la config du moment.
--
-- 1. PLAFOND PAR IP CONTOURNABLE (TOCTOU). `enforceIpRateLimit` comptait les tentatives puis
--    `startAttempt` insérait dans une requête SÉPARÉE : sans transaction ni verrou, une rafale
--    concurrente depuis une même IP lit toutes le même compte et insère toutes. Sur un endpoint
--    PUBLIC et non authentifié (`/postuler`, whitelisté dans proxy.ts), chaque tentative ouvre
--    jusqu'à `bot_messages` appels Haiku + un appel Sonnet de notation : le plafond est ce qui
--    borne la facture. `recruit_start_attempt()` fait désormais compte ET insert dans la MÊME
--    transaction, précédés d'un `pg_advisory_xact_lock` sur l'IP — deux démarrages de la même IP
--    ne peuvent plus s'entrelacer. Le verrou est par IP : deux candidats distincts ne s'attendent pas.
--
-- 2. RÉGLAGES NON FIGÉS PAR TENTATIVE. `qi_timer` et `bot_messages` étaient relus dans la config
--    LIVE au moment de la correction : un changement admin en cours de tentative rejetait un
--    candidat qui avait pourtant respecté le chrono affiché (qi_timer abaissé), offrait du temps
--    que le tirage n'avait jamais accordé (qi_timer relevé), ou enfermait définitivement le
--    candidat (bot_messages relevé : le client verrouille l'envoi à N figé, le serveur en exige
--    N+4 → `CHAT_INCOMPLETE` pour toujours, sur une tentative qui a déjà payé ses appels IA).
--    Les deux valeurs sont maintenant COLONNES de la tentative, posées au démarrage — même
--    principe que `qi_answers` (clé de correction) et que le nombre de questions figé en 0114.
--
-- Rétro-compat : les tentatives existantes prennent les défauts de 0113 (30 s, 14 messages), qui
-- sont les valeurs sous lesquelles elles ont été servies tant que personne n'a touché la config.

alter table public.recruit_attempts
  add column if not exists qi_timer     smallint not null default 30 check (qi_timer between 5 and 300),
  add column if not exists bot_messages smallint not null default 14 check (bot_messages between 1 and 50);

comment on column public.recruit_attempts.qi_timer is
  $cmt$secondes par question, FIGÉES au tirage — la correction serveur ne relit jamais la config live$cmt$;
comment on column public.recruit_attempts.bot_messages is
  $cmt$nombre de messages exigés au chat, FIGÉ au démarrage — le client verrouille l'envoi sur la même valeur$cmt$;

-- Démarrage d'une tentative : plafond par IP et insertion dans la même transaction.
-- SECURITY DEFINER + search_path épinglé ; appelée uniquement par le service-role (Server Action),
-- jamais exposée à anon/authenticated — d'où le `revoke` ci-dessous.
create or replace function public.recruit_start_attempt(
  p_device       text,
  p_ip           text,
  p_persona      text,
  p_qi_answers   jsonb,
  p_qi_timer     smallint,
  p_bot_messages smallint,
  p_max          integer,
  p_window       interval
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_id    uuid;
begin
  -- IP inconnue (dev local, en-tête absent) : aucune limite applicable — on ne bloque pas tous les
  -- candidats derrière un `null` commun. Même règle qu'avant, mais côté base désormais.
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

revoke all on function public.recruit_start_attempt(text, text, text, jsonb, smallint, smallint, integer, interval) from public;
revoke all on function public.recruit_start_attempt(text, text, text, jsonb, smallint, smallint, integer, interval) from anon, authenticated;

comment on function public.recruit_start_attempt(text, text, text, jsonb, smallint, smallint, integer, interval) is
  $cmt$démarre une tentative : plafond par IP (advisory lock) + insert atomiques — service-role uniquement$cmt$;
