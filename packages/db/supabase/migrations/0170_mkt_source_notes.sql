-- 0170 — Une note libre par (modèle, réseau) : l'onglet « Sources de trafic » de Marketing ›
-- Modèles (demande Benoit 2026-09-23 : « un crayon sur chaque source par modèle, qui ouvre une
-- modale où l'on peut mettre dans un textarea un énorme bloc d'info »).
--
-- Clé = (creator_id, group_key) : la note appartient au couple, pas à un lien — une modèle a
-- plusieurs liens Instagram, elle n'a qu'une source Instagram. `group_key` suit le groupe s'il est
-- renommé côté clé (`on update cascade`) ; un groupe n'est jamais supprimé physiquement (0167,
-- suppression douce), la note survit donc à sa mise à l'écart.
--
-- Texte libre, plafonné à 20 000 caractères : « énorme », mais pas un fichier. Une note vidée est
-- SUPPRIMÉE par l'action plutôt que gardée vide — pas de ligne fantôme qui ferait croire à une note.
--
-- ⚠️ Texte en CLAIR. Si l'équipe y range des identifiants de comptes, il faudra chiffrer comme les
-- Codes Snap (0063, AES) : la RLS protège la lecture, pas une fuite de sauvegarde ou de journal.
--
-- Même porte que le reste des tables marketing (0018, resserrée en 0060) ; l'écriture passe en
-- plus par une garde admin dans la Server Action, comme tous les réglages du pôle.

create table if not exists public.mkt_source_notes (
  creator_id uuid not null references public.creators(id) on delete cascade,
  group_key  text not null references public.mkt_link_groups(key) on update cascade on delete cascade,
  body       text not null check (char_length(body) between 1 and 20000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (creator_id, group_key)
);

alter table public.mkt_source_notes enable row level security;
create policy mkt_source_notes_all on public.mkt_source_notes for all to authenticated
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));
