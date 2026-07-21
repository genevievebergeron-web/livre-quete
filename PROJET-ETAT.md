# Livre de Quêtes — État du projet
_Mis à jour: 2026-07-21 — v1.92.0_

> **v1.92.0 (21 juillet, poussé, session nocturne autonome) — Lot 4 #19 : récompenses « écran » vs « calme » catégorisées dans la boutique.** `REWARD_CATALOG` a maintenant un champ `cat` optionnel (`"ecran"` pour 15 minutes d'écran, `"calme"` pour bain moussant/déjeuner au lit/temps privé avec le parent/musique) et une petite étiquette de couleur (📱 Écran orange, 🌙 Calme sarcelle) s'affiche à côté du libellé dans l'onglet 🎁 Récompenses de la boutique — objectif : rendre visibles les alternatives apaisantes/hors-écran plutôt que de laisser l'écran être la seule récompense qui saute aux yeux, utile pour des enfants neuroatypiques qui bénéficient d'options de régulation identifiables. Décision de conception : seulement 4 des 17 récompenses ont reçu la catégorie "calme" (celles clairement orientées détente/apaisement) — les autres (bonbon, jeu de société, achats, etc.) restent sans étiquette plutôt que de forcer une catégorisation arbitraire. **Vérifié en Chrome** (dev server, `localStorage` seedé avec un joueur test 500 pièces/500 XP) : les 3 étiquettes affichées correctement dans l'onglet Récompenses, aucune casse de mise en page. `npm run build` propre (mêmes 2 warnings préexistants bénins). **Reste du Lot 4** : #20 (thème hebdomadaire aléatoire), #21 (check-in émotions). Puis Lot 5 (fluidité).

> **v1.91.0 (21 juillet, poussé, session avec Gen) — Système de logs techniques + `MAINTENANCE.md`.** Nouveau `config.errorLogs` (capture auto des erreurs JS, invisible pour les enfants, visible dans le portail parent onglet Journal) pour faciliter le troubleshooting à distance. Nouveau fichier `MAINTENANCE.md` : premier passage documenté (lecture réelle de `https://livre-de-quetes.app.canner.ca/api/famille`, lecture seule) — un vrai bug signalé investigué (pas de cause codée trouvée, documenté honnêtement) + une vraie suggestion (renommer le familier) en attente d'accord de Gen. Le prompt de la routine `livre-quete-overnight-audit` sait maintenant s'auto-transformer en mode maintenance (1×/3j) une fois les Lots 4+5 clos, sans intervention de Gen. **Point de sécurité noté pour Gen** (hors-scope, pas corrigé) : l'API `/api/famille` n'a aucune authentification réelle au-delà du format d'`FAMILY_ID`, qui est en clair dans le repo GitHub public — à trancher séparément si elle veut y remédier (ex. token secret Canner).
> ⚠️ Concurrence observée cette session : la routine nocturne a tourné en parallèle et a poussé v1.90.0 (Lot 4 #18, mini-jeu choisi par l'enfant) pendant que ce travail était en cours — build resté propre, rien de cassé, mais la routine a été mise en pause puis son prompt mis à jour avec un rappel de vérifier l'état réel du fichier avant de committer.

> **v1.90.0 (21 juillet, poussé, session nocturne autonome) — Lot 4 #18 : mini-jeu choisi par l'enfant.** Avant, le mini-jeu de niveau (Tape vite/Cours et saute/Mange tout) était tiré au hasard. Maintenant : nouvelle phase "choice" dans `MiniGame` (App.jsx) qui montre les 3 jeux avec leurs paliers de récompense (XP+pièces par étoile) AVANT de choisir — l'enfant clique celui qu'il veut. L'écran d'intro (après le choix) réaffiche les mêmes paliers + un bouton "🔀 Changer de jeu" pour revenir en arrière sans perdre la fête de niveau. Les tables de bonus des 3 jeux (`BONUS_XP`/`BONUS_COINS`, dupliquées dans chaque composant de jeu) ont été centralisées dans une constante module `MINIGAME_TIERS` — même valeurs, zéro changement de gameplay, juste une seule source de vérité réutilisée par l'écran de choix. Le cadeau imposé (ex. Pac-Man offert en surprise) saute toujours directement à l'intro sans passer par le choix — comportement intentionnellement inchangé (le get_page_text a confirmé "🎁 CADEAU SURPRISE!" → va direct à "Mange tout!" sans écran de sélection). **Vérifié en Chrome (dev server + `localStorage` seedé avec un joueur test niveau 3)** : les 2 chemins testés en direct — (a) choix libre : clic sur chaque carte affiche bien ses propres paliers, "Changer de jeu" retourne au choix, le jeu se lance et se termine normalement (testé avec Tape vite, score 0 → "Pas de bonus cette fois", CONTINUER referme proprement); (b) cadeau forcé (`pendingCelebrations:[{game:"pacman"}]`) : saute direct à l'intro Mange tout, pas de bouton Changer de jeu. `npm run build` propre (mêmes 2 warnings préexistants bénins). Texte d'onboarding (`FEATURE_ARROWS`/étapes) mis à jour pour refléter le choix (avant : "choisi au hasard"). **Reste du Lot 4** : #19 (catégoriser récompenses hors-écran dans la boutique), #20 (thème hebdomadaire aléatoire), #21 (check-in émotions). **Prochaine étape suggérée pour la prochaine passe : continuer Lot 4 (#19 est probablement le plus rapide/sûr ensuite) ou passer au Lot 5 (fluidité).**

> **v1.89.0 (21 juillet, poussé) — Flex mobile/desktop**, demandé par Gen hors-plan : `game-root` n'avait aucune largeur max, donc l'app s'étirait pleine largeur sur un ordinateur. Le contenu principal avait déjà `maxWidth:900`, mais pas l'en-tête/compte-à-rebours/barre du jour/nav/barre d'onglets du bas — appliqué le même plafond partout, cohérent, testé visuellement en Chrome (~1568px) et sur mobile via seed. Aucune régression possible sous 900px par construction (maxWidth ne peut que restreindre). **Ronde de tests v1.82.0-v1.88.0 aussi complétée cette session** : relecture complète du diff + tests unitaires Node + vérification visuelle en Chrome réelle (disque de minuterie confirmé fonctionnel, bouton retrait de tâche, état vide orientant, chip renommé, D'abord→Ensuite — tous vus en direct).

