# Livre de Quêtes — État du projet
_Mis à jour: 2026-06-07 — v1.8.0_

---

## Stack & déploiement

- **React 18 + Vite 5 PWA** — single-file `src/App.jsx` (~3600 lignes)
- **Persistance:** `localStorage` uniquement, clé `livre-de-quetes-v1`, aucun backend
- **Deploy:** GitHub Pages via GitHub Actions — push `src/App.jsx` sur `main` → CI/CD automatique
- **Repo:** `genevievebergeron-web/livre-quete`
- **Dossier local:** `~/Downloads/livre-de-quetes/`

## Joueurs

4 garçons : Elli, Antoine E (Emery), Antoine DR (Dumont-Rocheleau), Olivier DR

**Couleurs par défaut (SetupWizard):**
- Elli → `#C060D0` (mauve)
- Antoine E → `#4A90D9` (bleu)
- Antoine DR → `#FF6B35` (orange)
- Olivier DR → `#2ECC40` (vert)

**Noms affichés dans le jeu = surnom (pseudo). Vrai nom = panneau parent uniquement.**

---

## Ce qui est fait ✅

### v1.0–1.2
- App complète de quêtes gamifiées avec XP, pièces, niveaux, récompenses
- Thèmes visuels (13 thèmes) XP-gatés — chaque joueur commence avec 2 thèmes aléatoires
- Pseudos personnalisés (`player.pseudo`)
- `displayName(player)` → pseudo ou prénom
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
- `seenVersions` en localStorage — évite de réafficher le changelog

### v1.4.0 — Écran login
- Nouvelle machine d'états: `"loading" | "setup" | "login" | "game"`
- `LoginScreen` — cartes joueurs tappables + bouton accès parent
- Après setup → `"login"` (pas `"game"` directement)
- Après chargement → `"login"`

### v1.8.0 — Carry-over + Mini-jeu
- `carryoverModal` — à l'ouverture si date changée, propose valider ou effacer les tâches pending d'hier
- `handleCarryoverValidate(playerIdx)` — donne XP pour toutes les tâches pending d'un joueur
- `handleCarryoverClear(playerIdx)` — efface les pending sans XP
- `MiniGame` component — whack-a-mole thématique 3x3, 3 rounds, 1.4s/cible
- `miniGame` state — déclenché dans `handlePinSuccess` quand `prevLv < newLv`
- `handleMiniGameEnd(bonusXp, bonusCoins)` — applique bonus et affiche RewardPopup

### v1.5.0 — PIN par joueur
- `gameState[i].pin` — `null` = pas encore créé, string 4 chiffres = défini
- Premier tap sur carte → flow création PIN (entrée + confirmation)
- Taps suivants → vérification PIN
- Indicateur 🔑 discret sur la carte si PIN existe
- Composants extraits: `PinDots`, `PinKeypad` (réutilisables)
- PIN parent par défaut dans SetupWizard: **1146**
- `migrateGameState` inclut `pin: gs.pin ?? null`

---

## Règles UX / Design décisions 🎨

### Thèmes joueur
- Chaque joueur commence avec **2 thèmes aléatoires** (`pickStarterThemes()` — déjà codé)
- Les autres thèmes se **débloquent par XP** (`isThemeUnlocked()` — déjà codé)
- Le thème choisi est **verrouillé pour la semaine** (lundi → dimanche)
  - Champ à ajouter: `player.themeChosenAt` (timestamp ISO)
  - Logique: si même semaine ISO → bloqué côté enfant; parent peut override
  - Message: "Ton thème dure toute la semaine — choisis bien! 🎯"
- Changer de thème = action parent uniquement en cours de semaine

### Flow login (À IMPLÉMENTER — v1.6.0)

```
Écran 1 — "Tu es...?"
  [🧒 Enfant]   [👨‍👩 Parent/Adulte]
        ↓                ↓
Écran 2             PIN parent
  "Qui es-tu?"
  Liste: Elli / Antoine E. / Antoine D-R. / Olivier D-R.
        ↓
  [1er login — onboarding]       [2e login+]
    1. Choisir thème               → PIN → jeu
       (parmi 2 starters)
       "Ce thème dure toute
        la semaine!"
    2. Créer avatar 8-bit
       (coupe cheveux, couleur
        cheveux, couleur chandail,
        couleur pantalon)
    3. Choisir surnom ingame
    4. Créer son PIN (4 chiffres)
        ↓
       Jeu
```

