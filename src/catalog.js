// ─── CATALOGUE DES TÂCHES, RÉCOMPENSES ET BADGES ───────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : données pures + fonctions
// dérivées. Seule dépendance externe : getLevel (src/leveling.js) pour les badges de
// niveau. weeklyRewards() reste dans App.jsx (dépend de todayStamp, utilitaire partagé).
import { getLevel } from "./leveling.js";

// ─── TASK CATALOG ────────────────────────────────────────────
export const TASK_CATALOG = [
  // Cuisine
  { id:"tc01", emoji:"🍽️", label:"Faire le lave-vaisselle (haut)",         xp:15, coins:8,  diff:"easy",   cat:"cuisine" },
  { id:"tc02", emoji:"🍽️", label:"Faire le lave-vaisselle (bas)",           xp:15, coins:8,  diff:"easy",   cat:"cuisine" },
  { id:"tc03", emoji:"🫙",  label:"Remplir le lave-vaisselle",               xp:15, coins:8,  diff:"easy",   cat:"cuisine" },
  { id:"tc04", emoji:"🧼",  label:"Laver la grosse vaisselle + essuyer",     xp:25, coins:12, diff:"medium", cat:"cuisine" },
  { id:"tc05", emoji:"🍳",  label:"Aider en cuisine pour un repas",          xp:30, coins:15, diff:"medium", cat:"cuisine" },
  { id:"tc06", emoji:"🧺",  label:"Vider ma boîte à lunch",                 xp:10, coins:5,  diff:"easy",   cat:"cuisine" },
  { id:"tc07", emoji:"🪣",  label:"Laver la table",                          xp:15, coins:8,  diff:"easy",   cat:"cuisine" },
  { id:"tc08", emoji:"🧽",  label:"Laver les comptoirs de la cuisine",       xp:20, coins:10, diff:"easy",   cat:"cuisine" },
  // Ménage
  { id:"tm01", emoji:"🗑️", label:"Préparer les poubelles",                  xp:15, coins:8,  diff:"easy",   cat:"menage"  },
  { id:"tm02", emoji:"🗑️", label:"Sortir les poubelles",                    xp:20, coins:10, diff:"easy",   cat:"menage"  },
  { id:"tm03", emoji:"♻️", label:"Préparer la récup",                       xp:15, coins:8,  diff:"easy",   cat:"menage"  },
  { id:"tm04", emoji:"♻️", label:"Sortir la récup",                         xp:20, coins:10, diff:"easy",   cat:"menage"  },
  { id:"tm05", emoji:"🌿",  label:"Vider le compost",                        xp:15, coins:8,  diff:"easy",   cat:"menage"  },
  { id:"tm06", emoji:"🌿",  label:"Sortir le compost",                       xp:20, coins:10, diff:"easy",   cat:"menage"  },
  { id:"tm07", emoji:"🧹",  label:"Laver le plancher d'une pièce",           xp:35, coins:18, diff:"hard",   cat:"menage"  },
  { id:"tm08", emoji:"🛏️", label:"Ménage de mon lit (rangement dodo)",       xp:20, coins:10, diff:"easy",   cat:"menage"  },
  { id:"tm09", emoji:"🪆",  label:"Ménage de mon cocon (chambre)",           xp:30, coins:15, diff:"medium", cat:"menage"  },
  { id:"tm10", emoji:"🗂️", label:"Ménage de mon bureau",                    xp:25, coins:12, diff:"medium", cat:"menage"  },
  { id:"tm11", emoji:"👕",  label:"Ranger une brassée de vêtements",         xp:25, coins:12, diff:"medium", cat:"menage"  },
  { id:"tm12", emoji:"🚿",  label:"Laver le lavabo de la salle de bain",     xp:20, coins:10, diff:"easy",   cat:"menage"  },
  { id:"tm13", emoji:"🛋️", label:"Ranger la véranda",                       xp:25, coins:12, diff:"medium", cat:"menage"  },
  // Routine
  { id:"tr01", emoji:"🥣",  label:"Bon déjeuner",                            xp:10, coins:5,  diff:"easy",   cat:"routine" },
  { id:"tr02", emoji:"💊",  label:"Prendre ses pilules",                      xp:20, coins:10, diff:"easy",   cat:"routine" },
  { id:"tr03", emoji:"🎒",  label:"Préparer son sac",                        xp:15, coins:8,  diff:"easy",   cat:"routine" },
  { id:"tr04", emoji:"🚿",  label:"Prendre ma douche",                       xp:20, coins:10, diff:"easy",   cat:"routine" },
  { id:"tr05", emoji:"🛁",  label:"Bain",                                    xp:20, coins:10, diff:"easy",   cat:"routine" },
  { id:"tr06", emoji:"📚",  label:"Faire ses devoirs + études",              xp:40, coins:20, diff:"hard",   cat:"routine" },
  { id:"tr07", emoji:"🌙",  label:"Routine du soir complète",                xp:25, coins:12, diff:"medium", cat:"routine" },
  { id:"tr08", emoji:"🧼",  label:"Pipi, mains, dents",                      xp:10, coins:5,  diff:"easy",   cat:"routine" },
  { id:"tr09", emoji:"💊",  label:"Prendre ma pilule (matin)",               xp:20, coins:10, diff:"easy",   cat:"routine" },
  { id:"tr10", emoji:"💊",  label:"Prendre ma pilule (soir)",                xp:20, coins:10, diff:"easy",   cat:"routine" },
  // Défis
  { id:"td01", emoji:"😴",  label:"Laisser la tribu dormir le matin",        xp:50, coins:25, diff:"boss",   cat:"defi"    },
  { id:"td02", emoji:"🍜",  label:"Être calme au souper",                    xp:35, coins:18, diff:"hard",   cat:"defi"    },
  { id:"td03", emoji:"💬",  label:"Nommer clairement son émotion",           xp:40, coins:20, diff:"hard",   cat:"defi"    },
  { id:"td04", emoji:"🤝",  label:"Nommer son mécontentement avec bienveillance", xp:45, coins:22, diff:"boss", cat:"defi" },
  { id:"td05", emoji:"🛌",  label:"Être dans mon lit à max 20h15",           xp:40, coins:20, diff:"hard",   cat:"defi"    },
  { id:"td06", emoji:"🪥",  label:"Faire ma routine du dodo seul en SDB",    xp:35, coins:18, diff:"hard",   cat:"defi"    },
  { id:"td07", emoji:"📖",  label:"Lire calmement dans mon lit avant bonne nuit", xp:30, coins:15, diff:"medium", cat:"defi" },
  { id:"td08", emoji:"💤",  label:"M'endormir seul",                         xp:70, coins:35, diff:"boss",   cat:"defi"    },
  { id:"td09", emoji:"🐇",  label:"Cueillir des verdures pour Boulette",     xp:20, coins:10, diff:"easy",   cat:"defi"    },
  { id:"td10", emoji:"👫",  label:"Jouer 45 minutes calmement avec mon frère", xp:40, coins:20, diff:"hard", cat:"defi"    },
  // Quêtes récurrentes de la semaine de garde (rc_*) — auto-générées, ne pas modifier manuellement
  { id:"rc_brassee",        emoji:"🧺", label:"Faire une brassée avec mon frère",      xp:35, coins:18, diff:"hard",  cat:"menage"  },
  { id:"rc_lavabo_cuisine", emoji:"🚰", label:"Nettoyer le lavabo de la cuisine",       xp:15, coins:8,  diff:"easy",  cat:"menage"  },
  { id:"rc_contour_bain",   emoji:"🛁", label:"Nettoyer le contour du bain",            xp:20, coins:10, diff:"easy",  cat:"menage"  },
  { id:"rc_chaises",        emoji:"🪑", label:"Nettoyer les chaises de la cuisine",     xp:15, coins:8,  diff:"easy",  cat:"cuisine" },
  { id:"rc_veranda",        emoji:"🪴", label:"Arroser les plantes de la véranda",      xp:15, coins:8,  diff:"easy",  cat:"outdoor" },
  { id:"rc_balcon",         emoji:"🌺", label:"Arroser les plantes du balcon",          xp:15, coins:8,  diff:"easy",  cat:"outdoor" },
  // Outdoor & Jardin
  { id:"to01", emoji:"⚽",  label:"Jouer dehors en harmonie",                xp:35, coins:18, diff:"hard",   cat:"outdoor" },
  { id:"to02", emoji:"🚴",  label:"Faire du vélo",                           xp:25, coins:12, diff:"medium", cat:"outdoor" },
  { id:"to03", emoji:"🌿",  label:"Arroser le jardin cour",                  xp:20, coins:10, diff:"easy",   cat:"outdoor" },
  { id:"to04", emoji:"🌸",  label:"Arroser le jardin devant",                xp:20, coins:10, diff:"easy",   cat:"outdoor" },
];

