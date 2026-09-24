# Coût Vercel — le prefetch de fond — glagencyapp

## Reconnaître le débordement

**Le compte qui déborde est Vercel, pas Supabase.** Signature d'une capture de facture : 20 $ de siège Pro + on-demand en « Upcoming Invoice », cycle du **17 au 17** (passage Pro le 2026-07-17), « Included Credit 20 $ », « On-Demand Budget … / 50 $ » avec **« Pause Projects: On »** → la prod se coupe toute seule au plafond. Cycle 17/08 → 17/09 : 37,80 $ d'on-demand.

## Diagnostiquer — la seule méthode qui marche

Le MCP Vercel **n'expose aucune ventilation de facture**, et lire le token du CLI est bloqué par le sandbox. Passer par `get_runtime_logs` :

- `group_by: source` (middleware / cache / function / rewrite / redirect), `group_by: route`, `group_by: statusCode` ;
- sur des **fenêtres de 24 h** (`since` / `until` en ISO — au-delà, ça expire). Une fenêtre par jour permet de dater un décrochage à la journée.

La ventilation par ligne de facture (Edge Requests, Fluid CPU, ISR) reste invisible : il faut l'onglet **Usage** du dashboard, à faire coller par Benoît.

## L'incident d'août-septembre 2026

9 320 requêtes/jour le 26/08 → **177 764 le 31/08**, plateau vers 180 k ensuite — ×19, calé sur les Releases 2.15 → 2.19, l'ouverture de la Formation aux chatters. Le 17/09 : 179 322 requêtes dont 119 303 en 304 et 177 505 en cache HIT, pour **4 687 vraies exécutions de fonction**. Donc pas du calcul : du **volume de requêtes**, chacune réveillant `proxy.ts`, qui tourne sur tout, prefetch compris.

**Cause** : des `<Link>` nus. Next préchargeait chaque cible à son entrée dans le viewport, puis la rejouait à l'expiration de la fraîcheur (~300 s) tant qu'un onglet restait ouvert. `/formation/modules/[code]` faisait à elle seule 123 626 requêtes/jour.

**Correctif — Release 2.56** (2026-09-17, commit `83d4288`) : `components/hover-prefetch-link.tsx` — `prefetch={false}` + `prefetchFull` au survol et au focus, le patron que la sidebar faisait déjà tourner. Branché sur `module-card.tsx`, `ModulesTemplate.tsx`, `session-header.tsx`, `cases-list.tsx`. Laissé de côté : `me-next.tsx` (~4,8 k/jour, liens en `<Button asChild>`). **Prix assumé** : sur tactile, un tap sans survol repart au serveur.

## Restent ouverts

1. **Mesurer l'effet** : `get_runtime_logs group_by: source` sur 24 h à partir du 18/09. Estimation annoncée : −60 à −75 % (vers 40-60 k/jour). C'est le seul vrai verdict.
2. **Le sweep de la sidebar n'a pas été touché** (`app-sidebar.tsx`, cycle de 250 s en boucle sur chaque onglet ouvert) — deuxième gisement si le compte reste haut. C'est un choix de perf assumé : y toucher demande l'accord de Benoît.
3. Vercel **Web Analytics n'est pas activé** sur le projet (`get_web_analytics` → 404) alors que `<Analytics />` et `<SpeedInsights />` sont montés dans `layout.tsx` : aucun coût d'événements de ce côté.
