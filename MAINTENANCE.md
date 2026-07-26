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
- [x] **Pouvoir renommer son familier** — implémenté en v2.5.3 (2026-07-25). Bouton ✏️ à côté du nom dans la carte familier du dashboard ; `pState.petNickname[petId]` stocké dans gameState, affiché à la place du nom catalogue dans le dashboard et dans la popup Mon Perso.

---

## Mini-check bugs du 2026-07-25 (soir/nuit) — nouvelle ÉTAPE 0.5 de la routine

Gen a demandé que la routine fasse ce mini-check à CHAQUE passage (pas seulement en mode maintenance) — voir SKILL.md. Lecture `GET /api/famille` (lecture seule), comparaison de `config.bugs`/`config.feed` (type `chat`) avec ce qui est déjà documenté ici et dans `PROJET-ETAT.md`.

### 🐛 Bugs passés en revue (5 dans `config.bugs`)
- **`bug_74klxs1`** (24 juillet 23:51) « jai cree une tache est elle est nule part, et pipi main dent est disparu de la liste » — ✅ déjà corrigé, c'est le rapport qui a déclenché le correctif v2.5.11 (fusion avant écriture locale dans `remotePush`).
- **`bug_hf01ozi`** (25 juillet 12:59 EDT) « quêtes disparues / ajout de quête, ça dit que c'est ajouté, mais ça apparaît pas » — ✅ même bug, c'est littéralement le rapport cité dans l'entrée PROJET-ETAT.md v2.5.11 (« un rapport d'Antoine Emery à 12:59 »), corrigé par le même fix.
- **`bug_h8r93zu`** (25 juillet 12:13 EDT) « le coffre se recharge trop vite parfois » — ✅ déjà corrigé en v2.5.9 (correctif `mergeGS`, changelog in-app : « les coffres ne se rechargent plus aussi vite »).
- **`bug_k1gqpz6`** (17 juin, ancien) « Je peut pas ajouter d'autre tâche » — déjà suivi 2 fois (21 et 25 juillet ci-dessus), toujours sans cause de code confirmée, hypothèses inchangées. Pas de nouvelle piste trouvée cette passe non plus.
- **`bug_lyr5812`** (25 juillet 08:34 EDT) « familier peut jouer à l'infini après petit temps d'attente » — 🆕 **nouveau, pas encore documenté.** Diagnostic (`handlePlayPet`/`currentEnergy`, `App.jsx` ~68-93, ~6012) : jouer coûte 20 énergie (`PLAY_ENERGY`), l'énergie se régénère en continu (`ENERGY_REGEN_PER_MIN`, pleine en 3h) — **aucun plafond quotidien codé sur "jouer"**, contrairement à "nourrir" qui a un vrai gate `lastFedDay===today` (1×/jour). Donc un enfant PEUT effectivement rejouer dès que l'énergie regagne 20 points (~36 min), plusieurs fois par jour — ce n'est pas un bug de code, c'est le comportement voulu du système d'énergie tel que conçu (commentaire existant `App.jsx` ~73-78 explique délibérément pourquoi certaines activités sont gatées par l'énergie et d'autres non). **Non corrigé** : ambigu si Gen veut un plafond quotidien additionnel sur "jouer" (comme "nourrir") ou si le rythme actuel (limité par l'énergie, pas par jour) est voulu — décision de balance produit, pas une cause de bug à deviner. À trancher avec Gen si elle confirme que c'est un problème plutôt qu'un choix de design.

### 💬 Fil de famille (type `chat`, 3 messages)
- « Il y a un bug! Ma quête de la journée de participer plus aux activités se reset à l'infini » (25 juillet 10:45 EDT) — ✅ déjà corrigé, c'est le rapport qui a déclenché le fix v2.5.16 (fusion explicite + union des checkins sur `weeklyChallenge`).
- « on pourrait mettre un truc qui fait qu'on peux renommer notre familier » (17 juillet) — ✅ déjà implémenté (v2.5.3), déjà coché ci-dessus.
- « LETS GOOOOOO » (12 juillet) — pas une suggestion/bug, aucune action.

### `config.errorLogs` — vide, rien à investiguer cette passe.
