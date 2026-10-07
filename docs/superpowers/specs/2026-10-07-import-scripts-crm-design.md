# Import de scripts dans le CRM (Notion → MyPuls) — design

> Révision : 2026-10-07 · statut : à valider par Benoit · taille : L (écran, migration, écriture chez un tiers, session MyPuls serveur)
> Suite de `2026-10-06-script-mypuls-design.md` (commande `script-mypuls`, mêmes briques).

## 1. Objectif

La commande `script-mypuls` marche, mais « une commande, personne ne la lancera » (Benoit). Cible : un écran **« Importer un script »** dans le CRM. Le manager choisit un script dans le **Notion de l'agence**, lit le rapport (messages, embranchements, PPV, erreurs) et clique « Envoyer ». Le script arrive **désactivé** dans le Studio MyPuls de la modèle. Il le relit dans MyPuls, puis l'active.

Réussite : un manager importe un script de vente de bout en bout depuis le CRM, sans terminal, et seulement pour une modèle de son périmètre.

**Hors périmètre** :
- la connexion Notion par manager (OAuth) : l'agence regroupe tout dans un espace unique (décision du 2026-10-07). Gardée en note § 11 ;
- l'activation automatique ;
- la modification ou la suppression d'un script MyPuls existant.

## 2. Décisions (Benoit, 2026-10-07)

| Sujet | Décision |
|---|---|
| Qui importe | Admin : toutes les modèles. Manager : **seulement ses modèles** (`profile_creators`) |
| Compte MyPuls | Le compte de Benoit, dans une **session à part** de celle du relevé de nuit |
| Notion | **Un espace d'agence unique**, connecté **par un admin seulement**, depuis le CRM, avec un bouton **« Connecter Notion »** (OAuth Notion) ; tests avec le compte de Benoit |
| Vercel | Benoit accepte de passer en Pro si besoin |

## 3. Organisation du Notion d'agence (à monter par l'agence)

- Tous les managers sont membres de l'espace, et leur connexion Claude ↔ Notion pointe dessus : le prompt range le script au bon endroit.
- **Une page racine** (ex. « Agence »), qui contient « OUTILS MANAGERS » et **un dossier par modèle, au même nom que dans le CRM** (EMMA ↔ Emma ; casse et accents ignorés).
- Les scripts et leurs pages médias sont des **sous-pages du dossier de la modèle**.
- La page racine est cochée **une fois**, par l'admin, dans l'écran Notion qui s'ouvre au clic sur « Connecter Notion ». Tout ce qui est en dessous, y compris ce qui sera ajouté plus tard, devient lisible.

## 4. Parcours

0. **Connexion (admin, une fois)** : « Connecter Notion » ouvre l'autorisation Notion (OAuth). L'admin choisit l'espace de l'agence et coche la page racine. Au retour, le CRM chiffre et enregistre la clé, puis l'admin confirme la page racine parmi les pages partagées (présélectionnée s'il n'y en a qu'une). L'écran affiche l'espace connecté, la racine, qui a connecté et quand, avec « Déconnecter ». Sans connexion, un manager voit « Notion n'est pas connecté — demande à un admin ».
1. **Liste** : le CRM lit la page racine de la connexion, puis ses dossiers et leurs sous-pages. Il affiche les scripts groupés par dossier. Un dossier dont le nom correspond à une modèle du périmètre est rattaché d'office à cette modèle. En secours : coller un lien Notion.
2. **Préparer** (action serveur) : lecture de la page → conversion (Claude Opus 5.5, modèle de sortie issu des vrais scripts) → `normalizeDraft` → `validateScriptDraft`. Une ligne `script_imports` est créée au statut `prepared`, avec le rapport. **Rien n'est écrit chez MyPuls.**
3. **Rapport** : messages, embranchements, PPV, total, mode (séquence ou banque), ajustements, médias à rattacher, erreurs. Le bouton « Envoyer » n'existe que s'il n'y a aucune erreur. La modèle reste modifiable, dans le périmètre.
4. **Envoyer** (action serveur) :
   - contrôle du périmètre (RLS) ;
   - à toute heure : l'import a sa propre session et n'écrit que dans le Studio de scripts, il ne gêne pas le relevé de nuit (décision Benoit, 2026-10-07 : « c'est de l'instantané ») ;
   - session MyPuls « scripts » vérifiée, renouvelée seulement si elle est morte ;
   - `sendScript` : script désactivé avant le premier message, puis contrôle final ;
   - statut `sending` puis `sent` ou `failed`, avec l'**identifiant du script MyPuls enregistré dès sa création** ;
   - à l'écran : le lien du Studio, ou l'étape en échec et le nettoyage réellement obtenu (`describeFailure`).
