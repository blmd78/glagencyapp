# Import de scripts intelligent — toutes les formes de page (2026-10-12)

> Suite de `2026-10-07-import-scripts-crm-design.md`. Demande de Benoit : « tout gérer, les différents
> types, comme un import intelligent » — un script doit arriver pareil dans MyPuls quelle que soit sa
> forme dans Notion.

## Constat (inventaire d'OUTILS MANAGERS, Espace de Lagouge, 2026-10-12)

- **Script de vente · Emma** n'est qu'une page de référence : le script est dans un PDF joint (17 pages)
  et derrière une mention de page (introuvable aujourd'hui). La lecture actuelle (texte de la page
  seule, `notion.ts`) n'en voit rien.
- **Script découverte (KYC) · Lucie** : script complet dans la page, plus le même en PDF.
- Le prompt de vente **V3** produit un format à badges (`💬 / 🎙️ / 🖼️`, `🔒 prix`, `⏱️`, `🔗 n`) que la
  conversion ne connaît pas ; les vocaux s'y écrivent « Texte que le vocal doit dire : « … » » + ton +
  durée ; les messages à écrire par le manager « ✏️ À COMPLÉTER : … ».
- Le Studio a un **Brief IA** (pour Aurel) que l'import envoie vide ; le tableau « Message automatique »
  n'a pas d'équivalent dans le Studio (Auto-DM, autre page).

## Ce qui change

1. **Sources** (`packages/scripts/src/sources.ts`) — tout ce que la page contient, sur UN niveau :
   texte de la page ; **PDF** déposés dans Notion (téléchargés, envoyés tels quels à Claude) ;
   **pages liées, sous-pages et mentions « @page »** (lues, étiquetées « === Page liée « … » === ») ;
   **Google Docs / Drive publics** (export texte / PDF, adresses construites par nous à partir de l'id :
   aucun autre site appelé). Non lus et dits : images, vidéos, bases, autres sites, pages non partagées,
   pages « Prompt … » (consignes, pas des scripts). Plafonds : 10 pages, 5 PDF, 20 Mo de PDF en tout (32 Mo par requête à Claude, base64 compris),
   150 000 caractères de texte, 60 s par téléchargement. Ce que citent les pages liées : leurs PDF et Google Docs sont lus, le reste
   est rapporté, regroupé par sorte.
2. **Garde-fou de « Préparer »** : une page qui n'a qu'un PDF passe (on ne peut pas juger un PDF sans le
   lire) ; sinon la règle actuelle sur le texte rassemblé.
3. **Conversion** (`convert.ts`) : PDF en blocs `document`, consignes pour les sources multiples (un seul
   exemplaire du script, la version la plus complète), le format V3, les vocaux (média « VOCAL n » à
   rattacher, jamais le texte à dire dans la bulle), les ✏️ (jamais un texte de bulle : listés ; le média du bloc reste), une page liée qui est un autre script (lue, jamais fusionnée), les messages
   automatiques (en tête du script ET listés avec leur déclenchement), le **Brief IA** (seul texte que
   Claude rédige : format du Studio, sans prix ni heure).
4. **Brouillon** (`@glagency/core`) : champs facultatifs `aiBrief`, `voiceNotes`, `toComplete`,
   `autoMessages` (un brouillon d'avant se relit toujours). Vérification en plus : aucun message ne
   contient « À COMPLÉTER » ni « Texte que le vocal doit dire ». Brief IA borné à 2 000 caractères
   (borne à nous : le Studio n'en affiche pas), coupé avec un ajustement noté. `ai_brief` envoyé.
5. **Stockage** (migration `0191`) : `script_imports.sources` (lu / non lu, figé), `source_text` (texte
   rassemblé, figé — pour relire et rejouer), `media_result` (bilan des médias à l'envoi).
6. **Écran** : le rapport affiche les sources, les vocaux à enregistrer, les messages à compléter, les
   déclenchements à régler dans l'Auto-DM, le Brief IA, et après l'envoi le bilan des médias.
7. **Liste** : une page dont le titre contient « prompt » n'est jamais reconnue comme script.

## Suite du 2026-10-12 — « pas de reste à faire » (Benoit)

- Vocal sans audio dans MyM à l'envoi : à l'écrit avec son texte (`writeMissingVoices`), titre « (pas encore fait
  donc à l'écrit en attendant) » — la règle du prompt V3.
- « ✏️ À COMPLÉTER » : Claude écrit le message (voix de la modèle, suggestif, depuis la seule description du
  média — il ne voit pas le média), titre « · ✍️ écrit par l'IA ».
- Reste à décider : régler aussi les messages automatiques dans l'Auto-DM de MyPuls (page jamais relevée,
  agit en direct sur chaque nouvel abonné).

## Hors périmètre (décidé)

- **Images** : jamais envoyées à Claude (photos des médias PPV : coût, contenu explicite, rien pour le
  texte du script). Un script en capture d'écran reste à recopier.
- Canva, Dropbox, sites quelconques, Google privé : listés « non lus », à coller ou ouvrir.
- La commande locale `script-mypuls` garde la lecture de la page seule.
