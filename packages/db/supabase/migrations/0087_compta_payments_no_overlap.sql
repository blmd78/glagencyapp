-- 0087 — Un jour ne peut être payé qu'UNE fois par chatteur.

-- Nettoyage d'une première version de CE MÊME 0087, appliquée sur l'UAT le 2026-07-27 : elle
-- posait un `unique (chatter_id, month, period)`. Proxy trop grossier — il interdisait les
-- paiements PARTIELS, que la spec §3 et §10 traitent comme un cas nominal (« `covered_days` ne
-- couvre qu'une partie → la quinzaine reste incomplète »). No-op sur une base neuve.
drop index if exists public.compta_payments_chatter_period_uniq;

-- Le vrai invariant est le non-chevauchement des jours couverts, pas l'unicité de la quinzaine.
--
-- Le verrou consultatif est ce qui rend la garde réellement atomique : un simple `exists` en
-- READ COMMITTED ne verrouille rien, deux insertions concurrentes le passeraient toutes les
-- deux. Sérialiser par chatteur suffit — les paiements de deux chatteurs ne se croisent jamais.
--
-- `security definer` : la fonction doit voir TOUS les paiements du chatteur visé pour détecter
-- un doublon. Aujourd'hui seul l'admin écrit (`compta_payments_admin_write`, 0085) et lit tout,
-- donc la RLS ne masquerait rien ; mais si l'écriture s'ouvrait un jour à l'encadrement, une
-- vérification soumise à la RLS deviendrait silencieusement partielle — et un jour serait payé
-- deux fois sans erreur. La fonction ne fait que lire et lever : rien à détourner.
create or replace function public.compta_payment_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.chatter_id::text));

  if exists (
    select 1 from public.compta_payments p
     where p.chatter_id = new.chatter_id
       and p.id <> new.id
       and p.covered_days && new.covered_days
  ) then
    -- 23505 (unique_violation) et non une erreur générique : `payFortnight` la traduit déjà en
    -- message métier, et c'est bien une violation d'unicité au sens fonctionnel.
    raise exception 'Un paiement couvre déjà au moins un de ces jours pour ce chatteur'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists compta_payment_no_overlap on public.compta_payments;
create trigger compta_payment_no_overlap
  before insert or update of covered_days, chatter_id on public.compta_payments
  for each row
  when (new.covered_days is not null)
  execute function public.compta_payment_no_overlap();