export const CAT_LABELS = { cuisine:"🍳 Cuisine", menage:"🏠 Ménage", routine:"⏰ Rituel", defi:"🎯 Défis", outdoor:"🌳 Dehors" };
export const DIFF_COLOR = d => ({ easy:"#5CAD68", medium:"#D9BC5C", hard:"#FF6B35", boss:"#FF2222" }[d] || "#aaa");
// Backlog UX #12 — temps approximatif par tâche, dérivé du palier de difficulté (pas au cas par cas,
// pour rester cohérent entre les 47 tâches du catalogue) — même patron que DIFF_COLOR ci-dessus.
export const DIFF_EST_MIN = { easy:8, medium:18, hard:25, boss:30 };
export const estMinOf = d => DIFF_EST_MIN[d] || 15;

// ─── REWARD CATALOG ──────────────────────────────────────────
// (emoji = placeholder temporaire — remplacé par du pixel-art dans le milestone art)
// v1.92.0 (Lot 4 #19) — `cat` optionnel distingue les récompenses ÉCRAN des récompenses
// CALME (temps calme/apaisant), pour que la boutique ne pousse pas que vers l'écran —
// utile pour les enfants neuroatypiques qui bénéficient d'alternatives de régulation visibles.
// v2.6.2 — champ `moment:true` (décision Gen 26 juillet) : récompenses qui demandent un CRÉNEAU
// à deux (parent + enfant), donc à planifier ensemble plutôt qu'à consommer sur-le-champ (voir
// handleBuy + section « 🗓️ À planifier ensemble » du portail parent). Les permissions instantanées
// (2e dessert, servi au souper, écran, bonbon…) restent des achats simples, aucun changement.
// Refonte visuelle Phase 2 (27-07) — `tier` explicite (≤30🪙 base = petite, 35-60 = moyenne,
// ≥70 = épique) au lieu de réutiliser rarityOf(cost) : les seuils cosmétiques (Rare dès 20🪙)
// classeraient un bonbon à 20🪙 comme "Rare", ce qui n'a pas de sens pour des récompenses réelles.
export const REWARD_CATALOG = [
  { id:"rw_ecran",   emoji:"📱", label:"15 minutes d'écran",                 coins:40, cat:"ecran", tier:"moyenne" },
  { id:"rw_parent",  emoji:"💝", label:"10 minutes privées avec ton parent", coins:35, cat:"calme", moment:true, tier:"moyenne" },
  { id:"rw_dessert", emoji:"🍰", label:"Permission de 2e dessert",           coins:30, tier:"petite" },
  { id:"rw_dejsoup", emoji:"🥞", label:"Permission de déjeuner au souper",   coins:35, tier:"moyenne" },
  { id:"rw_epicerie",emoji:"🛒", label:"Choix d'un achat à l'épicerie",      coins:60, moment:true, tier:"moyenne" },
  { id:"rw_depanneur",emoji:"🏪",label:"Choix d'un achat au dépanneur",      coins:70, moment:true, tier:"epique" },
  { id:"rw_jeu",     emoji:"🎲", label:"Choix d'un jeu de société en famille",coins:35, moment:true, tier:"moyenne" },
  { id:"rw_souper",  emoji:"🍽️", label:"Choix d'un souper pendant la semaine",coins:55, moment:true, tier:"moyenne" },
  { id:"rw_bonbon",  emoji:"🍬", label:"Manger un bonbon",                   coins:20, tier:"petite" },
  { id:"rw_ricochet",emoji:"↪️", label:"1 ricochet de tâche sur quelqu'un d'autre",coins:80, tier:"epique" },
  { id:"rw_debarrasse",emoji:"🧽",label:"On débarrasse ton repas",           coins:25, tier:"petite" },
  { id:"rw_servi",   emoji:"🍴", label:"Tu te fais servir au souper",        coins:30, tier:"petite" },
  { id:"rw_pasdetache",emoji:"🛌",label:"Pas de tâches aujourd'hui",         coins:150, moment:true, tier:"epique" },
  { id:"rw_dejlit",  emoji:"🛏️", label:"Déjeuner au lit",                    coins:45, cat:"calme", moment:true, tier:"moyenne" },
  { id:"rw_musique", emoji:"🎵", label:"Tu fais jouer ta musique dans la maison",coins:25, cat:"calme", tier:"petite" },
  { id:"rw_esclave", emoji:"🧞", label:"Ton parent est ton esclave 30 minutes",coins:90, moment:true, tier:"epique" },
  { id:"rw_bain",    emoji:"🛁", label:"Bain spécial mousse + chandelles",     coins:40, cat:"calme", moment:true, tier:"moyenne" },
];
export const REWARD_CAT_BADGE = { ecran:{label:"📱 Écran",color:"#FF8C6B"}, calme:{label:"🌙 Calme",color:"#7FD6E0"} };
// Refonte visuelle Phase 2 — mapping "planche Petite/Moyenne/Épique" : couleur + classe utilitaire
// (Phase 1, shared.js) pour la carte de récompense. tierOf() retombe sur les coins pour toute
// récompense custom future qui n'aurait pas encore de `tier` explicite.
export const REWARD_TIERS = {
  petite:  { label:"Petite",  color:"#9AA0A6", cls:"card-n1" },
  moyenne: { label:"Moyenne", color:"#4FA3FF", cls:"rarity-rare" },
  epique:  { label:"Épique",  color:"#FFB02E", cls:"rarity-legendaire" },
};
export const tierOf = (r) => REWARD_TIERS[r?.tier] ? r.tier : ((r?.coins||0)>=70 ? "epique" : (r?.coins||0)>=35 ? "moyenne" : "petite");

