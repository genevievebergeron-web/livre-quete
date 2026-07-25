# Maintenance — Livre de Quêtes

Ce fichier trace les passages de vérification (bugs signalés + suggestions des enfants) sur les vraies données de production, lues via `GET https://livre-de-quetes.app.canner.ca/api/famille?id=livre-quetes-bergeron-2026` (lecture seule — jamais d'écriture directe en prod).

---

## Passage du 2026-07-21

### 🐛 Bugs traités
- **[investigué, pas de correctif évident]** « Je peut pas ajouter dotre tache » — signalé par un des enfants (« je suis le gote »).
  - **Diagnostic** : relu les 3 chemins d'ajout de tâche côté enfant (`handleChildAddTask` App.jsx:7510, `handleChildPickTask` App.jsx:7538, `handleChildAddRoutineTask` App.jsx:7551) et le sélecteur de tâches pour un rituel (routine builder, App.jsx:4283-4302) — **aucun plafond ou blocage codé** trouvé dans aucun des 3 chemins. Le bouton « ➕ Créer ma propre tâche » (repli, App.jsx:4299-4302) est toujours disponible même si la liste de tâches existantes est vide.
  - **Hypothèses restantes** (non confirmées) : (a) un pépin ponctuel de sync/réseau au moment du clic plutôt qu'un bug de code déterministe; (b) un problème d'affichage propre à l'appareil de cet enfant (bouton hors-écran, superposition) que je ne peux pas reproduire sans plus de détails; (c) une confusion sur CE qu'il essayait d'ajouter (une tâche à un rituel précis vs. à sa journée).
  - **Pour avancer** : si ça se reproduit, la meilleure piste est de demander à l'enfant (ou observer) *quel bouton précis* il touche et *ce qui se passe* (rien? un message d'erreur? l'app se fige?) — je n'ai pas voulu deviner un correctif sur une cause non confirmée.

### 💡 Suggestions à approuver
- [x] **Pouvoir renommer son familier** — proposé dans le fil de chat familial (message : « on pourrait mettre un truc qui fait qu'on peux renommer notre familier stppp »).
  - **Piste d'implémentation** : les familiers ont déjà un nom fixe défini par catalogue (`allShopItemsFlat`/`SHOP_ITEMS`, ex. `eqPet.name`). Ajouterait un champ éditable par familier équipé, ex. `pState.petNickname` (par `petId`), affiché à la place du nom catalogue partout où `eqPet.name` est actuellement utilisé (fiche perso, carte familier). Petit changement, pas de risque architectural identifié à première vue.
  - *(Gen : coche cette case et redemande-moi de l'implémenter dans une prochaine session/passe pour que ce soit fait.)*

### 📋 Logs techniques notés
- Aucun — `config.errorLogs` n'existait pas encore avant ce passage (voir PROJET-ETAT.md, chantier de logs techniques en cours de construction).

---

## Passage du 2026-07-25

### 🌐 Lecture de l'API de production
- **Inaccessible cette passe** — le proxy réseau de l'environnement distant Claude bloque les connexions sortantes vers `livre-de-quetes.app.canner.ca` (HTTP 403 au niveau du tunnel CONNECT). Aucune donnée live (errorLogs, état des joueurs, fil de famille) consultable.
- **Impact** : les `config.errorLogs` éventuellement accumulés depuis le 21 juillet ne sont pas visibles ici. À lire manuellement dans le portail parent (onglet Journal) si un souci est suspecté.

### 🔨 Build de production
- `npm run build` → **propre**, 53 modules (inchangé depuis v2.4.1), mêmes 2 warnings préexistants bénins (clés dupliquées `badges`/`boughtRewards`/`pending` dans l'objet de merge — documentés et sans conséquence depuis v1.104.0).

### 🔍 Relecture du code (v2.1.0 → v2.4.1, depuis le dernier passage)

**Correctifs récents confirmés sains :**
- `resolveFamilySpaceOverlaps` (v2.4.1, App.jsx:2528) — deux passes gauche→droite/droite→gauche, bornes [8,92] respectées. Aucun chemin où des positions pourraient sortir de ces bornes.
- `PetSprite` dans `PlayerDashboard` (v2.4.1, App.jsx:1601) — patron `petSpriteKey(eqPet.id) ? <PetSprite .../> : <emoji>` correct, `_evo`/`_leg` bien calculés à partir du `pState` du joueur courant.
- `isCustodyWeek` / `custodyWeekKey` (recurring.js) — logique correcte. Semaine de garde **actuellement active** (ancre 2026-07-24, `weeksSince=0`, `0%2===0`). Les quêtes rotatives devraient être générées pour la clé `2026-07-24`.
- Système `coinOffers` (ajout silencieux dans le code, pas de version dédiée documentée) — lecture/écriture/merge propres, pas de chemin de double-dépense évident.

**Observation mineure — `FamilySpace`, closure stale (non prioritaire) :**
- Le `useEffect` de flânerie (App.jsx:2552) a `[players.length]` comme dépendance mais capture `players` et `playerIds` dans la closure de `setInterval`. Si la composition de la famille changeait (ajout/retrait d'un joueur pendant la session), l'intervalle continuerait de lire l'ancien tableau jusqu'au prochain changement de `players.length`.
- **En pratique inoffensif** : les IDs de joueurs ne changent jamais après le setup initial, et `players.length` est la seule vraie condition de re-montage pertinente. Noté ici au cas où un bug de flânerie serait signalé à l'avenir.

### 🐛 Bug du passage précédent — suivi
- **« Je peut pas ajouter dotre tache »** : aucun changement apporté aux 3 handlers depuis le 21 juillet (`handleChildAddTask` App.jsx:5293, `handleChildPickTask` App.jsx:5321, `handleChildAddRoutineTask` App.jsx:5334). Les hypothèses documentées (pépin réseau ponctuel, problème d'affichage sur l'appareil, confusion de l'enfant sur quel bouton toucher) restent valides. Si ça se reproduit, la meilleure piste reste de demander à l'enfant *quel bouton précis* et *ce qui se passe*.

### 💡 Suggestions en attente
- [x] **Pouvoir renommer son familier** — implémenté en v2.4.2 (2026-07-25). Bouton ✏️ à côté du nom dans la carte familier du dashboard ; `pState.petNickname[petId]` stocké dans gameState, affiché à la place du nom catalogue dans le dashboard et dans la popup Mon Perso.
