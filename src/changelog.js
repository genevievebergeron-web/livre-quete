// ─── CHANGELOG ───────────────────────────────────────────────
// Extrait d'`App.jsx` le 2026-08-06 (Lot 5/#24, vingt-troisième incrément). Donnée pure, zéro
// dépendance : la liste des versions affichée dans le fil famille à chaque mise à jour. Elle vit
// dans son propre module parce qu'elle a DEUX consommateurs — `migrations.js` (calcul des
// versions jamais vues, dans `migrateSavedData`) et `App.jsx` (affichage des nouveautés).
// ⚠️ À CHAQUE nouvelle version : ajouter l'entrée EN TÊTE de ce tableau (voir APP_VERSION dans App.jsx).

export const CHANGELOG = [
  { version:"2.16.77", date:"2026-08-17", features:[
    "✏️ Changer le nom ou la couleur d'un enfant dans le livre ne tenait pas : la modification repartait, puis l'ancien nom revenait tout seul à la synchro suivante. Corrigé — c'est maintenant la dernière modification qui gagne, comme pour le pseudo.",
    "🚪 Le verrou du matin et le budget-temps quotidien (réglages parent) pouvaient se remettre tout seuls à leur ancienne valeur : un appareil resté en retard imposait son vieux réglage à tout le monde. Ce que le parent règle en dernier tient maintenant partout.",
  ] },
  { version:"2.16.76", date:"2026-08-16", features:[
    "🎁 Quand tu rangeais une récompense de la boutique pour en faire apparaître une autre, elle revenait toute seule quelques secondes plus tard. Et à l'inverse, de vieilles récompenses rangées il y a des semaines pouvaient disparaître d'un coup de ta boutique du jour, sans que tu y touches. Les deux sont réglés : ce que tu ranges reste rangé pour la journée, et rien d'autre ne bouge.",
    "⏰ Le rituel que tu choisis (☀️ Matin, 🌙 Soir…) et ta bascule « 📋 Mes tâches / ⏰ Rituels » pouvaient être remis à l'ancien choix par un autre appareil de la maison resté en retard. Maintenant c'est toujours le choix le plus récent qui gagne, c'est-à-dire le tien.",
  ]},
  { version:"2.16.75", date:"2026-08-16", features:[
    "🛡️ La vérification automatique ajoutée la semaine dernière (celle qui refuse de laisser sortir une version où un réglage périmé peut écraser un réglage tout neuf) ne surveillait que les réglages de la famille. Tout ce qui t'appartient personnellement — ta maison, tes rituels, le surnom de ton familier, tes paliers de défi, le dernier jour où tu as ouvert l'app — n'était pas couvert. C'est justement là que les 4 derniers bugs de ce genre se cachaient.",
    "🔍 Maintenant elle regarde aussi tes affaires à toi, et elle refuse en plus de se laisser endormir : si un réglage se retrouve avec la même valeur des deux côtés du test, elle le signale au lieu de faire semblant de le surveiller.",
  ]},
  { version:"2.16.74", date:"2026-08-16", features:[
    "🏅 Les badges « As du Ménage », « Marmiton », « Roi des Routines », « Casse-Cou » et « Aventurier du Dehors » comptaient tes quêtes en repassant par la liste des tâches d'aujourd'hui. Résultat : dès que ton parent effaçait une tâche, ou dès qu'une quête rotative changeait de semaine, les fois où tu l'avais faite ne comptaient plus. 259 des 442 quêtes déjà accomplies dans la famille (59 %) avaient disparu de ces compteurs.",
    "🔢 Maintenant, chaque quête validée est comptée dans son étiquette au moment même de la validation, pour toujours. Ton avancement vers ces badges ne peut plus redescendre — et plus rien n'efface le travail que tu as déjà fait.",
  ]},
  { version:"2.16.73", date:"2026-08-16", features:[
    "🎨 Le thème de la famille pouvait changer tout seul. Une tablette restée en retard de quelques jours remettait l'ancien thème pour tout le monde dès qu'elle se synchronisait — même si personne n'avait rien demandé, même si quelqu'un venait tout juste d'en choisir un autre. Maintenant c'est le dernier choix fait qui gagne, peu importe l'appareil.",
    "🎁 Les récompenses maison de ton parent (celles qu'il écrit lui-même dans l'assistant) pouvaient disparaître de la même façon, et une récompense déjà achetée perdait son nom dans ta liste. Réglé aussi.",
    "🛡️ Et une nouvelle vérification automatique refuse maintenant de laisser sortir une version où un réglage périmé peut écraser un réglage tout neuf. C'est la 7e fois que ce genre de bug se produisait — c'était la dernière.",
  ]},
  { version:"2.16.72", date:"2026-08-16", features:[
    "🏠 Ta maison ne gardait pas ce que tu y mettais. Quand tu posais un tapis, une plante ou une affiche, le nuage pouvait te renvoyer la version d'avant quelques secondes plus tard, et ton meuble disparaissait tout seul. Sur deux tablettes, la déco de l'une pouvait carrément effacer celle de l'autre. Maintenant c'est le dernier changement qui gagne, et un meuble que tu enlèves reste enlevé.",
    "🌅 Le message « Nouvelle journée! » se réaffichait parfois pour une journée que tu avais déjà ouverte. Réglé.",
  ]},
  { version:"2.16.71", date:"2026-08-15", features:[
    "☁️ Le nuage ne suivait pas les mêmes règles que l'app pour huit choses, et il les jetait en silence : ton temps d'écran du jour repartait plus bas que la vraie durée, la fête d'un rituel déjà célébré revenait, le surnom de ton familier disparaissait, une annonce balayée réapparaissait, et les annonces de ton parent, tes propositions de quête et tes demandes de retrait pouvaient s'effacer avant même qu'il les voie.",
    "🪙 Pire : le bonus du défi de la semaine (3 jours → +10 🪙, 5 → +15, 7 → +25) pouvait être repayé, parce que la trace « déjà payé » n'était protégée nulle part. C'est réparé des deux côtés.",
    "🛡️ Et pour que ça ne recommence pas : une vérification automatique compare maintenant les deux moitiés de la synchro à chaque nouvelle version. Si elles ne disent pas exactement la même chose, la version ne peut plus sortir.",
  ]},
  { version:"2.16.70", date:"2026-08-15", features:[
    "⏰ Modifier un rituel ne tenait pas. Renommer « Routine du matin », changer son émoji, ajouter ou retirer une quête dedans : ça marchait sur ta tablette, puis la version d'avant revenait dès la synchro suivante, sans un mot. Le nuage gardait toujours sa première version du rituel et refusait tout le reste.",
    "🧹 Du coup, les quêtes effacées restaient collées dans les rituels : les 3 rituels d'Antoine Emery traînaient 5 quêtes supprimées que le ménage automatique n'arrivait jamais à enlever. C'est réparé — la version la plus récente gagne, et supprimer un rituel le supprime toujours pour de bon.",
  ]},
  { version:"2.16.69", date:"2026-08-15", features:[
    "⏱ Terminer ton rituel chronométré ne comptait pas comme une journée active. Tu avais beau finir ta routine au complet, l'app te disait « +XP 🎉 » et ta série 🔥 restait à zéro pour la journée, comme si tu n'avais rien fait.",
    "🔥 C'est réparé : un rituel terminé allume ta journée tout de suite, pour ta série comme pour ta ligue de la semaine.",
  ]},
  { version:"2.16.68", date:"2026-08-15", features:[
    "⚡ Le bouton « VALIDER SANS CODE » que ton parent utilise quand il est à côté de toi donnait bien l'XP et les pièces, mais rien d'autre : pas d'heure au journal de ta journée, rien dans la courbe d'XP de ta fiche, aucun badge même si tu venais de franchir un palier, aucun jeton pour taper sur le boss, rien au fil de la famille, et aucune fête.",
    "🎉 Maintenant c'est une vraie validation, exactement comme celle du portail : badge, montée de niveau, jeton de boss, message au fil de famille, et ta surprise qui part dès que ton parent te redonne l'appareil.",
  ]},
  { version:"2.16.67", date:"2026-08-15", features:[
    "📅 Un événement ajouté à plusieurs enfants d'un coup se modifie enfin pour tout le monde. Avant, le crayon ✏️ ne changeait que la copie de l'enfant dont on avait touché la ligne, sans le dire : « Soirée cinéma » est devenue un rendez-vous hebdomadaire pour un seul des quatre, et est restée une soirée unique du 30 juillet pour les trois autres.",
    "👀 Le formulaire de modification montre maintenant à quels enfants le changement s'applique, et laisse décocher ceux qu'on veut laisser tranquilles.",
  ]},
  { version:"2.16.66", date:"2026-08-14", features:[
    "\u23f3 Le compteur \u00ab temps de jeu aujourd'hui \u00bb comptait les heures o\u00f9 l'app dormait dans le fond de l'\u00e9cran, ou celles o\u00f9 la tablette \u00e9tait en veille. Une journ\u00e9e sans une seule qu\u00eate y a \u00e9t\u00e9 enregistr\u00e9e comme 7 h 45 de jeu.",
    "\ud83d\udee1\ufe0f Maintenant le temps ne court que pendant que tu es vraiment dans l'app. L'\u00e9cran de pause ne peut donc plus se d\u00e9clencher pour du temps que tu n'as pas jou\u00e9.",
  ]},
  { version:"2.16.65", date:"2026-08-14", features:[
    "📈 La courbe d'XP de ta fiche profil montrait n'importe quoi : une montagne géante sur une seule journée (jusqu'à 6000 XP le 9 août, plus que tout ce que tu as gagné depuis le début) et tout le reste écrasé à plat.",
    "🧮 En cause : chaque synchro entre tes appareils recopiait ton journal d'XP au complet par-dessus lui-même. 2 quêtes devenaient 4, puis 8, puis 500. C'est réparé, et ton journal se remet tout seul d'aplomb au prochain chargement.",
  ]},
  { version:"2.16.64", date:"2026-08-14", features:[
    "🔥 Ta série compte enfin le jour où TU as fait la quête, pas le jour où le parent l'a validée. Avant, une quête faite samedi et validée dimanche donnait le crédit à dimanche — et samedi ne comptait pas du tout.",
    "📅 Les journées perdues comme ça t'ont été rendues : 12 jours de travail remis aux 4 enfants, et les « jours actifs cette semaine » de ton profil sont enfin les bons.",
  ]},
  { version:"2.16.63", date:"2026-08-14", features:[
    "⏰ Le rituel que tu choisis reste choisi. Avant, si tu prenais « 🌙 Soir » et que tu allais voir « 📋 Mes tâches » deux secondes, revenir sur « ⏰ Rituels » te ramenait au rituel du matin — sans rien dire.",
    "🗂️ Ça marche aussi pour la puce « Tout », et ton choix tient jusqu'à ta prochaine connexion.",
  ]},
  { version:"2.16.62", date:"2026-08-14", features:[
    "🪙 Une récompense déjà remboursée pouvait être remboursée encore, et redonner toutes ses pièces une fois par semaine, sans jamais avoir été rachetée. Un remboursement compte maintenant pour l'achat qu'il annule : une seule fois par achat.",
    "🛒 Si tu rachètes vraiment la même récompense plus tard, tu peux évidemment changer d'idée à nouveau — ça, ça n'a pas changé.",
  ]},
  { version:"2.16.61", date:"2026-08-13", features:[
    "➕ « Ajouter une quête à ma journée » disait « Quête ajoutée! » et la quête n'apparaissait nulle part. Ça arrivait dès qu'un rituel ⏰ était sélectionné : ta nouvelle quête n'appartenait à aucun rituel, donc l'écran la cachait tout de suite. Elle s'affiche maintenant tout de suite, rituel ou pas.",
    "🔎 Pareil pour la grille « ➕ Choisis une quête » : ce que tu prends dedans reste visible, même en mode Rituel.",
    "🧷 Et si la quête que tu ajoutes porte le même nom qu'une autre déjà prévue ailleurs dans ta semaine, c'est la tienne, celle que tu viens d'ajouter, qui reste à l'écran.",
  ]},
  { version:"2.16.60", date:"2026-08-13", features:[
    "🔓 « BOUTIQUE VERROUILLÉE — fais encore 2 tâches rotatives » pouvait s'afficher les jours où AUCUNE tâche rotative n'existait : une semaine sur deux (hors semaine de garde), et dès qu'on passait en mode Rituel ⏰. Le compteur restait à 0/2 pour toujours, impossible à faire monter.",
    "🎨 Même chose pour le bouton « personnaliser mon perso » : il refusait de s'ouvrir avec la même consigne impossible. Les deux s'ouvrent maintenant normalement quand il n'y a pas de tâche rotative dans ta journée.",
    "✅ Quand il y a bien des tâches rotatives, rien ne change : il en faut toujours 2 pour débloquer. Et s'il n'y en a qu'une seule aujourd'hui, on ne t'en demande qu'une (0/1 au lieu de 0/2).",
  ]},
  { version:"2.16.59", date:"2026-08-13", features:[
    "🎲 La boutique dit « les récompenses changent » depuis toujours… et elle n'a jamais changé. Le tirage du jour sortait exactement les mêmes récompenses, dans le même ordre, tous les jours de l'année. C'est réparé : à partir de maintenant la boutique se renouvelle vraiment chaque jour.",
    "🎁 Une récompense que tu as déjà prise reste affichée même si le tirage du jour ne la ressort pas — avec ses boutons « J'ai changé d'idée » et « ✓ Cacher ». Si une récompense payée avait disparu de ton écran, elle est de retour.",
    "🐣 Même correction pour les évolutions de ton familier : les deux éléments proposés ne suivaient plus une liste figée d'un palier à l'autre.",
  ]},
  { version:"2.16.58", date:"2026-08-13", features:[
    "✔️ Encore des quêtes en double, et cette fois c'était le NOM qui comptait : « Salle de bain », « Prendre une collation », « Me changer »… revenaient deux fois dans ta journée, et « Tâche de rituel (à renommer) » jusqu'à vingt fois. C'étaient des tâches différentes portant le même nom — la correction de la semaine dernière ne pouvait pas les voir. Il n'en reste qu'une par nom.",
    "🕐 Une même tâche prévue à deux moments différents (les dents le matin ET le soir) reste bien deux cases : c'est le nom PLUS l'heure PLUS le jour qui comptent.",
    "✅ Et si tu avais déjà coché une case aujourd'hui, c'est celle-là qui reste — ta coche ne disparaît pas avec la mise à jour.",
  ]},
  { version:"2.16.57", date:"2026-08-13", features:[
    "🎁 Dans la boutique, onglet Récompenses : quand tu tapes sur une récompense que tu ne peux pas prendre, l'appli te dit enfin pourquoi. Avant, il ne se passait absolument rien — ni son ni message. Maintenant : « il t'en manque 25 » si c'est les pièces, ou « reviens dans ~20 min » si ton héros se repose.",
    "🔒 Et une récompense que tu ne peux pas prendre tout de suite s'affiche grisée avec un cadenas, comme partout ailleurs dans le jeu — au lieu de montrer « Acheter » en or et de refuser après coup.",
  ]},
  { version:"2.16.56", date:"2026-08-12", features:[
    "🎁 La boutique respecte enfin les récompenses cochées par le parent. Elle tirait dans le catalogue complet et ignorait la page « Récompenses » de l'assistant : ce soir encore, 4 des 8 récompenses offertes aux enfants étaient des récompenses qui avaient été décochées.",
    "🛠️ Côté parent : décocher une récompense tient maintenant après une synchro (avant, l'autre appareil la remettait), et les récompenses maison créées avec « + Récompense personnalisée » peuvent enfin apparaître en boutique. Une récompense à 0 pièce n'y va jamais — elle serait gratuite à l'infini.",
  ]},
  { version:"2.16.55", date:"2026-08-12", features:[
    "✔️ Fini les quêtes en double dans ta journée : « Bon déjeuner », « Sac à dos » ou « Vider ma boîte à lunch » apparaissaient 3, 4, parfois 5 fois, chacune avec sa propre case à cocher. Il n'en reste qu'une seule par quête, et cocher fonctionne du premier coup.",
    "🛠️ Côté parent : le catalogue de l'assistant affiche « ✓ déjà ajoutée » avant qu'on reclique, et le portail marque les copies exactes qui restent à supprimer.",
  ]},
  { version:"2.16.54", date:"2026-08-12", features:[
    "🔄 Le bouton « Renvoyer » d'une annonce (portail parent) fonctionne enfin comme prévu : l'annonce redevient visible pour les enfants même si sa date était passée, un message confirme l'envoi, et le bouton disparaît une fois le renvoi fait au lieu de rester là et d'empiler des copies.",
  ]},
  { version:"2.16.53", date:"2026-08-12", features:[
    "🌟 Dans le portail parent, le compte de jours du défi de la semaine (« 3/7 jours ») additionnait aussi les coches des semaines d'avant. Il ne compte plus que la semaine en cours, comme les sept pastilles juste en dessous.",
  ]},
  { version:"2.16.52", date:"2026-08-11", features:[
    "📖 La page « Nouveautés » du portail parent montrait encore les nouveautés de juin (versions 1.2 à 1.26) et jamais les récentes. Elle affiche maintenant les 30 dernières versions, la plus récente en haut.",
  ]},
  { version:"2.16.51", date:"2026-08-11", features:[
    "⚡ L'app se rouvre plus vite après une mise à jour. Avant, chaque nouvelle version te faisait tout retélécharger; maintenant la grosse pièce commune reste gardée sur ton appareil. Rien ne change à ce que tu vois.",
  ]},
  { version:"2.16.50", date:"2026-08-10", features:[
    "🌗 « Contraste fort » va maintenant jusqu'au bout : les noms des onglets que tu n'as pas choisis (la barre du bas, les onglets de la Boutique…) s'éclaircissent eux aussi. Avant, ils restaient gris pâle pendant que le reste du texte devenait plus lisible.",
  ]},
  { version:"2.16.49", date:"2026-08-10", features:[
    "🌗 Nouveau réglage « Contraste fort » dans ⚙️ Mes réglages : éclaircit les petits textes gris et les cadres, si tu les trouves difficiles à lire. C'est éteint au départ, et ça ne change aucune couleur importante (l'or des prix, le rouge, le vert restent pareils).",
  ]},
  { version:"2.16.48", date:"2026-08-09", features:[
    "😄 Nouveau réglage « Messages rigolos » dans ⚙️ Mes réglages : si les blagues après une quête ne te tentent pas, tu peux les éteindre. C'est allumé au départ.",
  ]},
  { version:"2.16.47", date:"2026-08-09", features:[
    "🛠️ Petite fondation technique (rien de visible pour toi).",
  ]},
  { version:"2.16.46", date:"2026-08-08", features:[
    "🛠️ Petite fondation technique (rien de visible pour toi).",
  ]},
  { version:"2.16.45", date:"2026-08-08", features:[
    "🪙 Tes pièces ne disparaissent plus jamais au changement de semaine. Ce qui est à toi reste à toi.",
  ]},
  { version:"2.16.44", date:"2026-08-07", features:[
    "🧹 La liste « Choisis une quête » ne montre plus la même tâche dix fois : une seule carte par nom.",
  ]},
  { version:"2.16.43", date:"2026-08-07", features:[
    "⚡ L'app s'ouvre plus vite : elle ne charge plus au démarrage les écrans que tu n'utilises pas tout de suite.",
  ]},
  { version:"2.16.42", date:"2026-08-07", features:[
    "🛠️ Si jamais l'app bugge, tu vois maintenant un message clair et un bouton « Recharger » au lieu d'un écran blanc.",
    "🔧 Les pépins techniques sont notés automatiquement pour le parent (portail → Journal).",
  ]},
  { version:"2.16.41", date:"2026-08-06", features:[
    "🛠️ Petite fondation technique (rien de visible pour toi).",
  ]},
  { version:"2.16.40", date:"2026-08-06", features:[
    "🛠️ Petite fondation technique (rien de visible pour toi).",
  ]},
  { version:"2.16.39", date:"2026-08-06", features:[
    "🛠️ Petite fondation technique (rien de visible pour toi).",
  ]},
  { version:"2.16.38", date:"2026-08-06", features:[
    "🛠️ Petite fondation technique (rien de visible pour toi).",
  ]},
  { version:"2.16.37", date:"2026-08-05", features:[
    "🛠️ Petite fondation technique (rien de visible pour toi).",
  ]},
  { version:"2.16.36", date:"2026-08-05", features:[
    "🛠️ Petite fondation technique (rien de visible pour toi).",
  ]},
  { version:"2.16.35", date:"2026-08-04", features:[
    "🤝 Nouveau : fais une tâche « en équipe » avec ton frère/sœur! Invite-le/la depuis une de tes tâches — s'il/elle accepte, vous partagez l'XP et les pièces.",
  ]},
  { version:"2.16.34", date:"2026-08-03", features:[
    "🎖️ Nouveau : ta Ligue personnelle (Bronze/Argent/Or/Diamant) apparaît dans ton profil — basée sur TES propres jours actifs, jamais un classement avec tes frères/sœurs, et ton palier ne redescend jamais!",
  ]},
  { version:"2.16.33", date:"2026-08-03", features:[
    "📊 Ton profil affiche maintenant une courbe de tes 30 derniers jours d'XP!",
  ]},
  { version:"2.16.32", date:"2026-08-03", features:[
    "🛠️ Petite fondation technique pour les futures stats historiques (rien de visible pour toi).",
  ]},
  { version:"2.16.31", date:"2026-08-03", features:[
    "📅 L'onglet « Semaine » s'appelle maintenant « Calendrier » — il montre tes rendez-vous et événements en 7 colonnes. Tes tâches de la semaine, elles, ont déménagé dans « Quêtes » (nouveau bouton « Cette semaine » en haut à droite)!",
  ]},
  { version:"2.16.30", date:"2026-08-03", features:[
    "⛶ La Minuterie a déménagé dans l'onglet « Rituels » — plus facile à trouver quand tu en as besoin!",
  ]},
  { version:"2.16.29", date:"2026-08-03", features:[
    "👨‍👩‍👧‍👦 « Famille » a maintenant sa propre place dans la barre du bas!",
  ]},
  { version:"2.16.28", date:"2026-08-02", features:[
    "🗡️ L'onglet « Aujourd'hui » s'appelle maintenant « Quêtes »!",
  ]},
  { version:"2.16.27", date:"2026-08-02", features:[
    "🛡️ Petite amélioration technique côté serveur (rien de visible pour toi).",
  ]},
  { version:"2.16.26", date:"2026-08-02", features:[
    "🔒 Nouveau réglage parent : la Boutique et le personnalisateur peuvent maintenant demander de faire quelques tâches rotatives d'abord (réglable, désactivable). Le jeu indique clairement combien il en reste!",
  ]},
  { version:"2.16.25", date:"2026-08-02", features:[
    "✨ Petit coup de polish : ton avatar, ton niveau et tes pièces sont maintenant visibles direct dans l'onglet Aujourd'hui, et un petit 🔒 indique clairement les objets pas encore accessibles en Boutique.",
  ]},
  { version:"2.16.24", date:"2026-08-02", features:[
    "🔐 Portail parent réorganisé en 4 catégories (Suivi/Communication/Actions/Compte) au lieu de 8 onglets à plat — plus facile à naviguer. Le Journal sépare maintenant clairement les nouveautés des actions.",
  ]},
  { version:"2.16.23", date:"2026-08-02", features:[
    "👨‍👩‍👧‍👦 Vue Famille allégée : les cartes montrent maintenant juste l'essentiel (qui a fait quoi aujourd'hui) — XP/pièces/série restent dans le Profil détaillé.",
  ]},
  { version:"2.16.22", date:"2026-08-02", features:[
    "🪙 Tes pièces ne repartent plus à zéro le vendredi — ton solde reste le tien jusqu'à ce que tu dépenses!",
  ]},
  { version:"2.16.21", date:"2026-08-02", features:[
    "🎁 Coffres-surprise plus honnêtes : prix baissés (Commun 50, Rare 120, Légendaire 250) et garantie anti-doublon — tant qu'il reste un objet jamais eu dans ta bande de chance, tu l'obtiens en priorité!",
  ]},
  { version:"2.16.20", date:"2026-08-02", features:[
    "⚔️ Combat de boss : dès que le boss a perdu 70% de ses PV, un « COUP DE GRÂCE » apparaît — n'importe lequel des 4 membres de la famille peut l'achever, sans jeton!",
  ]},
  { version:"2.16.19", date:"2026-08-02", features:[
    "🎨 Les objets de la Boutique pas encore accessibles (trop chers ou énergie basse) s'affichent maintenant grisés en plus d'être atténués, pour être plus clairs d'un coup d'œil.",
  ]},
  { version:"2.16.18", date:"2026-08-02", features:[
    "🧹 Correctif : une tâche rotative manquée qui revient un autre jour ne s'affiche plus en double chez 2 enfants le même jour.",
  ]},
  { version:"2.16.17", date:"2026-07-30", features:[
    "🖥️ Sur tablette/ordinateur : les popups Archives, Signaler un bug, Réglages, Choix du thème et Choisir une quête restent maintenant lisibles au centre de l'écran au lieu de s'étirer d'un bord à l'autre.",
  ]},
  { version:"2.16.16", date:"2026-07-30", features:[
    "🏠 Correctif : déplacer les meubles dans Ma Maison fonctionne maintenant correctement sur tablette et téléphone (pas juste avec une souris).",
  ]},
  { version:"2.16.15", date:"2026-07-30", features:[
    "🎒 La tâche « Préparer son sac » s'appelle maintenant « Sac à dos (MDP) » et rappelle quoi mettre dedans pour le camp de jour (collation, bouteille d'eau, chapeau, boîte à lunch vide).",
  ]},
  { version:"2.16.14", date:"2026-07-30", features:[
    "✨ Correctif : les icônes des peaux spéciales dans la Boutique (onglet Spécial), invisibles sur fond sombre, s'affichent maintenant correctement.",
  ]},
  { version:"2.16.13", date:"2026-07-30", features:[
    "🪑 Correctif : le glisser-déposer des meubles dans Ma Maison, qui ne faisait plus rien, fonctionne à nouveau — tu peux les replacer où tu veux, avec un bouton pour les remettre par défaut.",
  ]},
  { version:"2.16.11", date:"2026-07-29", features:[
    "🥚 Un petit secret se cache peut-être quelque part dans le Livre... à toi de le trouver!",
  ]},
  { version:"2.16.10", date:"2026-07-29", features:[
    "😂 Une quête validée affiche maintenant, de temps en temps, un petit message rigolo en plus de tes XP et pièces!",
  ]},
  { version:"2.16.9", date:"2026-07-29", features:[
    "⏳ Nouveau réglage parent (facultatif) : un budget-temps quotidien par enfant (15 à 90 min, ou illimité). Une fois atteint, un petit écran de pause propose de demander à un parent de continuer un peu.",
  ]},
  { version:"2.16.8", date:"2026-07-29", features:[
    "🔥 Ta fiche profil (Vue Famille → Profil) montre maintenant aussi ta série de jours consécutifs, comme sur ton accueil.",
  ]},
  { version:"2.16.7", date:"2026-07-29", features:[
    "🚪 Nouveau réglage parent (facultatif) : un « verrou du matin » qui peut fermer la Boutique et le personnalisateur pendant une plage horaire, pour t'aider à te concentrer sur tes tâches du matin — tes autres salles du Livre se réveillent après!",
  ]},
  { version:"2.16.6", date:"2026-07-29", features:[
    "🌟 5 nouveaux niveaux (11 à 15)! Si tu étais au maximum (niveau 10, SUPRÊME), ta barre d'XP va enfin recommencer à avancer — TRANSCENDANT, IMMORTEL, COSMIQUE, ÉTERNEL, et le tout nouveau titre final MAÎTRE AVENTURIER t'attendent!",
  ]},
  { version:"2.16.5", date:"2026-07-29", features:[
    "🎨 Les boutons Famille/Calendrier/Minuterie de ton accueil ont maintenant leurs propres jolies icônes pixel art, au lieu des emojis!",
  ]},
  { version:"2.16.4", date:"2026-07-29", features:[
    "⚔️ Le bouton « Combat final » (qui montrait toujours l'Hydre, peu importe le vrai boss) est remplacé par une petite tuile avec ton visage et des cœurs pour les PV du boss et de la famille — toujours le bon boss, toujours synchronisé avec le vrai combat!",
  ]},
  { version:"2.16.3", date:"2026-07-29", features:[
    "🛍️ Les onglets de la Boutique sont plus grands et plus faciles à toucher (Récompenses/Chapeaux/Armures/Familiers/Maison/Spécial) — icônes bien visibles, texte lisible.",
  ]},
  { version:"2.16.2", date:"2026-07-28", features:[
    "🛒 Boutique : toucher très vite deux fois « Acheter » ne débite plus tes pièces deux fois pour un seul objet — un bug rare mais réel qui pouvait te faire perdre des pièces pour rien!",
  ]},
  { version:"2.15.5", date:"2026-07-28", features:[
    "📅 Les événements épinglés en haut de ta Semaine (v2.15.4) affichent maintenant leur vraie icône (🏥⚽🧑‍⚕️🏕️) au lieu d'un 📅 générique pour tous — plus facile de repérer un match de sport ou un camp d'un coup d'oeil!",
  ]},
  { version:"2.15.4", date:"2026-07-28", features:[
    "📅 Ta semaine affiche maintenant aussi tes événements (camp, sorties, rendez-vous) en haut de chaque journée — les quêtes restent en dessous!",
  ]},
  { version:"2.15.3", date:"2026-07-28", features:[
    "🪙 Boutique (Maison, Spécial et les autres onglets) : si tu n'as pas assez de pièces pour un item, tu le sais maintenant tout de suite (avant, rien ne se passait quand tu appuyais dessus)!",
  ]},
  { version:"2.15.2", date:"2026-07-28", features:[
    "📅 Les calendriers de toute la famille s'affichent maintenant côte à côte quand l'écran est assez large — plus besoin de défiler pour comparer les journées!",
  ]},
  { version:"2.15.1", date:"2026-07-28", features:[
    "🔄 Ton parent peut maintenant te renvoyer une annonce importante que tu as fermée trop vite — elle réapparaît sur ton accueil!",
  ]},
  { version:"2.15.0", date:"2026-07-27", features:[
    "📅 Calendrier tout neuf : un seul endroit pour tes rendez-vous et activités (plus de doublon), organisé en Lever/Matin/Dîner/Après-midi/Souper/Soirée, et tu peux maintenant modifier tes événements après les avoir ajoutés!",
  ]},
  { version:"2.14.3", date:"2026-07-27", features:[
    "👕 Les items sans dessin (affichés en emoji, comme le chandail) sont maintenant bien centrés sur ton perso au lieu d'être décalés.",
  ]},
  { version:"2.14.2", date:"2026-07-27", features:[
    "🪖 Cette fois c'est la bonne : le casque de chevalier est bien centré sur la tête (on avait perdu un réglage en route — désolé!).",
  ]},
  { version:"2.14.1", date:"2026-07-27", features:[
    "📣 Les annonces parent sont personnalisables : texte du bouton, messages du compte à rebours, titre et liste des tâches communes — fini les textes fixes sur les invités.",
  ]},
  { version:"2.14.0", date:"2026-07-27", features:[
    "🪖 Le casque de chevalier est VRAIMENT bien placé maintenant (le jeu recadre lui-même chaque item sur son contenu — fini les décalages).",
    "↩️ Tu peux enfin RETIRER un item équipé : retape-le dans ton Inventaire (ou la Boutique) et il s'enlève!",
    "🔒 Les ailes, capes, cornes, tentacules et bras en plus se DÉBLOQUENT maintenant à la Boutique (onglet ✨ Spécial) — ceux qui les portaient déjà les gardent!",
  ]},
  { version:"2.13.6", date:"2026-07-27", features:[
    "👄 Bouches SÉRIEUX et CRISPÉ dans Mon Perso : elles ne faisaient rien avant (mêmes pixels que NEUTRE) — chacune a maintenant sa vraie bouche.",
  ]},
  { version:"2.13.5", date:"2026-07-27", features:[
    "🪖 Le heaume de chevalier est maintenant bien posé sur la tête (son panache décentrait le casque) — et quelques autres items sont mieux alignés aussi.",
  ]},
  { version:"2.13.4", date:"2026-07-27", features:[
    "🏅 Le badge « Journée Marathon » (10 quêtes) a un nouveau nom : « Journée Titanesque » — pour ne plus le confondre avec son cousin à 6 quêtes!",
  ]},
  { version:"2.13.3", date:"2026-07-27", features:[
    "💪 Nouvel Extra dans Mon Perso : des BRAS EN PLUS! (Et oui, quatre bras.)",
  ]},
  { version:"2.13.2", date:"2026-07-27", features:[
    "🐾 Ton familier apparaît maintenant EN ENTIER dans ta maison — corps, pattes et queue, plus juste sa tête! (Les familiers évolués gardent leur forme spéciale.)",
  ]},
  { version:"2.13.1", date:"2026-07-27", features:[
    "📋 Dans le portail parent, l'onglet Tâches montre maintenant seulement les tâches d'AUJOURD'HUI par défaut — un bouton permet de voir toute la semaine si besoin.",
  ]},
  { version:"2.13.0", date:"2026-07-27", features:[
    "👀 Tes YEUX et ta BOUCHE changent maintenant sur ton nouveau perso : lunettes fumées, yeux étoiles, yeux de chat, yeux d'alien, sourire, langue, bouche zippée…",
    "✨ Nouvelles PEAUX à débloquer dans la Boutique (onglet Peaux) : Or, Zombie, Lave et Glace!",
    "🔧 Réparations : le casque n'est plus décalé de la tête, le familier n'est plus géant dans ta maison, et ton héros est plus grand dans sa chambre.",
  ]},
  { version:"2.12.2", date:"2026-07-27", features:[
    "🎉 Correction : la notification « bravo, quête complétée! » pouvait revenir sans arrêt pour un même enfant — c'est réglé, elle ne repasse plus une fois vue.",
  ]},
  { version:"2.12.1", date:"2026-07-27", features:[
    "🎾 Correction : jouer avec ton familier disait toujours « gagne de l'XP », même quand il avait déjà atteint son max du jour — le message est maintenant honnête!",
  ]},
  { version:"2.12.0", date:"2026-07-27", features:[
    "🎨 TON HÉROS FAIT PEAU NEUVE : nouveau personnage détaillé en pixel art — ta peau, tes cheveux, tes ailes (plumées ou de dragon!), ta cape et tes souliers en vrai style jeu vidéo. Choisis Ado ou Enfant dans Mon Perso!",
    "😈 Nouvel onglet EXTRAS dans Mon Perso : cornes de démon avec queue, tentacules…",
    "🧻 Nouvelles armures dans la Boutique : armure de papier de toilette, armure de post-it, armure de chevalier et armure royale dorée — portées directement sur ton héros!",
  ]},
  { version:"2.11.2", date:"2026-07-27", features:[
    "☀️ « Ma journée » (mode Semaine) trie maintenant tes quêtes par moment : 🌅 Matin, ☀️ Après-midi, 🌙 Soir — plus facile de voir quoi faire quand!",
    "🕐 Quand tu crées ta propre quête, tu peux maintenant choisir à quel moment de la journée elle se fait.",
  ]},
  { version:"2.11.1", date:"2026-07-27", features:[
    "🍱 Nouvelles tâches : défaire sa boîte à lunch et en préparer une vide, du lundi au jeudi.",
    "🔧 Correction : certains rituels restaient vides (une tâche qu'ils contenaient avait changé) — ils se nettoient maintenant tout seuls automatiquement.",
  ]},
  { version:"2.11.0", date:"2026-07-27", features:[
    "🧑 Ton héros peut maintenant être un ADO ou un ENFANT — choisis ta silhouette dans Mon Perso (onglet Silhouette). Le look détaillé s'en vient!",
  ]},
  { version:"2.10.0", date:"2026-07-27", features:[
    "🏠 Ta maison est devenue MAGNIFIQUE : vrais meubles en pixel art (lit, fauteuil, coffre à jouets, fenêtre ensoleillée…), tapisseries et planchers dessinés comme dans un jeu vidéo rétro!",
    "🖼️ Ta chambre s'affiche maintenant en grande bannière sur ton écran d'accueil, avec ton héros dedans — touche-la pour la décorer!",
  ]},
  { version:"2.9.0", date:"2026-07-27", features:[
    "⚔️ Dans le Combat Final, ton héros porte maintenant son équipement (chapeau, épée, bouclier…) — c'est vraiment TOI qui combats!",
    "👨‍👩‍👧‍👦 Dans l'Espace Famille, les avatars sourient quand leur héros a complété une quête aujourd'hui!",
  ]},
  { version:"2.8.0", date:"2026-07-27", features:[
    "🏠 MA MAISON! Ton héros a maintenant sa propre chambre dans Mon Perso — achète des meubles, tapisseries et planchers dans la Boutique (onglet 🏠 Maison) et décore-la comme tu veux. Chaque thème a même son trophée unique!",
  ]},
  { version:"2.7.0", date:"2026-07-27", features:[
    "🦋 Nouveau dans Mon Perso : ton héros peut maintenant avoir des ailes de fée, des ailes de dragon ou une cape, et choisir ses souliers (baskets, bottes, pantoufles…) — gratuit, va essayer!",
  ]},
  { version:"2.6.9", date:"2026-07-27", features:[
    "📅 Calendrier refondu : un seul calendrier (menu du bas), séparé des tâches — sections Déjeuner/Avant-midi/Dîner/Après-midi/Souper/Soir, heure optionnelle, et tu peux maintenant modifier tes événements (pas juste les supprimer)!",
  ]},
  { version:"2.6.8", date:"2026-07-27", features:[
    "✨ Petits préparatifs sous le capot pour ton personnage — rien ne change encore, mais de belles surprises s'en viennent!",
  ]},
  { version:"2.6.7", date:"2026-07-27", features:[
    "🎨 Tes cartes de quêtes ont un nouveau look : un liseré de couleur à gauche te montre la difficulté d'un coup d'œil (vert facile, jaune moyen, orange difficile) — plus besoin de chercher!",
  ]},
  { version:"2.6.6", date:"2026-07-27", features:[
    "🧹 Grand ménage : ~125 anciennes tâches fantômes (jamais complétables) qui réapparaissaient sans cesse dans la file « à valider » du parent sont enfin retirées pour de bon.",
    "📊 Correction : le graphique « Progrès de la semaine » et le compteur « quêtes accomplies ensemble » oubliaient de compter les quêtes de la semaine de garde — ils affichent maintenant les vrais chiffres.",
    "🔁 Les tâches manquées ne se reportent plus en double quand la même tâche revient de toute façon bientôt (ex. les pilules quotidiennes) — seules celles qui seraient sinon perdues pour la semaine sont reportées.",
  ]},
  { version:"2.6.5", date:"2026-07-27", features:[
    "🛍️ La Boutique range maintenant les récompenses par Petite/Moyenne/Épique — plus facile de voir ce que tu peux te payer d'un coup d'œil!",
  ]},
  { version:"2.6.4", date:"2026-07-26", features:[
    "🗓️ NOUVEAU : les récompenses « moments » (sortie, souper spécial, temps privé avec un parent…) se planifient maintenant ENSEMBLE! À l'achat, ça atterrit dans « À planifier » du portail parent — le parent choisit une date (ajoutée à ton calendrier 🎁) et personne n'oublie. Aucune date limite : ça reste là jusqu'à ce que ce soit vécu.",
  ]},
  { version:"2.6.3", date:"2026-07-26", features:[
    "🧦 Correction : la brassée de lavage et le rangement des vêtements propres ne s'assignaient à PERSONNE depuis un moment (un changement de pseudo avait cassé la reconnaissance des paires) — c'est réparé, tout le monde va retrouver ces tâches dans sa rotation.",
  ]},
  { version:"2.6.2", date:"2026-07-26", features:[
    "🌟 Ton défi de la semaine récompense maintenant CHAQUE étape : 3 jours réussis = +10 🪙, 5 jours = +15 🪙 de plus, et 7 sur 7 = +25 🪙 + le nouveau badge « Maître de soi » 🧘! Pas besoin de jours d'affilée — chaque jour coché compte, rien ne se perd.",
    "✨ Quand tu appuies sur « J'AI FAIT ÇA! », petite pluie d'étoiles immédiate et ta carte affiche tes gains RÉSERVÉS (+XP · +🪙) en attendant que ton parent valide — tu sais tout de suite ce qui s'en vient!",
  ]},
  { version:"2.6.1", date:"2026-07-26", features:[
    "🗓️ La vue Semaine s'affiche maintenant en COLONNES, comme un vrai calendrier — un jour par colonne avec tes quêtes et tes événements! Glisse de gauche à droite pour voir les 7 prochains jours. Tu préfères l'ancienne liste? Le bouton 📋 Liste est juste à côté, et ton choix est retenu.",
  ]},
  { version:"2.6.0", date:"2026-07-26", features:[
    "🕊️ NOUVEAU : les quêtes de réparation! Après un moment difficile entre vous, un parent peut proposer une quête commune (faire la paix, s'entraider…). Quand CHACUN l'a faite, quelque chose de spécial arrive : le boss recule de 50 PV — ou toute l'équipe reçoit +10 🪙 s'il n'y a pas de boss. Parce que réparer ensemble, c'est la plus grande force d'une famille.",
  ]},
  { version:"2.5.29", date:"2026-07-26", features:[
    "🚀 L'app est plus légère et se synchronise plus vite entre vos appareils.",
  ]},
  { version:"2.5.28", date:"2026-07-26", features:[
    "🍖 Ton familier te fait maintenant savoir quand il a faim! Si tu termines une quête et qu'il n'a pas mangé aujourd'hui, un petit message te le rappelle — nourris-le et il gagnera de l'XP avec tes quêtes.",
  ]},
  { version:"2.5.27", date:"2026-07-26", features:[
    "👑 Nouveau réglage : « Titres au féminin »! Active-le dans tes réglages (menu ☰) pour devenir Héroïne, Championne, Chevalière ou Reine au lieu de Héros, Champion, Chevalier, Roi. Chacun choisit pour soi.",
  ]},
  { version:"2.5.26", date:"2026-07-26", features:[
    "💰 Encore un correctif sur les pièces effacées : une tablette pas encore à jour avait laissé une mauvaise date dans la sauvegarde, et ça re-vidait les porte-monnaie à chaque ouverture de l'app. C'est colmaté des deux côtés (app ET serveur) — le reset des pièces n'arrive que le vendredi, promis juré.",
  ]},
  { version:"2.5.25", date:"2026-07-26", features:[
    "🐉 Correctif discret : dans de rares cas (deux attaques presque en même temps), la victoire d'un boss aurait pu accorder deux fois la récompense. Impossible maintenant.",
    "📅 Le badge « Machine à Habitudes » s'appelle maintenant « Journée Marathon » — ça décrit mieux ce qu'il récompense (6 quêtes dans la même journée).",
  ]},
  { version:"2.5.24", date:"2026-07-25", features:[
    "💰 GROS correctif : tes pièces se faisaient effacer par erreur chaque soir après 20h (bug de fuseau horaire) — c'est réglé! Le vrai reset des pièces n'arrive QUE le vendredi, comme annoncé. Maman peut redonner ce qui a été perdu.",
  ]},
  { version:"2.5.23", date:"2026-07-25", features:[
    "🛍️ Correctif : si tu appuyais très vite deux fois sur « Acheter » puis « J'ai changé d'idée » dans la Boutique, la récompense restait invisible-mais-coincée dans ton inventaire (aucun effet gênant, mais réglé proprement).",
  ]},
  { version:"2.5.22", date:"2026-07-25", features:[
    "🐛 Portail parent — « À valider » signale maintenant clairement une demande dont la tâche a été supprimée entretemps (au lieu d'un « Tâche » vide trompeur), pour que tu saches qu'aucun XP ne sera donné avant de cliquer.",
  ]},
  { version:"2.5.21", date:"2026-07-25", features:[
    "🐾 Correctif : un familier gagné en récompense pouvait sembler disparaître (« pas de familier équipé ») si tu changeais de thème après l'avoir équipé — il ne l'était pas vraiment, juste mal affiché. Réglé!",
  ]},
  { version:"2.5.20", date:"2026-07-25", features:[
    "🧼 Nouvelle tâche « Pipi, mains, dents » disponible dans les tâches de base.",
    "💊 Rappel automatique quotidien pour prendre ses pilules (matin/soir selon l'enfant).",
    "👫 Nouveau défi quotidien « Jouer 45 minutes calmement avec mon frère ».",
  ]},
  { version:"2.5.19", date:"2026-07-25", features:[
    "🎨 Petit ajustement visuel dans le portail parent : les bugs signalés et les logs techniques affichent maintenant la date bien alignée à droite pour un coup d'œil plus rapide.",
  ]},
  { version:"2.5.18", date:"2026-07-25", features:[
    "📌 Une tâche récurrente de la semaine de garde qu'on a oubliée revient automatiquement dans ta liste du jour, du lundi au jeudi, pour ne rien perdre en cours de route.",
  ]},
  { version:"2.5.17", date:"2026-07-25", features:[
    "⏱️ Chaque quête affiche maintenant un temps approximatif (~8 à 30 min selon la difficulté) pour t'aider à planifier ton temps.",
  ]},
  { version:"2.5.16", date:"2026-07-25", features:[
    "⏱ Un petit bouton minuteur apparaît maintenant sur chaque tâche — pour te chronométrer sur UNE tâche précise sans avoir à aller dans l'onglet Minuterie.",
    "🐛 Correctif : le défi de la semaine pouvait se décocher tout seul après une synchro entre appareils, obligeant à le cocher encore et encore.",
  ]},
  { version:"2.5.15", date:"2026-07-25", features:[
    "🎯 Ton écran « Aujourd'hui » commence maintenant direct par tes quêtes du jour — le Défi de la semaine et les Objectifs du jour sont rangés dans un tiroir replié juste en dessous, à ouvrir si tu veux.",
    "✏️ Le bouton « créer ma propre tâche » apparaît aussi en haut de la liste de quêtes, pas juste tout en bas.",
  ]},
  { version:"2.5.14", date:"2026-07-25", features:[
    "🧢 Le popup « Mon Perso » (avatar/familier) garde maintenant ton nom et le bouton ✕ visibles même quand tu défiles dans ton inventaire.",
    "🏷️ Ton nom reste affiché en haut de l'écran sur Famille, Calendrier et Minuterie.",
  ]},
  { version:"2.5.13", date:"2026-07-25", features:[
    "🗓️ Les dates de ton calendrier s'affichent maintenant en clair (« Mer 29 juil ») plutôt qu'en format brut (« 2026-07-29 »).",
  ]},
  { version:"2.5.12", date:"2026-07-25", features:[
    "🖼️ Ton perso s'affiche maintenant en grand sur l'écran « Qui es-tu? » — plus besoin de te connecter pour voir à quoi il ressemble!",
  ]},
  { version:"2.5.11", date:"2026-07-25", features:[
    "🔧 Correctif : une quête ajoutée (ou une tâche piquée dans la liste) ne devrait plus jamais « disparaître » après coup à cause d'une synchro entre appareils — la sauvegarde locale ne se fait plus écraser par une synchro plus vieille arrivée en retard.",
  ]},
  { version:"2.5.10", date:"2026-07-25", features:[
    "🧑‍🤝‍🧑 Nouveau! Quand tu te crées une tâche, tu choisis maintenant : juste pour aujourd'hui, juste pour toi à chaque fois, ou proposer à toute la famille (un parent doit l'approuver).",
  ]},
  { version:"2.5.9", date:"2026-07-25", features:[
    "🔋 Correctif : les coffres ne se « rechargent » plus aussi vite — la sync multi-appareils pouvait remettre de l'énergie qui avait déjà été dépensée. Les délais de recharge sont maintenant respectés peu importe depuis quel appareil tu ouvres l'appli.",
    "🪙 Correctif : les pièces ne reviennent plus comme par magie après une sync — un vieil appareil ne peut plus faire remonter ton solde après que tu l'aies dépensé.",
  ]},
  { version:"2.5.8", date:"2026-07-25", features:[
    "👁️ Correctif technique (portail parent) : les onglets par enfant s'appellent maintenant « 👁️ Voir [prénom] » pour rappeler que c'est un aperçu, pas un panneau de gestion (les ajustements XP/pièces restent dans Actions).",
  ]},
  { version:"2.5.7", date:"2026-07-25", features:[
    "🏷️ Dans le portail parent, l'onglet pour ajouter un événement au calendrier s'appelle maintenant « Ajouter au calendrier » — pour ne plus le confondre avec l'onglet « Calendriers » (qui sert juste à consulter).",
  ]},
  { version:"2.5.6", date:"2026-07-25", features:[
    "🏷️ Petit correctif d'étiquette : la boutique dit maintenant « ÉQUIPÉ » comme partout ailleurs dans l'app (au lieu de « ON »).",
  ]},
  { version:"2.5.5", date:"2026-07-25", features:[
    "🔓 Correctif : quitter le mode parent te ramène directement à ta propre page, sans devoir retaper ton code secret.",
  ]},
  { version:"2.5.4", date:"2026-07-25", features:[
    "🛠️ Correctif technique (portail parent) : l'assistant « Modifier le livre » a maintenant un bouton « Fermer sans enregistrer » toujours visible, et laisse sauter directement à une étape plus loin sans devoir cliquer « Suivant » à chaque fois.",
  ]},
  { version:"2.5.3", date:"2026-07-25", features:[
    "🐾 Tu peux maintenant donner un surnom à ton familier! Touche le petit ✏️ à côté de son nom pour le renommer comme tu veux.",
  ]},
  { version:"2.5.2", date:"2026-07-25", features:[
    "🐉 Correctif : le verrou « toutes les corvées avant le coup final » vise maintenant le VRAI boss actif, plus jamais bloqué par de vieilles corvées d'un ancien combat.",
    "🧹 Nettoyage technique : les vieilles assignations de tâches qui ne pointaient plus vers rien ont été retirées.",
  ]},
  { version:"2.5.1", date:"2026-07-25", features:[
    "🧹 Correctif technique : une tâche personnalisée supprimée sur un appareil pendant qu'elle était encore assignée sur un autre ne laisse plus d'assignation « fantôme » derrière elle.",
  ]},
  { version:"2.5.0", date:"2026-07-25", features:[
    "🪙 Nouveauté : dès maintenant, tes pièces repartent à 0 chaque vendredi minuit (comme un budget de la semaine) — mais tout ce que tu as GAGNÉ au total continue de compter pour tes badges 💰 Petit Trésor et 🤑 Oncle Picsou, ça ne redescend jamais!",
  ]},
  { version:"2.4.1", date:"2026-07-24", features:[
    "🐾 Ton familier s'affiche maintenant en vrai pixel-art sur ta page d'accueil, comme partout ailleurs — plus d'emoji générique.",
    "🏡 Correctif : dans l'Espace Famille, les avatars ne se chevauchent plus quand ils se déplacent.",
  ]},
  { version:"2.4.0", date:"2026-07-24", features:[
    "🏡 Nouvel Espace Famille : vos 4 avatars flânent maintenant ensemble dans une petite scène sur la Vue Famille — cliquez sur un avatar pour ouvrir son profil.",
  ]},
  { version:"2.3.0", date:"2026-07-24", features:[
    "🎨 La palette adoucie touche maintenant aussi les couleurs déjà choisies pour vous 4 (avant, seules les couleurs de l'interface avaient changé) — vos avatars deviennent plus doux dès la prochaine ouverture.",
    "📱 Correctif : sur téléphone, le menu du bas ne se cache plus derrière les boutons du système.",
    "🖥️ Correctif : sur ordinateur, le nom des sections (Accueil/Aujourd'hui/Semaine/Boutique) ne se cache plus derrière le petit texte de version en bas.",
    "👆 Le retour tactile \"bouton pressé\" est maintenant partout, pas juste sur un bouton.",
  ]},
  { version:"2.2.0", date:"2026-07-24", features:[
    "🎨 Palette adoucie partout dans l'app — les couleurs vives (or, cyan, vert, rouge, violet, orange) sont maintenant plus douces, moins agressives à l'œil, et le noir pur est remplacé par un noir un peu plus doux. Même look, contraste moins intense.",
    "👆 Les boutons principaux réagissent maintenant au toucher/clic (petit effet \"pressé\") pour un retour plus satisfaisant.",
  ]},
  { version:"2.1.0", date:"2026-07-24", features:[
    "📣 Le fil de famille est maintenant organisé par jour (Aujourd'hui, Hier...) avec une petite barre de couleur pour repérer d'un coup d'œil le genre d'événement (quête, badge, niveau, boss, rituel, message).",
  ]},
  { version:"2.0.3", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"2.0.2", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"2.0.1", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"2.0.0", date:"2026-07-24", features:[
    "🔧 Les tâches en attente de validation s'affichent maintenant avec leur vrai titre (les quêtes rotatives de la semaine apparaissaient comme \"Tâche\" sans titre).",
    "💾 Le panel parent a maintenant un bouton Enregistrer visible pour les défis hebdomadaires — plus de mystère sur si c'était sauvegardé ou non.",
  ]},
  { version:"1.109.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.108.0", date:"2026-07-24", features:[
    "🔄 QUÊTES ROTATIVES! Chaque semaine chez maman, tes tâches d'entretien (vaisselle, plancher, verdure pour Boulette, etc.) tournent automatiquement entre vous 4 — plus besoin que quelqu'un les assigne à la main.",
    "⭐ DÉFI DE LA SEMAINE! Un défi personnel juste pour toi (pas une corvée — plutôt un objectif du genre \"pratiquer le hockey\" ou \"communiquer mes émotions\"). Coche-le chaque jour où tu réussis — 7 jours sur 7 et tu débloques un cadre d'avatar spécial!",
    "📍 Une bannière discrète t'avertit quand c'est la semaine chez l'autre parent : tes quêtes de la maison t'attendent à ton retour.",
  ]},
  { version:"1.107.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.106.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.105.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.104.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.103.0", date:"2026-07-24", features:[
    "🐲 18 NOUVEAUX BOSS! Fini les 4 monstres qui se ressemblaient juste avec une couleur différente — chaque combat de boss peut maintenant faire apparaître un démon des racines, un yéti, une méduse, une hydre, un dragon et plein d'autres, chacun avec son propre look. Choisis avec maman!",
  ]},
  { version:"1.102.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.101.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.100.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.99.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.98.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.97.0", date:"2026-07-24", features:[
    "⚡ Encore un peu de ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.96.0", date:"2026-07-23", features:[
    "⚡ Petit ménage technique invisible : aucun changement visible pour toi.",
  ]},
  { version:"1.95.0", date:"2026-07-22", features:[
    "⚡ Encore un peu plus de fluidité côté technique (invisible), surtout pour l'écran Famille et le portail parent.",
  ]},
  { version:"1.94.0", date:"2026-07-21", features:[
    "⚡ Petite amélioration technique invisible : l'app devrait sembler un peu plus fluide, surtout sur des appareils plus lents.",
  ]},
  { version:"1.93.0", date:"2026-07-21", features:[
    "🎲 Un thème gratuit différent est débloqué chaque semaine pour tout le monde dans le sélecteur de thème — pas besoin d'XP pour l'essayer, en plus des thèmes déjà débloqués!",
  ]},
  { version:"1.92.0", date:"2026-07-21", features:[
    "🌙 Boutique : les récompenses « écran » et « calme » (bain moussant, déjeuner au lit, temps privé avec ton parent, musique) ont maintenant une petite étiquette de couleur — plus facile de choisir une récompense apaisante plutôt que toujours de l'écran.",
  ]},
  { version:"1.91.0", date:"2026-07-21", features:[
    "🔧 Nouveau système de logs techniques (invisible pour les enfants) : capture automatique des erreurs pour aider Gen/Claude à diagnostiquer un pépin, visible dans le portail parent (onglet Journal).",
  ]},
  { version:"1.90.0", date:"2026-07-21", features:[
    "🎮 Mini-jeu de niveau : tu choisis maintenant TOI-MÊME ton jeu (Tape vite / Cours et saute / Mange tout) au lieu qu'il soit tiré au hasard — et tu vois les paliers de récompense (XP + pièces) AVANT de jouer.",
  ]},
  { version:"1.89.0", date:"2026-07-21", features:[
    "🖥️ Sur un ordinateur (grand écran), l'app reste maintenant une colonne confortable et centrée au lieu de s'étirer d'un bord à l'autre — pareil sur téléphone, tablette et ordi.",
  ]},
  { version:"1.88.0", date:"2026-07-20", features:[
    "⏱ Minuterie : nouveau disque visuel qui rétrécit avec le temps (en plus du chrono numérique).",
    "👉 Mode « une tâche à la fois » : affiche maintenant ce qui vient après (« Ensuite: … »).",
    "🌟 Petit message encourageant quand il reste 1-2 tâches (« tu y es presque! »).",
    "🎉 Les confettis d'une tâche ordinaire sont un peu plus discrets — les vrais jalons (level-up, victoire de boss) gardent toute la fête.",
  ]},
  { version:"1.87.0", date:"2026-07-20", features:[
    "🔍 Nouveau réglage « Taille du texte » (Normal/Grand/Très grand) dans Mes réglages.",
    "🔤 Nouveau réglage « Police plus lisible » — remplace les lettres « jeu vidéo » par une police plus simple à lire, pour toute l'app.",
    "🌅 Message « Nouvelle journée! » à ta première visite du jour — explique pourquoi tes tâches sont redevenues à faire.",
  ]},
  { version:"1.86.0", date:"2026-07-20", features:[
    "⏱ Le bouton Minuterie de l'accueil garde maintenant ton rituel actif présélectionné (avant : toujours vierge, même si tu étais en plein rituel).",
  ]},
  { version:"1.85.0", date:"2026-07-20", features:[
    "✅ L'onglet « Aujourd'hui » montre maintenant aussi tes devoirs/examens du jour, pas juste tes quêtes — un seul endroit pour voir tout ce qu'il y a à faire.",
    "📋 Le bouton « Semaine » est renommé « Mes tâches » pour ne plus se confondre avec l'onglet Accueil.",
    "💡 Si tu n'as rien dans un mode (Mes tâches / Rituels), l'app te dit maintenant si tu as des trucs dans l'autre.",
    "📅 Le calendrier a 4 nouvelles catégories : 🏥 Santé, ⚽ Sport, 🧑‍⚕️ Intervenant, 🏕️ Camp/sortie (en plus de Devoir/Examen/Événement).",
  ]},
  { version:"1.84.0", date:"2026-07-20", features:[
    "😴 L'énergie de ton héros s'applique maintenant aussi à la boutique et à ton perso (pas juste ton familier) — les corvées, elles, restent TOUJOURS gratuites.",
    "😴 Un petit message « ton héros se repose » apparaît maintenant dans ta fiche perso dès que l'énergie est basse, pas juste sur la carte familier.",
  ]},
  { version:"1.83.0", date:"2026-07-20", features:[
    "🗑️ Tu peux maintenant demander à retirer une tâche que tu ne veux plus — ton parent voit la demande et l'approuve ou la garde.",
  ]},
  { version:"1.82.0", date:"2026-07-20", features:[
    "📋 Choisir une tâche à assigner se fait maintenant par grille (comme côté enfant) au lieu d'une longue liste déroulante.",
    "🧹 Créer une tâche personnalisée qui existe déjà (même nom) réutilise l'ancienne au lieu d'en empiler une nouvelle — le catalogue de tâches ne grossit plus à l'infini.",
    "🧹 Retiré le réglage « Messages rigolos » qui ne faisait rien (aucun message drôle n'existe encore dans le jeu) — reviendra une fois du vrai contenu écrit.",
  ]},
  { version:"1.81.0", date:"2026-07-20", features:[
    "🎨 Nouveaux dessins pixel art faits par un des garçons : bouclier, épée, arc, bâton magique et armure, 6 chapeaux/casques/couronnes, et 11 familiers (chat, chien, loup, renard, dragon, araignée, canard, abeille, ver, colibri-perroquet, capybara)!",
    "🧙 Ton perso PORTE vraiment son équipement maintenant : le chapeau est sur la tête, l'armure sur le torse, et les armes (bouclier/épée/arc/bâton) sont tenues en main — fini les items qui flottaient à côté du perso.",
  ]},
  { version:"1.80.0", date:"2026-07-18", features:[
    "📶 Combat final plus fiable : si le jeu ne charge pas (signal faible), un message clair et un bouton « Réessayer » apparaissent au lieu d'un écran noir muet.",
  ]},
  { version:"1.79.0", date:"2026-07-12", features:[
    "🐛 Fix boss « jamais vaincu » : la victoire est maintenant recalculée automatiquement dès que les dégâts cumulés dépassent les PV du boss, même sans nouveau clic d'attaque (ne peut plus rester bloqué pour toujours).",
    "🏕️ Boss de camping unique avec ses propres couleurs et des arbres autour de lui!",
  ]},
  { version:"1.78.0", date:"2026-07-01", features:[
    "🪟 Correctif d'affichage : les fenêtres de félicitations et écrans de mini-jeu (niveau atteint, boss vaincu, récompense) ne peuvent plus être coupés en haut de l'écran sur les petits écrans — elles se centrent quand ça rentre et défilent quand c'est trop grand.",
  ]},
  { version:"1.77.0", date:"2026-07-01", features:[
    "🎮 COMBAT FINAL! Dans l'onglet ⚔️ BOSS, un nouveau bouton « 🐉 Combat final » lance un vrai mini-jeu plateforme : tu affrontes ta tête d'Hydre avec TON avatar et TON familier, tu tires des flèches et tu sautes par-dessus le feu (3 vies). Jouable au doigt sur cellulaire et tablette!",
  ]},
  { version:"1.76.0", date:"2026-07-01", features:[
    "🐉 L'Hydre à deux têtes a maintenant son propre look : un vrai monstre à deux têtes (une jaune, une bleue) au lieu du dragon habituel!",
    "🔒 L'Hydre ne peut être ACHEVÉE que si TOUTES les corvées du jour sont faites — vous pouvez l'affaiblir, mais le coup final n'entre que quand tout le monde a terminé ses quêtes. Travail d'équipe! 💪",
  ]},
  { version:"1.75.0", date:"2026-06-17", features:[
    "🖼️ Les familiers peuvent maintenant afficher de vraies illustrations pixel art (sprites PNG) — préparation pour les nouveaux dessins. Si une image existe, elle s'affiche; sinon, le familier dessiné actuel reste.",
  ]},
  { version:"1.74.0", date:"2026-06-17", features:[
    "🏆 Victoire du boss, en mieux : les 4 enfants reçoivent la grande notification de victoire à leur PROCHAINE connexion (plus seulement celui qui porte le coup final), et chacun gagne un ITEM ULTRA LÉGENDAIRE aléatoire 🎁 — en plus des +40 🪙, +50 ⚡ et du badge 🐲.",
  ]},
  { version:"1.73.0", date:"2026-06-17", features:[
    "⏱️ Minuteur intégré dans ton rituel : juste sous tes tâches, choisis ⏳ Minuterie (compte à rebours), ⏰ Heure butoir (jusqu'à une heure précise) ou ⏱ Chrono — sans changer d'écran. (Le minuteur plein écran avec XP reste dispo en dessous.)",
  ]},
  { version:"1.72.0", date:"2026-06-17", features:[
    "🏆 Vaincre le boss de semaine, c'est maintenant un VRAI moment : célébration plein écran + récompense bonifiée — +40 🪙, +50 ⚡, et le nouveau badge « Tombeur de Boss » 🐲 pour toute la famille!",
  ]},
  { version:"1.71.0", date:"2026-06-17", features:[
    "📅 Assignation enrichie (portail parent) : quand tu planifies une tâche, tu choisis maintenant les JOURS — « Chaque jour », « Lun–Ven », « Fin de semaine », ou des jours précis (récurrence par jour de la semaine).",
  ]},
  { version:"1.70.0", date:"2026-06-17", features:[
    "🔓 Validation parent depuis une session enfant : entrer le code te ramène maintenant au portail parent (avec « À valider ») — avant, ça restait coincé dans la vue de l'enfant.",
    "🪟 Balayage des fenêtres : plus de débordement hors écran et défilement partout (popup quête/rituel terminé, formulaire bug, coffre, célébrations, mini-jeux, niveau, code parent).",
  ]},
  { version:"1.69.0", date:"2026-06-16", features:[
    "🛠️ VRAI correctif des pièces infinies (pour de bon) : « j'ai changé d'idée » ne rembourse qu'une seule fois par récompense, même quand l'appareil d'un autre enfant resynchronise. Plus aucune boucle de remboursement.",
  ]},
  { version:"1.68.0", date:"2026-06-16", features:[
    "📋 Quand tu pars le minuteur d'un rituel, tu vois maintenant TOUTES ses tâches juste en dessous — coche-les au fur et à mesure sans quitter le minuteur!",
    "🎉 Quand tu termines un rituel AU COMPLET, une belle fête apparaît pour célébrer ta job. Bravo!",
  ]},
  { version:"1.67.0", date:"2026-06-16", features:[
    "🎮 Correctif : ton jeu de niveau se lance maintenant même si tu es DÉJÀ dans l'app quand un parent valide ta quête (avant, il fallait se déconnecter/reconnecter — tu voyais la notif mais le jeu ne partait pas).",
  ]},
  { version:"1.66.0", date:"2026-06-16", features:[
    "🙂 Correctif : quand tu changes ton pseudo (ou ton thème), ça reste — fini le retour à l'ancien après la synchro.",
    "💰 Les items et les familiers coûtent un peu plus cher : ils deviennent de vrais objectifs à viser. Prends ton temps, ça vaut la peine!",
  ]},
  { version:"1.65.0", date:"2026-06-15", features:[
    "🐛 Correctif : le formulaire « J'ai trouvé un bug » se rend maintenant de façon fiable dans ton portail parent (onglet Logs) — les rapports ne se perdaient plus à la synchro.",
    "🕐 Horodateur ajouté sur les tâches (création + complétion) pour mieux analyser ce qui se passe.",
  ]},
  { version:"1.64.0", date:"2026-06-15", features:[
    "🛠️ Bug réglé : une tâche refusée par le parent ne revient plus toute seule dans le portail (la synchro la ré-injectait).",
    "😹 Quand une quête est refusée, l'enfant voit un petit message rigolo + un bouton « Archiver » pour le faire disparaître.",
  ]},
  { version:"1.63.0", date:"2026-06-15", features:[
    "🛠️ VRAI correctif du bug des pièces infinies : « j'ai changé d'idée » tient maintenant pour de bon (avant, la synchro ramenait la récompense → on pouvait rembourser sans fin).",
    "📅 Les tâches prévues pour d'autres jours sont rangées dans un accordéon « Tâches planifiées » (replié) — ta liste du jour reste propre.",
  ]},
  { version:"1.62.0", date:"2026-06-15", features:[
    "🎽 Tes items équipés s'affichent maintenant PORTÉS sur ton perso : chapeau sur la tête, accessoire de visage, armure sur le torse — et ton familier en pixel art juste à côté de toi! Équipe des items dans 🎒 pour personnaliser ton avatar.",
  ]},
  { version:"1.61.0", date:"2026-06-15", features:[
    "📋 Grand ménage des quêtes : une quête validée QUITTE ta liste du jour (fini les tâches barrées qui traînent) et se range dans 🗄️ Archives — maintenant avec l'HEURE de complétion et l'étiquette.",
    "🎉 Quand tout est fait, un beau message « Tout est fait pour aujourd'hui! » remplace la liste.",
  ]},
  { version:"1.60.0", date:"2026-06-15", features:[
    "🏷️ Chaque quête affiche son étiquette de couleur (Ménage, Cuisine, Routine, Dehors, Défi…) — facile de s'y retrouver d'un coup d'œil.",
    "📊 Nouvelle carte « Stats de la famille » dans l'onglet Famille : voyez combien de quêtes vous avez accomplies ENSEMBLE, par catégorie!",
  ]},
  { version:"1.59.0", date:"2026-06-15", features:[
    "🏅 Plein de nouveaux badges, dont des plus DURS à mériter! Des badges par type de tâche : As du Ménage (10), Marmiton (cuisine), Roi des Routines, Casse-Cou (défis), Aventurier du Dehors…",
    "💯 Des défis de longue haleine : 100 et 300 quêtes, 2500 XP, et « Journée Marathon » (10 quêtes en une seule journée)!",
  ]},
  { version:"1.58.0", date:"2026-06-15", features:[
    "⚔️ Le combat de boss devient stratégique! Chaque jour, un MODIFICATEUR change la meilleure tactique (jour des grosses, carapace, frénésie, jour du familier…). Sous 30% de PV, le boss ENRAGE et devient plus dangereux.",
    "🐾 Ton FAMILIER peut attaquer le boss! S'il est nourri et évolué (niv. 4+), lance-le au combat (3 jetons) — un familier Légendaire 👑 frappe beaucoup plus fort.",
  ]},
  { version:"1.57.0", date:"2026-06-15", features:[
    "✨ ÉVOLUTION DES FAMILIERS! Aux niveaux 4, 8 et 12, ton familier évolue — tu CHOISIS sa voie élémentaire (Feu, Glace, Nature, Ombre, Foudre…) parmi 2 options tirées au hasard. Son apparence change selon la voie!",
    "👑 Niveau 12 = forme LÉGENDAIRE avec couronne et halo doré. Un vrai objectif de longue haleine (la nouvelle courbe va jusqu'au niveau 12).",
  ]},
  { version:"1.56.0", date:"2026-06-15", features:[
    "🐾 Les familiers ont maintenant un look PIXEL ART! Ton familier équipé s'affiche en grand dans « Mon perso » et grossit quand il monte de niveau.",
    "🆕 Nouveaux familiers dans la boutique : 🦆 Canard jaune, 🪱 Ver de terre, 🦫 Capybara, 🐝 Abeille, 🕷️ Araignée!",
  ]},
  { version:"1.55.0", date:"2026-06-15", features:[
    "🧹 Grand ménage : les vieilles tâches « orphelines » (anciens doublons qui ne servaient plus) sont retirées pour de bon, et elles ne reviennent plus à la prochaine synchro. La liste de tâches reste propre.",
  ]},
  { version:"1.54.0", date:"2026-06-15", features:[
    "🛒 La boutique se renouvelle CHAQUE JOUR : de nouvelles récompenses à découvrir tous les matins (avant c'était chaque semaine).",
    "🪟 Correctif : le popup de félicitations / récompense ne déborde plus hors de l'écran — il s'adapte et défile sur les petits écrans (téléphones).",
  ]},
  { version:"1.53.0", date:"2026-06-15", features:[
    "➕ Ajouter une quête, version facile : tu CHOISIS maintenant dans une grille colorée par catégorie (Routine, Cuisine, Ménage, Dehors, Défi…) au lieu de tout réécrire. Plus rapide à trouver, et fini les doublons!",
    "✏️ Tu peux encore créer ta propre tâche si tu ne la trouves pas — et si elle existe déjà, le jeu la réutilise au lieu d'en faire une copie.",
  ]},
  { version:"1.52.0", date:"2026-06-15", features:[
    "🐾 Familiers plus difficiles à faire évoluer : 8 stades (Bébé → Légendaire) avec une courbe beaucoup plus longue. Devenir Légendaire est maintenant un vrai objectif de plusieurs semaines, pas d'une journée!",
    "🌙 Ton familier grandit en prenant soin de lui CHAQUE JOUR : il gagne au max un peu d'XP par jour (plus de gros « farm » d'un coup). Nourris-le et fais tes quêtes tous les jours pour qu'il évolue.",
    "✅ Personne ne perd son stade : les familiers déjà avancés gardent (ou améliorent) leur niveau avec la nouvelle courbe.",
  ]},
  { version:"1.51.0", date:"2026-06-15", features:[
    "⏱️ Minuterie de rituel : depuis un rituel, touche « Partir le minuteur de ce rituel » — il charge ton heure de fin et te donne de l'XP quand tu le réussis dans les temps.",
    "🛠️ La minuterie libre (sans rituel) est maintenant juste un OUTIL : elle ne donne plus d'XP « pour rien ». Pour gagner de l'XP, choisis un rituel dans la minuterie.",
  ]},
  { version:"1.50.0", date:"2026-06-15", features:[
    "🗂️ L'onglet « Tout » des rituels est rangé! Tes tâches sont maintenant regroupées par rituel (Matin, Soir…), repliées par défaut. Touche un rituel pour l'ouvrir — fini la liste sans fin qui scrolle à l'infini.",
  ]},
  { version:"1.49.0", date:"2026-06-15", features:[
    "🧭 Navigation simplifiée : sur ta page d'accueil, des gros boutons mènent à 👨‍👩‍👧‍👦 Famille, 📅 Calendrier et ⏱️ Minuterie. Plus de barre d'onglets en double en haut — un bouton 🏠 Accueil te ramène toujours chez toi.",
    "🛠️ Glitch corrigé : « j'ai changé d'idée » ne rembourse plus qu'une seule fois par récompense (fini les pièces infinies!).",
  ]},
  { version:"1.48.0", date:"2026-06-15", features:[
    "🧹 Les tâches qu'un enfant s'invente valent moins (anti-farm), ne s'ajoutent plus au catalogue des autres, et celles « ajoutées à ma journée » s'effacent toutes seules après la journée.",
    "🗑️ Parent : bouton pour supprimer d'un coup les tâches perso d'un enfant (onglet 📋 Tâches) — et les suppressions « tiennent » maintenant (ne reviennent plus).",
  ]},
  { version:"1.47.0", date:"2026-06-15", features:[
    "🕐 Minuterie « Heure de fin » : choisis l'heure où tu dois être prêt (7h, 7h30, 8h ou autre). Le minuteur affiche « il reste X min » et lance un « 🚀 Let's go! » à 5 minutes. Parfait pour la routine du matin!",
  ]},
  { version:"1.46.0", date:"2026-06-14", features:[
    "☰ Le menu est maintenant dans le header (en haut à droite) — il remplace le cadenas et la porte (qui sont dedans : Validation parent, Quitter).",
  ]},
  { version:"1.45.0", date:"2026-06-14", features:[
    "☰ Nouveau menu : un seul bouton « Menu » regroupe tes réglages, les Archives, et « J'ai trouvé un bug ».",
    "🗄️ Archives : retrouve tes quêtes complétées aujourd'hui.",
    "🐛 J'ai trouvé un bug → s'envoie directement à ton parent (il le voit dans son portail).",
  ]},
  { version:"1.44.0", date:"2026-06-14", features:[
    "⏳ Minuterie : nouveau mode COMPTE À REBOURS (choisis tes minutes), avec « 🎉 J'ai réussi » ou « 😅 Oups, prochaine fois » — pas de récompense si pas réussi. Tu peux aussi nommer ce que tu chronomètres.",
    "📋 Portail parent : les demandes « À valider » sont regroupées par enfant (avec « ✅ Tout valider »).",
    "🎮 Mini-jeux : explications plus claires des touches (doigt, espace, flèches).",
  ]},
  { version:"1.43.0", date:"2026-06-14", features:[
    "🐛 GROS FIX : une quête validée ne « revient » plus quelques secondes après (la synchro fusionne maintenant au lieu d'écraser).",
    "🏃 Fix du jeu « Cours et saute » : appuie n'importe où sur l'écran pour sauter (ça marche enfin!).",
    "📱 Fix : la fenêtre du code parent ne dépasse plus de l'écran sur téléphone.",
    "🔓 Le bouton « PARENT » rouvre toujours le menu (plus besoin de se reconnecter).",
  ]},
  { version:"1.42.0", date:"2026-06-14", features:[
    "⚔️ COMBAT DE BOSS! Quand un boss est lancé, un onglet rouge ⚔️ BOSS apparaît. Chaque quête validée te donne un jeton d'attaque : choisis une petite (1 jeton) ou une grosse (3 jetons) attaque pour enlever des PV au boss. Battez-le en famille!",
    "❤️ Le boss riposte : si la famille ralentit, les PV de la famille baissent (vite, attaquez!). Vaincre le boss donne +40 🪙 à tout le monde.",
    "🎚️ Le parent choisit la difficulté du boss (Facile / Moyen / Costaud).",
    "🟢🟡🔴 Quand tu crées ta propre tâche, tu choisis sa difficulté — plus c'est dur, plus ça donne d'XP et de pièces!",
  ]},
  { version:"1.41.0", date:"2026-06-14", features:[
    "🐣 Familier VIVANT! Nourris-le chaque jour (🍖) pour qu'il reste en forme — c'est seulement nourri qu'il gagne de l'XP avec tes quêtes.",
    "⚡ Jauge d'énergie : jouer avec ton familier et ouvrir des coffres dépensent de l'énergie. Quand elle est basse, il fait une 💤 sieste et se recharge tout seul (reviens plus tard!). Tes quêtes, elles, sont toujours faisables.",
    "🔥 Série : le nombre de jours d'affilée où tu fais au moins une quête s'affiche sur ton Accueil.",
  ]},
  { version:"1.40.0", date:"2026-06-14", features:[
    "🤝 Échange de pièces : en plus de DONNER, tu peux maintenant DEMANDER des pièces à un frère depuis son profil. Il reçoit ta demande sur son Accueil (📬) et peut accepter ou refuser. (idée de D1TEXXY)",
  ]},
  { version:"1.39.0", date:"2026-06-14", features:[
    "🎒 Quand tu regardes le profil d'un frère, tu vois son inventaire (ses items et son familier)! (idée de LE FRERO)",
  ]},
  { version:"1.38.0", date:"2026-06-14", features:[
    "🧹 Accueil désencombré! Une barre d'onglets en bas : 🏠 Accueil · ✅ Aujourd'hui · 📅 Semaine · 🛒 Boutique.",
    "🏠 Accueil = ton profil + ton familier + tes badges. ✅ Aujourd'hui = tout ce qu'il y a à faire aujourd'hui. 📅 Semaine = calendrier et tâches à venir.",
  ]},
  { version:"1.37.0", date:"2026-06-14", features:[
    "🐾 Familiers qui ÉVOLUENT! Ton familier équipé gagne de l'XP à chaque quête et monte de niveau (Bébé → Légendaire). Il garde sa progression même si tu l'enlèves.",
    "🎒 Fenêtre du perso refaite : nouvel onglet « Familier » pour voir ton compagnon grandir.",
    "📈 Niveaux plus difficiles et 10 niveaux à atteindre (Mythique, Divin, Suprême!) — vous trouviez ça trop facile 😉",
    "📣 Le fil regroupe les quêtes : « X a accompli 5 quêtes » au lieu de 5 lignes.",
  ]},
  { version:"1.36.0", date:"2026-06-14", features:[
    "🐛 GROS FIX : l'argent dépensé ne revient plus à la prochaine connexion (fini les achats infinis!)",
    "🏅 Fix : un badge ne se fête plus en double",
    "⏱ Minuterie : tu peux partir un chrono libre, sans rituel",
  ]},
  { version:"1.35.0", date:"2026-06-14", features:[
    "🧭 Navigation plus claire : un gros choix Semaine / Rituels, puis les rituels en dessous (fini le méli-mélo)",
    "🛟 Fini l'écran qui saute tout seul : la synchro ne te ramène plus ailleurs pendant que tu joues",
    "🪙 Échange de pièces : tu peux DONNER des pièces à un frère depuis son profil",
    "🔒 Plus de niaiseries : tu ne peux pas ouvrir la session d'un autre ni changer ses affaires (mais voir son profil, oui!)",
    "💰 Économie rééquilibrée : les prix montent, les coffres coûtent plus cher et les doublons rapportent moins (les pièces ont enfin de la valeur!)",
  ]},
  { version:"1.34.0", date:"2026-06-14", features:[
    "🙂 Dans « Mes réglages », un enfant peut maintenant changer SON pseudo et SON code secret lui-même",
    "🔧 Le code parent peut être réinitialisé/changé depuis n'importe quel appareil (correctif de synchro)",
  ]},
  { version:"1.33.0", date:"2026-06-14", features:[
    "➕ Un enfant peut maintenant créer ses PROPRES tâches directement dans un rituel (plus besoin d'attendre qu'un parent en ajoute) — il est autonome!",
    "🔑 Le code (PIN) d'un enfant peut être changé depuis un autre appareil et se synchronise partout",
  ]},
  { version:"1.32.0", date:"2026-06-14", features:[
    "🎁 Un parent peut offrir un mini-jeu surprise (ex: Pac-Man) à un enfant : il apparaît à sa prochaine connexion!",
  ]},
  { version:"1.31.0", date:"2026-06-14", features:[
    "🎉 Quand un parent valide une quête sur un autre appareil, c'est l'ENFANT qui aura sa fête (popup + jeu de niveau) à sa prochaine connexion — fini les félicitations qui s'affichent sur l'écran du parent!",
  ]},
  { version:"1.30.0", date:"2026-06-14", features:[
    "🐛 Fix : l'avatar est de nouveau modifiable (les morceaux se sauvegardent)",
    "✉️ Fix : le bouton « bug » copie l'adresse courriel et la montre (plus de cul-de-sac)",
  ]},
  { version:"1.29.0", date:"2026-06-13", features:[
    "🎁 Coffres mystères! Ouvre un coffre (Commun/Rare/Légendaire) pour un item surprise — plus le coffre est rare, plus la chance d'un item Légendaire ou Unique!",
    "💰 Doublon = des pièces remboursées",
  ]},
  { version:"1.28.0", date:"2026-06-13", features:[
    "🎯 Objectifs du jour — réussis des défis quotidiens (3 quêtes, 6 quêtes, 60 XP) pour des bonus à réclamer!",
  ]},
  { version:"1.27.0", date:"2026-06-13", features:[
    "💎 Raretés des items! Commun, Rare, Ultra Rare, Légendaire, Unique — bordures et lueurs colorées pour les plus rares",
  ]},
  { version:"1.26.0", date:"2026-06-13", features:[
    "🧭 Fix Safari (page blanche) — on retire le cache hors-ligne qui restait bloqué + compatibilité Safari plus ancien",
  ]},
  { version:"1.25.0", date:"2026-06-13", features:[
    "🎮 Mini-jeux ralentis (plus doux) + plus de « OK » en trop : un seul écran d'intro puis 3·2·1·GO!",
  ]},
  { version:"1.24.0", date:"2026-06-13", features:[
    "📅 Le parent ajoute des événements au calendrier (récurrents ou datés) pour un ou plusieurs enfants",
    "🗓️ Nouvel onglet « Calendriers » — voir le calendrier de chacun",
    "⏱ Nouvel onglet « Minuterie » — chronomètre ton rituel avec des encouragements; à la fin, ton temps et ton XP s'affichent dans le fil!",
  ]},
  { version:"1.23.0", date:"2026-06-13", features:[
    "🧭 Fix Safari — l'app se charge maintenant même si le service worker n'est pas dispo",
    "🎁 Récompense achetée : « J'ai changé d'idée » (remboursé) + « Cacher » (une nouvelle prend sa place)",
    "✨ « Routine » devient « Rituel »!",
  ]},
  { version:"1.22.0", date:"2026-06-13", features:[
    "🏅 Badges en pixel-art (médaillons dorés avec un symbole du défi) — fini les emojis sur les badges!",
  ]},
  { version:"1.21.1", date:"2026-06-13", features:[
    "🐛 Fix : la quête ajoutée par l'enfant apparaît maintenant tout de suite dans sa vue",
  ]},
  { version:"1.21.0", date:"2026-06-13", features:[
    "🎁 Nouvelles récompenses + elles changent au hasard chaque semaine (fini de choisir, place à la surprise!)",
    "🛠️ Fix « Modifier le livre » — ça ouvre bien tes enfants et tâches (au lieu d'un nouveau livre vide)",
    "➕ Un enfant peut s'ajouter une quête à sa journée; et on choisit l'image avec une grille d'emojis",
    "↩️ Le parent peut annuler une récompense réclamée par erreur (les pièces sont remises)",
    "🏅 Badges plus difficiles à mériter",
    "← Bouton Retour en haut ET en bas des écrans (jamais coincé)",
  ]},
  { version:"1.20.0", date:"2026-06-13", features:[
    "🐉 Boss de famille! Un monstre surprise apparaît — toute la famille gagne de l'XP ensemble pour le vaincre, et tout le monde reçoit une récompense!",
    "🎨 Boss en pixel-art original (le parent le lance depuis le portail, onglet Actions)",
  ]},
  { version:"1.19.0", date:"2026-06-13", features:[
    "📣 Fil de famille — vois ce que tout le monde accomplit, mets des ❤️ et écris un petit mot à la famille!",
    "🧩 Le parent peut préparer une routine pour un enfant depuis le portail",
  ]},
  { version:"1.18.0", date:"2026-06-13", features:[
    "🔒 Confidentialité — un enfant connecté ne voit que SON onglet (plus possible de modifier la routine d'un frère)",
    "🎨 Design allégé — moins de lueurs, de bordures et de clignotements (plus reposant pour les yeux)",
    "👀 Les avatars clignent des yeux! Et ton familier (animal) apparaît dans la fenêtre de ton perso",
  ]},
  { version:"1.17.0", date:"2026-06-13", features:[
    "📊 Progrès de la semaine — graphique de l'XP gagné par jour pour chaque membre, dans la vue Famille",
    "🏆 Qui est en tête cette semaine — petite compétition amicale pour se motiver",
  ]},
  { version:"1.16.0", date:"2026-06-13", features:[
    "⚙️ Mes réglages (par enfant) : 🔊 son, 🎬 mode calme (moins d'animations/flash), ⏱ décompte calme, 😄 messages rigolos, 🎯 une tâche à la fois",
    "♿ Plus accessible pour tout le monde — respecte aussi le réglage « moins d'animations » de l'appareil",
    "← Boutons Retour partout (fini d'être coincé dans un écran)",
  ]},
  { version:"1.15.0", date:"2026-06-13", features:[
    "🎨 Choix du thème chaque semaine — touche « Mon thème » pour en changer (un nouveau choix par semaine)",
    "🔓 Débloque de nouveaux thèmes en gagnant de l'XP — l'écran montre lesquels et combien d'XP il manque",
    "🏅 Chaque thème a ses propres badges et items de boutique",
  ]},
  { version:"1.14.1", date:"2026-06-13", features:[
    "💬 Plus d'explications partout pour les enfants — quoi toucher, quoi cocher, comment ça marche",
    "🔢 Étapes numérotées (1/4, 2/4…) quand on crée son compte",
  ]},
  { version:"1.14.0", date:"2026-06-13", features:[
    "🔄 Les tâches se remettent à zéro chaque jour — la routine est à refaire chaque matin (l'XP gagné reste pour toujours!)",
    "⏰ Chaque routine peut avoir sa propre heure de fin (Matin, Soir…)",
    "✏️ On peut modifier une routine déjà créée (ajouter/retirer des tâches, renommer)",
    "📅 Vue Semaine — les tâches d'aujourd'hui sont mises en avant",
    "☁️ Petit indicateur quand la progression est synchronisée sur tous les appareils",
  ]},
  { version:"1.13.1", date:"2026-06-13", features:[
    "🏠 Connexion → on arrive direct sur l'accueil Semaine",
    "➕ Bouton bien en vue pour créer une nouvelle routine",
    "🚪 Bouton déconnexion (changer d'enfant) + 🔒 sortir du mode parent",
    "⏳ Les mini-jeux expliquent quoi faire et donnent un décompte « 3·2·1·GO! »",
    "🛑 Fini le gros chrono rouge « en retard » dans la vue parent et le soir",
  ]},
  { version:"1.13.0", date:"2026-06-13", features:[
    "🔀 Chaque enfant peut basculer entre ⏰ Rituel et 📅 Semaine — son XP et sa progression se cumulent dans les deux modes!",
    "🎨 Un seul thème par enfant, le même en mode Routine et en mode Semaine",
    "☁️ Synchro plus prudente — la progression de chaque appareil se fusionne sans jamais s'écraser (l'XP ne peut que monter)",
    "📋 Portail parent — on choisit maintenant si une tâche est de type Routine ou Semaine en l'ajoutant",
  ]},
  { version:"1.12.0", date:"2026-06-12", features:[
    "🔑 Fix connexion — le code se valide à nouveau tout seul au 4e chiffre!",
    "📨 Tâches autonomes — l'enfant envoie sa tâche faite, plus besoin du code parent sur place!",
    "✅ Portail parent — nouvel onglet «À valider» pour confirmer ou refuser les demandes",
    "📋 Gestion des tâches — ajouter/retirer des tâches directement du portail parent",
    "📚 Fix calendrier — valider un devoir/examen donne maintenant vraiment l'XP (c'était cassé!)",
    "☁️ Synchronisation multi-appareils — la progression suit partout via la base Postgres de Canner (voir SYNC.md)",
  ]},
  { version:"1.11.0", date:"2026-06-12", features:[
    "🎨 Un seul thème à choisir — l'écran entier suit maintenant le thème du joueur, fini l'ambiance globale séparée",
    "📜 Liste de tâches déroulante — on peut enfin voir toutes les tâches dans la configuration",
    "🏅 Badges tactiles — appuie sur un badge pour voir comment le débloquer (fini le survol souris)",
    "✏️ Textes revus — vocabulaire simplifié partout, plus de mots techniques",
  ]},
  { version:"1.10.0", date:"2026-06-08", features:[
    "🎮 Runner au level-up — mini-jeu style Chrome Dino: saute les obstacles, ramasse les pièces",
    "👻 Pac-Quest au level-up — mini-jeu style Pac-Man: mange les pellets, évite le fantôme",
    "🎲 Jeu choisi aléatoirement — whack-a-mole, runner ou pac-quest au level-up",
    "⌨️ PIN clavier corrigé — Enter fonctionne, plus de blocage de saisie rapide",
  ]},
  { version:"1.9.1", date:"2026-06-08", features:[
    "⌨️ Saisie PIN au clavier — chiffres, Backspace et Escape fonctionnent maintenant",
    "👧 Écran «C'est quoi cette appli» reécrit pour les enfants — ton/conseils XP adaptés",
    "💬 Descriptions contextuelles — petites phrases d'aide dans le tableau de bord",
  ]},
  { version:"1.9.0", date:"2026-06-08", features:[
    "📱 Interface responsive — optimisée tablette et bureau",
    "👤 Profil Duolingo — stats, XP, badges et classement famille par joueur",
    "😂 Messages humoristiques — quand tu complètes une tâche... ou rates le code PIN",
  ]},
  { version:"1.8.2", date:"2026-06-08", features:[
    "📚 Bonus calendrier — +5 XP et +2 🪙 à chaque devoir ou examen ajouté",
  ]},
  { version:"1.8.1", date:"2026-06-08", features:[
    "ℹ️ Présentation de l'appli — guide pour les parents sur l'écran d'accueil",
  ]},
  { version:"1.8.0", date:"2026-06-07", features:[
    "📋 Report de tâches — tâches en attente d'hier proposées au lendemain",
    "🎮 Mini-jeu au level-up — tape les icônes thématiques pour gagner un bonus XP!",
  ]},
  { version:"1.6.0", date:"2026-06-07", features:[
    "🧒 Nouvelle connexion — Enfant ou Parent, puis choix du joueur",
    "🎨 Onboarding 1er login — thème, avatar, surnom et code secret",
    "📅 Calendrier examens/devoirs — rappels automatiques 3 jours avant",
  ]},
  { version:"1.5.0", date:"2026-06-07", features:[
    "🔑 Code secret par joueur — chaque aventurier protège son compte",
  ]},
  { version:"1.4.0", date:"2026-06-07", features:[
    "👋 Écran de sélection — chaque joueur choisit sa carte au démarrage",
    "🔐 Accès parent sécurisé depuis l'écran d'accueil",
  ]},
  { version:"1.3.0", date:"2026-06-07", features:[
    "🏅 Système de badges — débloquez des trophées en complétant des quêtes!",
    "🎨 Thèmes XP-gatés — chaque joueur commence avec 2 thèmes aléatoires",
    "🪪 Pseudos — les joueurs peuvent se créer un surnom visible par tous",
    "💾 Migration automatique — vos données sont préservées entre les mises à jour",
  ]},
  { version:"1.2.0", date:"2026-06-01", features:[
    "🎨 Thèmes verrouillés par XP — débloquez de nouveaux thèmes en progressant",
    "✍️ Pseudos personnalisés pour chaque joueur",
  ]},
];