// ─── RARETÉS (incite à collectionner) ────────────────────────
// Refonte visuelle Phase 2 — `cls` pointe vers les classes .rarity-* (shared.js, Phase 1) qui
// factorisent le style inline déjà utilisé ici (bordure+dégradé+lueur), même rendu, dédupliqué.
export const RARITIES = [
  { min:0,  name:"Commun",     color:"#9AA0A6", cls:"rarity-commun" },
  { min:20, name:"Rare",       color:"#4FA3FF", cls:"rarity-rare" },
  { min:30, name:"Ultra Rare", color:"#B06BFF", cls:"rarity-ultra" },
  { min:45, name:"Légendaire", color:"#FFB02E", cls:"rarity-legendaire" },
  { min:60, name:"Unique",     color:"#FF5BAE", cls:"rarity-unique" },
];
export const rarityOf = (cost) => { let r=RARITIES[0]; for(const x of RARITIES) if((cost||0)>=x.min) r=x; return r; };

// ─── ÉCONOMIE (équilibrage « game master ») ───────────────────
// Prix de base montés d'un cran pour que les pièces aient de la valeur et qu'un
// item légendaire se MÉRITE. rarityOf reste sur le coût de BASE (la rareté ne bouge pas).
export const PRICE_MULT = 3; // v1.66.0 — items/familiers plus chers (Gen : « que ça dure longtemps »). Était 2.
export const baseCost = (it) => (it?.cost ?? it?.coins ?? 0); // items: .cost — récompenses: .coins
export const priceOf  = (it) => Math.round(baseCost(it) * PRICE_MULT);
// Récompense d'une tâche selon la difficulté choisie
export const DIFF_PRESETS = { easy:{xp:10,coins:5}, medium:{xp:20,coins:10}, hard:{xp:40,coins:20} };
// Plafond ANTI-FARM pour les tâches qu'un ENFANT se crée (valeurs réduites)
export const CHILD_DIFF_PRESETS = { easy:{xp:5,coins:2}, medium:{xp:8,coins:4}, hard:{xp:12,coins:6} };
// v1.53.0 — étiquettes de catégorie (couleur + libellé) pour le sélecteur de tâches en grille
export const CAT_META = {
  routine:{label:"Routine",color:"#9B5DE5"},
  cuisine:{label:"Cuisine",color:"#FF8C42"},
  menage:{label:"Ménage",color:"#4A90D9"},
  outdoor:{label:"Dehors",color:"#5CAD68"},
  defi:{label:"Défi",color:"#FF2D6F"},
  custom:{label:"Mes tâches",color:"#FFD24D"},
  reparation:{label:"Réparation",color:"#7FD6E0"}, // v2.6.0 — quêtes de réparation 🕊️ (teal doux, jamais de rouge)
};