5. **Historique** : les imports du manager (l'admin les voit tous). Un import resté en `sending`, coupé par la durée maximale de Vercel, s'affiche « interrompu » avec l'identifiant du script à vérifier et supprimer.

## 5. Architecture

**Nouveau package `@glagency/scripts`** (`packages/scripts`). On y déplace `script-notion.ts`, `script-convert.ts` et `script-send.ts` depuis `apps/ingestion/src/` : la commande et le CRM partagent ainsi le même code. Ajouts :
- `listNotionScripts(token, rootId)` : lit la racine, ses dossiers et leurs sous-pages ;
- `./session` : la session MyPuls « scripts » (`scriptsSessionForSend`, `keepScriptsSessionAlive`), sans le SDK Anthropic pour rester légère côté Worker.

Le package dépend de `@glagency/core`, `@glagency/mypuls` et `@anthropic-ai/sdk`. La commande `script-mypuls` est conservée et importe désormais depuis le package.

**Session MyPuls « scripts »** : une deuxième ligne de `ingest_session` (`id = 'scripts'`), table déjà réservée au service role (0109).
- Amorçage : si la ligne est vide, depuis `MYPULS_SCRIPTS_SESSION_COOKIE` (variable Vercel). Benoit se connecte une fois à MyPuls en navigation privée et colle le cookie : une série « remember me » distincte de celle du Worker.
- Avant chaque envoi : la session est **vérifiée** ; elle n'est renouvelée par le REMEMBERME (cookie frais enregistré) que si elle est morte.
- **Garde en vie** : le Worker renouvelle aussi cette ligne à chaque run nocturne, si elle existe et n'a pas été rafraîchie depuis 12 h. Un échec est un simple avertissement, pas un run dégradé. Tant qu'un run a lieu, elle ne meurt plus.
- Pas de collision : le relevé de nuit a sa propre session ; un import ne renouvelle qu'une session morte, et le Worker ne touche pas une session rafraîchie depuis moins de 12 h. Un PHPSESSID déjà en main reste valide même si le REMEMBERME tourne entre-temps.

**CRM (`apps/web`)** : feature `features/scripts-import/` selon `archi-web` et `docs/guidelines-standard-feature.md`.
- `app/(dash)/chatter/scripts/page.tsx` → `services/` → `ScriptsImportTemplate` (Server Component + feuille client) ;
- `actions.ts` : `prepareImport`, `sendImport`, `setNotionRoot`, `disconnectNotion` (Server Actions, Zod ; les deux derniers réservés à l'admin) ;
- **OAuth Notion** (seul cas de Route Handler, comme le prévoit `archi-web`) :
  - `app/api/notion/connect/route.ts` : admin réel exigé ; `state` aléatoire en cookie httpOnly ; redirection vers l'autorisation Notion ;
  - `app/api/notion/callback/route.ts` : vérifie le `state` et l'admin, échange le `code` contre la clé (`POST https://api.notion.com/v1/oauth/token`, authentification Basic avec l'id et le secret de l'application), la **chiffre** (`encryptSecret`, `lib/snap-crypto.ts`, AES-256-GCM, même modèle que `uncove_account_tokens`) et l'enregistre ;
  - les points précis de l'OAuth Notion (paramètres d'autorisation, présence d'un jeton de rafraîchissement, révocation) sont à relire dans la doc officielle au moment du code ;
- entrée de navigation « Importer un script » sur la face chatteurs, `adminOnly` + `managerAccess` ;
- `export const maxDuration = 800` sur la route (plan Pro : Benoit accepte de payer si besoin, 2026-10-07) ; 300 si le projet reste en Hobby. Une conversion prend 1 à 2 min (recette : ~7,7 k tokens écrits), un envoi environ 1 min hors attentes sur 429.

**Migration `0184` — table `notion_connection`** (une seule ligne, `id = 'agence'`) : `access_token_encrypted`, `workspace_id`, `workspace_name`, `bot_id`, `root_page_id` (null tant que l'admin n'a pas confirmé), `connected_by` → `profiles`, `connected_at`. **RLS activée sans aucune policy**, comme `ingest_session` : seul le serveur (client admin) la lit, après contrôle du rôle admin dans l'action. La clé n'est jamais renvoyée au navigateur.

**Migration `0184` — table `script_imports`** :

| Colonne | Contenu |
|---|---|
| `id` uuid, `created_by` → `profiles`, `creator_id` → `creators` | qui, pour quelle modèle |
| `notion_page_id`, `notion_title` | la source |
| `status` text check (`prepared`, `sending`, `sent`, `failed`) | état |
| `summary`, `notes`, `errors`, `draft`, `usage` jsonb | rapport et brouillon |
| `mypuls_script_id` bigint, `failed_step` text, `error` text, `cleanup` jsonb | résultat |
| `created_at`, `sent_at` | dates |

RLS, qui fait le vrai cloisonnement :
- lecture : `is_admin()` ou `created_by = auth.uid()` ;
- insertion et mise à jour : `created_by = auth.uid()`, et `is_admin()` ou modèle présente dans `profile_creators` pour `auth.uid()`.

Un manager sans modèle assignée ne peut rien importer. C'est plus strict que le repli « sans borne » des pages en lecture : on écrit chez un tiers.

## 6. Garde-fous

Ceux de la commande s'appliquent tous : vérification complète avant écriture, script désactivé puis relu, création uniquement, chemins appariés par libellé et couleur, attentes sur les 429, « INCOMPLET » avec un nettoyage rapporté tel quel. S'y ajoutent :
- l'envoi ne part que depuis une ligne `prepared` sans erreur, appartenant à l'appelant, pour une modèle de son périmètre ;
- un import en cours (`sending`) bloque un second envoi de la même ligne (anti double-clic) ;
- l'identifiant MyPuls est enregistré dès la création du script.

## 7. Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET` | Vercel | l'application Notion (déclarée une fois, adresse de retour `https://<domaine>/api/notion/callback`) |
| `SNAP_CODES_SECRET` | déjà sur Vercel | clé de chiffrement réutilisée pour la clé Notion |
| `NOTION_TOKEN` | `.env` local seulement | la commande `script-mypuls` (outil de dev), inchangée |
| `MYPULS_SCRIPTS_SESSION_COOKIE` | Vercel | amorçage de la session « scripts » |
| `ANTHROPIC_API_KEY` | déjà sur Vercel (Formation) | conversion |

## 8. Tests et recette

- **Vitest** :
  - `listNotionScripts` (racine → dossiers → scripts, pagination) ;
  - rattachement d'un dossier à une modèle (casse, accents, absent, hors périmètre) ;
  - règles de l'envoi (refus hors périmètre, double envoi, envoi avec erreurs, statut « interrompu ») ;
  - session « scripts » (amorçage, session valide gardée telle quelle, session morte renouvelée, ligne absente, garde en vie sautée si rafraîchie depuis moins de 12 h) ;
  - OAuth Notion : `state` absent ou faux refusé, non-admin refusé, échange réussi → clé chiffrée enregistrée (faux serveur Notion), déconnexion ;
- **SQL** : test de la RLS de `script_imports` sur l'UAT (manager hors périmètre refusé, admin accepté).
- **Recette avec le compte de Benoit** :
  - l'application Notion déclarée, « Connecter Notion » depuis le CRM (UAT) sur son espace, une racine de test avec un dossier « JULIE » et un script ;
  - Préparer depuis le CRM (UAT), puis Envoyer sur une modèle de test, sur son go ;
  - relecture dans le Studio, puis suppression.

## 9. Découpage

| PR | Contenu |
|---|---|
| 1 | Package `@glagency/scripts` (déplacement, `listNotionScripts`, session « scripts ») ; garde en vie par le Worker ; commande inchangée côté usage |
| 2 | Migration `0184` (`notion_connection`, `script_imports` + RLS, UAT d'abord) ; OAuth Notion (connect, callback, racine, déconnexion) ; actions `prepareImport` et `sendImport` |
| 3 | Écran : connexion Notion (admin), liste, rapport, envoi, historique ; navigation |
| 4 | Doc (ARCHITECTURE, CARTE, CHANGELOG, `.env.example`), recette |

## 10. Coût

Environ 0,19 $ par préparation (Opus 5.5, mesuré sur la recette Lucie). L'envoi ne coûte rien côté IA. Pas de nouveau fournisseur : Notion (API officielle, gratuite) et Anthropic (déjà payé pour la Formation).

## 11. Risques et notes

- **Durée Vercel** : une préparation dure 1 à 2 min, un envoi environ 1 min hors 429. Pro : 800 s, large marge ; Hobby : 300 s (et le Hobby est réservé à un usage non commercial : plan à vérifier sur le tableau de bord). Au-delà, l'envoi est coupé : le script reste désactivé (désactivé avant le premier message) et l'historique affiche « interrompu » avec son identifiant.
- **Adresses internes MyPuls**, médias à rattacher (décision D1) : comme pour la commande.
- **Note, Notion par manager** : si un jour des scripts vivent hors de l'espace d'agence, la même application OAuth permet un « Connecter mon Notion » par manager (une ligne de connexion par profil au lieu d'une seule). `listNotionScripts` et la lecture restent identiques ; environ 1 PR.
- **Application Notion publique** : l'OAuth exige de déclarer l'application dans le portail développeur de Notion. Les informations demandées (nom, site, politique de confidentialité) et l'éventuelle revue pour un usage limité à un espace sont à vérifier au moment de la déclaration.
