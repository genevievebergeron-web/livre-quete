# Livre de Quêtes — État du projet
_Mis à jour: 2026-06-12 — v1.11.0_

---

## Stack & déploiement

- **React 18 + Vite 5 PWA** — single-file `src/App.jsx` (~4250 lignes)
- **Persistance:** `localStorage` uniquement, clé `livre-de-quetes-v1`, aucun backend
- **Deploy:** Push sur `main` → **Canner** (hébergeur canadien style Vercel) déploie automatiquement
  - Pas de build local nécessaire — Canner s'en charge
  - Repo GitHub : `genevievebergeron-web/livre-quete`
  - Remote git : `https://genevievebergeron-web@github.com/genevievebergeron-web/livre-quete.git`
- **Dossier local:** `~/Downloads/livre-de-quetes/`
- **Push depuis terminal:** `cd ~/Downloads/livre-de-quetes && git push`

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

### v1.11.0 — Fusion thème/ambiance + scroll tâches + textes enfants ← DERNIER COMMIT
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