// v2.6.0 — Quêtes de réparation 🕊️ (chantier approuvé par Gen le 25 juillet).
// Modèles proposés au PARENT (jamais dans TASK_CATALOG ni le TaskChooser enfant — création
// parent uniquement). Cadrage TOP/AuDHD non négociable : texte symétrique, aucun fautif,
// jamais les mots « conflit / dispute / faute » dans l'UI enfant ni le fil.
export const REPAIR_PRESETS = [
  { emoji:"🤝", label:"Faire la paix", steps:["Écouter l'autre","Trouver une solution ensemble","Se serrer la main"] },
  { emoji:"💬", label:"S'excuser et réparer", steps:["Dire ce qui s'est passé avec ses mots","S'excuser sincèrement","Réparer ou remplacer ce qui a été abîmé"] },
  { emoji:"🤲", label:"Aider l'autre à finir", steps:["Demander ce qui reste à faire","Faire sa part côte à côte","Célébrer le travail fini ensemble"] },
];
export const catMeta = (c) => CAT_META[c] || { label:"Autre", color:"#9AA0A6" };
export const normLabel = (s) => (s||"").toLowerCase().trim().replace(/\s+/g," ");

// v1.85.0 (Lot 2 #9) — catégories de calendrier au-delà de Événement/Devoir/Examen : tout ce qui
// n'est pas scolaire (camp de jour, match/entraînement, vaccin, intervenant à la maison…) avait
// jusqu'ici la même icône générique 📅. `type`/`recur`/`date` restent les mêmes champs — extension
// du tableau de types, pas une nouvelle mécanique.
export const CAL_TYPES = {
  sante:       { label:"🏥 Santé/rendez-vous", icon:"🏥" },
  sport:       { label:"⚽ Sport/activité",     icon:"⚽" },
  intervenant: { label:"🧑‍⚕️ Intervenant à la maison", icon:"🧑‍⚕️" },
  camp:        { label:"🏕️ Camp/sortie",        icon:"🏕️" },
  recompense:  { label:"🎁 Moment récompense",  icon:"🎁" }, // v2.6.2 — moment planifié depuis une récompense "moment:true"
};
export const calEventIcon = (e) => {
  if (e.type==="examen") return "📝";
  if (e.type==="devoir") return "📚";
  if (CAL_TYPES[e.type]) return CAL_TYPES[e.type].icon; // nouvelles catégories : icône dédiée même récurrent
  return e.recur ? "🔁" : "📅"; // "evenement" générique — comportement historique inchangé
};
// v1.64.0 — messages drôles de refus (déterministe par clé pour rester stable)
export const REFUS_MSGS = [
  "😹 Bien tenté! Cette quête part au recyclage…",
  "🙃 Pas tout à fait — on réessaiera une autre fois!",
  "🐙 Ton parent a dit « pas celle-là pour l'instant »!",
  "🎈 Cette quête s'envole… reviens-y plus tard!",
  "🛟 Refusée pour cette fois — pas grave, t'es capable!",
];
export const refusMsg = (key) => { let h=0; const s=String(key||""); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return REFUS_MSGS[h%REFUS_MSGS.length]; };

