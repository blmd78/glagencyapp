# Formation — incrément 4 : Test de recrutement public (design)

**Statut** : validé en chat le 2026-08-20 (Benoit), à implémenter sur `feature/formation-catalogue`
(migration **0125**, UAT seulement, prod avec la release).
**Source** : test de recrutement de Good Luck Agency (`serveur.py` : `PERSONAS`, `bot_system`,
`SCORE_SYSTEM`, `CAND_SCORE_SCHEMA`, `/api/bot|score|check|candidate|status` ; `index.html` :
`DEFAULT_CONFIG`, `QI_BANK`, `render.kyc|qi|frappe|connexion|bot`, `finishCandidate`). Extrait de
travail : `scratchpad/gla-recruit-extract.txt` (session).

## 1. Contexte et décisions (chat 2026-08-20)

- **Lien ouvert** comme GLA (pas d'invitation) : `https://glagencyapp-web.vercel.app/postuler` —
  bouton « Copier le lien du test » sur la page Recrutement.
- **Identité À LA FIN** (différence voulue vs GLA qui la demandait d'abord) : le candidat passe le
  test, puis donne **nom, prénom, e-mail** (+ Discord optionnel) pour soumettre. Abandon avant =
  aucun dossier (mais la tentative technique existe, cf. §3 — rate-limit et coût IA).
- **Parcours GLA repris tel quel** : QI (5 QCM, 30 s/question, banque configurable) → frappe
  (recopier un texte, mots/min corrects, copier-coller bloqué) → connexion (téléchargement
  `speed.cloudflare.com/__down`, 12 s max, Mbps) → **conversation fan IA** (personas Lucas/Marco/
  David en rotation serveur, 14 échanges par défaut, **média verrouillé `[MEDIA VERROUILLE - X€]`**
  envoyable par le candidat) → notation IA 4 axes /25 (orthographe, cohérence, relance, vente).
- **Verdict GLA conservé** : gates cachés (frappe ≥ 30 wpm, connexion ≥ 10 Mbps, QI ≥ 3/5),
  score global = QI/5×30 + bot/100×70, réussite si gates ET global ≥ 70 ; refus avec une **raison
  qualitative** (l'épreuve la plus faible, jamais les chiffres) ; réussite → lien Discord (config).
- **Un seul essai** (`oneAttempt`) : à la soumission, device + e-mail (+ Discord) rejoignent la
  liste de blocage ; le blocage device/IP est vérifié à l'ENTRÉE du test, e-mail/Discord à la
  soumission. E-mail déjà porteur d'un dossier → dossier marqué « 2e passage » côté agence.
- **Conversation tenue CÔTÉ SERVEUR** (différence assumée vs GLA, aligne sur nos sessions
  d'entraînement) : tentative anonyme + messages en base, le bot répond sur l'historique serveur,
  la notation lit la transcription serveur → pas de transcription forgée ; rate-limit par IP ;
  coût IA visible même sur les abandons.
- **Côté CRM (face Formation)** : item direct **« Recrutement »** (**admin seulement** — « c'est la
  config du lien qu'on envoie ») : file des candidats, dossier complet, valider/refuser/bloquer,
  copier le lien. **Groupe repliable « Configuration »** (admin) dans la sidebar : **Catalogue**
  (déplacé dedans) + **« Config du test »**.
- **Rattachement membre** : création d'un membre dont l'e-mail = un dossier → `profile_id` posé
  automatiquement (+ encart dans le dialog de création, ligne `recompense`? non — kind dédié n'est
  pas nécessaire : encart + « devenu membre » côté Recrutement suffisent, pas de member_event).
- IA via `lib/ai/` existant : bot **Haiku** (`max_tokens` 150, sans thinking), notation **Sonnet**
  structurée (schéma 4 axes + total recalculé serveur) ; prompts GLA transposés fidèlement.

Hors périmètre : invitations/tokens, e-mails automatiques aux candidats, multi-langue, captcha
(le rate-limit + blocklist + plafond de messages bornent le coût), stats de recrutement.

## 2. Règles

- **Entrée** (`/postuler`) : route PUBLIQUE (le proxy laisse passer `/postuler` comme `/login`).
  Au chargement : test fermé (config) → écran « Le recrutement est fermé pour le moment ». Sinon
  `startAttempt({ device })` : device (UUID localStorage) + IP contre `recruit_blocklist` →
  bloqué → écran « Tu as déjà passé le test » ; rate-limit : > 5 tentatives créées pour la même IP
  sur 24 h → refus (« réessaie plus tard ») ; sinon création de `recruit_attempts` (statut `en_cours`).
- **QI** : 5 questions tirées de la banque (1 variante aléatoire par emplacement), 30 s par
  question (config `qi_timer`), non répondu = faux. Le score est calculé SERVEUR : le client envoie
  les réponses choisies, le serveur les corrige contre la banque (la bonne réponse ne descend
  jamais au client).
- **Frappe** : texte fixe GLA recopié ; wpm = mots corrects / minute ; copier-coller bloqué (UI) ;
  le client envoie `{ wpm, accuracy, seconds }` (déclaratif, comme GLA — le gate est caché).
- **Connexion** : mesure client `speed.cloudflare.com/__down?bytes=50000000` (12 s max) → Mbps.
- **Bot** : `botReply({ attemptId, body | mediaPrice })` — le serveur ajoute le message candidat à
  `recruit_messages`, appelle Haiku avec `bot_system(persona)` (persona choisi à la création de la
  tentative par rotation), historique = messages serveur (`to_messages` GLA : candidat = user,
  client = assistant), enregistre la réponse (150 tokens max), renvoie `{ reply }`. Fin quand
  `bot_replies >= bot_messages` (config, défaut 14). Chaque appel tracé (`recruit_attempts` :
  compteurs tokens). Média : `mediaPrice` ⇒ body `[MEDIA VERROUILLE - X€]` (mécanique GLA).
- **Notation** : `scoreAttempt({ attemptId })` — transcription serveur → Sonnet structuré
  (`orthographe`, `coherence`, `relance`, `vente` 0-25, clampés serveur ; `total` recalculé =
  somme). Une seule notation par tentative (idempotent).
- **Soumission** : `submitCandidate({ attemptId, firstName, lastName, email, discord? })` —
  e-mail/Discord contre la blocklist → refus ; dossier `recruit_candidates` créé (verdict calculé
  SERVEUR : gates + global + raison qualitative GLA) ; device + e-mail (+ Discord) ajoutés à la
  blocklist (`oneAttempt`) ; e-mail déjà en dossier → flag `repeat` ; tentative → statut `soumise`.
  Écran final GLA : réussite (avec lien Discord) ou refus (raison qualitative).
- **Recrutement (admin)** : liste (nouveaux d'abord, badge sidebar = dossiers `nouveau`), dossier
  (identité, QI/frappe/connexion avec gates, 4 axes + global, transcription, device/IP, repeat,
  « devenu membre »), actions : **valider** / **refuser** (statut), **bloquer** (device+e-mail+
  Discord+IP), **débloquer** (retirer de la blocklist), supprimer un dossier (ConfirmDialog).
- **Config du test (admin)** : ouvert/fermé, `bot_messages`, `qi_timer`, seuils (`frappe_min`,
  `connexion_min`, `qi_min`, `global_threshold`), lien Discord, **banque QI** (5 emplacements,
  variantes { question, 4 options, bonne réponse }), texte de frappe. Défauts = GLA.

## 3. Modèle de données (migration `0125_recruit_test.sql`)

- `recruit_config` (1 ligne) : `open boolean`, `bot_messages`, `qi_timer`, `frappe_min`,
  `connexion_min`, `qi_min`, `global_threshold`, `discord_link`, `typing_text`, `qi_bank jsonb`
  (défauts GLA), `updated_at/by`.
- `recruit_attempts` : id, `device`, `ip`, `persona`, `status` (`en_cours`/`notee`/`soumise`/
  `abandonnee`), `qi_score`, `qi_answers jsonb`, `typing jsonb`, `connection_mbps`,
  `bot_replies int`, `input_tokens`/`output_tokens`, scores 4 axes + `bot_total`, `created_at`.
  Index (ip, created_at) pour le rate-limit.
- `recruit_messages` : attempt_id, position, `speaker` (`candidat`/`client`), body, media_price,
  created_at ; unique (attempt_id, position).
- `recruit_candidates` : id, attempt_id (unique), `first_name`, `last_name`, `email`, `discord`,
  `qi_score`, `typing_wpm`, `connection_mbps`, 4 axes, `bot_total`, `global`, `passed`,
  `refusal_step`/`refusal_reason`, `repeat boolean`, `status` (`nouveau`/`valide`/`refuse`),
  `profile_id uuid null → profiles`, `reviewed_by/at`, created_at. Index email, status partiel.
- `recruit_blocklist` : id, `device`, `email`, `discord`, `ip`, `reason`, `created_by`, created_at.
- **RLS : tout `is_admin()` en lecture ; AUCUNE policy anon/authenticated d'écriture** — le
  candidat ne touche la base QUE via les Server Actions (service-role) ; l'anon key ne lit rien.
- RPC `recruit_pending_count()` (definer, admin) pour le badge sidebar.

## 4. Architecture web

- **Public** : `app/postuler/{page,layout}.tsx` (layout minimal hors dash, pas de sidebar ; thème
  clair du CRM, sobre) → feature `features/recruit-test/` : `TestFlow` (client : machine à états
  intro → qi → frappe → connexion → bot → identité → fin ; état local, `sessionStorage` pour
  survivre à un refresh en gardant `attemptId`), actions publiques (`startAttempt`, `saveQi`,
  `saveTyping`, `saveConnection`, `botReply`, `scoreAttempt`, `submitCandidate` — chacune
  revalide côté serveur : tentative existante, statut, bornes), `lib/ai/recruit-prompts.ts`
  (+ client partagé). Proxy : `/postuler` ajouté aux routes publiques.
- **Admin** : `features/recruit-admin/` — `/formation/recrutement` (liste + dossier `?dossier=id`),
  `/formation/recrutement/config` (RHF + Zod, banque QI en field arrays) ; sidebar : item
  Recrutement (adminOnly, badge) + groupe « Configuration » (adminOnly) = Catalogue + Config du
  test ; rattachement membre dans `features/members` (création : lookup e-mail → `profile_id` +
  encart).
- Frontières : rien de partagé entre `recruit-test` (public) et `recruit-admin` hors `lib/` ;
  montants/aucun secret : la banque QI (bonnes réponses) ne descend JAMAIS au client public.

## 5. Sécurité, coût, tests

- Coût borné : bot ≤ `bot_messages` × 150 tokens sortie (~14 échanges ≈ 0,01-0,02 $), notation
  1 appel Sonnet ; rate-limit 5 tentatives/IP/24 h ; test fermable en un clic ; blocklist.
- Anti-triche : QI corrigé serveur, conversation serveur, verdict serveur ; frappe/connexion
  restent déclaratifs (gates cachés, comme GLA — assumé).
- Tests Vitest : schémas (identité, config), `computeVerdict` (gates/global/raison — pur, dans
  `@glagency/core` ou la feature), correction QI. Le reste = recette UAT.

## 6. Recette (UAT)

1. `/postuler` sans être connecté : parcours complet → dossier créé, visible dans Recrutement.
2. Refaire le test sur le même navigateur → « Tu as déjà passé le test » (blocklist device).
3. Config : fermer le test → écran fermé ; changer `bot_messages` → pris en compte.
4. Admin : valider / refuser / bloquer / débloquer ; badge sidebar.
5. Créer un membre avec l'e-mail du candidat → encart « A passé le test » + « devenu membre ».
6. Vérifier le coût (compteurs tokens de la tentative).
