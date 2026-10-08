# Script Notion → MyPuls — design

> Révision : 2026-10-06 · statut : à valider par Benoit · taille : L (écriture chez un tiers, prix de vente)

## 1. Objectif

Les managers rédigent les scripts des modèles dans Claude avec les prompts de la page Notion **OUTILS MANAGERS** (KYC, vente V3, négociation), puis les ressaisissent à la main dans le Studio de scripts MyPuls : **~6 h par script**. Cible : une commande qui lit la page Notion du script et **remplit MyPuls** à la place du manager.

Réussite = un script de vente V3 complet (messages, embranchements 🔴/🟢, délais, prix, médias) apparaît dans le Studio de la bonne modèle, désactivé, sans aucune saisie, et le manager n'a plus qu'à le relire et l'activer.

**Hors périmètre** : le CRM web (aucun écran, aucune table), un serveur MCP pour les managers (couche possible plus tard, au-dessus du même code), la modification ou la suppression de scripts existants, l'activation automatique.

## 2. Ce qui est vérifié (2026-10-06)

**Studio MyPuls** — page `/scripts` capturée (`apps/ingestion/raw/pages/scripts.html`) et code public du Studio (`cdn.mypuls.app/assets/js/pages/script-studio-*.js`) :

| Action | Requête | Corps |
|---|---|---|
| Choisir la modèle | `GET /switch-creator/{id}` — déjà codé : `switchCreator` (`packages/mypuls/src/endpoints/chat.ts:29`) | — |
| Créer le script | `POST /scripts/new` → JSON `{ id }` | FormData `name`, `description`, `ai_brief`, `is_sequence` (0/1), `used_ratio` |
| Ajouter un message | `POST /scripts/{id}/messages/new` | FormData `title`, `content`, `price`, `medias_json` (liste d'ids), `chain_delays_json` (secondes), et `branch_id` + `branch_path` pour un message dans un chemin |
| Ajouter un embranchement | `POST /scripts/{id}/branches/new` | JSON `{ label, paths: [{ label, color }] }` |
| Lire l'état du Studio | `GET /scripts/{id}/studio` → JSON `{ script, branches, messages }` (capture `raw/pages/scripts-1326-studio.json`) | — |
| Ordre des éléments | `PATCH /scripts/{id}/layout` | JSON `{ items: [{ type: 'message', id } \| { type: 'branch', id, paths: [{ id, messages: [ids] }] }] }` |
| Activer / désactiver | `PATCH /scripts/{id}/toggle` | JSON `{ isActive }` |
| Renommer | `POST /scripts/{id}/edit` | mêmes champs que la création |

- Création sans jeton CSRF (en-tête `X-Requested-With: XMLHttpRequest` + cookie de session) ; seules les suppressions en exigent un.
- Règles imposées par le Studio (`policy`, `chainLimits` de la page) : 5 médias max par message, prix 5 → 1000 €, 500 caractères max quand un média est joint, 8 chemins max par embranchement, 10 relances max (10 s → 48 h), **un message payant exige un média** (contrôle côté navigateur ; côté serveur : à vérifier).
- Couleurs de chemin : `green`, `orange`, `red`, `blue`, `yellow`, `purple`, `grey`.
- Le script est créé sur **la modèle courante de la session** : chaque envoi commence par `switchCreator`.
- Médias : identifiants MYM propres à chaque modèle (export CSV : `74970496,76783012`). Métadonnées connues : type (photo / vidéo / vocal), durée, vignette, date — **aucun libellé** (`meta.title` vide).

**Formats Notion** (lus via le connecteur Notion) :
- **Vente V3** (`Prompt – Script de vente V3`) : format strict — messages numérotés, étape `#N`, branche 🔴/🟢, badges type (💬/🎙️/🖼️), `🖼️ n médias`, `🔒 prix`, `⏱️ délai`, `🔗 n`, bulle en citation, consignes entre parenthèses.
- **KYC** (`Script découverte (KYC) · Lucie`) : autre format — `#N · titre`, « ⏩ À la suite », « ⏸️ Attendre sa réponse », alternatives `#6/#7/#8` selon la réponse du fan, messages automatiques (`N1…`, `E1…`), aucun prix ni média.
- **Vente V2** (PDF d'Emma) : chronologie des médias avec prix, et chaque média est une **page Notion** (« ligne violette ») dans le dossier de la modèle — contenu non lu (dossier non partagé).

## 3. La commande

```bash
pnpm --filter @glagency/ingestion script-mypuls <lien page Notion> --modele=<prénom>             # rapport, n'écrit rien
pnpm --filter @glagency/ingestion script-mypuls <lien page Notion> --modele=<prénom> --envoyer   # crée le script
```

1. **Lire** la page Notion (API officielle, `NOTION_TOKEN`) en Markdown, sous-pages média comprises.
2. **Convertir** en `ScriptDraft` (§ 4) avec Claude — même fournisseur et même clé que la Formation (`ANTHROPIC_API_KEY`), modèle Claude Opus 5.5 (`claude-opus-5-5`), sortie forcée au schéma JSON, repli serveur sur refus (`fallbacks: "default"`). L'IA absorbe les écarts de format (KYC, V2, V3) ; elle ne touche jamais MyPuls.
3. **Vérifier** le brouillon (règles § 2, fonction pure) et l'enregistrer dans `apps/ingestion/raw/scripts/<date>/<modele>-<slug>.json` (gitignoré).
4. **Afficher le rapport** : messages, embranchements, PPV, total des prix, médias rattachés / à rattacher, erreurs bloquantes.
5. Avec `--envoyer` et zéro erreur : `login` (session propre, jamais celle du Worker) → `switchCreator` → créer le script → le **désactiver** → messages et embranchements dans l'ordre → ordre final. Affiche le lien du Studio.

`--modele` se résout via `creators.mypuls_creator_id` (lecture Supabase) ; un prénom ambigu ou inconnu arrête la commande.

## 4. Le brouillon `ScriptDraft`

```ts
type ScriptDraft = {
  name: string                  // titre Notion (emoji compris)
  description: string           // « Description pour l'outil des chatteurs » / règles du jeu
  isSequence: boolean
  items: Array<DraftMessage | DraftBranch>
}
type DraftMessage = {
  type: 'message'
  title: string                 // « #12 🟢 — Bonne réponse → ENVOYER LE PPV 2 » ; consignes « (…) » ici
  content: string               // texte envoyé au fan, jamais de consigne
  price: number                 // 0 = gratuit
  media: DraftMedia[]           // § 5
  chainDelays: number[]         // secondes, bulles « à la suite » / « ⏱️ +10 s »
}
type DraftBranch = {
  type: 'branch'
  label: string                 // la situation (« Il est libre ? »)
  paths: Array<{ label: string; color: 'red' | 'green' | 'orange' | 'blue' | 'yellow' | 'purple' | 'grey'; messages: DraftMessage[] }>
}
```

Correspondances : `#N 🔴` / `#N 🟢` → un embranchement, chemins `red` / `green` ; alternatives KYC `#6/#7/#8` → un embranchement à 3 chemins ; « ⏩ À la suite » et `⏱️ +10 s` → `chainDelays` du premier message de l'étape ; **bulle recopiée à l'identique, consignes entre parenthèses comprises** — c'est ainsi que les scripts sont saisis à la main aujourd'hui (export CSV : « perso j'suis ( ville proche du sub) jsp si tu connais ? »), le chatteur complète avant d'envoyer. Les règles exactes du prompt de conversion vivent dans le code, avec ses tests.

## 5. Médias — décision D1, à trancher en tête de PR 1

Le Studio attend des **ids MYM** ; Notion pointe vers des pages média. Avant de coder les médias, lire une page média d'un dossier de modèle (dossier à partager avec l'intégration Notion) :

- **(a) la page porte l'id MYM ou un lien MyPuls** → rattachement direct ;
- **(b) elle porte le fichier** → chercher comment MyPuls importe un média dans la bibliothèque d'une modèle ; sans moyen fiable, repli (c) ;
- **(c) repli** : le message est créé avec le titre `🖼️ À RATTACHER : <description> · 🔒 <prix> €`, sans média et à 0 € ; le manager rattache média et prix dans le Studio. Le rapport compte ces messages.

## 6. Garde-fous

- Par défaut, **rapport seul** ; l'écriture exige `--envoyer`.
- Brouillon vérifié en entier **avant** la première écriture ; une erreur = rien n'est créé.
- Le script est créé **désactivé** ; seul un humain l'active, dans le Studio.
- Création uniquement : aucune requête de modification ou de suppression d'un script existant.
- Échec en cours d'envoi : le script reste désactivé, renommé `⚠️ INCOMPLET — <nom>` ; la commande affiche l'étape en échec. Pas de reprise automatique.
- 429 MyPuls : attentes de 30 s puis 60 s (même règle que `identity-backfill`).
- Session MyPuls propre à la commande (`login`), jamais le cookie d'ingestion du Worker.

## 7. Tests et recette

- **Vitest, pur** (`packages/core`) : vérification des règles (chaque règle de § 2 a son cas), résumé du rapport, conversion `ScriptDraft` → requêtes MyPuls (ordre, chemins, délais).
- **Adaptateur d'écriture** (`packages/mypuls`) : corps des requêtes contre des réponses enregistrées.
- **Conversion IA** : fixtures Markdown réelles (KYC Lucie, V3) → brouillon attendu sur les points structurants (nombre de messages, embranchements, prix).
- **Recette réelle** : un script de test envoyé sur une modèle, relu dans le Studio (textes, chemins, délais, prix, médias), puis supprimé à la main par Benoit.

## 8. Découpage

| PR | Contenu |
|---|---|
| 1 | D1 tranchée ; `packages/core` : `ScriptDraft`, vérification, résumé ; `packages/mypuls` : `createScript`, `addMessage`, `addBranch`, `setLayout`, `toggleScript` ; recette d'écriture sur un brouillon écrit à la main |
| 2 | `apps/ingestion/src/script-mypuls.ts` : lecture Notion, conversion Claude, rapport, `--envoyer` ; doc (`ARCHITECTURE.md`, `docs/CARTE.md`, `CHANGELOG.md`) ; recette sur un vrai script V3 |

## 9. Ce qu'il faut de Benoit

- Une **intégration interne Notion** dans l'espace de l'agence (`NOTION_TOKEN` dans `.env`), partagée sur OUTILS MANAGERS et les dossiers des modèles.
- Le dossier d'une modèle partagé avec le connecteur Notion de Claude, pour trancher D1.
- Une modèle et un moment pour la recette réelle.

## 10. Coût

Conversion par Claude Opus 5.5 (4 $ / 20 $ le million) : ~10 k tokens en entrée, ~10 k en sortie pour un script de ~90 messages, soit ~0,25 $ par script — estimation, non mesurée ; la recette relève le vrai chiffre (`usage` de la réponse).

## 11. Risques

- **Adresses internes MyPuls** : pas d'API publique ; un changement du Studio casse l'envoi. La vérification « avant écriture » et le script désactivé limitent les dégâts à un script incomplet, jamais visible des chatteurs.
- **Conversion IA** : un message mal découpé ou une consigne dans le texte. Le rapport, le titre des messages et la relecture dans le Studio avant activation sont les filets.
- **Négociation** : format « bibliothèque de messages », pas un déroulé ; couvert par la même commande seulement si sa conversion tient en recette, sinon sorti du périmètre.