// ─── BADGE CATALOG ───────────────────────────────────────────
// type: "general" | themeId
// condition fn receives: (pState, completedCount, config, player)
export const BADGES = [
  // ── GÉNÉRAUX ──
  { id:"b_first",    emoji:"⭐", name:"Premier Sang",         desc:"Complète ta première quête",           type:"general", check:(ps)=>(ps.completed?.length||0)>=1 },
  { id:"b_5tasks",   emoji:"🔥", name:"En Feu",               desc:"Complète 15 quêtes",                   type:"general", check:(ps)=>(ps.completed?.length||0)>=15 },
  { id:"b_20tasks",  emoji:"💪", name:"Bras de Fer",          desc:"Complète 50 quêtes",                   type:"general", check:(ps)=>(ps.completed?.length||0)>=50 },
  { id:"b_50tasks",  emoji:"🏆", name:"Légende Vivante",      desc:"Complète 150 quêtes",                  type:"general", check:(ps)=>(ps.completed?.length||0)>=150 },
  { id:"b_xp100",    emoji:"⚡", name:"Chargé à Bloc",        desc:"Accumule 250 XP",                      type:"general", check:(ps)=>(ps.xp||0)>=250 },
  { id:"b_xp300",    emoji:"🌩️", name:"Orage Intérieur",      desc:"Accumule 600 XP",                      type:"general", check:(ps)=>(ps.xp||0)>=600 },
  { id:"b_xp500",    emoji:"🌟", name:"Supernova",            desc:"Accumule 1200 XP",                     type:"general", check:(ps)=>(ps.xp||0)>=1200 },
  { id:"b_coins50",  emoji:"💰", name:"Petit Trésor",         desc:"Gagne 100 pièces au total",            type:"general", check:(ps)=>(ps.coinsLifetime||0)>=100 }, // v2.5.0 — coinsLifetime (jamais réinitialisé), pas coins (reset chaque vendredi)
  { id:"b_coins150", emoji:"🤑", name:"Oncle Picsou",         desc:"Gagne 300 pièces au total",            type:"general", check:(ps)=>(ps.coinsLifetime||0)>=300 }, // v2.5.0 — idem
  { id:"b_buy1",     emoji:"🛒", name:"Première Récompense",  desc:"Achète une récompense",               type:"general", check:(ps)=>(ps.boughtRewards?.length||0)>=1 },
  { id:"b_buy5",     emoji:"🛍️", name:"Problème de Shopping", desc:"Achète 10 récompenses",                type:"general", check:(ps)=>(ps.boughtRewards?.length||0)>=10 },
  { id:"b_streak3",  emoji:"📅", name:"Journée Marathon",     desc:"6 quêtes dans la même journée",        type:"general", check:(ps,c)=>c>=6 }, // v2.5.25 — nom renommé (l'ancien "Machine à Habitudes" laissait croire à une série de jours, alors que c'est 6 quêtes en UNE journée — id/desc/check inchangés pour ne pas orpheliner les badges déjà gagnés
  { id:"b_level2",   emoji:"🆙", name:"Ya du Progrès",        desc:"Atteins le niveau 2",                  type:"general", check:(ps)=>getLevel(ps.xp||0).level>=2 },
  { id:"b_level3",   emoji:"🚀", name:"Spationaute du Ménage",desc:"Atteins le niveau 3",                  type:"general", check:(ps)=>getLevel(ps.xp||0).level>=3 },
  { id:"b_level4",   emoji:"👑", name:"Royauté de la Patate", desc:"Atteins le niveau 4",                  type:"general", check:(ps)=>getLevel(ps.xp||0).level>=4 },
  { id:"b_level5",   emoji:"🌈", name:"Dieu du Plancher Sale",desc:"Atteins le niveau 5 (LÉGENDE)",       type:"general", check:(ps)=>getLevel(ps.xp||0).level>=5 },
  // ── THÈMES ──
  { id:"bt_mc1",     emoji:"⛏️", name:"Mineur du Dimanche",   desc:"Creuseuse compulsive (Minecraft)",    type:"minecraftpp", check:(ps)=>(ps.completed?.length||0)>=3 },
  { id:"bt_mc2",     emoji:"💎", name:"Veine de Diamant",     desc:"50 XP en mode Minecraft",             type:"minecraftpp", check:(ps)=>(ps.xp||0)>=50 },
  { id:"bt_rb1",     emoji:"🎮", name:"Noob Accompli",        desc:"Première quête Roblox",               type:"roblox",      check:(ps)=>(ps.completed?.length||0)>=1 },
  { id:"bt_rb2",     emoji:"🏗️", name:"Robux Méritée",        desc:"100 XP en mode Roblox",              type:"roblox",      check:(ps)=>(ps.xp||0)>=100 },
  { id:"bt_hp1",     emoji:"🪄", name:"Accio Vaisselle",      desc:"Première quête Harry Potter",         type:"harrypotter", check:(ps)=>(ps.completed?.length||0)>=1 },
  { id:"bt_hp2",     emoji:"🦉", name:"Gardien de Gryffondor",desc:"5 quêtes en mode HP",                type:"harrypotter", check:(ps)=>(ps.completed?.length||0)>=5 },
  { id:"bt_gh1",     emoji:"🌿", name:"Esprit de la Forêt",   desc:"3 quêtes en mode Ghibli",            type:"ghibli",      check:(ps)=>(ps.completed?.length||0)>=3 },
  { id:"bt_hor1",    emoji:"💀", name:"Survivant·e",          desc:"Première quête Horreur",              type:"horreur",     check:(ps)=>(ps.completed?.length||0)>=1 },
  { id:"bt_hor2",    emoji:"🩸", name:"Bain de Sang Ménager", desc:"10 quêtes en mode Horreur",          type:"horreur",     check:(ps)=>(ps.completed?.length||0)>=10 },
  { id:"bt_mon1",    emoji:"🦠", name:"Mucus de Champion",    desc:"3 quêtes en mode Monstres",          type:"monstres",    check:(ps)=>(ps.completed?.length||0)>=3 },
  { id:"bt_lic1",    emoji:"🦄", name:"Paillettes Partout",   desc:"Première quête Licornes",            type:"licornes",    check:(ps)=>(ps.completed?.length||0)>=1 },
  { id:"bt_bf1",     emoji:"💥", name:"Boomerang Lancé",      desc:"5 quêtes en mode Boomerang Fu",      type:"boomerangfu", check:(ps)=>(ps.completed?.length||0)>=5 },
  { id:"bt_mar1",    emoji:"🦸", name:"Avec Grand Pouvoir",   desc:"50 XP en mode Marvel",               type:"marvel",      check:(ps)=>(ps.xp||0)>=50 },
  { id:"bt_jap1",    emoji:"🍜", name:"Ramen à la Maison",    desc:"3 quêtes en mode Japon",             type:"japon",       check:(ps)=>(ps.completed?.length||0)>=3 },
  { id:"bt_sci1",    emoji:"🔬", name:"Chercheur·se en Chef", desc:"5 quêtes en mode Science",           type:"microscopique",check:(ps)=>(ps.completed?.length||0)>=5 },
  { id:"bt_dis1",    emoji:"✨", name:"Bienvenue dans le Rêve",desc:"Première quête Disney",             type:"disney",      check:(ps)=>(ps.completed?.length||0)>=1 },
  { id:"bt_pix1",    emoji:"💡", name:"Lampe de Chevet",      desc:"3 quêtes en mode Pixar",             type:"pixar",       check:(ps)=>(ps.completed?.length||0)>=3 },
  // ── PAR ÉTIQUETTE (catégorie de tâche) — objectifs plus difficiles ──
  { id:"b_cat_menage10",  emoji:"🧹", name:"As du Ménage",        desc:"Fais 10 tâches de Ménage",  type:"general", check:(ps,c,cc)=>(cc?.menage||0)>=10 },
  { id:"b_cat_menage30",  emoji:"🧼", name:"Maître du Ménage",    desc:"Fais 30 tâches de Ménage",  type:"general", check:(ps,c,cc)=>(cc?.menage||0)>=30 },
  { id:"b_cat_cuisine10", emoji:"🍳", name:"Marmiton",            desc:"Fais 10 tâches de Cuisine", type:"general", check:(ps,c,cc)=>(cc?.cuisine||0)>=10 },
  { id:"b_cat_cuisine30", emoji:"👨‍🍳", name:"Chef de la Maison",   desc:"Fais 30 tâches de Cuisine", type:"general", check:(ps,c,cc)=>(cc?.cuisine||0)>=30 },
  { id:"b_cat_routine20", emoji:"⏰", name:"Roi des Routines",     desc:"Fais 20 tâches de Routine", type:"general", check:(ps,c,cc)=>(cc?.routine||0)>=20 },
  { id:"b_cat_defi10",    emoji:"🎯", name:"Casse-Cou",           desc:"Réussis 10 Défis",          type:"general", check:(ps,c,cc)=>(cc?.defi||0)>=10 },
  { id:"b_cat_outdoor10", emoji:"🌳", name:"Aventurier du Dehors",desc:"Fais 10 tâches Dehors",     type:"general", check:(ps,c,cc)=>(cc?.outdoor||0)>=10 },
  // ── PLUS DURS (longue haleine) ──
  { id:"b_100tasks", emoji:"💯", name:"Centurion",            desc:"Complète 100 quêtes",        type:"general", check:(ps)=>(ps.completed?.length||0)>=100 },
  { id:"b_300tasks", emoji:"🛡️", name:"Vétéran des Corvées",   desc:"Complète 300 quêtes",        type:"general", check:(ps)=>(ps.completed?.length||0)>=300 },
  { id:"b_xp2500",   emoji:"☄️", name:"Comète",               desc:"Accumule 2500 XP",           type:"general", check:(ps)=>(ps.xp||0)>=2500 },
  { id:"b_day10",    emoji:"🌟", name:"Journée Marathon",     desc:"10 quêtes dans la même journée", type:"general", check:(ps,c)=>c>=10 },
  { id:"b_boss",     emoji:"🐲", name:"Tombeur de Boss",      desc:"Vaincs un boss de famille en équipe", type:"general", check:()=>false }, // v1.72.0 — décerné à la victoire (pas via checkBadges)
  { id:"b_maitre",   emoji:"🧘", name:"Maître de soi",        desc:"Réussis ton défi de la semaine 7 jours sur 7", type:"general", check:()=>false }, // v2.6.2 — décerné au palier 7/7 du défi hebdo gradué (pas via checkBadges)
];

// v1.59.0 — compte les complétions par étiquette (catégorie de tâche) pour les badges par catégorie
export const completionCatCounts = (ps, config) => {
  const tasks=[...TASK_CATALOG, ...((config&&config.customTasks)||[])];
  const catByInst={}; ((config&&config.assignments)||[]).forEach(a=>{ const t=tasks.find(x=>x.id===a.taskId); if(t) catByInst[a.instanceId]=t.cat; });
  const counts={};
  (ps.completed||[]).forEach(k=>{ const base=k.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_")); const cat=catByInst[inst]; if(cat) counts[cat]=(counts[cat]||0)+1; });
  return counts;
};
// Returns array of newly earned badge IDs
export const checkBadges = (pState, player, dailyCount, catCounts={}) => {
  const themeId = player?.themeId || "none";
  const alreadyEarned = new Set(pState.badges || []);
  return BADGES
    .filter(b => !alreadyEarned.has(b.id))
    .filter(b => b.type === "general" || b.type === themeId)
    .filter(b => { try { return b.check(pState, dailyCount, catCounts); } catch { return false; } })
    .map(b => b.id);
};
