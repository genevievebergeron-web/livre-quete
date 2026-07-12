# Livre de Quêtes — État du projet
_Mis à jour: 2026-07-12 — v1.79.1_

> **v1.79.0/1.79.1 (12 juillet, commits 5fd3a5d+87da09b+0c3f68d, poussés)** — **FIX bug boss « jamais vaincu »** (demandé par Gen, cause root-causée) : la victoire n'était calculée QUE dans `handleBossAttack`/`handleBossPetAttack` (au clic). Si les dégâts cumulés dépassaient déjà les PV (dégâts arrivés via synchro d'un autre appareil après le dernier clic, ou tous les jetons familiaux dépensés avant de franchir le seuil), plus personne ne pouvait re-déclencher le calcul → boss bloqué pour toujours (vécu avec l'Hydre à deux têtes du 1er juillet, jamais vaincue malgré ~106 dégâts cumulés pour 40 PV). FIX : `useEffect` (App.jsx ~6672, dépend `[gameStates, config?.boss]`) qui réévalue la victoire à CHAQUE changement d'état, pas seulement au clic. v1.79.1 = hotfix crash au démarrage (dep array lisait `config.boss` sans optional chaining → crash car `config` vaut `null` au tout premier rendu; corrigé en `config?.boss`).
> **Nouveaux champs optionnels sur un boss** : `forest:true` (arbres décoratifs 🌲 autour du sprite, onglet BOSS + carte famille) + `atkEmoji:{petite,grosse}` (reskin des boutons d'attaque, ex. ballons ⚽).
> **Boss camping injecté en live (12 juillet, données, pas du code)** : « L'Embraseur de Kabania » 🔥 (hpMax 30, couleurs braise/orange, forest:true, atkEmoji ⚽) + 15 tâches `cust_camp_*` (cat `outdoor`) assignées aux 4 enfants = checklist de préparation du sac pour le camping à Kabania (3 nuits) : hygiène, vêtements, souliers, pluie/chandail chaud, bain, dodo (oreiller/sac de couchage), gourde, sac à dos (jeu de société + carnet/crayon), déjeuner varié avant le match de soccer d'Olivier, collations, rangement au coin identifié, transport à l'auto (avec Carl), + tâche bonus (aider à porter le reste). Le boss précédent (Hydre du 1er juillet, jamais vaincue) a été clos administrativement (`defeatedAt` posé, sans récompense auto) le 11 juillet avant l'injection de ce nouveau boss — voir aussi remise à zéro des routines actives / mode « week » pour les 4 enfants le même jour.

> **AUDIT 16 juin** (fonctionnalité + balance + fun/motivation) : `Documents/Claude/Projects/Livre de quêtes (1)/audit-fonctionnalite-balance.md`. Bugs root-causés (B1 mini-jeu de niveau jamais lancé en session active = `consumeCelebrations` au login seulement; B2 pseudo/thème qui revient = `_mergePlayer` base-gagne; B3 frein énergie ne bloque que coffres+jouer-familier; B4 timer rituel sans accès aux tâches; B5 fin de rituel sans célébration; B6 enfant ne peut pas supprimer une tâche; B7 ménage tâches + grille colonnes côté parent).
> **v1.66.0 (16 juin) — FAIT :** (1) fix B2 — `_mergePlayer` (client App.jsx ~1698 ET server.cjs ~124) en DERNIÈRE-ÉCRITURE-GAGNE sur `pseudo`/`themeId`/`themeChosenAt` (reçoit `preferIncoming`) → pseudo/thème ne « revient » plus (testé node 6/6). (2) Balance : `PRICE_MULT` 2→3. Validé esbuild (2 warnings préexistants bénins). **RESTE (lots de l'audit) :** B1, B4, B5, frein énergie élargi, déblocage thèmes HEBDO (1 random/semaine au lieu de XP — dépend de B2), suppression tâche enfant→appro parent, ménage parent + colonnes, Phase F pixel art (sprites 8-bit items + équipement sur avatar : perso centré, familier proportionné/visible). `PET_DAILY_CAP` 50→35 possible pour ralentir les familiers.

> **Résumé v1.16 → v1.29** (détails complets dans la constante `CHANGELOG` de `src/App.jsx`) :
> - **v1.16** panneau « Mes réglages » par enfant (son, mode calme/anti-flash, décompte calme, humour, focus une tâche) + `prefers-reduced-motion`.
> - **v1.17** stats « Progrès de la semaine » (XP/jour par membre, calculé depuis les clés `completed` datées → merge-safe) + classement.
> - **v1.18** confidentialité (`sessionPlayer` : un enfant connecté ne voit que son onglet) + design allégé + avatars qui clignent (`AvatarCanvas` blink) + familier dans la fenêtre perso.
> - **v1.19** fil de famille (`config.feed`, ❤️ + chat, merge union par id) + parent assigne un rituel à un enfant.
> - **v1.20** boss de famille (`config.boss`, objectif XP collectif, sprite `BossSprite` pixel, victoire = +15🪙 chacun, lancé par parent).
> - **v1.21** fix « Modifier le livre » (édite la config existante, `editingBook`) + récompenses renouvelées + **rotation hebdo aléatoire** (`weeklyRewards`) + enfant ajoute une quête + **picker emoji** (`CustomTaskModal`/`EMOJI_CHOICES`) + annuler récompense + badges plus durs + boutons Retour haut/bas.
> - **v1.22** badges en **pixel-art** (`BadgeIcon`/`renderBadgeToCtx`, médaillon + symbole).
> - **v1.23** **fix Safari** (rendu avant SW) + récompense « J'ai changé d'idée »/« Cacher » (`hiddenRewards`) + **Routine→Rituel** (libellés).
> - **v1.24** calendrier au portail parent (`handleAddCalendarEvent`, récurrent/daté, `recur`/`upcomingOccurrences`) + onglet **Calendriers** (`view==="calendars"`) + onglet **Minuterie** (`TimerView`, chrono rituel + encouragements + feed/XP, `handleRitualTimerDone`).
> - **v1.25** mini-jeux auto-start (retire le « OK » en trop) + rythme ralenti.
> - **v1.26** **fix Safari déf.** : `VitePWA selfDestroying:true` (le SW se désinscrit et vide le cache bloqué) + `build.target` es2019/safari13.
> - **v1.27** **raretés** des items (`RARITIES`/`rarityOf`, Commun→Unique, bordures/lueurs).
> - **v1.28** **objectifs du jour** (`dailyClaimed`, défis quotidiens à réclamer).
> - **v1.29** **coffres mystères** (`CHESTS`/`pickFromChest`/`ChestSprite`, tirage pondéré par rareté, doublon→pièces).
>
> **RESTE À FAIRE (gros lot art, demandé) :** pixel-art « illustré coloré comme les réfs » pour les **récompenses, items et familiers** (remplacer les emoji), et **nouveaux slots d'avatar** (ailes, armes tenues, souliers, accessoires de tête). À faire avec aperçu visuel pour itérer le look. Infra déjà prête : moteur de sprites canvas (cf. `BossSprite`, `BadgeIcon`, `ChestSprite`, `renderAvatarToCtx`).

---

## Stack & déploiement

- **React 18 + Vite 5 PWA** — single-file `src/App.jsx` (~4400 lignes)
- **Persistance:** `localStorage` (clé `livre-de-quetes-v1`) + **sync cloud** (Postgres Canner via `server.cjs`/`DATABASE_URL`, repli Supabase — voir `SYNC.md`)
  - Multi-appareils = **fusion non-destructive** (`mergeFamily`) : last-write-wins remplacé par une union par joueur où l'XP ne peut que monter. Aucune donnée perdue quand 2 appareils non synchronisés se rejoignent (même `FAMILY_ID`).
- **Deploy:** Push sur `main` → **Canner** (hébergeur canadien style Vercel) déploie automatiquement
  - Pas de build local nécessaire — Canner s'en charge
  - Repo GitHub : `genevievebergeron-web/livre-quete`
- **Dossier canonique (GitHub Desktop) : `~/Downloads/livre-de-quetes/livre-quete/`** ← travailler ICI
  - Le dossier parent `~/Downloads/livre-de-quetes/` est un second clone du même repo — ne pas committer dedans (risque de divergence)
- **Push :** GitHub Desktop (bouton « Push origin ») ou `cd ~/Downloads/livre-de-quetes/livre-quete && git push`

> ⚠️ **Lock files git dans le sandbox** — si erreur de push, supprimer manuellement :
> ```bash
> rm ~/Downloads/livre-de-quetes/.git/HEAD.lock
> rm ~/Downloads/livre-de-quetes/.git/index.lock
> ```

---

## Joueurs

4 garçons : **Elli**, **Antoine E** (Emery), **Antoine DR** (Dumont-Rocheleau), **Olivier DR**

**Couleurs par défaut (SetupWizard):**
- Elli → `#C060D0` (mauve)
- Antoine E → `#4A90D9` (bleu)
- Antoine DR → `#FF6B35` (orange)
- Olivier DR → `#2ECC40` (vert)

**Noms affichés dans le jeu = surnom (pseudo). Vrai nom = panneau parent uniquement.**

---

## Ce qui est fait ✅

### v1.15.0 — Thème hebdomadaire + déblocage par XP (UI) ← DERNIER COMMIT
- **Sélecteur de thème** (`themePicker` dans PlayerDashboard) : bouton « 🎨 Mon thème » → modale listant tous les thèmes non-secrets. Débloqués (starter ou `pState.xp>=xpUnlock`) = sélectionnables; verrouillés = grisés avec « 🔒 X XP ». Affiche le prochain thème à débloquer + XP manquant.
- **Un thème par semaine** : `weekKey(date)` (accepte une date) compare `player.themeChosenAt` à la semaine courante. `canChange = !themeChosenAt || weekKey(themeChosenAt)!==weekKey()`. Sinon « reviens lundi prochain ».
- `onChangeTheme(themeId)` (App) met à jour `config.players[i].themeId` + `themeChosenAt`. Le système de déblocage par XP (`isThemeUnlocked`, `THEME_XP_UNLOCK`) existait déjà — il manquait l'UI. (Résout le #6 « Lock thème hebdomadaire ».)
- Rappel : badges et items de boutique sont déjà spécifiques au thème (BADGES type=themeId; `pt.shopCategory.items`).
- v1.14.1 : microcopie enfant partout (quoi toucher/cocher) + étapes onboarding 1/4…4/4.

### v1.14.0 — Reset quotidien + heures de routine + édition + économie + sécurité données
- **Reset quotidien (clés datées)** : doneKey des tâches = `instanceId_player#YYYY-MM-DD` (`todayStamp()`). « Fait aujourd'hui » se remet à zéro chaque jour, l'XP reste. **Compatible fusion** (chaque jour = clé distincte → union sans conflit, pas de suppression). Calendrier = clé sans date (persiste jusqu'à l'examen). Sites touchés : requestComplete, resolvePendingTask (strip `#`), dashboard render, deComplete, forceComplete, compteurs « fait aujourd'hui », streak.
- **Heure de fin par routine** : `routine.endTime`; le countdown App utilise l'heure de la routine active (sinon `config.routineEnd`); `showCountdown` masqué hors fenêtre matin (et en vue famille/parent).
- **Éditer une routine** : builder avec `editId` (prérempli) + bouton ✏️ Modifier dans la vue routine.
- **Vue Semaine = focus du jour** : tâches d'aujourd'hui en avant (`todayWeek`), reste de la semaine en section grisée (`laterWeek`).
- **Indicateur de synchro ☁️** : `markSynced()` (event `lq-synced`) sur push/pull réussis → badge ☁️✓ dans l'entête.
- **PWA mise à jour fiable** : `injectRegister:null` + `registerSW` manuel dans main.jsx avec `r.update()` chaque minute → les appareils passent vite à la dernière version (c'était LA cause du « je vois juste Antoine » : les cells restaient sur l'ancienne version sans sync).
- **Sécurité données renforcée** : `remotePull` distingue cloud-vide (null → on peut semer) vs échec-réseau (`PULL_FAILED` → on NE touche PAS au cloud). Plus aucun risque qu'une erreur réseau fasse écraser le cloud à la reconnexion. Testé node : reconnexion Elli+cloud = 2 joueurs gardés; vieux device = XP non régressif. 
- **Bugs/économie** : shop thématique (Minecraft etc.) affiche et vend enfin ses items (`SHOP_ITEMS[shopTab]||themedCat.items`); exploit calendrier retiré (ajouter un devoir ne donne plus +5XP/+2🪙); coûts récompenses relevés (5$=150, écrans=40, skin=120…); **ajustement de pièces / remboursement** dans le portail parent (+10/+50/montant/-10 🪙).

### v1.13.1 — Accueil Semaine + déconnexion + intro mini-jeux + fix chrono
- **Connexion → accueil Semaine** : `onSelectPlayer` force `mode:"week", activeRoutineId:null` (on n'arrive plus au milieu d'une routine d'hier).
- **Bouton « ➕ Créer une nouvelle routine »** bien en vue (au lieu d'une petite puce). Puce d'accueil renommée 🏠 Semaine.
- **Déconnexion / changer d'enfant** (🚪 dans l'entête → retour `screen:"login"`) + **sortir du mode parent** (🔒 dans l'entête ET dans le portail via `onExitParent`). Avant : aucun moyen de quitter le mode parent.
- **Mini-jeux** : écran d'intro (`MiniGame` phase `intro→countdown→play`) qui explique quoi faire + décompte « 3·2·1·GO! ». Les jeux (Runner/Pacman/Whack) ne se montent qu'après GO → le chrono part quand l'enfant est prêt. Bouton « Passer » conservé.
- **Fix gros chrono rouge** : `effectiveMode` = "week" en vue famille/parent (plus de countdown là) ; `showCountdown` limité à un enfant en mode routine ET dans une fenêtre du matin (≤ routineEnd+90 min) → fini le « EN RETARD » d'une routine d'hier soir.
- ⚠️ Convergence multi-appareils : chaque appareil doit OUVRIR l'app en ligne (PWA `autoUpdate`) pour passer en v1.13.x et fusionner ses joueurs dans le cloud. Tant qu'un appareil n'a pas synchronisé, ses enfants n'apparaissent pas ailleurs (normal, pas un bug).

### v1.13.0 — Modes par enfant + routines autonomes + fusion sync
- **FIX BUILD CANNER** : `package-lock.json` ne contenait pas `pg` (ajouté en v1.12.0) → `npm ci` échouait (`EUSAGE`, déploiement `failed`). Lock régénéré (`npm install --package-lock-only`), `npm ci` validé. C'est LA raison pour laquelle la sync v1.12.0 ne s'était jamais déployée.
- **Mode par enfant** : `gameStates[i].mode` (`"routine"|"week"`, défaut = `config.mode`). Chaque enfant bascule lui-même entre ⏰ Routine et 📅 Semaine via des chips dans son dashboard. L'XP/pièces sont un **seul pool par enfant** → se cumulent dans les deux modes (aucun changement de logique XP nécessaire). `effectiveMode` (App) pilote countdown/barre de progression/entête selon le joueur vu. Ancien onglet global « 📅 Semaine » retiré (la semaine est maintenant par-enfant).
- **Routines autonomes créées par l'enfant** : `gameStates[i].routines = [{id,name,emoji,taskIds:[instanceId]}]` + `activeRoutineId`. L'enfant crée « Matin », « Soir »… en choisissant parmi ses tâches de routine assignées (XP intègre, pas d'invention). Bouton **« ✅ J'ai fini ma routine — revenir au mode Semaine »** (confirm). Builder dans `PlayerDashboard` (`routineBuilder` state).
- **Un thème par enfant pour les 2 modes** : le thème dérive de `player.themeId` peu importe le mode (déjà le cas) → confirmé/garanti. Plus de thème mélangé routine/semaine.
- **Type de tâche au portail parent** : `handleAddAssignment(taskId,playerIds,assType)` → `assType==="week"` met `days:[0..4]`, sinon `days:[]`. Sélecteur ⏰/📅 dans l'onglet Tâches + badge type dans la liste.
- **Sync = FUSION non-destructive** (au lieu d'écraser) : `mergeFamily`/`mergeGS` (près du bloc SYNC). Union des joueurs par `id`, **max** XP/pièces (l'XP ne peut que monter), union completed/pending/owned/badges/boughtRewards/routines, **un seul thème** par enfant. Branché dans `load()` ET la boucle 25s. Anti-churn via `_famSig` (push seulement si le contenu change). ⇒ réunir « l'ordi 2 modes » + « le cell 1 mode » + nouveaux comptes enfants **sans perte**. Testé : 16/16 scénarios (node), parcours headless OK, 0 erreur console.
- **UX** : bouton calendrier proéminent (gros bouton cyan « ➕ Ajouter un devoir ou un examen »). Récompense « 🎬 Choisir le film » (`rw10`) retirée du catalogue.

### v1.0–1.2
- App complète de quêtes gamifiées avec XP, pièces, niveaux, récompenses
- Thèmes visuels (13 thèmes) XP-gatés — chaque joueur commence avec 2 thèmes aléatoires
- Pseudos personnalisés (`player.pseudo`) — `displayName(player)` → pseudo ou prénom
- Footer version + bouton bug report
- Sauvegarde toujours active (toggle retiré)

### v1.3.0 — Badges
- Catalogue `BADGES` (16 généraux + 19 thème-spécifiques)
- `checkBadges(pState, player, dailyCount)` — appelé à chaque tâche complétée
- Badge shelf dans `PlayerDashboard` (locked = grisé/opacité 0.3)
- `RewardPopup` affiche les nouveaux badges débloqués
- Streak badge: compte les quêtes du jour via prefix `toDateString()`

### v1.3.0 — Migration de données
- `migrateGameState(gs)` — ajoute les nouveaux champs sans écraser les données existantes
- `migrateSavedData(data)` — applique migration + détecte nouvelles versions
- `CHANGELOG` constant — alimente le feed famille à chaque push

### v1.4.0 — Écran login
- Machine d'états: `"loading" | "setup" | "login" | "game"`
- `LoginScreen` — sélection Enfant/Parent + flow par joueur

### v1.5.0 — PIN par joueur
- `gameState[i].pin` — `null` = pas encore créé, string 4 chiffres = défini
- Premier login → flow création PIN (entrée + confirmation)
- Logins suivants → vérification PIN
- Indicateur 🔑 discret sur carte si PIN existe
- `PinDots`, `PinKeypad` — composants extraits réutilisables
- **PIN parent par défaut dans SetupWizard : 1146** ← NE PAS afficher côté enfant
- `migrateGameState` inclut `pin: gs.pin ?? null`

### v1.8.0 — Carry-over + Mini-jeu whack-a-mole
- `carryoverModal` — à l'ouverture si date changée, propose valider ou effacer les tâches pending d'hier
- `handleCarryoverValidate(playerIdx)` — donne XP pour toutes les tâches pending
- `handleCarryoverClear(playerIdx)` — efface les pending sans XP
- `MiniGame` component — whack-a-mole thématique 3x3, 3 rounds, 1.4s/cible
- Déclenché dans `handlePinSuccess` quand `prevLv < newLv`
- Bonus XP 0/8/18/30 + coins 0/4/10/18 selon score

### v1.9.0 — Fix PIN login (stale closure mobile)
- `handlePlayerDigit` / `handleParentDigit` refactorisés avec `useRef` pour éviter stale closure sur mobile
- Pattern : `pPinRef.current` + `ppPinRef.current` au lieu de state React dans les handlers

### v1.10.0 — Fix PIN login (suppression useCallback inutile)
- Suppression des `useCallback` sur les handlers PIN (deps changeaient à chaque render de toute façon)
- Extraction de `doPlayerSubmit()` et `doParentSubmit()` — fonctions pures qui lisent depuis les refs
- Ces fonctions sont appelées par auto-submit (4e chiffre) ET par le bouton VALIDER

### v1.12.0 — Autonomie + portail parent + sync ← DERNIER COMMIT
- **FIX LOGIN/PIN (bug rapporté par Gen)** : l'auto-submit au 4e chiffre avait disparu dans la refactorisation v1.10.1 — taper son code ne faisait RIEN à moins de remarquer le bouton VALIDER. Restauré (`setTimeout(doPlayerSubmit/doParentSubmit, 120)` dans `handlePlayerDigit`/`handleParentDigit`), reproduit et re-testé en headless.
- **Nouveau flux de validation** : enfant tape «J'AI FAIT ÇA!» → tâche en `pending` + toast (plus de popup PIN par tâche). Parent valide/refuse depuis le portail → onglet **«✅ À valider»** (`approvePending`/`refusePending` dans App). Pastille rouge avec compteur sur le bouton 🔐 du header.
- `resolvePendingTask(playerIdx, doneKey)` — résout tâche catalogue/perso/**calendrier** (fix: les rappels calendrier ne donnaient JAMAIS l'XP — `handlePinSuccess` cherchait `ass.taskId` inexistant sur les rappels)
- **Onglet «📋 Tâches» du portail parent** : ajouter une tâche du catalogue à des joueurs (copies indépendantes), créer une tâche perso, retirer une assignation (`handleAddAssignment`/`handleRemoveAssignment`/`handleAddCustomTask`)
- **CarryOverModal supprimé** (faille: les enfants pouvaient s'auto-valider les tâches d'hier) — les pending restent simplement dans la file du portail
- **Couche sync cloud à 2 modes auto-détectés** (`SYNC.md`) : (1) **API même-origine `/api/famille`** servie par `server.cjs` (Node, `npm start`) branché sur le **Postgres Canner** via `DATABASE_URL` — détection client via `/api/sante`; (2) **Supabase** si `SYNC_URL`/`SYNC_KEY` remplis. `remotePush` (debounce 1.5s) à chaque save, `remotePull` au chargement + 25s + retour sur l'app, last-write-wins par `savedAt` (le serveur refuse d'écraser plus récent). Repli : local seulement, comportement historique. `FAMILY_ID` = clé de la famille.
- **`server.cjs`** : sert `dist/` (fallback SPA) + API famille; stockage Postgres si `DATABASE_URL`, sinon fichier JSON local (dev). `package.json` : `start: node server.cjs`, dépendance `pg`. ⚠️ Vérifier après déploiement que Canner roule le projet en Node (tester `/api/sante`) et que Postgres est activé pour le projet.
- `PinPad` ne sert plus qu'à l'accès mode parent in-game

### v1.11.0 — Fusion thème/ambiance + scroll tâches + textes enfants
- **Un seul thème à choisir** : étape "Ambiance" retirée du SetupWizard (STEPS = Mode/Joueurs/Tâches/Récompenses/PIN, indices décalés)
- En vue joueur, le shell complet (fond, header, accents) dérive du thème perso via `getPlayerTheme()` (useMemo dans App) ; vue famille = ambiance par défaut (`config.theme` conservé pour rétrocompat, plus d'UI)
- **Fix scroll** : colonnes catalogue/assignées de l'étape Tâches → `maxHeight:62vh + overflowY:auto` chacune (avant : conteneur `overflow:hidden` qui coupait tout) ; `paddingBottom:48` sur le contenu jeu pour dégager le footer fixe
- **Badges tactiles** : tap sur badge → bulle d'info (état `badgeInfo`), texte "Survole" → "Appuie"
- **Textes revus** : "défaut: 1234" supprimé (faux), OVERRIDE → "VALIDER SANS CODE", panneau parent francisé (Journal/Code/Sauvegarde, note Supabase retirée), "Voir tableau" → "Voir mes quêtes", état vide boutique récompenses
- Validation headless Chromium (parcours enfant complet wizard→login→onboarding→tâche→PIN→reward) : OK, zéro erreur console

### v1.10.1 — Boutons VALIDER sur écrans login
- Bouton `✅ VALIDER` ajouté sous `PinKeypad` dans le mode `"pin"` (joueur) — visible quand `pPin.length===4`
- Bouton `✅ VALIDER` ajouté sous `PinKeypad` dans le mode `"parent"` — visible quand `ppPin.length===4`
- Fix critique UX : avant, si auto-submit mobile avait un bug timing → l'utilisateur était bloqué sans aucun bouton

---

## Architecture clé

```
App state:
  screen: "loading"|"setup"|"login"|"game"
  config: { players[], pin, tasks[], rewards[], updateFeedEntries[] }
  gameStates[]: { xp, coins, completed[], pending[], owned[], equipped{},
                  boughtRewards[], badges[], pin, avatar{} }
  view: "family" | playerIndex (number)
  parentMode: bool
  parentPinOpen: bool

Helpers:
  getLevel(xp) → { level, xpForNext, xpInLevel }
  getLevelTitle(xp, themeId) → { title, icon }
  getPlayerTheme(themeId) → theme object (couleurs, icônes, perso)
  displayName(player) → pseudo || name
  checkBadges(pState, player, dailyCount) → new badge IDs[]
  migrateGameState(gs) → gs with all new fields
  migrateSavedData(data) → data with migrations + changelog entries

Composants principaux:
  LoginScreen       — écran de sélection joueur/parent
  SetupWizard       — configuration initiale famille
  FamilyOverview    — vue "tout le monde"
  PlayerDashboard   — vue individuelle (XP, badges, tâches, shop)
  ParentPanel       — gestion tâches/récompenses/PIN/export
  RewardPopup       — popup après tâche complétée (XP + badges)
  AvatarCanvas      — rendu pixel-art personnage
  PinPad            — pavé PIN validation tâche/mode parent (in-game) — A UN BOUTON VALIDER
  PinDots           — indicateur 4 points PIN (login screen)
  PinKeypad         — clavier numérique (login screen) — PAS de bouton valider intégré
                      → le bouton VALIDER est ajouté dans le JSX parent selon le contexte
  MiniGame          — whack-a-mole au level-up
```

### Différence PinPad vs PinKeypad (important!)
- `PinPad` (ligne ~1231) : utilisé **in-game** pour valider tâche ou accéder au mode parent. **A son propre bouton VALIDER intégré.**
- `PinKeypad` (ligne ~2682) : utilisé sur l'**écran login**. Clavier uniquement, **pas de bouton VALIDER intégré** — le bouton est ajouté dans le JSX appelant (`mode==="pin"` et `mode==="parent"` dans `LoginScreen`).

### Pattern handlers PIN login (ref-based, anti-stale-closure)
```js
// Refs pour éviter stale closure sur mobile
const pPinRef = useRef("");
const ppPinRef = useRef("");
const confirmStepRef = useRef(false);
const firstPinRef = useRef("");
const gameStatesRef = useRef(gameStates);
gameStatesRef.current = gameStates;
const selIdxRef = useRef(selIdx);
selIdxRef.current = selIdx;
const configPinRef = useRef(config?.pin);
configPinRef.current = config?.pin;

// Appelé par auto-submit (4e chiffre) ET par bouton VALIDER
const doPlayerSubmit = () => { /* lit depuis pPinRef.current */ };
const doParentSubmit = () => { /* lit depuis ppPinRef.current */ };

const handlePlayerDigit = (d) => {
  if (pPinRef.current.length >= 4) return;
  pPinRef.current = pPinRef.current + d;
  setPPin(pPinRef.current);
  if (pPinRef.current.length === 4) doPlayerSubmit();
};
```

### Pattern persist
```js
const persist = useCallback((cfg, gs) =>
  save({ config:cfg, gameStates:gs, savedAt:new Date().toISOString() }), []);
```

### App-level props pour LoginScreen
```jsx
<LoginScreen
  config={config}
  gameStates={gameStates}
  onSelectPlayer={(idx)=>{ setView(idx); setScreen("game"); SFX.click(); }}
  onParentLogin={()=>{ setParentMode(true); setView("family"); setScreen("game"); SFX.click(); }}
  onSetPlayerPin={(idx, pin)=>{ /* met à jour gameStates[idx].pin */ }}
  onCompleteOnboarding={...}
  onNewSetup={()=>{ setScreen("setup"); }}
/>
```

---

## Règles UX / Design décisions 🎨

### Sécurité PIN
- **PIN parent par défaut = 1146** — NE JAMAIS afficher dans une UI côté enfant
- Le vrai PIN d'une famille = celui créé au setup original. Pour changer : panneau parent → onglet PIN.

### Thèmes joueur
- Chaque joueur commence avec **2 thèmes aléatoires** (`pickStarterThemes()`)
- Les autres thèmes se **débloquent par XP** (`isThemeUnlocked()`)
- **Thèmes disponibles :** minecraftpp, roblox, harrypotter, ghibli, horreur, monstres, licornes, boomerangfu, marvel, japon, microscopique, disney, pixar

### Versioning
- Bump `APP_VERSION` à chaque feature/fix
- Ajouter entrée dans `CHANGELOG` constant

---

## Ce qui reste à faire 📋

### #6 — Refonte login (v1.6.0)
- Écran "Enfant / Parent" comme point d'entrée
- Liste des joueurs par nom + cartes
- Flow onboarding 1er login : thème → avatar → surnom → PIN
- Lock thème hebdomadaire (`themeChosenAt` + vérif semaine ISO)
- `avatar.configured: bool` dans `migrateGameState`

### #7 — Responsive tablette/ordinateur
- L'app est actuellement optimisée mobile uniquement
- Adapter layouts pour tablette (≥768px) et desktop (≥1024px)

### #8 — Pages profil famille (Duolingo-style)
- Vue dédiée par joueur depuis FamilyOverview
- Stats historiques, progression XP, badges en vitrine, streak, ligues

### #10 — Calendrier devoirs/examens
- Saisie d'examens/devoirs avec date dans `gameStates[i].calendar[]`
- Rappel contextuel dans le dashboard

### #12 — Humour et trolling
- Messages sarcastiques/drôles aléatoires dans l'UI
- Easter eggs, réactions aux actions répétées
