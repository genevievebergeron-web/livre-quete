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
- **`bug_k1gqpz6`** (17 juin, ancien) « Je peut pas ajouter d'autre tâche » — déjà suivi 3 fois maintenant (21 et 25 juillet ci-dessus, plus une 4e relecture le 27 juillet à la demande explicite de Gen). Relu `handleChildAddTask`, `handleChildPickTask`, `handleChildAddRoutineTask` (`App.jsx` ~6332-6439) avec un œil neuf : toujours aucun plafond ni blocage codé trouvé dans aucun des 3 chemins. Hypothèses inchangées (pépin réseau ponctuel, affichage propre à l'appareil, ou confusion sur quel bouton précis). Pas de nouvelle piste — n'ayant pas de cause de code confirmée après 4 relectures indépendantes, je ne force pas de correctif spéculatif.
- **`bug_lyr5812`** (25 juillet 08:34 EDT) « familier peut jouer à l'infini après petit temps d'attente » — ✅ **corrigé en v2.12.1 (27 juillet).** Revu avec un œil neuf le 27 juillet (demande explicite de Gen de vérifier/implémenter les correctifs documentés) : le diagnostic initial (aucun plafond quotidien sur "jouer") était incomplet — `gainPet` (`App.jsx` ~55-63) plafonne déjà l'XP du familier à `PET_DAILY_CAP=50`/jour, tous gains combinés (nourrir/jouer/quêtes). La vraie cause : `handlePlayPet` affichait toujours « Ton familier gagne de l'XP 🌟 », **même une fois le plafond atteint** — l'enfant pouvait donc cliquer "Jouer" indéfiniment (l'énergie se régénère en continu) en croyant progresser à chaque fois, alors que 0 XP était réellement accordé passé le plafond. Ce n'était pas une question de balance produit mais une fausse rétroaction, contraire au principe directeur (jamais de récompense simulée). **Fix** : le toast reflète maintenant le gain réel — message honnête « a atteint son max d'XP du jour » quand le plafond est déjà atteint — sans bloquer l'interaction (l'énergie se dépense et l'animation joue quand même, cohérent avec "jouer" comme activité plaisir non gatée par jour, contrairement à "nourrir"). Vérifié par trace d'état directe (localStorage avant/après clic) : `petXp`/`petDay.xp` inchangés au 2e clic une fois `petDay.xp=50`, `gained=false` correctement calculé. `npm run build` propre.

### 💬 Fil de famille (type `chat`, 3 messages)
- « Il y a un bug! Ma quête de la journée de participer plus aux activités se reset à l'infini » (25 juillet 10:45 EDT) — ✅ déjà corrigé, c'est le rapport qui a déclenché le fix v2.5.16 (fusion explicite + union des checkins sur `weeklyChallenge`).
- « on pourrait mettre un truc qui fait qu'on peux renommer notre familier » (17 juillet) — ✅ déjà implémenté (v2.5.3), déjà coché ci-dessus.
- « LETS GOOOOOO » (12 juillet) — pas une suggestion/bug, aucune action.

---

## Tests approfondis du 2026-07-25

File d'implémentation du chantier du 24 juillet vidée à 100% (v2.5.19) — première passe de la section tests approfondis (chasse aux bugs exploratoire demandée par Gen).