**Détection 1er login:** `gameState[i].pin === null && !gameState[i].avatar?.configured`
→ Ajouter champ `avatar.configured: bool` dans `migrateGameState`

**Surnom:** affiché partout dans le jeu (feed, profil, cartes)
**Vrai nom:** affiché seulement dans le panneau parent

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
  PinPad            — pavé numérique validation tâche/mode parent (in-game)
  PinDots           — indicateur 4 points PIN (login screen)
  PinKeypad         — clavier numérique (login screen)
```

### Pattern persist
```js
const persist = useCallback((cfg, gs) =>
  save({ config:cfg, gameStates:gs, savedAt:new Date().toISOString() }), []);
```

### Pattern badge check (dans handlePinSuccess)
```js
const today = new Date().toDateString();
const todayCount = (p.completed||[]).filter(k=>k.startsWith(today)).length + 1;
const updatedPs = { ...p, xp:newXp, coins:newCoins, completed:[...], pending:[...] };
const newBadgeIds = checkBadges(updatedPs, player, todayCount);
if (newBadgeIds.length) updatedPs.badges = [...(p.badges||[]), ...newBadgeIds];
```

---

## Ce qui reste à faire 📋

### #6 — Refonte login (v1.6.0) ← PRIORITÉ IMMÉDIATE
- Écran "Enfant / Parent" comme point d'entrée
- Liste des 4 joueurs par nom (pas cartes avec stats)
- Flow onboarding 1er login : thème → avatar → surnom → PIN
- Lock thème hebdomadaire (`themeChosenAt` + vérif semaine ISO)
- Surnom ingame vs vrai nom dans panneau parent
- `avatar.configured: bool` dans `migrateGameState`

### #7 — Responsive cell/tablette/ordinateur
- L'app est actuellement optimisée mobile uniquement
- Adapter les layouts pour tablette (≥768px) et desktop (≥1024px)
- Grilles, tailles de police, marges — tout clamp/responsive
- Tester sur les 3 formats avant chaque déploiement

### #8 — Pages profil famille (Duolingo-style)
- Vue dédiée par joueur accessible depuis FamilyOverview
- Stats historiques, progression XP visuelle, badges en vitrine
- Style Duolingo: streak, ligues, comparaison fraternelle

### #9 — Report automatique des tâches non complétées ✅ FAIT v1.8.0
- CarryOverModal affiché si date changée + tâches pending
- Valider (+XP) ou Effacer par joueur

### #10 — Calendrier devoirs/examens avec prompt quotidien
- Section dans PlayerDashboard ou vue séparée
- Saisie d'examens/devoirs avec date
- Rappel contextuel: "Ton exam de math est dans 3 jours!"
- Stocké dans `gameStates[i].calendar[]`

### #11 — Mini-jeux sur montée de niveau ✅ FAIT v1.8.0
- Whack-a-mole thématique 3x3, 3 rounds 1.4s/cible
- Bonus XP 0/8/18/30 + coins 0/4/10/18 selon score
- Thème = thème actif du joueur (emoji + couleurs)

### #12 — Humour et trolling dans l'app
- Messages aléatoires sarcastiques/drôles dans l'UI
- Ex: commentaires sur les tâches ménagères, noms de niveau absurdes
- Easter eggs, réactions aux actions répétées

---

## Notes importantes

- **Jamais de build local** — GitHub Actions s'en charge, push App.jsx suffit
- **Lock files git** dans le sandbox: supprimer `HEAD.lock` + `index.lock` manuellement si besoin
  ```bash
  rm ~/Downloads/livre-de-quetes/.git/HEAD.lock
  rm ~/Downloads/livre-de-quetes/.git/index.lock
  ```
- **Versioning:** bump `APP_VERSION` + ajouter entrée `CHANGELOG` à chaque feature
- **PIN parent existant** = celui créé au setup original (pas 1146 rétroactivement)
  → Pour changer: panneau parent → onglet PIN
- **Thèmes disponibles:** minecraftpp, roblox, harrypotter, ghibli, horreur, monstres,
  licornes, boomerangfu, marvel, japon, microscopique, disney, pixar
