# Agence : type et modèle des événements (partie B) — plan d'implémentation

> Exécuté en Native dans la foulée (Benoit, 2026-10-02 : « fais tout ce que j'ai demandé »).
> Ruling : plan resserré (tâches, interfaces et tests listés ; le code est écrit pendant
> l'exécution, en TDD) plutôt que le code intégral dans le plan — coût si faux : moins de détail
> pour une reprise par un autre agent.

**Goal :** dans Agence, un événement porte un **type** libre et une **modèle**. Le nom se compose
tout seul (« CAROUSEL ALICE »), et l'**avatar rond** de la modèle s'affiche à côté du nom.

**Spec :** `docs/superpowers/specs/2026-10-02-photos-modeles-agence-design.md` (partie B).
**Prérequis :** partie A (`0180`, `creators.avatar_path`, bucket `creator-avatars`) — appliquée
sur l'UAT le 2026-10-02.

## Global Constraints

- Migration **`0181`** (suite de `0180`). `0182` (suppression de la to-do) reste dans `pending/`.
- Écriture admin en service-role après garde (inchangé) ; lecture pour tous (RLS inchangée).
- Avatars : URLs signées du bucket privé `creator-avatars`, générées **uniquement** pour les
  modèles des événements que la RLS rend à l'appelant (même règle que les photos d'événement).
- Type : texte libre, 40 caractères au plus, facultatif. Modèle : facultative.
- Nom : composé tant qu'il n'a pas été modifié à la main ; il reste modifiable et obligatoire.
- La grande photo importée garde sa place ; l'avatar ne la remplace pas.
- Aucun commit sans accord ; pas de prod sans go prod explicite.

## Review Focus

1. Événement sans modèle (réunion) : aucun avatar, nom libre, rien de cassé.
2. Modèle sans photo (Mathilde : MyPuls n'en a pas) : pas d'avatar, ou une initiale ; jamais d'image cassée.
3. Nom modifié à la main : changer le type ou la modèle ne l'écrase plus.
4. Ancien titre non reconnu par la reprise (« Réunion d'équipe ») : `kind` et `creator_id` restent vides.
5. Utilisateur non admin : voit l'avatar des événements qui le visent, jamais la liste des modèles.

## Tâches

1. **Migration `0181_agence_type_modele.sql`** : `agency_events.kind text check (1..40)`,
   `agency_events.creator_id uuid → creators on delete set null` + index ; reprise des titres
   « TYPE MODÈLE » (dernier mot = nom exact d'une modèle, sans casse, titre à plusieurs mots).
   Types écrits à la main (`agency_events` : `kind`, `creator_id`, relation).
2. **Schéma** (`features/agency/schema.ts`, tests dans `schema.test.ts`) : `eventInput` +
   `kind` (`string | null`, vide → `null`, 40 max) et `creatorId` (`uuid | null`) ; `eventRow`
   écrit `kind` et `creator_id` ; `composeEventTitle(kind, modelName)` (majuscules, espaces
   normalisés, `''` si l'un manque).
3. **Données** : `AgencyEvent` + `kind`, `creatorId`, `creatorName`, `creatorAvatarUrl` ;
   `getAgencyEvents` lit `kind, creator_id`, puis nom et avatar des modèles concernées en
   service-role, et signe les avatars ; `getAgencyModels()` (admin) → modèles actives `{ id, name }`.
4. **Écran** : la fenêtre d'événement reçoit `models` (Type + Modèle au-dessus du Nom, nom
   composé) ; `ModelAvatar` (rond, initiale si pas de photo) dans la carte, la barre du
   calendrier et la fiche ; `models` passé par la page → `AgencyTemplate` → grille, barres, cartes.
5. **Docs et contrôles** : CARTE (tables et bucket), ARCHITECTURE § Agence, CHANGELOG, AGENTS
   (UAT = 0181) ; tests, types, lint, build, carte ; `0181` sur l'UAT.
