-- 0117 — Entraînement : la révélation différée devient une garantie de la BASE.
--
-- ⚠️ ORDRE D'APPLICATION : cette migration doit être appliquée **APRÈS** le déploiement du code qui
-- l'accompagne, et surtout pas avant. Elle retire un droit de lecture dont l'ancien code se sert
-- encore ; l'appliquer sur une prod qui tourne encore le code précédent casserait l'écran de
-- session. C'est la seule migration de ce lot dans ce cas — 0116 est sûre dans les deux sens.
--
-- LE TROU. `training_messages_read` ne filtre que la LIGNE (session du chatter, encadrant
-- `frm-suivi`, admin) : aucun prédicat sur `visible_at`. La rétention du texte du fan ne vivait donc
-- que dans l'applicatif (`get-session`, `sendMessage`, `revealThread`, qui rendent un corps vide
-- tant que l'échéance n'est pas passée). Un chatter authentifié pouvait lire `body` en direct via
-- PostgREST avec son propre jeton pendant les 30 à 120 secondes de révélation, et préparer sa
-- réponse AVANT l'armement du chrono de réaction — sur la mécanique même qui produit les notes, le
-- classement hebdomadaire et donc les gains de la roue.
--
-- POURQUOI PAS un prédicat `visible_at <= now()` dans la policy : cacher la LIGNE casserait le jeu.
-- Le client déduit « une réponse est en attente » de l'EXISTENCE du message non encore visible, et
-- s'en sert pour SUSPENDRE le chrono et verrouiller la saisie. Ligne absente = chrono armé tout de
-- suite = le chatter perd le temps de réaction auquel il a droit.
--
-- CORRECTIF : plus aucune lecture de cette table par les rôles clients. Les trois lectures
-- légitimes (affichage d'une session, historique d'un tour, révélation à l'échéance) passent en
-- service-role APRÈS un contrôle d'accès explicite — soit la session lue sous RLS par le client de
-- l'appelant, soit la jointure sur `profile_id`. C'est exactement le modèle déjà retenu pour les
-- ÉCRITURES de la face (lecture RLS, écriture service-role après vérification de propriété) et pour
-- le secret `expected`.
--
-- `training_messages_read` n'est pas touchée : elle reste la règle des LIGNES, et redeviendrait
-- effective si un jour on rendait la lecture à `authenticated`. Le service-role, lui, conserve son
-- privilège de table (il n'est pas visé par ce revoke) et n'est pas soumis à la RLS.
revoke select on public.training_messages from anon, authenticated;

comment on table public.training_messages is
$cmt$messages d'une session d'entraînement. LECTURE RÉVOQUÉE aux rôles clients (0117) : le corps du fan ne doit pas être récupérable avant sa révélation différée — les lectures applicatives passent en service-role, après contrôle d'accès explicite$cmt$;
