# Livre de Quêtes — Analyse game design & mécaniques (2026-07-25)

_Demandé par Gen. Trois volets : (1) état des lieux des mécaniques + parcours/logique/fluidité/cohésion, (2) analyse compétitive des mécaniques d'apps équivalentes, (3) avantages/inconvénients croisés + manques à gagner et opportunités._
_Complète l'analyse visuelle externe (DA 9,5/10, finition 6,5/10) et le plan de refonte visuelle en 6 phases approuvé le 25 juillet. Ici on parle **mécaniques**, pas pixels._

---

## Volet 1 — État des lieux des mécaniques

### 1.1 Inventaire des systèmes (vérifié dans le code)

| Système | Fonctionnement | Réf |
|---|---|---|
| **XP & niveaux** | 10 niveaux (0→2600 XP), titres par thème (niv 1-5) puis prestige (6-10). XP plat-additif, aucun multiplicateur. Célébration différée au prochain login de l'enfant (mini-jeu + particules) | `leveling.js:9-28` |
| **Pièces** | Gain par tâche (easy 5-12 → boss 22-35). Prix boutique = coût de base × 3 (`PRICE_MULT`). **Reset à 0 chaque vendredi** (`custodyWeekKey`), `coinsLifetime` jamais décrémenté (badges) | `catalog.js:114`, `App.jsx:1136` |
| **Énergie** | Consommée par achats (15), coffres (30), jouer avec le familier (20); rechargée en nourrissant le familier (+45). Ne bloque JAMAIS les quêtes | `App.jsx:64-80` |
| **Jetons de boss** | 1 jeton / quête validée. Petite attaque 1 jeton = 1 dégât; grosse 3 = 4; attaque familier 3 jetons | `App.jsx:99-102` |
| **Boss collectif** | PV 88/176/308 (à 4 joueurs), modificateurs quotidiens déterministes, coup final verrouillé tant que les corvées du boss du jour ne sont pas toutes faites, victoire = +40🪙 +50 XP + 1 item ULTRA aléatoire pour TOUS. Lancé manuellement par le parent, sans cadence | `App.jsx:95-155, 5584+` |
| **Familier** | 12 niveaux (0→2600 XP familier), 8 stades Bébé→Légendaire, gagne l'XP des tâches SEULEMENT si nourri aujourd'hui, cap 50 XP/jour, évolutions aux niv 4/8/12 avec choix de 2 éléments (8 éléments, recoloration), attaque de boss au niv ≥4 | `pets.js` |
| **Coffres (loot)** | 80/170/320🪙 + 30 énergie. Odds par bande de rareté (ex. coffre Légendaire : 55 % Ultra / 33 % Lég / 12 % Unique). Doublon = remboursement partiel | `sprites.jsx:122-134` |
| **Badges** | 45 badges : totaux de quêtes/XP/pièces, par catégorie de tâche, par thème, niveaux, boss | `catalog.js:162-231` |
| **Objectifs du jour** | 3 quêtes (+10 XP/+5🪙), 6 quêtes (+15/+10), 60 XP du jour (+10🪙), réclamables 1×/jour | `App.jsx:2368-2409` |
| **Défi perso hebdo** | Check-ins quotidiens; semaine parfaite (7/7 jours de garde) = cadre « Maître de soi » le jeudi | `recurring.js:243-255` |
| **Semaine de garde** | Ven→jeu, 1 semaine sur 2, quêtes récurrentes générées automatiquement (rotation vaisselle/planchers/paires de brassée, pilules quotidiennes), report des tâches non faites lun-jeu | `recurring.js` |
| **Rituels & minuteries** | Mode routine vs semaine par enfant, rituels nommés avec minuterie (Time Timer), complétion chronométrée = min(40, 5×nb tâches) XP, minuteur par tâche (concentration pure) | `ritualtimer.jsx`, `timers.jsx` |
| **Thèmes & cosmétiques** | Déblocage par XP (0→400) + 2 starters aléatoires + 1 thème gratuit/semaine + 5 thèmes secrets. Slots hat/face/armor/weapon/themed/pet. **Purement cosmétique** (sauf familier) | `themes.js`, `shared.js:37-62` |
| **Social famille** | Fil (tâches/niveaux/badges/boss/dons/rituels, likes), dons de pièces directs + offres à accepter, Espace Famille ambiant, annonces parent | `App.jsx:5145+` |
| **Leviers parent** | Validation/refus (messages doux), force-complete, undo, ajustements ±XP/±pièces, propositions de tâches des enfants, demandes de retrait, lancement de boss, mini-jeu cadeau | `App.jsx:5312+` |
| **Anti-frustration** | Mode calme, décompte calme, police lisible, taille de texte, « une tâche à la fois » (D'abord → Ensuite), pas d'expiration de tâche, refus sans perte d'XP | `App.jsx:1153`, `calm.js` |

### 1.2 Forces du game design actuel

1. **Boucle centrale saine et complète** : effort réel → demande → validation parentale → XP + pièces + progression visible → dépense choisie (récompense réelle ou cosmétique). Peu d'apps du genre ferment la boucle aussi proprement.
2. **Quasi-zéro punition** — délibéré et rare dans le genre : pas de perte d'XP, pas d'expiration, refus avec messages doux, l'énergie ne bloque jamais les quêtes. Exactement ce qu'il faut pour le public TDAH/TSA (vs Habitica qui punit).
3. **Coopératif, pas compétitif** : le boss est un effort d'équipe (dégâts additionnés, récompense pour tous), les dons de pièces entre enfants existent. Nipto/Sweepy font des classements — risqué à 4 enfants d'âges différents ; le choix coopératif est le bon.
4. **Accessibilité neurodivergente au-dessus du marché** : mode calme + décompte calme + focus « une tâche à la fois » + police/taille — aucun compétiteur n'offre ce quatuor.
5. **La semaine de garde est une mécanique unique** : aucune app du marché ne modélise la garde partagée (génération/nettoyage automatique, ancre vendredi). Avantage structurel réel.
6. **Économie volontairement serrée** : reset hebdo + gros prix (450🪙 = semaine parfaite) = les grosses récompenses réelles restent rares et désirables.

### 1.3 Faiblesses, incohérences et dettes de design

**Charge cognitive des compteurs (le plus important).** L'enfant jongle avec **6 compteurs** : XP, pièces, énergie, jetons de boss, XP familier, badges — plus les check-ins de défi. Pour un public TDAH, c'est l'anti-pattern n°1. L'énergie est la plus floue : elle gate les achats/le jeu (friction) sans créer de motivation, et sa recharge (nourrir le familier) n'a aucun lien logique avec « l'énergie du héros ». Finch a UNE énergie au rôle limpide (elle envoie l'oiseau en aventure) ; Joon n'a QUE des pièces.

**Le reset hebdo punit l'épargne.** Seule vraie « perte » du jeu : un enfant qui économise vers une récompense à 450🪙 et rate le vendredi perd tout. C'est contre-productif pour apprendre la gratification différée (une compétence exécutive centrale à travailler). Il manque une **épargne protégée** (tirelire/objectif).

**La régularité n'est jamais récompensée.** `streakOf()` calcule une vraie série de jours consécutifs… affichée nulle part ailleurs que cosmétiquement, liée à aucun badge ni bonus. Le badge `b_streak3` « Machine à Habitudes » vérifie en réalité 6 quêtes le même jour (id trompeur). Or la constance est LA cible comportementale d'une app de routines.

**Latence de gratification dépendante du parent.** L'enfant appuie sur « J'AI FAIT ÇA! » → toast, puis **rien tant que le parent n'a pas validé**. Joon a bâti tout son produit sur la compression de ce gap (ADHD : la récompense doit être immédiate). La célébration différée au prochain login est bien, mais le moment du tap lui-même est sous-exploité.

**Le boss n'a pas de cadence.** Lancement 100 % manuel par le parent → des semaines peuvent passer sans boss (la mécanique la plus « wow » du jeu dort). Pas de cooldown ni de rythme rituel (vs Nipto : couronnement chaque dimanche).

**Plafond de progression proche.** Niveau max 10 = 2 600 XP. À 50-70 XP/jour de garde, un enfant assidu plafonne en ~3-4 mois de semaines actives. Après : plus de niveaux, thèmes tous débloqués à 400 XP — pas d'endgame (prestige, saisons).

**Bugs de design confirmés dans le code** (trouvés pendant l'inventaire) :
1. 🐛 **La célébration « semaine parfaite » ne se déclenche jamais** : `App.jsx:5270` écrit `pendingCelebration` (singulier), le consommateur lit `pendingCelebrations` (pluriel). Le cadre est ajouté en silence.
2. 🐛 **`frame_maitre_de_soi` est un item fantôme** : accordé à `owned[]` mais défini nulle part (pas dans `ALL_SHOP_ITEMS`, pas de sprite) — rendu vide/emoji s'il est affiché.
3. 🐛 **Triple chemin de récompense de victoire boss** (`useEffect` :5218 + 2 handlers) — course plausible de double octroi +40🪙/+50 XP (l'affichage est dédupliqué, l'octroi non).
4. `b_streak3` mal nommé (voir ci-dessus).
5. `titleF`/`levelsF` (titres féminins) définis mais jamais retournés par `getLevelTitle` — les filles reçoivent les titres masculins.
6. Mini-jeux quasi orphelins : seulement au level-up et en cadeau parent — jamais intégrés à la boucle quotidienne.

### 1.4 Parcours utilisateur, logique, fluidité, cohésion

**Parcours enfant (nominal)** : login (portraits + PIN) → « Aujourd'hui » → liste de quêtes en premier (corrigé v2.5.15) → « ✔ J'AI FAIT ÇA! » → attente → célébration différée au prochain login. Le chemin critique est court et désormais sans défilement. Le mode focus (« D'abord → Ensuite ») est excellent pour la population cible.

**Logique** : la métaphore RPG est appliquée sans exception (quête/boss/inventaire/XP — jamais « tâche/corvée » côté enfant) → cohésion narrative de très haut niveau, confirmée par l'analyse externe. Les incohérences sont mécaniques, pas narratives : à quoi sert l'énergie ? pourquoi mon familier ne gagne rien aujourd'hui (pas nourri) sans que rien ne me le dise au moment où je complète une quête ? pourquoi le coup final ne passe pas (verrou corvées du boss — bon design, mais opaque pour l'enfant) ?

**Fluidité** : les gros freins relevés par l'audit du 24 juillet (6 systèmes de nav superposés, collisions de noms « Semaine »/« Calendrier ») sont soit corrigés, soit en file 👤. Restent : la double économie boutique (récompenses réelles vs cosmétiques vs coffres dans le même écran), et la validation parent qui peut prendre des heures (aucune relance/notification côté parent).

**Cohésion** : 8/10. Un système par intention, peu de doublons — sauf la couche thèmes famille (`THEMES`) vs thèmes joueur (`PLAYER_THEMES`), héritage legacy à unifier un jour.

---

## Volet 2 — Analyse compétitive des mécaniques

Mécaniques comparées à périmètre équivalent (boucle centrale, monnaies, compagnon, régularité, social, punition, validation parent, récompenses réelles).

| Mécanique | **Livre de Quêtes** | Habitica | Finch | Joon | Nipto | Sweepy | Pokémon Smile |
|---|---|---|---|---|---|---|---|
| **Boucle centrale** | Quête → validation parent → XP+🪙 → boutique/boss | Habitudes/Dailies → XP/or, dégâts si raté | Objectifs perso → énergie → aventure du birb | Quête → validation parent → 🪙 → nourrir le Doter | Corvées → points → couronnement du dimanche | Corvées planifiées → points → leaderboard | Brossage 1×/jour → capture de Pokémon |
| **Monnaies/compteurs** | 6 (XP, 🪙, énergie, jetons, XP familier, badges) | 4+ (XP, PV, or, gemmes 💵, mana) | 2 (énergie, rainbow stones) | 1 (🪙) + niveaux du Doter | 1 (points) | 1 (points) | 0 (collection) |
| **Compagnon** | Familier optionnel (acheté/loot), XP si nourri, attaque le boss | Pets/montures à collectionner (éclosion), passifs | **Le birb EST le jeu** — grandit, voyage, s'habille | **Le Doter EST le jeu** — nourri par l'effort | — | — | Pokémon à collectionner |
| **Régularité/streaks** | Calculée mais **jamais récompensée** | Streaks + multiplicateurs (anxiogène) | Pierres pour 2/4/6 jours/catégorie — **pardonne les trous** | Progression du Doter continue | Cadence hebdo forte (dimanche) | Planning auto par pièce | Tampons/calendrier, douceur |
| **Social** | Coopératif : boss d'équipe, dons, fil familial | Parties/guildes; **dailies ratées blessent l'équipe** | Amis « tree town », encouragements | Fratrie côte à côte (pas d'équipe) | **Compétition** familiale hebdo | **Leaderboard** familial | Solo |
| **Punition** | Quasi nulle (reset 🪙 hebdo) | PV perdus, mort du perso, équipe pénalisée | **Zéro** | Zéro (Doter jamais malade — choix assumé) | Perdre la semaine | Bas du classement | Zéro |
| **Validation parent** | Oui, avec refus doux + undo | Non (autonome adulte) | Non | **Oui — cœur du produit** | Oui (points bonus) | Non | Non (présence implicite) |
| **Récompenses réelles** | Catalogue 🪙 (écran, dessert, sorties) | Custom « rewards » en or | Non | **Oui, fixées par le parent** | Récompense du gagnant | Custom | Non |
| **Modèle éco** | Gratuit, aucun achat réel | Gratuit + gemmes 💵 + abo | Freemium + abo (~10 $/mois) | **Abo 12,99 $/mois** | Freemium | Freemium | Gratuit |
| **Public** | 4 enfants neurodivergents précis | Adultes | Ados/adultes (self-care émotionnel) | Enfants TDAH 6-12 + parents | Familles/colocs | Familles/colocs | Enfants (brossage) |

**Lectures clés du tableau :**
- Sur la **punition** et le **coopératif**, Livre de Quêtes est déjà au meilleur standard (Finch/Joon), devant Habitica/Nipto/Sweepy.
- Sur le **compagnon émotionnel**, Joon et Finch sont devant : leur pet est le *centre* de la boucle (chaque effort le nourrit visiblement, immédiatement). Chez LdQ le familier est périphérique : optionnel, conditionnel (nourri ce jour), et muet au moment de l'effort.
- Sur la **régularité**, Finch a le meilleur modèle du marché pour un public anxieux : récompenser « N jours sur la période » au lieu de séries consécutives cassables. LdQ a l'infrastructure (streakOf, check-ins, semaine de garde) mais ne paie rien.
- Sur la **cadence rituelle**, Nipto (couronnement du dimanche) et Pokémon Smile (session quotidienne unique célébrée) montrent la force d'un rendez-vous fixe. Le boss de LdQ — sa meilleure mécanique — n'a aucun rythme.
- Sur la **compression de gratification**, Joon est la référence (récompense instantanée, visuelle, incarnée par le Doter). LdQ a un trou entre le tap enfant et la validation parent.

---

## Volet 3 — Avantages/inconvénients croisés, manques à gagner, opportunités

### 3.1 Avantages décisifs de Livre de Quêtes (à protéger)

1. **Univers cohérent + coopératif familial** — aucune app n'a « famille qui vainc un boss ensemble ». Habitica a les parties mais punit ; Nipto/Sweepy divisent (compétition).
2. **Accessibilité neurodivergente native** (calme/focus/police/décompte) — supérieure à tout le marché, y compris Joon qui cible pourtant le TDAH.
3. **Semaine de garde** — unique au marché, structurellement impossible à copier pour les apps génériques.
4. **Gratuit, sans achat réel, sans loot payante en argent** — vs Joon 12,99 $/mois, Habitica gemmes, Finch abo. (Les coffres restent en monnaie de jeu uniquement.)
5. **Leviers parent complets** (undo, ajustements, refus doux, propositions d'enfants) — plus riches que Joon.

### 3.2 Inconvénients face à la compétition

1. **Compagnon périphérique** là où Joon/Finch en font le moteur émotionnel central.
2. **6 compteurs** vs 1-2 chez tous les compétiteurs enfants — charge cognitive à contre-emploi du public.
3. **Aucune récompense de constance** vs Finch (pierres 2/4/6 jours) et Habitica (streaks).
4. **Gratification suspendue à la validation parentale** sans feedback riche immédiat, vs Joon.
5. **Pas de cadence rituelle** (boss manuel, pas de rendez-vous hebdo) vs Nipto/Pokémon Smile.
6. **Endgame court** (niv 10 / 2 600 XP) vs Habitica (profondeur infinie) et Finch (croissance continue du birb).
7. **Reset hebdo qui punit l'épargne** — aucun compétiteur ne confisque la monnaie gagnée.

### 3.3 Manques à gagner & opportunités (priorisés par impact/effort)

**A. Impact fort, effort modéré — candidats à scoper avec Gen :**
1. **Faire du familier (ou de l'avatar) le témoin immédiat de l'effort** — réaction visible du compagnon à CHAQUE « J'AI FAIT ÇA! » (saut de joie, cœur, « en attente de maman » pendant le pending) : comprime le gap de gratification (modèle Joon) sans toucher au flux de validation. Synergie directe avec la Phase 5 de la refonte visuelle (humeurs avatar) — étendre la machine à états au familier coûte peu.
2. **Bonus de constance façon Finch, calé sur la semaine de garde** : « actif 3/5/7 jours cette semaine de garde » → petits bonus (pièces/cadre/nourriture familier). Pardonne les trous (pas de série cassable), réutilise `streakOf`/check-ins existants. Corrige au passage le badge `b_streak3`.
3. **Tirelire protégée** : l'enfant peut « verrouiller » des pièces vers UNE récompense-objectif choisie ; le verrou survit au reset du vendredi. Transforme le reset (punitif pour l'épargnant) en outil d'apprentissage de la gratification différée. Décision d'économie → 👤 avec Gen.
4. **Boss à cadence rituelle** : boss automatique chaque semaine de garde (lancé le samedi, victoire visée avant jeudi soir), difficulté auto-calibrée sur le nombre de quêtes prévues. Le parent garde un veto/ajustement. Donne un rendez-vous type « dimanche Nipto » + réutilise la meilleure mécanique existante.

**B. Corrections rapides 🤖 (bugs de design confirmés, autonomes) :**
5. Fix célébration « semaine parfaite » (`pendingCelebration` → `pendingCelebrations`, `App.jsx:5270`).
6. Définir réellement `frame_maitre_de_soi` (item + sprite) ou le remplacer par une récompense existante.
7. Dédupliquer l'octroi de victoire boss (garde d'idempotence sur les +40🪙/+50 XP).
8. Renommer/refaire `b_streak3` en badge « 6 quêtes en un jour » assumé (et créer un vrai badge de constance quand #2 existera).
9. Brancher `titleF`/`levelsF` selon le genre du profil (les filles reçoivent des titres masculins).
10. Message contextuel « ton familier a faim, il ne gagne pas d'XP » au moment de compléter une quête familier non nourri (l'info existe, elle n'est juste pas montrée au bon moment).

**C. Chantiers plus gros 👤 (décision de Gen requise) :**
11. **Rationaliser les monnaies** : clarifier ou fusionner l'énergie (option : la supprimer et re-thématiser ses coûts en pièces ; option : la renommer « repos du héros » avec un rôle unique). Grosse décision d'économie.
12. **Endgame/saisons** : prestige au niveau 10 (recommencer avec un cadre doré), ou « saisons » alignées sur les semaines de garde avec récompense de fin de saison.
13. **Mini-jeux intégrés à la boucle** : en récompense d'objectifs du jour complétés (au lieu de level-up seulement).
14. Question loot-box des coffres (déjà en file 👤 — l'analyse compétitive note qu'aucune app enfant du marché n'a de coffres à odds, même en monnaie de jeu).
15. Notification/relance côté parent pour raccourcir le délai de validation (mécanique Joon : le parent est un maillon de la boucle de dopamine de l'enfant).

### 3.4 Ce qu'il ne faut PAS copier

- **Habitica** : dégâts/PV/mort, streaks cassables, pression d'équipe négative (dailies ratées qui blessent les coéquipiers) — anxiogène, anti-indiqué pour le public.
- **Nipto/Sweepy** : classement/gagnant unique hebdo — à 4 enfants d'âges et de capacités différents, le même podium chaque semaine démotiverait les autres.
- **Joon** : paywall de la boucle centrale.
- Ne pas ajouter de 7e compteur, quelle que soit l'idée.

---

## Volet 4 — Équilibre économique chiffré (ajouté le 25 juillet au soir)

_Données : code (catalog.js, recurring.js, sprites.jsx) + lecture seule de la prod (`GET /api/famille`) le 25 juillet ~22 h 40._

### 4.1 Verdict

**Fondations saines, économie déséquilibrée sur 4 axes — et les données de prod le prouvent comportementalement.** Ce qui est sain : chaque tâche paie exactement pièces = XP÷2 (cohérence parfaite sur les 47 entrées du catalogue), et le plafond anti-farm des tâches créées par les enfants (2-6 🪙) fonctionne (vérifié en prod : les 6 tâches enfants actives sont toutes à 2-6 🪙).

### 4.2 Les revenus — ce qu'un enfant peut gagner

| Source | Montant | Réf |
|---|---|---|
| Tâche easy / medium / hard / boss | 5-12 / 10-15 / 18-20 / 22-35 🪙 | `catalog.js:8-66` |
| Rotation auto de la semaine de garde (4 rôles/jour) | 24-38 🪙/jour selon le rôle + ménage cocon 15 🪙 aux 2 jours | `recurring.js:120-192` |
| Objectifs du jour (3 quêtes / 6 quêtes / 60 XP) | +5 / +10 / +10 🪙, 1×/jour | `App.jsx:2368` |
| Victoire de boss | +40 🪙 (tous) | `App.jsx:5615` |
| Tâches perso quotidiennes (pilules, jouer calmement) | +30-40 🪙/jour — **seulement Elli et Antoine Emery** | `recurring.js:134-143` |

**Potentiel hebdomadaire auto-généré, semaine courante (calculé depuis la prod)** : Antoine Emery **~541 🪙** (48 instances), Elli **~500** (42), Antoine DR **~288** (28), Olivier **~253** (25). Écart de **2,1×** entre fratrie, créé par les tâches perso quotidiennes qui paient comme des corvées.

### 4.3 Les prix — ce que ça coûte

- **Récompenses réelles** (`priceOf` = base ×3) : bonbon **60**, débarrasse/musique **75**, dessert/servi **90**, parent/jeu/déj-souper **105**, écran/bain **120**, déj au lit **135**, souper **165**, épicerie **180**, dépanneur **210**, ricochet **240**, esclave **270**, pas de tâches **450**.
- **Cosmétiques** (base ×3) : commun 30, rare 60, ultra 90, légendaire 135, unique 180.
- **Coffres** (prix directs, PAS de ×3) : 80 / 170 / 320 + 30 énergie.
- La doc PDF v2.5.22 décrit un `priceOf(item, ownedCount)` à prix progressif — **inexact** : le code applique un ×3 fixe (erratum à corriger dans la doc).

### 4.4 Les 4 déséquilibres

1. **Inégalité de revenus 2,1×** (§4.2). Conséquence dure : avec le reset du vendredi, « Pas de tâches aujourd'hui » (450 🪙) est **mathématiquement inatteignable pour Olivier et Antoine DR** (253 + 175 d'objectifs = 428 max sur une semaine parfaite).
2. **La boucle effort → privilège réel ne ferme pas.** Preuve prod (6 semaines) : **4 récompenses réelles achetées, toutes par Elli**, contre ~100 acquisitions cosmétiques (owned : 23/26/13/41). Trois causes cumulées : (a) prix ×3 — un bonbon = une journée parfaite, 15 min d'écran = ~2 jours d'effort ; (b) **rotation quotidienne de la boutique** (`weeklyRewards(8)`, App.jsx:26) : 8 récompenses sur 17 visibles par jour — impossible d'épargner vers un item invisible, et c'est du FOMO involontaire ; (c) cosmétique permanent vs récompense consommable — à prix comparable, l'enfant choisit rationnellement le chapeau.
3. **Taux à la minute inversé** (via `DIFF_EST_MIN` 8/18/25/30 min) : easy ≈ **1,0 🪙/min**, medium ≈ 0,7-0,8, hard ≈ 0,72-0,8, boss ≈ 0,8-1,2. La difficulté paie MOINS à la minute → incitation à spammer le facile.
4. **Coffres surpayés de 50-64 %.** Valeur espérée en équivalent achat direct : Commun ~39 🪙 de valeur pour 80 payés (49 %) ; Légendaire ~116 pour 320 (36 %) — avant même le risque doublon (remboursé base÷3, ex. 15 🪙 sur un légendaire). Une « taxe de hasard » énorme, payée surtout par Antoine DR (41 items).

### 4.5 Constats annexes

- **Courbe XP épuisée** : Antoine Emery 3158 XP (> cap 2600, niveau max atteint), Elli 2279 (niv 9), Antoine DR 1780 et Olivier 1525 (niv 8) — après ~6 semaines. L'endgame manquant est un problème actuel, pas futur.
- **Badges `coinsLifetime` 100/300** instantanément acquis au seed (113-1176) — décoratifs désormais.
- **Énergie** : recharge complète en 3 h — c'est une friction, pas une rareté (≈5-6 achats possibles par après-midi). Et c'est un patron « jeu mobile » que la philosophie anti-dépendance (Volet 5) recommande d'éliminer.
- **Bug UTC corrigé (v2.5.24)** : `custodyWeekKey` basculait au lendemain après 20 h → reset des pièces en boucle (les 4 comptes vidés le 25 au soir, dont 1176 🪙 d'Antoine DR sans dépense) + régénération de la semaine avec un autre shuffle (cause racine probable des orphelins v2.5.22). Soldes de référence pour restitution éventuelle : AE 408, Elli 51, Olivier 228, Antoine DR 1176.

### 4.6 Recommandations de rééquilibrage (décisions 👤 Gen)

1. **PRICE_MULT différencié** : cosmétiques ×3 (inchangé), récompenses réelles ×1,5-2 → bonbon 30-40, écran 60-80, « pas de tâches » 225-300. La boucle parentale peut enfin fermer pour les 4 enfants.
2. **Récompenses réelles affichées EN PERMANENCE** (les 17) ; la rotation quotidienne reste pour les cosmétiques seulement.
3. **Équité** : une tâche perso quotidienne payée pour Olivier et Antoine DR aussi (chacun son défi personnel), ou plafond de prix calé sur le potentiel du moins riche.
4. **hard/boss +20-30 % de pièces** pour remettre le taux/minute à l'endroit.
5. **Coffres ~50/120/250** ou garantie anti-doublon (pity) — à trancher avec la question loot-box.
6. **Tirelire protégée** (épargne verrouillée vers UNE récompense-objectif, survit au vendredi).
7. **Niveaux 11+** (ou prestige/saisons) — urgent, voir 4.5.
8. **Restitution des soldes effacés** par le bug UTC (montants en 4.5), via l'outil d'ajustement existant.

---

## Volet 5 — Synthèse des deux contre-analyses externes (25 juillet au soir)

Gen a reçu deux critiques complémentaires. Elles sont excellentes ET partiellement contradictoires — voici l'arbitrage.

### 5.1 Critique « RPG familial vivant »

Thèse : Livre de Quêtes n'est plus une app de tâches mais un **jeu de progression familiale** — ses références deviennent Nintendo/Animal Crossing/Pokémon, pas Habitica. Ce qui manque n'est pas une mécanique mais de la **mise en scène**. Idées fortes retenues : micro-récompenses immédiates au tap (carte qui explose en étoiles, +1 jeton visible, personnage qui saute — sans tricher sur la validation parentale) ; jalons de niveaux transformateurs (niv 3 → sac, niv 5 → cape, niv 7 → décor, niv 10 → compagnon) ; familier = cœur émotionnel vivant (cherche, dort, s'ennuie, célèbre, accompagne) ; boss = événement (apparition, rugissements, états, phase 2, coffre de victoire) ; collections (monstres rencontrés, boss vaincus, titres, autocollants) ; « presque » (« plus qu'une quête → niveau suivant ») ; village + PNJ donneurs de quêtes (long terme).

### 5.2 Critique « anti-dépendance bienveillante »

Thèse : le succès de l'app se mesure **au temps passé à vivre en dehors d'elle**. Bannir tout FOMO : pas de récompense quotidienne à ne pas manquer, pas de série cassable, pas d'objet « seulement aujourd'hui », pas de coffre à réclamer, pas de minuterie artificielle. La boucle doit se **fermer** : tâche → validation → grande célébration → **l'app devient calme**. Idées fortes retenues : **écran de repos** (toutes les quêtes faites → ambiance de soir, feu de camp, familier qui dort, « Profite de ta soirée » — aucun bouton ne clignote) ; familier apaisant, jamais Tamagotchi anxiogène (il dort, ne réclame rien, n'est pas puni) ; « le monde continue sans toi » (rien ne se perd en ton absence) ; récompenses réelles qui font **quitter l'app** (cabane, pique-nique, lecture avec papa/maman) ; **coach qui s'efface** (les aides s'estompent avec les niveaux — le jeu « gagne » quand l'enfant n'en a plus besoin).

### 5.3 Arbitrage (principe directeur pour tous les chantiers)

> **Mise en scène et célébration : OUI. Rétention et urgence : NON.**

- ✅ Retenu des deux : célébrations riches, familier vivant ET apaisant, boss-événement, jalons de niveaux, collections permanentes, village/PNJ (sans quêtes à expiration), micro-feedback immédiat au tap, écran de repos, récompenses réelles orientées monde réel.
- ❌ Rejeté (FOMO, contraire à la mission) : marchands itinérants/soldes/objets du jour, boutique « rendez-vous quotidien », saisons à récompenses manquables (une saison = décor + contenus qui REVIENNENT, jamais des exclusivités perdues), bonus de connexion, coffre gratuit périodique.
- 🔧 À corriger dans l'existant au nom de ce principe : la **rotation quotidienne des récompenses réelles** (FOMO involontaire, voir Volet 4) et le **système d'énergie** (patron mobile de rétention/friction sans bénéfice pour l'enfant).
- La cible comportementale à récompenser reste la **constance douce façon Finch** (« 3/5/7 jours actifs cette semaine de garde », jamais une série cassable).

---

## Sources externes (mécaniques compétiteurs, consultées 2026-07-25)

- Habitica : [features officielles](https://habitica.com/static/features), [wiki Gamification](https://habitica.fandom.com/wiki/Gamification), [Wikipedia](https://en.wikipedia.org/wiki/Habitica)
- Finch : [Energy (wiki)](https://finch.fandom.com/wiki/Energy), [Rainbow Stones (wiki)](https://finch.fandom.com/wiki/Rainbow_Stones), [Energy vs Rainbow Stones (aide officielle)](https://help.finchcare.com/hc/en-us/articles/37780134479757-Energy-vs-Rainbow-Stones)
- Joon : [Joon App Review 2025 (ChoosingTherapy)](https://www.choosingtherapy.com/joon-app-review/), [revue 2026 (Timily)](https://timily.app/guides/joon-app-review/), [blog Joon](https://www.joonapp.io/post/adhd-video-game)
- Nipto : [Google Play](https://play.google.com/store/apps/details?id=com.nipto.niptoapp&hl=en), [App Store](https://apps.apple.com/us/app/nipto-split-chores/id1504877473)
- Sweepy/OurHome : [comparatif apps familiales 2026 (NestBoard)](https://mynestboard.com/blog/best-family-chore-apps)