### Zones couvertes
- Seed de données de test volontairement extrêmes dans `localStorage` (4 joueurs de test, jamais la prod) : un enfant à 0 pièces/0 XP/aucun familier équipé, un enfant niveau 10 SUPRÊME (xp 3200, 9999 pièces, familier proche du seuil légendaire petXp 2700), un enfant avec assignation orpheline + libellé de tâche très long + emoji inhabituels, un enfant avec calendrier à 22 événements. Boss actif à PV pleins (80/80).
- Onboarding neuf (thème → avatar → pseudo → PIN) testé 2× (joueurs "OrphanTest" et "MaxN") : pseudo vidé puis soumis → géré sans crash (fallback silencieux) ; PIN de confirmation différent du premier → rejeté correctement (reset visuel rouge, retour à l'étape PIN) ; PIN identique (0000 puis 1234) → accepté, dashboard chargé.
- Dashboard "Aujourd'hui" : confirmé que la quête du jour est bien le premier contenu (réordonnancement v2.5.15 tient en conditions réelles). Double-clic rapide sur "✔ J'AI FAIT ÇA!" → le bouton disparaît immédiatement au 1er clic (élément retiré du DOM avant qu'un 2e clic puisse l'atteindre) : aucune double-soumission possible par ce chemin.
- Vue "Semaine" : accordéon "Tâches planifiées" testé avec un enfant en semaine de garde active — affiche correctement les tâches rotatives auto-générées.
- Écran BOSS + bouton "COMBAT FINAL" : reconfirmé sans restriction d'accès même à PV pleins/0 jeton — c'est le bug boss #2 déjà documenté et volontairement non corrigé (décision de conception à trancher avec Gen), rien de nouveau trouvé ici.
- Portail parent : vérification visuelle de l'alignement 2-colonnes du v2.5.19 (bugs signalés / logs techniques).

### 🐛 Bugs trouvés
Aucun nouveau bug de code confirmé cette passe. Deux observations à noter :
- **Assignation orpheline non testée pour de vrai** : mon seed de test avait omis les drapeaux de migration ponctuelle (`rotativeCleanupV1`, `orphanAssignCleanupV1`, `colorToneDownV1`), ce qui a fait retourner ces migrations une fois "à neuf" et vidé `config.assignments`/`config.customTasks` avant que je puisse observer le rendu de la tâche orpheline. **Ce n'est pas un bug** — ça confirme au contraire que ces migrations ponctuelles fonctionnent exactement comme prévu (idempotentes, drapeau unique). Pour retester ce scénario précis à la prochaine passe : seed `config.rotativeCleanupV1=true` et `config.orphanAssignCleanupV1=true` pour éviter que ces migrations historiques ne s'exécutent à nouveau sur des données de test fraîches.
- **Modale d'évolution de familier (légendaire) non cliquable pendant le test** : en testant le joueur "MaxN" (familier proche du seuil légendaire, petXp 2700), la modale ÉVOLUTION! (choix Feu/Ombre) s'est affichée correctement, mais mes clics sur les boutons n'ont pas réagi. Cause identifiée dans la console : une AUTRE session travaillait en direct sur `App.jsx`/`popups.jsx`/etc. au même moment (rechargements HMR Vite visibles dans les logs), le serveur dev a même perdu puis repris sa connexion pendant le test — confondu avec l'environnement de test partagé, **pas attribuable au code de l'app**. Cette autre session a fini par committer proprement (`v2.5.20`, aucun conflit). **À revérifier dans une prochaine passe, en solo** (pas de collision concurrente) : ouvrir la modale ÉVOLUTION! avec un familier proche d'un seuil d'évolution et confirmer que le choix Feu/Ombre/Légendaire fonctionne bien.

### Non couvert cette passe (pour la prochaine)
Boutique (achats, double-clic rapide sur "Acheter"), popup avatar/familier (header sticky avec 20+ items), onglets du tiroir parent autres que Journal (À valider, Tâches, Défis, Actions, Annonces, Code, Sauvegarde), PIN parent incorrect plusieurs fois de suite, calendrier à 22 événements (pas encore ouvert visuellement), formulaires vides côté parent (ex. ajustement XP/pièces à 0 ou négatif).

---

## Tests approfondis du 2026-07-25 (2e passage, session solo)

### Zones couvertes
- Re-seed avec les drapeaux de migration correctement posés (`rotativeCleanupV1`, `orphanAssignCleanupV1`, `colorToneDownV1`) pour éviter la fausse piste du passage précédent.
- Portail parent, PIN incorrect 8 fois de suite → aucun verrouillage, aucun crash, PIN correct accepté normalement ensuite.
- Onglet "✅ À valider" : affichage correct de "Rien à valider" (mes 2 items de test avaient un id de joueur avec underscore, cassant le parsing du `doneKey` — artefact de mon seed, pas un bug : les vrais ids (`uid()`) ne contiennent jamais de underscore).
- Onglet "📋 Tâches" : soumission du formulaire "Ajouter" sans tâche choisie → correctement bloqué (bouton no-op), aucune assignation fantôme créée.
- Onglet "🔐 Code" : soumission du champ PIN vide, puis à 2 chiffres → les deux rejetés silencieusement, PIN réel inchangé en `localStorage`.

### 🐛 Bug trouvé et corrigé
- **Familier équipé affiché comme "Pas de familier équipé" après un changement de thème** — ✅ **corrigé en v2.5.21**. Cause : la carte familier (`PlayerDashboard`, `App.jsx` ~1813) résout l'item équipé via `allShopItemsFlat`, qui ne contient QUE les items de base + le thème *actuel* du joueur — pas le catalogue complet. Un familier gagné en récompense de victoire de boss (`pickUltraLegendary`, toutes thèmes confondus) ou simplement équipé avant un changement de thème hebdomadaire devenait introuvable dans cette liste réduite, faisant retomber toute la carte (nourrir/jouer/XP/évolution) sur le message "Pas de familier équipé" — alors que `owned[]`/`equipped.pet` étaient parfaitement valides. Aucune perte de données, bug purement visuel/fonctionnel (le familier redevenait invisible et non-nourrissable). Fix : fallback sur `shopItemById` (catalogue complet, déjà importé de `themes.js`) quand l'item n'est pas trouvé dans le sous-ensemble scopé au thème. Vérifié en Chrome : la carte affiche maintenant "Licorne bonus — Niv.12, Légendaire" avec les boutons Nourrir/Jouer fonctionnels. `npm run build` propre.

### Non couvert cette passe (pour la prochaine)
Boutique (achats, double-clic), popup avatar/familier (header sticky), onglets Défis/Annonces/Sauvegarde du tiroir parent, calendrier à 22 événements (vue "MON CALENDRIER" pas encore ouverte visuellement), la modale ÉVOLUTION! Feu/Ombre/Légendaire (cliquer un choix pour de vrai, en solo cette fois), ajustement XP/pièces à 0 ou négatif dans l'onglet Actions.

---

## Tests approfondis du 2026-07-25 (3e passage)

Mini-check bugs (lecture `GET /api/famille`) fait en premier — aucun nouveau bug/signalement depuis le passage précédent (mêmes 5 `config.bugs` et 3 messages `feed` déjà documentés, tous déjà traités ou déjà notés comme décision de conception).

### Zones couvertes (celles explicitement laissées non-couvertes par les 2 passages précédents)
- **Modale ÉVOLUTION! Feu/Ombre/Légendaire, en solo** — familier seedé juste au-dessus du seuil niveau 4, `petEvo` vide. Modale affichée correctement, choix tier 1 (Feu) cliqué → toast "Ton familier a évolué!", persisté dans `petEvo`. **Découverte en cours de route** : mon seed avait omis le drapeau `petMigV2` (migration one-shot ancienne-courbe→nouvelle-courbe), ce qui a fait remonter le petXp de test de 260 à 1160 (plancher du niveau 8) — pas un bug, la migration a fonctionné exactement comme prévu sur des données qui ressemblaient à de l'« ancien format ». Ça a eu l'avantage de tester aussi le tier 2 (Glace/Foudre) dans la foulée : choix cliqué, modale fermée proprement, sprite recoloré confirmé visuellement, zéro erreur console. **Les deux tiers d'évolution fonctionnent correctement de bout en bout.**
- **Boutique — achats et double-clic rapide sur "Acheter"** — voir bug trouvé et corrigé ci-dessous.

### 🐛 Bug trouvé et corrigé
- **Récompense refusée reste coincée dans `owned[]`** — ✅ **corrigé en v2.5.23**. En testant un double-clic rapide sur "Acheter" (récompense boutique), le 1er clic achète correctement (coins déduits, `boughtRewards`+id) et le bouton devient "↩️ J'ai changé d'idée" au même endroit — le 2e clic du double-clic atterrit dessus et annule l'achat (coins remboursés, `boughtRewards`-id). Root cause : `handleUnclaimReward` (`App.jsx` ~5955) ne retirait jamais l'id de `owned[]`, seulement de `boughtRewards` — l'id restait coincé pour toujours dans l'inventaire "possédé" même après remboursement complet. **Impact réel nul pour les enfants** (vérifié par grep exhaustif : `owned[]` n'est lu nulle part pour l'affichage ou la logique des récompenses — seul `boughtRewards` compte pour ça — ni par aucun badge) mais corrigé proprement puisque la cause était claire et le correctif petit et sûr. Vérifié en build de production (`vite preview`, hors StrictMode) : après achat+refus, `owned` redevient bien `[]`. `npm run build` propre, zéro erreur console.

### 🔍 Fausse piste écartée (documentée pour ne pas la re-creuser)
En testant l'achat sur le serveur de DEV (`vite dev`, avec React StrictMode), un achat semblait ne PAS mettre à jour `boughtRewards` (restait vide) malgré `owned[]` et `coins` corrects. Reproduit deux fois, puis testé sur le **build de production** (`vite preview`, sans StrictMode) où l'achat fonctionne correctement du premier coup. Cause confirmée : `handleBuy` appelle des effets de bord (`persist()`, `SFX.buy()`, `showToast()`, `spawnParticles()`) **à l'intérieur** de l'updater `setGameStates(gs=>{...})`, ce que React StrictMode invoque deux fois exprès en développement pour détecter les impuretés — comportement dev-only, invisible en production. **Pas un bug pour les enfants** (ils n'utilisent jamais le mode dev), mais une fragilité de code à garder en tête : un futur refactor qui déplacerait ces effets de bord hors de l'updater serait plus robuste, sans urgence.

### ⚠️ Collision concurrente rencontrée et gérée
Une autre session travaillait en direct sur `App.jsx` pendant ce passage (HMR visible dans les logs dev, `v2.5.22`→commit `8ca75e7` poussé pendant que ce passage était en cours). Suivi le protocole habituel : lecture fraîche du fichier avant chaque edit, `npm run build` sur l'état réel du disque avant de committer — aucune collision réelle, le commit de l'autre session et celui de ce passage se sont enchaînés proprement sur `main`.

### Non couvert cette passe (pour la prochaine)
Popup avatar/familier (header sticky avec 20+ items), onglets Défis/Annonces/Sauvegarde du tiroir parent, calendrier à 22 événements (vue "MON CALENDRIER" pas encore ouverte visuellement), ajustement XP/pièces à 0 ou négatif dans l'onglet Actions, achats de Chapeaux/Armures/Familiers (seule la Boutique onglet Récompenses a été testée cette passe), les 3 coffres (Commun/Rare/Légendaire).

### `config.errorLogs` — vide, rien à investiguer cette passe.