> **v1.88.0 (20 juillet, poussé) — Lot 3 de l'audit 2.0 COMPLET** (sauf #17, déprioritisé — impact réel quasi nul). Ajouté sur v1.87.0 : disque de minuterie visuel qui rétrécit (TimerView, ⚠️ **pas vérifié visuellement en navigateur cette session** — seulement relu attentivement, à tester en priorité avec les enfants); "👉 Ensuite: …" en mode une-tâche-à-la-fois; message "tu y es presque!" à 1-2 tâches restantes; confettis réduits sur une tâche ordinaire (pleine fête conservée pour level-up/victoire de boss). **Lots 1, 2, 3 tous complétés** (avec quelques items délibérément déprioritisés/reportés, documentés dans le plan). **Prochaine étape suggérée : Lot 4 (autonomie/gamification) ou Lot 5 (fluidité/performance).**

> **v1.87.0 (20 juillet, poussé) — Lot 3 de l'audit 2.0 partiel.** Fait, vérifié visuellement en navigateur avant push : réglages "Taille du texte" (Normal/Grand/Très grand) et "Police plus lisible" (Nunito) dans Mes réglages; message "🌅 Nouvelle journée!" au premier retour d'un jour différent. **Pas fait** : réduction de la densité confetti/SFX/glow par défaut (#11, demande un vrai jugement de tuning), minuterie visuelle Time Timer (#13), visuel "D'abord → Ensuite" (#14), avertissements de transition (#15). Item #17 (hoist GLOBAL_CSS) **déprioritisé** : en creusant, son impact réel sur la fluidité est quasi nul (les 4 sites ne montent jamais simultanément).

> **v1.86.0 (20 juillet, poussé) — Lot 2 de l'audit 2.0 CLOS pour cette passe** (items restants réévalués, pas juste sautés). #6 fait en version réduite : le bouton Minuterie de l'Accueil respecte maintenant le rituel actif (au lieu d'ouvrir toujours vierge) — mais je n'ai PAS forcé `TimerView` à partager 100% son état avec le dashboard, car c'est un outil délibérément plus flexible (3 modes + minuterie libre + choix d'un autre rituel), pas une duplication à éliminer. #10 (fusion complète Semaine+Rituel en une vue simultanée) est resté **délibérément pas fait** : `pMode` pilote trop de choses (en-tête, section "plus tard cette semaine", bouton fin de rituel, minuteur) pour que ce soit un fix ciblé — c'est une vraie refonte qui mérite une maquette avant d'y toucher sur une app utilisée quotidiennement par 4 enfants. **Prochaine étape suggérée : Lot 3 (épuration sensorielle) ou une session de conception dédiée pour le #10.**

> **v1.85.0 (20 juillet, poussé) — Lot 2 de l'audit 2.0 partiel.** Fait : l'onglet "✅ Aujourd'hui" montre aussi les rappels calendrier du jour; chip "🏠 Semaine"→"📋 Mes tâches" (fix collision d'icône avec l'onglet Accueil); états vides orientants (Semaine↔Rituels); 4 nouvelles catégories calendrier (Santé/Sport/Intervenant/Camp) + fix pour qu'elles ne soient pas gamifiées comme des devoirs. **Pas fait** (reste du Lot 2) : unifier le sélecteur de rituel de l'onglet Minuterie avec celui du dashboard (#6); fusion complète Semaine+Rituel dans une seule vue au-delà d'aujourd'hui (#10). Découverte utile en creusant : l'app avait déjà un onglet "✅ Aujourd'hui" pensé comme hub central — le vrai trou était qu'il manquait les rappels calendrier, pas qu'il fallait tout reconstruire.

> **v1.84.0 (20 juillet, poussé) — Lot 1 de l'audit 2.0 TERMINÉ.** Les 4 items du Lot 1 (voir plan) sont livrés et en ligne : (v1.82.0) sélecteur parent en grille + catalogue de tâches perso qui ne grossit plus à l'infini + retrait du toggle humour mort; (v1.83.0) l'enfant peut demander à retirer une tâche (approbation parent); (v1.84.0) frein énergie élargi à la boutique + avatar, avec message "sieste" visible dans la fiche perso. **Prochain lot recommandé : Lot 2 (navigation)** — le vrai irritant nommé par Gen ("on sait jamais où chercher"), pas encore commencé. Plan complet : `~/.claude/plans/le-design-de-mon-mighty-mountain.md`.

> **v1.82.0 (20 juillet, poussé) — Début de l'audit 2.0** (interface épurée, autonomie, moins de bugs, plus fluide — demandé par Gen). Plan complet dans `~/.claude/plans/le-design-de-mon-mighty-mountain.md` (6 lots, 28 items, revérifié contre le code actuel plutôt que contre les vieux audits de juin). **Lot 1 en cours** — livré cette session : (1) portail parent choisit une tâche via `TaskChooser` (grille par catégorie) au lieu du `<select>` plat qui devenait long à parcourir; (2) `handleAddCustomTask` (création tâche perso côté parent) dédoublonne par libellé normalisé — même règle que côté enfant (v1.53.0) — le catalogue de tâches ne grossit plus à l'infini quand une tâche au même nom est recréée; (3) retiré `settings.humor` du panneau réglages, un toggle qui ne faisait rien (aucun texte humoristique n'existe dans le code, malgré la promesse à l'onboarding). **Reste du Lot 1** : B3 (frein énergie élargi à boutique/avatar/boss/mini-jeux), B6 (l'enfant peut demander à retirer une tâche). **Reste des lots 2-6** : navigation unifiée (le vrai irritant nommé par Gen — « on sait jamais où chercher »), calendrier enrichi, épuration sensorielle, thème hebdo, fluidité (re-render 1s), graphisme next-level + espace platformer famille. Convention de travail pour la suite : diffs ciblés par item, validation `npm run build` avant chaque commit, bump `APP_VERSION`+`CHANGELOG`, commit **et push** (autorisé par Gen le 20 juillet).

> **v1.81.0 (20 juillet, à pousser) — Pixel art d'un des garçons + vraie refonte du port d'équipement.** Gen a fourni 3 captures de pixel art fait par son fils (armes/armures, 6 chapeaux/casques, 11 familiers) → découpées automatiquement en sprites individuels transparents (script Python/PIL/scipy : détection de composantes connexes sur la couleur de fond, despeckle, recadrage carré 128×128) et déposées dans `public/sprites/{items,pets}/` selon la convention existante (`a1..a5`, `h1..h6`, clés familiers). `a4.png` (armure diamant) REMPLACÉ par la nouvelle version, plus cohérente avec le reste du set. Familier manquant de ce lot : `owl` (reste en repli emoji/canvas).
> **Mapping items** (déduit de `liste-assets-a-illustrer.md` + confirmation visuelle) : a1 Bouclier, a2 Épée, a3 Arc en or, a4 Armure diamant, a5 Bâton magique; h1 Chapeau magique (haut-de-forme), h2 Couronne, h3 Casque héros (casque rouge à crête), h4 Casque diamant (embleme bleu), h5 Chapeau savant (capuche grise), h6 Cap champion (casquette rouge); familiers : bee, worm, capybara (tête brune), dragon, spider, duck (poussin jaune), parrot (colibri vert), fox (tigre), dog, wolf, cat (dernière tête orange/violette) — ces 2 derniers (fox=tigre, capybara=tête brune) sont les appariements les moins certains, à valider avec Gen/son fils si un jour ça semble mal nommé.
> **VRAI FIX du rendu « porté » (bug root-causé, pas juste plus d'assets)** : les items équipés (hat/face/armor) étaient positionnés en `left:"50%"` = centrés sur le **CANVAS** de 72 unités de `renderAvatarToCtx`. Mais le personnage dessiné (bras compris, x:-2 à 38) est décalé à GAUCHE dans ce canvas — son vrai centre est x=18, pas x=36. Les items flottaient donc à côté du corps au lieu d'être vraiment dessus (surtout visible sur l'armure, qui atterrissait près des jambes, pas du torse). FIX : nouveau composant `EquippedGear` + `AVATAR_EQUIP_ANCHORS` (App.jsx, juste après `ItemSprite` ~L3013) — ancres exprimées dans le MÊME repère 72 unités que `renderAvatarToCtx` (cx/cy natifs ÷72×taille), donc l'alignement reste correct à n'importe quelle taille d'avatar (carte dashboard size72 ET popup size120, avant dupliqué avec des offsets figés différents et incohérents). Nouveau : `HELD_WEAPON_IDS = {a1,a2,a3,a5}` → ces items (bouclier/épée/arc/bâton, en fait des ARMES pas de l'armure de torse) sont maintenant rendus tenus en main (ancre "weapon", bras droit, rotation 22°) au lieu d'être centrés sur le torse comme a4 (vraie armure, ancre "armor"). Aucune migration de données : la distinction est purement visuelle, basée sur l'id, `eq.armor` reste le même champ.
> **Validé en Chrome headless (playwright-core)** avant push : localStorage pré-rempli avec un joueur test équipé (casque+épée, puis couronne+armure diamant, puis couronne+bouclier), captures d'écran à size72 (carte dashboard) et size120 (popup « Mon Perso ») — le chapeau/casque/couronne est bien sur la tête, l'armure diamant bien sur le torse, et bouclier/épée bien tenus en main à un angle naturel. `esbuild` bundle sans nouvelle erreur (2 warnings préexistants bénins inchangés).
> **Note technique sandbox** : `node_modules` absent du checkout `~/Downloads/livre-de-quetes/livre-quete` au départ de cette session → `npm install` a tout réinstallé proprement (rollup-linux-arm64-gnu déjà présent, pas besoin du contournement habituel). Chromium headless bloqué par 1 lib système manquante (`libXdamage.so.1`, pas de sudo dans ce sandbox) → contourné en téléchargeant le `.deb` via `apt-get download` (pas root) et en pointant `LD_LIBRARY_PATH` dessus, sans rien installer au niveau système.

> **v1.80.0 (18 juillet, commit 5b695d4, poussé+déployé)** — **Investigation « combat final accessible à 1 seul enfant sur 4 »** (camping à Kabania) : vérifié que rien côté code/compte ne bloque 3 des 4 (bouton COMBAT FINAL sans aucune condition par joueur; `/combat-hydre.html` se sert correctement en live; les 4 profils avatar+familier sont valides). Cause la plus probable = réseau faible/instable au camping, sans aucun état d'erreur avant ce fix (l'iframe qui ne charge pas laissait un écran noir muet). FIX (préventif, pas une certitude de cause) : `HydraFinalGame` (App.jsx ~3096) a maintenant un minuteur de 7s sur l'iframe — si `onLoad` ne s'est pas déclenché, affiche un écran clair « 📶 Ça n'a pas pu charger » + bouton 🔁 Réessayer (remonte l'iframe via une nouvelle `key`). Si le problème revient malgré ce fix, ça confirmerait une cause réseau (pas un bug de code) — sinon regarder du côté compatibilité tactile par device (iOS vs Android).

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
