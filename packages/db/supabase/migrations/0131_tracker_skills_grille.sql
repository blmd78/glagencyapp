-- Grille de compétences du suivi chatters — les CINQ compétences manquantes.
--
-- 0128 n'en a semé qu'UNE, au motif écrit l.146-149 que « leurs libellés ne figurent nulle part
-- dans les pages capturées ». C'est faux : les six sont en clair dans la capture d'une fiche réelle
-- (`.tracker-ref/notes-67.html`, bloc « Compétences travaillées pendant cette session »), chacune
-- avec ses cinq étoiles. Un 1:1 saisi jusqu'ici n'évaluait donc qu'un sixième de la grille.
--
-- Libellés et ORDRE repris de leur écran. Descriptions reprises du catalogue de formation de la
-- même agence (`0113_formation.sql:222,268,301,337,394,476`) : ce sont les mêmes six domaines, dans
-- les mots de l'agence — leur écran de suivi n'affiche que le libellé et les étoiles, pas de texte.
--
-- Idempotent par NOM : rejouer la migration ne duplique rien, et `Setting & Qualification` déjà
-- semée par 0128 garde sa ligne (donc ses notes existantes, qui pointent sur son id).
insert into public.tracker_skills (name, description, position)
select v.name, v.description, v.position
from (values
  ('Setting & Qualification',
   'Qualifier l''abonné (KYC) en douceur, faire monter l''envie, puis closer le tout premier média payant à 6 €.',
   1),
  ('Transitions',
   'Le fan sort du script (il dévie, il va trop vite, il se bloque) : rebondir sur ce qu''il dit PUIS raccrocher à la prochaine étape du script, sans casser le lien ni la chauffe.',
   2),
  ('Demande de rencontre',
   'Le fan veut se rencontrer en vrai : refuser en laissant TOUJOURS la porte ouverte, sans jamais vexer — valoriser, valider l''émotion, donner une raison stable, compenser, rebondir. Un futur flou, jamais de date.',
   3),
  ('Négociation après objection',
   'Le fan objecte (prix, budget, méfiance) : ne JAMAIS baisser le prix. Méthode ARCC — Accuser, Recadrer, Créer le désir, Closer — on change ce qu''il y a dans le paquet, pas le prix.',
   4),
  ('Relationnel',
   'Créer une vraie connexion pour vendre plus facilement et plus cher, puis fidéliser le fan pour le faire revenir. Sert AVANT et APRÈS la vente.',
   5),
  ('Relance spender',
   'Le fan a lâché un truc positif au milieu du bavardage : le repérer et relancer dessus, en un seul message — jamais sur une plaie.',
   6)
) as v(name, description, position)
where not exists (
  select 1 from public.tracker_skills s where s.name = v.name
);

-- Remettre l'ordre d'affichage de leur écran sur la ligne déjà présente (0128 la posait en 1, mais
-- on ne présume pas de ce qui a pu être édité depuis).
update public.tracker_skills set position = 1
where name = 'Setting & Qualification' and position <> 1;
