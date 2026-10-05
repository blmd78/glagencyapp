-- 0181 — Agence : type et modèle d'un événement (spec
-- docs/superpowers/specs/2026-10-02-photos-modeles-agence-design.md, partie B).
--
-- Les événements s'écrivaient « CAROUSEL ALICE », « POP UP CARLA » : le TYPE (texte libre, 40
-- caractères au plus) et la MODÈLE deviennent deux champs. Le nom (`title`) reste la vérité
-- affichée et notifiée ; la fenêtre le compose à partir des deux, et il reste modifiable.
-- La modèle donne son avatar (`creators.avatar_path`, 0180) à côté du nom.
--
-- Facultatifs tous les deux : une réunion n'a ni type ni modèle. Une modèle supprimée laisse
-- l'événement sans modèle (`on delete set null`).
--
-- Écriture : inchangée (service-role après la garde admin, aucune policy d'écriture, 0175).
-- Lecture : la RLS de `agency_events` s'applique aux nouvelles colonnes comme aux autres.

alter table public.agency_events
  add column if not exists kind text check (kind is null or char_length(kind) between 1 and 40),
  add column if not exists creator_id uuid references public.creators(id) on delete set null;

create index if not exists agency_events_creator_idx on public.agency_events (creator_id);

-- Reprise des événements existants : un titre d'au moins deux mots dont le DERNIER est le nom
-- exact d'une modèle (sans tenir compte de la casse) → cette modèle, et le reste du titre devient
-- le type (« HERO SLIDER MATHILDE » → type « HERO SLIDER », modèle Mathilde). Sinon rien ne change.
update public.agency_events e
set creator_id = c.id,
    kind = nullif(left(trim(regexp_replace(e.title, '\s+\S+\s*$', '')), 40), '')
from public.creators c
where e.creator_id is null
  and e.title ~ '\S\s+\S'
  and lower(c.name) = lower(regexp_replace(trim(e.title), '^.*\s', ''));
