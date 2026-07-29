import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { SFX, setSfxMuted } from "./sfx.js";
import { CALM, setCalm } from "./calm.js";
import { PLAYER_THEMES, THEME_XP_UNLOCK, PT_LIST, getPlayerTheme, BASE_SHOP_ITEMS, ALL_SHOP_ITEMS, shopItemById, ULTRA_ITEMS, pickUltraLegendary } from "./themes.js";
import { PET_LEVELS, PET_STAGES, PET_DAILY_CAP, petLevel, petStage, petBar, mergePetXp, PET_SPRITES, PET_SPRITE_KEY, petSpriteKey, renderPetToCtx, ITEM_SPRITES, renderItemToCtx, PET_ELEMENTS, PET_ELEMENT_KEYS, petTierForLevel, petActiveElement, petIsLegendary, petFormLabel, petPalOverride, petPendingTier, petEvoOptions } from "./pets.js";
import { LEVELS, getLevel, getLevelTitle, xpBar } from "./leveling.js";
import { TASK_CATALOG, CAT_LABELS, DIFF_COLOR, estMinOf, REWARD_CATALOG, REWARD_CAT_BADGE, REWARD_TIERS, tierOf, RARITIES, rarityOf, PRICE_MULT, baseCost, priceOf, DIFF_PRESETS, CHILD_DIFF_PRESETS, CAT_META, catMeta, normLabel, CAL_TYPES, calEventIcon, calEventIconName, REFUS_MSGS, refusMsg, BADGES, completionCatCounts, checkBadges, REPAIR_PRESETS } from "./catalog.js";
import { Countdown, HeaderClock, TimeTimerDisc, TaskTimerModal } from "./timers.jsx";
import { PetSprite, ItemSprite, HELD_WEAPON_IDS, AVATAR_EQUIP_ANCHORS, equipAnchorStyle, EquippedGear, renderAvatarSprite, badgeSymbol, renderBadgeToCtx, BadgeIcon, CHESTS, pickFromChest, renderChestToCtx, ChestSprite, UIIcon, Coin, Xp } from "./sprites.jsx";
import { Toast, PinDots, PinKeypad } from "./ui.jsx";
import { DAYS_SHORT, fmtDateShort, displayName, THEMES, uid, todayStamp, weekKey, getWeeklyFreeTheme, isThemeUnlocked, GLOBAL_CSS, COLOR_DESATURATE_MAP } from "./shared.js";
import { WeekView } from "./weekview.jsx";
import { TaskChooser, CustomTaskModal } from "./taskpickers.jsx";
import { EvolutionModal, PinPad, RewardPopup } from "./popups.jsx";
import { SetupWizard } from "./setupwizard.jsx";
import { AVATAR_PARTS, DEFAULT_AVATAR, renderAvatarToCtx, AvatarCanvas } from "./avatar.jsx";
import { PlayerProfile } from "./playerprofile.jsx";
import { AvatarPopup } from "./avatarpopup.jsx";
import { DECO_CATALOG, decoForTheme, DecoSprite, HouseScene } from "./house.jsx";
import { spawnParticles } from "./particles.js";
import { InlineRitualTimer } from "./ritualtimer.jsx";
import { isCustodyWeek, custodyWeekKey, generateCustodyWeekAssignments, CHALLENGE_PERFECTION_FRAME_ID, challengeDaysCount, CHALLENGE_TIERS, carryOverUnfinishedTasks, isValidCustodyWeekKey } from "./recurring.js";

const APP_VERSION = "2.16.3";
const BUG_EMAIL = "sturnus.vulgaris.linnaeus@proton.me";
// v1.54.0 — Sélection ALÉATOIRE par JOUR (reset de la boutique chaque jour) — déterministe via la date
const weeklyRewards = (n=8) => {
  const wk = todayStamp();
  let seed = 0; for (let i=0;i<wk.length;i++) seed = (seed*31 + wk.charCodeAt(i)) >>> 0;
  const arr = REWARD_CATALOG.map((r,i)=>({r, k:((seed + i*2654435761) >>> 0)}));
  arr.sort((a,b)=>a.k-b.k);
  return arr.slice(0, Math.min(n, arr.length)).map(x=>x.r);
};

// ─── CONSTANTS ───────────────────────────────────────────────
const DAYS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];


// v1.52.0 — migration anti-rétrogradation : avec la nouvelle courbe (plus dure), on remonte
// l'XP des familiers existants pour qu'aucun enfant ne perde son stade. Mappe l'ancien niveau
// (courbe 6 paliers) vers le nouveau (8 paliers) et remonte au plancher du palier obtenu.
const PET_LEVELS_OLD = [0, 30, 80, 160, 280, 450];
const migratePetXpV2 = (petXp) => {
  const out = { ...(petXp || {}) };
  for (const k in out) {
    const xp = out[k] || 0;
    let oldLv = 1; for (let i = 0; i < PET_LEVELS_OLD.length; i++) if (xp >= PET_LEVELS_OLD[i]) oldLv = i + 1;
    const newLv = Math.max(1, Math.min(PET_LEVELS.length, Math.round(oldLv / PET_LEVELS_OLD.length * PET_LEVELS.length)));
    const floor = PET_LEVELS[newLv - 1] || 0;
    if (xp < floor) out[k] = floor;
  }
  return out;
};
// v1.52.0 — ajoute de l'XP au familier équipé en respectant le plafond quotidien. Retourne {petXp, petDay}.
const gainPet = (p, petId, amount) => {
  const cur = p.petXp || {}; const today = todayStamp();
  const pd0 = (p.petDay && p.petDay.day === today) ? p.petDay : { day: today, xp: 0 };
  if (!petId || !(amount > 0)) return { petXp: cur, petDay: pd0 };
  const room = Math.max(0, PET_DAILY_CAP - (pd0.xp || 0));
  const add = Math.min(amount, room);
  if (add <= 0) return { petXp: cur, petDay: pd0 };
  return { petXp: { ...cur, [petId]: (cur[petId] || 0) + add }, petDay: { day: today, xp: (pd0.xp || 0) + add } };
};

// ─── ÉNERGIE / SIESTE (frein sain : on ne passe pas la journée dessus) ──────
// L'énergie se RECHARGE toute seule avec le temps réel (pleine en ~3 h).
// Les extras « plaisir » (coffres, jouer) la consomment. Basse → le familier fait une sieste.
// Les quêtes ne sont JAMAIS bloquées (on veut que les corvées se fassent).
const ENERGY_MAX = 100;
const ENERGY_REGEN_PER_MIN = ENERGY_MAX / 180; // pleine en 3 heures
const CHEST_ENERGY = 30;   // ouvrir un coffre coûte de l'énergie
const PLAY_ENERGY  = 20;   // jouer avec le familier
const FEED_ENERGY  = 45;   // nourrir le familier (1×/jour) en redonne
// v1.84.0 (Lot 1 #B3) — le frein énergie s'élargit à la boutique et à l'avatar (browsing "plaisir"
// sans limite naturelle). Volontairement PAS étendu à : (1) le mini-jeu de niveau — récompense
// méritée par un accomplissement (level-up), pas une activité répétée pour tuer le temps; (2) le
// combat de boss — déjà gaté par les jetons (1 par quête complétée), donc déjà lié à l'effort réel;
// l'audit du 16 juin avait explicitement jugé le boss "bien conçu... RAS", ajouter l'énergie par-dessus
// serait redondant et rendrait une activité familiale plus frustrante sans bénéfice.
const SHOP_ENERGY  = 15;   // acheter dans la boutique (magasiner)
const AVATAR_ENERGY= 10;   // ouvrir le personnalisateur de perso
// Énergie courante = valeur stockée + ce qui s'est rechargé depuis energyTs
const currentEnergy = (gs) => {
  if (!gs) return ENERGY_MAX;
  const base = gs.energy == null ? ENERGY_MAX : gs.energy;
  const ts = gs.energyTs ? new Date(gs.energyTs).getTime() : 0;
  const mins = ts ? Math.max(0, (Date.now() - ts) / 60000) : 0;
  return Math.max(0, Math.min(ENERGY_MAX, Math.round(base + mins * ENERGY_REGEN_PER_MIN)));
};
// Minutes avant que l'énergie atteigne `target`
const minsToEnergy = (gs, target) => {
  const cur = currentEnergy(gs);
  if (cur >= target) return 0;
  return Math.ceil((target - cur) / ENERGY_REGEN_PER_MIN);
};
// ─── COMBAT DE BOSS FAMILIAL ──────────────────────────────────
// Faire des quêtes = gagner des JETONS d'attaque. On les dépense (petite/grosse attaque)
// pour enlever des PV au boss. Le boss riposte si la famille ralentit (PV de famille baissent).
const BOSS_DIFF = { facile:{label:"Facile",hp:40}, moyen:{label:"Moyen",hp:80}, costaud:{label:"Costaud",hp:140} };
const ATTACKS = {
  petite:{ label:"Petite attaque", cost:1, dmg:1, emoji:"🗡️" },
  grosse:{ label:"Grosse attaque", cost:3, dmg:4, emoji:"💥" }, // 3 jetons → 4 dégâts (bonus à viser gros)
};
const FAMILY_HP_MAX = 100;
const BOSS_DRAIN_PER_H = FAMILY_HP_MAX / 36; // PV famille vidés en ~36 h sans attaque (recharge en attaquant)
// PV de famille restants = baisse selon le temps écoulé depuis la dernière attaque
const familyHp = (boss, enraged=false) => {
  if (!boss || boss.defeatedAt || !boss.lastHitTs) return FAMILY_HP_MAX;
  const drain = BOSS_DRAIN_PER_H * (enraged ? 2 : 1); // v1.58.0 — le boss enragé vide les PV 2× plus vite
  const h = (Date.now() - new Date(boss.lastHitTs).getTime()) / 3600000;
  return Math.max(0, Math.min(FAMILY_HP_MAX, Math.round(FAMILY_HP_MAX - h * drain)));
};
const _bb = (gs, bossId) => (gs && gs.bossBattle && gs.bossBattle.bossId === bossId) ? gs.bossBattle : null;
// v2.6.0 — 3e param optionnel : les quêtes de réparation 🕊️ (config.repairEvents) ajoutent leurs
// dégâts au total du boss visé. Les events portent un dmg DÉJÀ plafonné à l'écriture (cap HPMAX-1).
const repairDamageFor = (repairEvents, bossId) => (repairEvents || []).reduce((s, e) => s + ((e && e.bossStartedAt === bossId) ? (e.dmg || 0) : 0), 0);
const bossDamageTotal = (gameStates, bossId, repairEvents) => (gameStates || []).reduce((s, g) => s + ((_bb(g, bossId)?.dmg) || 0), 0) + repairDamageFor(repairEvents, bossId);
const bossJetons = (gs, bossId) => { const b = _bb(gs, bossId); return b ? Math.max(0, (b.earned || 0) - (b.spent || 0)) : 0; };
// v1.76.0 — le boss actif ne peut être ACHEVÉ que si toutes ses corvées du jour sont complétées par les enfants assignés.
// v2.5.2 (Bug boss #1) — généralisé au boss RÉELLEMENT actif (config.boss.id) au lieu du préfixe "cust_hydre_" codé
// en dur : avant, un verrou pouvait se déclencher à cause d'anciennes tâches "cust_hydre_*" orphelines (données de
// test du 1er juillet, jamais nettoyées) même quand le boss actif n'avait plus rien à voir avec l'Hydre.
const bossQuestsAllDone = (config, states) => {
  try {
    const todayIdx=(new Date().getDay()+6)%7, stamp=todayStamp();
    const bossId = config?.boss?.id;
    if(!bossId) return true; // aucun boss actif → pas de verrou
    const prefix = "cust_"+bossId+"_";
    const corv=(config?.assignments||[]).filter(a=>typeof a.taskId==="string" && a.taskId.startsWith(prefix) && Array.isArray(a.days) && a.days.includes(todayIdx));
    if(!corv.length) return true; // aucune corvée pour CE boss aujourd'hui → pas de verrou
    for(const a of corv){
      for(const pid of (a.playerIds||[])){
        const idx=(config.players||[]).findIndex(p=>p.id===pid);
        if(idx<0) continue;
        if(!((states[idx]?.completed||[]).includes(a.instanceId+"_"+pid+"#"+stamp))) return false;
      }
    }
    return true;
  } catch(e){ return true; }
};
// v1.58.0 — modificateur du JOUR (surprise + stratégie), déterministe par date+boss → identique sur tous les appareils
const BOSS_MODIFIERS = [
  { id:"grosse",   emoji:"💥", label:"Jour des grosses", desc:"Les grosses attaques font +2 dégâts!" },
  { id:"petite",   emoji:"🗡️", label:"Pluie de coups",   desc:"Les petites attaques font +1 dégât!" },
  { id:"carapace", emoji:"🛡️", label:"Carapace",         desc:"Les petites rebondissent — vise les grosses!" },
  { id:"frenesie", emoji:"⚡", label:"Frénésie",          desc:"Toutes les attaques font +1!" },
  { id:"familier", emoji:"🐾", label:"Jour du familier",  desc:"L'attaque du familier fait DOUBLE!" },
];
const bossModifierOfDay = (bossId) => { const s=todayStamp()+"#"+(bossId||""); let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return BOSS_MODIFIERS[h%BOSS_MODIFIERS.length]; };
const bossAtkDamage = (type, mod) => { let d=ATTACKS[type]?.dmg||0; if(mod){ if(mod.id==="grosse"&&type==="grosse") d+=2; if(mod.id==="petite"&&type==="petite") d+=1; if(mod.id==="carapace"&&type==="petite") d=0; if(mod.id==="frenesie") d+=1; } return Math.max(0,d); };
const PET_ATTACK_COST = 3; // jetons pour lancer l'attaque du familier
const petAttackDamage = (petLv, legendary, mod) => { let d = 3 + Math.floor((petLv||1)/2) + Math.floor(Math.random()*3) + (legendary?3:0); if(mod&&mod.id==="familier") d*=2; return d; };
const mergeBossBattle = (a, b) => {
  a = a || {}; b = b || {};
  if (!a.bossId) return b.bossId ? b : { bossId:null, earned:0, spent:0, dmg:0 };
  if (!b.bossId) return a;
  if (a.bossId === b.bossId) return { bossId:a.bossId, earned:Math.max(a.earned||0,b.earned||0), spent:Math.max(a.spent||0,b.spent||0), dmg:Math.max(a.dmg||0,b.dmg||0) };
  return (new Date(b.bossId) > new Date(a.bossId)) ? b : a; // boss le plus récent
};
// Série : jours consécutifs (en finissant aujourd'hui ou hier) présents dans activeDays
const streakOf = (activeDays) => {
  const set = new Set(activeDays || []);
  if (!set.size) return 0;
  const d = new Date(); d.setHours(12,0,0,0);
  const key = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  if (!set.has(key(d))) { d.setDate(d.getDate()-1); if (!set.has(key(d))) return 0; } // ni aujourd'hui ni hier → série rompue
  let n = 0;
  while (set.has(key(d))) { n++; d.setDate(d.getDate()-1); }
  return n;
};

const SECRET_THEME_IDS = Object.values(PLAYER_THEMES).filter(t=>t.secret).map(t=>t.id);
const RANDOM_THEME_PLAYER = { id:"random", name:"Au hasard 🎲", icon:"🎲", secret:false,
  bg:"#0a0a14", primary:"#888", accent:"#aaa", glow:"#aaa", levels:["?","?","?","?","?"],
  coinName:"Surprise", taskVerb:"mystérisée", winMsg:"Thème mystère activé!" };
const RANDOM_THEME_WEEK   = { id:"random_week", name:"Semaine surprise 🎲", icon:"🎲" };

// Pick a random theme for a player (seeded by player id + week)
const resolveRandomTheme = (playerId) => {
  const allIds = [...SECRET_THEME_IDS, ...Object.keys(PLAYER_THEMES).filter(k=>!PLAYER_THEMES[k].secret&&k!=="none")];
  const seed = (playerId||"x").split("").reduce((a,c)=>a+c.charCodeAt(0),0) + new Date().getDay();
  return allIds[seed % allIds.length];
};
const resolveWeekRandomTheme = (weekSeed) => {
  const all = Object.keys(THEMES);
  return all[(weekSeed||0) % all.length];
};



// ─── STORAGE ─────────────────────────────────────────────────
// ─── CHANGELOG (affiché dans le feed famille à chaque mise à jour) ──────────
const CHANGELOG = [
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

// Structured for easy Supabase swap: replace save/load with async Supabase calls
// Future: import { saveToSupabase, loadFromSupabase } from './lib/supabase.js'
const STORE_KEY = "livre-de-quetes-v1";

// ─── SYNC CLOUD (multi-appareils) ────────────────────────────
// Deux modes, détectés automatiquement (voir SYNC.md) :
//   1. API même-origine /api/famille — active quand l'app roule sur le serveur
//      Node (server.cjs) avec le Postgres Canner. RIEN à configurer ici.
//   2. Supabase — remplir SYNC_URL et SYNC_KEY ci-dessous (solution de rechange).
// Si aucun des deux n'est disponible : sauvegarde locale seulement, comme avant.
const SYNC_URL = "";  // (optionnel) ex: "https://abcdefgh.supabase.co"
const SYNC_KEY = "";  // (optionnel) clé "anon public" Supabase
const FAMILY_ID = "livre-quetes-bergeron-2026"; // identifiant unique de la famille (agit comme mot de passe — garder original)

const supaEnabled = () => Boolean(SYNC_URL && SYNC_KEY);
const supaHeaders = () => ({ apikey: SYNC_KEY, Authorization: `Bearer ${SYNC_KEY}`, "Content-Type": "application/json" });
let LAST_SAVED_AT = null; // horodatage de la dernière sauvegarde connue localement
// v2.15.8 (cause racine de la casse généralisée des tâches perso — voir ménage orphelines plus bas) :
// true seulement quand load() a reçu une vraie réponse cloud (fusionnée ou seule source). false quand
// remotePull() a échoué (serveur endormi, réseau) et qu'on est retombé sur la copie locale SEULE —
// potentiellement périmée si cet appareil n'a pas rouvert l'app depuis un moment.
let LAST_LOAD_SYNCED = false;
let _pushTimer = null;
let API_OK = null; // détection unique de l'API même-origine
// Signale à l'UI qu'une synchro cloud vient de réussir (pour l'indicateur ☁️)
const markSynced = () => { try { window.dispatchEvent(new CustomEvent("lq-synced")); } catch {} };

// L'API même-origine est-elle là? (un déploiement statique renverrait du HTML → non)
const apiAvailable = async () => {
  if (API_OK !== null) return API_OK;
  try {
    const r = await fetch("/api/sante", { cache: "no-store" });
    const ct = r.headers.get("content-type") || "";
    API_OK = r.ok && ct.includes("json") && (await r.json())?.ok === true;
  } catch { API_OK = false; }
  return API_OK;
};

// Pousse l'état complet vers le cloud (debounce 1.5s pour regrouper les actions rapides)
const remotePush = (data) => {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(async () => {
    try {
      if (await apiAvailable()) {
        // ⚠️ FUSION AVANT ÉCRITURE : on relit le cloud et on fusionne, sinon un push « brut »
        // écrase les changements faits sur un autre appareil (ex: une validation qui « revient »).
        let toWrite = data;
        try {
          const r0 = await fetch(`/api/famille?id=${encodeURIComponent(FAMILY_ID)}`, { cache: "no-store" });
          if (r0.ok) { const cloud = (await r0.json())?.data; if (cloud && cloud.config) toWrite = mergeFamily(cloud, data); }
        } catch {}
        await fetch("/api/famille", { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: FAMILY_ID, data: toWrite }) });
        // v2.5.11 — FUSION AVANT L'ÉCRITURE LOCALE FINALE, même principe que la fusion avant écriture
        // cloud ci-dessus : ce callback est déclenché par un setTimeout debounced (1500ms) qui peut
        // rester "en vol" pendant plusieurs centaines de ms (2 fetch réseau successifs). Si une AUTRE
        // action (ex: ajouter une tâche) a sauvegardé une version plus fraîche dans localStorage PENDANT
        // ce vol, `clearTimeout` ne peut plus annuler ce callback déjà démarré — sans cette fusion, le
        // `toWrite` (bâti sur une fermeture plus vieille) écrasait purement et simplement cette version
        // plus fraîche, faisant "disparaître" ce qui venait d'être ajouté. Bug signalé par Antoine
        // (« ajout de quête, ça dit que c'est ajouté, mais ça apparaît pas »), le 2026-07-25.
        try {
          let finalWrite = toWrite;
          try { const cur = localStorage.getItem(STORE_KEY); if (cur) { const curData = JSON.parse(cur); if (curData?.config) finalWrite = mergeFamily(toWrite, curData); } } catch {}
          localStorage.setItem(STORE_KEY, JSON.stringify(finalWrite));
          LAST_SAVED_AT = finalWrite.savedAt || LAST_SAVED_AT;
        } catch {}
        markSynced();
      } else if (supaEnabled()) {
        let toWrite = data;
        try {
          const r0 = await fetch(`${SYNC_URL}/rest/v1/familles?id=eq.${encodeURIComponent(FAMILY_ID)}&select=data`, { headers: supaHeaders() });
          if (r0.ok) { const cloud = (await r0.json())?.[0]?.data; if (cloud && cloud.config) toWrite = mergeFamily(cloud, data); }
        } catch {}
        await fetch(`${SYNC_URL}/rest/v1/familles?on_conflict=id`, {
          method: "POST",
          headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ id: FAMILY_ID, data: toWrite, saved_at: toWrite.savedAt || new Date().toISOString() }),
        });
        // v2.5.11 — même fusion défensive que la branche apiAvailable() ci-dessus (voir son commentaire).
        try {
          let finalWrite = toWrite;
          try { const cur = localStorage.getItem(STORE_KEY); if (cur) { const curData = JSON.parse(cur); if (curData?.config) finalWrite = mergeFamily(toWrite, curData); } } catch {}
          localStorage.setItem(STORE_KEY, JSON.stringify(finalWrite));
          LAST_SAVED_AT = finalWrite.savedAt || LAST_SAVED_AT;
        } catch {}
        markSynced();
      }
    } catch (e) { console.warn("Sync: push échoué (mode local conservé)", e); }
  }, 1500);
};

// Récupère l'état depuis le cloud.
//   → objet data  : le cloud a des données
//   → null        : le cloud est JOINT mais VIDE (aucune famille encore)  → on peut semer sans risque
//   → PULL_FAILED : échec réseau / pas de sync  → NE PAS écraser le cloud (on garde le local et on réessaiera)
const PULL_FAILED = Symbol("pull_failed");
const remotePull = async () => {
  try {
    if (await apiAvailable()) {
      const r = await fetch(`/api/famille?id=${encodeURIComponent(FAMILY_ID)}`, { cache: "no-store" });
      if (!r.ok) return PULL_FAILED;
      const d = (await r.json())?.data;
      markSynced();
      return d || null;
    }
    if (supaEnabled()) {
      const r = await fetch(`${SYNC_URL}/rest/v1/familles?id=eq.${encodeURIComponent(FAMILY_ID)}&select=data`, { headers: supaHeaders() });
      if (!r.ok) return PULL_FAILED;
      const rows = await r.json();
      markSynced();
      return rows?.[0]?.data || null;
    }
  } catch { return PULL_FAILED; }
  return PULL_FAILED; // aucune sync disponible
};

const isNewer = (a, b) => { // a plus récent que b ? (timestamps ISO, tolérant aux absents)
  if (!a) return false;
  if (!b) return true;
  try { return new Date(a) > new Date(b); } catch { return false; }
};

// ─── FUSION NON-DESTRUCTIVE (multi-appareils) ────────────────
// Quand deux appareils ont chacun leur progression non synchronisée, on FUSIONNE
// au lieu d'écraser : l'XP ne peut que monter, rien n'est perdu. C'est ce qui
// permet de réunir « l'ordi (2 modes) » et « le cell (1 mode) » sans tout casser.
const _uniq = (arr) => [...new Set(arr || [])];
// v2.7.0 — dernière-écriture-gagne (par updatedAt) + tombstone (removedIds) au lieu d'un simple
// « premier id vu gagne ». Avant : si un appareil modifiait/supprimait un événement pendant qu'un
// autre pas encore synchronisé renvoyait l'ancienne version, le merge pouvait faire réapparaître
// l'ancienne version modifiée, ou ressusciter un événement supprimé.
const _mergeCalendar = (a, b, removedIds) => {
  const rm = removedIds ? new Set(removedIds) : null;
  const byId = new Map(); const noId = []; const seenRaw = new Set();
  for (const e of [...(a || []), ...(b || [])]) {
    if (!e) continue;
    if (e.id == null) { const k = JSON.stringify(e); if (!seenRaw.has(k)) { seenRaw.add(k); noId.push(e); } continue; }
    if (rm && rm.has(e.id)) continue; // suppression (tombstone) gagne sur une version pas encore synchronisée
    const prev = byId.get(e.id);
    if (!prev || (e.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(e.id, e);
  }
  return [...byId.values(), ...noId];
};
// Fusion d'un état de joueur — non régressive (max XP/pièces, union des listes)
const mergeGS = (a, b, preferIncoming) => {
  a = a || {}; b = b || {};
  const completed = _uniq([...(a.completed || []), ...(b.completed || [])]);
  const refusedKeys = _uniq([...(a.refusedKeys || []), ...(b.refusedKeys || [])]).slice(-400); // v1.64.0 — tombstone des demandes refusées
  const _refusedSet = new Set(refusedKeys);
  const removedCalendarIds = _uniq([...(a.removedCalendarIds || []), ...(b.removedCalendarIds || [])]).slice(-400); // v2.7.0 — tombstone des événements calendrier supprimés
  const avatarConfigured = b.avatar?.configured ? b.avatar : (a.avatar?.configured ? a.avatar : { ...(a.avatar || {}), ...(b.avatar || {}) });
  return {
    ...a, ...b,
    xp: Math.max(a.xp || 0, b.xp || 0),
    // ⚠️ Les pièces se DÉPENSENT : un max() ramènerait l'argent dépensé (achats infinis).
    // → dernière écriture gagne (l'appareil qui a changé le solde le plus récemment gagne).
    coins: preferIncoming ? (b.coins ?? a.coins ?? 0) : (a.coins ?? b.coins ?? 0),
    coinsLifetime: Math.max(a.coinsLifetime || 0, b.coinsLifetime || 0), // v2.5.0 — jamais décrémenté, donc fusion sûre par max (comme xp)
    // coinsWeek doit être géré EXPLICITEMENT — sinon le spread ...b l'écrase toujours par l'incoming.
    // Bug v2.5.3 : un vieux device synquant avec un coinsWeek d'une semaine passée déclenchait un
    // reset spurieux à la prochaine migration. Fix : on garde la semaine la plus récente (lexicographique).
    coinsWeek: (()=>{ const aw=(a.coinsWeek?.week||""); const bw=(b.coinsWeek?.week||""); return aw>=bw ? (a.coinsWeek||{week:aw}) : (b.coinsWeek||{week:bw}); })(),
    completed,
    completedAt: { ...(b.completedAt || {}), ...(a.completedAt || {}) }, // v1.60.0 — horodatage de complétion (union)
    pending: _uniq([...(a.pending || []), ...(b.pending || [])]).filter((k) => !completed.includes(k) && !_refusedSet.has(k)), // v1.64.0 — exclut les refusées (sinon l'union les ré-ajoutait au portail parent)
    refusedKeys,
    refusals: preferIncoming ? (b.refusals || a.refusals || []) : (a.refusals || b.refusals || []), // v1.64.0 — file consommable du message drôle de refus
    owned: _uniq([...(a.owned || []), ...(b.owned || [])]),
    boughtRewards: preferIncoming ? (b.boughtRewards || a.boughtRewards || []) : (a.boughtRewards || b.boughtRewards || []), // v1.63.0 — dernière-écriture-gagne (voyage avec coins)
    refundedRewards: _uniq([...(a.refundedRewards || []), ...(b.refundedRewards || [])]).slice(-200), // v1.69.0 — tombstone « déjà remboursé cette semaine » (union increvable → fin des pièces infinies)
    badges: _uniq([...(a.badges || []), ...(b.badges || [])]),
    equipped: { ...(a.equipped || {}), ...(b.equipped || {}) },
    calendar: _mergeCalendar(a.calendar, b.calendar, removedCalendarIds),
    removedCalendarIds,
    avatar: avatarConfigured,
    // PIN : dernière écriture gagne (permet de changer le code d'un enfant depuis un autre appareil)
    pin: preferIncoming ? (b.pin ?? a.pin ?? null) : (a.pin ?? b.pin ?? null),
    mode: b.mode ?? a.mode ?? null,
    // v2.15.8 — tombstone des rituels supprimés (union, comme removedProposals) : sans ça, une
    // routine retirée localement (« Supprimer le rituel ») revenait dès qu'un autre appareil (ou le
    // serveur, qui garde l'ancien état) réapparaissait dans la fusion union-by-id ci-dessous.
    removedRoutineIds: _uniq([...(a.removedRoutineIds||[]), ...(b.removedRoutineIds||[])]).slice(-200),
    routines: (() => { const removed=new Set([...(a.removedRoutineIds||[]), ...(b.removedRoutineIds||[])]); const m = new Map(); for (const r of [...(a.routines || []), ...(b.routines || [])]) { if (r && r.id != null && !removed.has(r.id) && !m.has(r.id)) m.set(r.id, r); } return [...m.values()]; })(),
    activeRoutineId: b.activeRoutineId ?? a.activeRoutineId ?? null,
    hiddenRewards: _uniq([...(a.hiddenRewards||[]),...(b.hiddenRewards||[])]),
    hiddenWeek: b.hiddenWeek ?? a.hiddenWeek ?? null,
    dailyClaimed: (()=>{ const A=a.dailyClaimed||{}, B=b.dailyClaimed||{}; if(A.day&&A.day===B.day) return {day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])])}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(),
    ritualCelebrated: (()=>{ const A=a.ritualCelebrated||{}, B=b.ritualCelebrated||{}; if(A.day&&A.day===B.day) return {day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])])}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(), // v1.68.0 (B5) — garde « rituel déjà fêté aujourd'hui »
    // v2.12.2 — bug signalé par Gen (« notification félicitation qui revient sans cesse ») : la file
    // « consommable » utilisait dernière-écriture-gagne (l'union empêcherait l'enfant de la vider), mais
    // ça laissait un appareil FRÈRE/SŒUR non lié (savedAt global plus récent, mais qui n'a jamais vu le
    // vidage local) ressusciter en bloc l'ancienne file non vidée à chaque fusion — même patron que le
    // tombstone refundedRewards ci-dessus (union increvable, jamais de résurrection après consommation).
    consumedCelebrationIds: _uniq([...(a.consumedCelebrationIds||[]), ...(b.consumedCelebrationIds||[])]).slice(-300),
    pendingCelebrations: (()=>{ const consumed=new Set([...(a.consumedCelebrationIds||[]), ...(b.consumedCelebrationIds||[])]); const seen=new Set(); const out=[]; for(const c of [...(a.pendingCelebrations||[]), ...(b.pendingCelebrations||[])]){ if(!c||!c.id||consumed.has(c.id)||seen.has(c.id))continue; seen.add(c.id); out.push(c); } return out; })(),
    petXp: mergePetXp(a.petXp, b.petXp), // XP des familiers : max par familier (ne fait que monter)
    petDay: (()=>{ const A=a.petDay||{}, B=b.petDay||{}; if(A.day&&A.day===B.day) return {day:A.day, xp:Math.max(A.xp||0,B.xp||0)}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(), // v1.52.0 — plafond quotidien familier (merge-safe)
    petEvo: (()=>{ const out={...(a.petEvo||{})}; const B=b.petEvo||{}; for(const k in B){ out[k]={...(B[k]||{}), ...(out[k]||{})}; } return out; })(), // v1.57.0 — voies d'évolution choisies (collant : 1er choix gagne)
    petNickname: {...(a.petNickname||{}), ...(b.petNickname||{})}, // v2.4.2 — surnom par familier (union ; dernier nom donné gagne par petId)
    // Énergie : consommable → l'horodatage energyTs arbitre directement (pas le flag coarse preferIncoming).
    // Bug v2.5.3 : preferIncoming basé sur savedAt global pouvait annuler une consommation d'énergie
    // si l'appareil qui avait ouvert un coffre avait un savedAt plus vieux que l'autre.
    // v2.15.7 (bug signalé « le coffre se recharge trop vite parfois », 2026-07-28) : l'énergie
    // (pool partagé boutique/avatar/familier/coffre) se fusionnait par « dernier energyTs gagne »
    // — dans une fenêtre de synchro quasi simultanée entre deux appareils, celui qui n'avait pas
    // encore reçu la dépense de l'autre pouvait pousser un timestamp perçu comme plus récent avec
    // une énergie plus haute, remboursant silencieusement une dépense déjà faite (achat, coffre…).
    // Fix : sous ~5 min d'écart (fenêtre de course plausible), prendre le MINIMUM des deux valeurs
    // — ne se trompe jamais dans le sens généreux — et son energyTs assorti (cohérent avec la
    // régénération recalculée depuis ce timestamp par currentEnergy/minsToEnergy). Au-delà de 5 min,
    // comportement inchangé (le plus récent gagne — nécessaire pour que la régénération progresse).
    energy: (()=>{ const aT=a.energyTs?new Date(a.energyTs).getTime():0; const bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) return Math.min(a.energy??100, b.energy??100);
      return bT>=aT ? (b.energy??a.energy??100) : (a.energy??b.energy??100); })(),
    energyTs: (()=>{ const aT=a.energyTs?new Date(a.energyTs).getTime():0; const bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) return (a.energy??100) <= (b.energy??100) ? (a.energyTs??b.energyTs??null) : (b.energyTs??a.energyTs??null);
      return bT>=aT ? (b.energyTs??a.energyTs??null) : (a.energyTs??b.energyTs??null); })(),
    lastFedDay: [a.lastFedDay, b.lastFedDay].filter(Boolean).sort().pop() || null, // jour le plus récent
    activeDays: _uniq([...(a.activeDays||[]), ...(b.activeDays||[])]), // union (série merge-safe)
    bossBattle: mergeBossBattle(a.bossBattle, b.bossBattle), // jetons/dégâts monotones par boss → max

    settings: { ...(a.settings || {}), ...(b.settings || {}) },
    dismissedAnnouncements: _uniq([...(a.dismissedAnnouncements||[]), ...(b.dismissedAnnouncements||[])]), // v2.6.0 — union des annonces archivées
  };
};
// Fusion d'un joueur (config) — garde UN seul thème par enfant.
// v1.66.0 (fix B2) : pseudo / themeId / themeChosenAt en DERNIÈRE-ÉCRITURE-GAGNE
// (preferIncoming = la copie entrante est plus récente). Avant, la base gagnait
// toujours → le pseudo changé par l'enfant « revenait » à sa prochaine sync.
const _mergePlayer = (a, b, preferIncoming = false) => {
  const w = preferIncoming ? b : a, o = preferIncoming ? a : b; // w = écriture la plus récente
  return {
    ...a, ...b,
    name: a.name || b.name,
    color: a.color || b.color,
    pseudo: w.pseudo || o.pseudo,
    themeId: (w.themeId && w.themeId !== "none") ? w.themeId
           : (o.themeId && o.themeId !== "none") ? o.themeId
           : (w.themeId || o.themeId || "none"),
    themeChosenAt: w.themeChosenAt || o.themeChosenAt,
    starterThemes: _uniq([...(a.starterThemes || []), ...(b.starterThemes || [])]).slice(0, 4),
  };
};
// Fusion complète de deux instantanés famille { config, gameStates, savedAt }
const mergeFamily = (base, incoming) => {
  if (!base) return incoming;
  if (!incoming) return base;
  const bC = base.config || {}, iC = incoming.config || {};
  const bP = bC.players || [], iP = iC.players || [];
  const bG = base.gameStates || [], iG = incoming.gameStates || [];
  const preferIncoming = isNewer(incoming.savedAt, base.savedAt);
  const byId = new Map();
  bP.forEach((p, i) => byId.set(p.id, { player: { ...p }, gs: bG[i] }));
  iP.forEach((p, i) => {
    if (byId.has(p.id)) { const e = byId.get(p.id); e.player = _mergePlayer(e.player, p, preferIncoming); e.gs = mergeGS(e.gs, iG[i], preferIncoming); }
    else byId.set(p.id, { player: { ...p }, gs: iG[i] });
  });
  const players = [...byId.values()].map((e) => e.player);
  const gameStates = [...byId.values()].map((e) => e.gs);
  // Assignations : union par instanceId, MOINS les supprimées (tombstones, union des deux côtés)
  const removedAssignments = _uniq([...(bC.removedAssignments || []), ...(iC.removedAssignments || [])]).slice(-800);
  const _rmSet = new Set(removedAssignments);
  const assignMap = new Map();
  (bC.assignments || []).forEach((a) => { if (!_rmSet.has(a.instanceId)) assignMap.set(a.instanceId, a); });
  (iC.assignments || []).forEach((a) => { if (!_rmSet.has(a.instanceId) && !assignMap.has(a.instanceId)) assignMap.set(a.instanceId, a); });
  // Tâches perso : union par id, MOINS les supprimées (tombstones durables, comme les assignations) —
  // v2.5.0 (Correctif 2A) : SAUF si une assignation survivante (assignMap, déjà calculé ci-dessus)
  // référence encore cette tâche — sinon une tâche supprimée sur un appareil pendant qu'une assignation
  // qui la référence survit sur un autre appareil devient une « assignation orpheline » (taskId sans
  // tâche correspondante, jamais complétable) — c'est la cause des ~125 orphelines trouvées en prod.
  const removedCustomTasks = _uniq([...(bC.removedCustomTasks || []), ...(iC.removedCustomTasks || [])]).slice(-1000);
  const _rmCT = new Set(removedCustomTasks);
  const referencedTaskIds = new Set([...assignMap.values()].map((a) => a.taskId));
  const _keepTask = (t) => referencedTaskIds.has(t.id) || !_rmCT.has(t.id);
  const taskMap = new Map();
  (bC.customTasks || []).forEach((t) => { if (_keepTask(t)) taskMap.set(t.id, t); });
  (iC.customTasks || []).forEach((t) => { if (_keepTask(t) && !taskMap.has(t.id)) taskMap.set(t.id, t); });
  // v1.83.0 (Lot 1 #B6) — demandes de retrait de tâche (enfant→parent) : union par id,
  // en retirant celles dont l'assignation visée a déjà été supprimée entretemps (tombstone naturel).
  const reqMap = new Map();
  [...(bC.removalRequests || []), ...(iC.removalRequests || [])].forEach((r) => { if (r && r.id && !_rmSet.has(r.instanceId)) reqMap.set(r.id, r); });
  // v2.5.10 (Correctif 2C) — propositions de tâche enfant→parent : union par id, moins les tombstones
  // (approuvées ou refusées sur un appareil, ne doivent pas revenir via une copie pas encore synchronisée).
  const removedProposals = _uniq([...(bC.removedProposals || []), ...(iC.removedProposals || [])]).slice(-800);
  const _rmProp = new Set(removedProposals);
  const propMap = new Map();
  [...(bC.childTaskProposals || []), ...(iC.childTaskProposals || [])].forEach((p) => { if (p && p.id && !_rmProp.has(p.id)) propMap.set(p.id, p); });
  const newer = isNewer(incoming.savedAt, base.savedAt) ? incoming : base;
  const newerC = newer.config || {};
  const config = {
    ...bC, ...iC,
    players,
    assignments: [...assignMap.values()],
    removedAssignments,
    customTasks: [...taskMap.values()],
    removedCustomTasks,
    removalRequests: [...reqMap.values()],
    childTaskProposals: [...propMap.values()],
    removedProposals,
    selectedRewards: _uniq([...(bC.selectedRewards || []), ...(iC.selectedRewards || [])]),
    feed: (() => { // fil de famille : union par id, likes unionnés, 60 plus récents
      const m = new Map();
      for (const f of [...(bC.feed || []), ...(iC.feed || [])]) {
        if (!f || f.id == null) continue;
        const prev = m.get(f.id);
        if (prev) prev.likes = _uniq([...(prev.likes || []), ...(f.likes || [])]);
        else m.set(f.id, { ...f, likes: [...(f.likes || [])] });
      }
      return [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 60);
    })(),
    coinOffers: (() => { // offres de pièces : union par id; une résolution (accepté/refusé) est COLLANTE
      const m = new Map();
      for (const o of [...(bC.coinOffers || []), ...(iC.coinOffers || [])]) {
        if (!o || o.id == null) continue;
        const prev = m.get(o.id);
        if (!prev) m.set(o.id, { ...o });
        else if (prev.status === "pending" && o.status && o.status !== "pending") m.set(o.id, { ...o }); // garder le résolu
      }
      // on ne garde que les 40 plus récentes et on jette les résolues de plus de 2 jours
      const cutoff = Date.now() - 2 * 864e5;
      return [...m.values()].filter(o => o.status === "pending" || (o.ts || 0) > cutoff).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 40);
    })(),
    bugs: (() => { const m = new Map(); for (const x of [...(bC.bugs || []), ...(iC.bugs || [])]) { if (x && x.id != null && !m.has(x.id)) m.set(x.id, x); } return [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 60); })(), // v1.65.0 — bugs signalés : union par id (ne se perdent plus à la synchro)
    errorLogs: (() => { const m = new Map(); for (const x of [...(bC.errorLogs || []), ...(iC.errorLogs || [])]) { if (x && x.id != null && !m.has(x.id)) m.set(x.id, x); } return [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 80); })(), // v1.90.0 — logs techniques (erreurs JS) : même pattern que bugs, union par id
    boss: (() => { // même boss = garder l'état "vaincu" si l'un l'a vaincu; sinon le plus récent
      const a = bC.boss, b = iC.boss;
      if (!a) return b || null; if (!b) return a;
      if (a.startedAt === b.startedAt) return { ...a, ...b, defeatedAt: a.defeatedAt || b.defeatedAt };
      return (new Date(b.startedAt||0) >= new Date(a.startedAt||0)) ? b : a;
    })(),
    // PIN parent : dernière écriture gagne (permet de le changer / réinitialiser depuis n'importe quel appareil)
    pin: newerC.pin || bC.pin || iC.pin || "1146",
    mode: newerC.mode || bC.mode || iC.mode || "routine",
    routineEnd: newerC.routineEnd || bC.routineEnd || iC.routineEnd,
    // v2.6.0 — annonces parent : union par id, 20 les plus récentes (suppression = tombstone via absence sur les deux côtés)
    announcements: (() => { const m = new Map(); for (const a of [...(bC.announcements||[]), ...(iC.announcements||[])]) { if (a && a.id != null && !m.has(a.id)) m.set(a.id, a); } return [...m.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,20); })(),
    // v2.14.2 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) — Lot 7 (semaine de garde) :
    // weeklyQuests n'était PAS listé ici, donc il retombait sur le spread naïf `{...bC,...iC}` ci-dessus
    // — iC (incoming) écrasait TOUJOURS bC, sans égard à la fraîcheur (même bug déjà corrigé pour
    // weeklyChallenge, voir plus bas). Un appareil resté sur une semaine de garde plus vieille (ou sur
    // `weeklyQuests:null`) pouvait donc effacer les assignations de la semaine en cours partout, orphelinant
    // les demandes de validation en attente. Fix : dernière-semaine-gagne par generatedForWeek, comme le
    // fait déjà server.cjs (mergeFamily côté serveur) — les deux moitiés de la fusion restent cohérentes.
    weeklyQuests: (() => {
      const a = bC.weeklyQuests, b = iC.weeklyQuests;
      if (!a) return b || null;
      if (!b) return a;
      // v2.14.3 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) : une donnée corrompue trouvée
      // en prod ("2026-07-25z2", jamais produite par ce code — voir isValidCustodyWeekKey) battait
      // pour toujours la vraie clé du jour dans une comparaison `>=` brute, empêchant tout correctif
      // via une simple synchro. Une clé invalide perd maintenant automatiquement face à une clé
      // valide, peu importe l'ordre alphabétique.
      const aValid = isValidCustodyWeekKey(a.generatedForWeek), bValid = isValidCustodyWeekKey(b.generatedForWeek);
      if (aValid !== bValid) return aValid ? a : b;
      return (a.generatedForWeek || "") >= (b.generatedForWeek || "") ? a : b;
    })(),
    // v2.6.0 — quêtes de réparation 🕊️ : union-by-id (id = instanceId de l'assignation) = effet
    // collectif exactly-once même après fusion multi-appareils. ⚠️ JAMAIS sur config.boss (merge shallow).
    repairEvents: (() => { const m = new Map(); for (const e of [...(bC.repairEvents||[]), ...(iC.repairEvents||[])]) { if (e && e.id != null && !m.has(e.id)) m.set(e.id, e); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,100); })(),
    // v2.6.2 — récompenses "moment" à planifier avec le parent : union-by-id + progression MONOTONE
    // du statut (attente < planifie < fait) — après fusion multi-appareils, un statut ne recule jamais
    // (le parent a pu le marquer "Fait" sur un appareil pendant qu'un autre pousse encore "attente").
    momentRequests: (() => {
      const rank = { attente:0, planifie:1, fait:2 };
      const m = new Map();
      for (const r of [...(bC.momentRequests||[]), ...(iC.momentRequests||[])]) {
        if (!r || r.id == null) continue;
        const prev = m.get(r.id);
        if (!prev || (rank[r.status]||0) > (rank[prev.status]||0)) m.set(r.id, r);
        else if ((rank[r.status]||0) === (rank[prev.status]||0) && r.plannedDate && !prev.plannedDate) m.set(r.id, r);
      }
      return [...m.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,60);
    })(),
    // Bug live signalé par Gen (2026-07-25) : « défi de la semaine peut être coché à l'infini ».
    // Cause : weeklyChallenge n'était PAS listé ici, donc il retombait sur le spread naïf `{...bC,...iC}`
    // ci-dessus — iC (incoming) écrasait TOUJOURS bC en entier, sans égard à la fraîcheur (contrairement
    // au reste de cette fonction), et sans fusionner les checkins. Résultat : une simple relecture cloud
    // (poll périodique, autre appareil) pouvait ramener une copie sans la coche du jour et effacer la
    // coche qui venait d'être faite → le bouton réapparaissait, cochable encore et encore. Fix : fusion
    // explicite par playerId + UNION des checkins (checkins ne fait qu'ajouter des jours "true", jamais
    // les retirer — aucune UI ne décoche — donc l'union est increvable, même patron que `owned`/`badges`).
    weeklyChallenge: (() => {
      const bWC = bC.weeklyChallenge, iWC = iC.weeklyChallenge;
      if (!bWC) return iWC || null;
      if (!iWC) return bWC;
      const weekKey = (iWC.weekKey||"") >= (bWC.weekKey||"") ? (iWC.weekKey||bWC.weekKey) : bWC.weekKey;
      const cm = new Map();
      (bWC.challenges||[]).forEach(c => { if (c && c.playerId != null) cm.set(c.playerId, {...c}); });
      (iWC.challenges||[]).forEach(c => {
        if (!c || c.playerId == null) return;
        const ex = cm.get(c.playerId);
        if (!ex) { cm.set(c.playerId, {...c}); return; }
        cm.set(c.playerId, {
          ...ex, ...c,
          text: preferIncoming ? (c.text ?? ex.text) : (ex.text ?? c.text),
          emoji: preferIncoming ? (c.emoji ?? ex.emoji) : (ex.emoji ?? c.emoji),
          checkins: {...(ex.checkins||{}), ...(c.checkins||{})},
        });
      });
      return { weekKey, challenges:[...cm.values()] };
    })(),
  };
  return { ...newer, config, gameStates, savedAt: isNewer(incoming.savedAt, base.savedAt) ? incoming.savedAt : base.savedAt };
};
// Signature de contenu (ignore savedAt) pour détecter un vrai changement
const _famSig = (d) => { try { return JSON.stringify({ c: d?.config, g: d?.gameStates }); } catch { return Math.random() + ""; } };

const save = async (data) => {
  LAST_SAVED_AT = data.savedAt || LAST_SAVED_AT;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { console.warn("Storage save failed:", e); }
  remotePush(data);
};

const load = async () => {
  let local = null;
  try { const r = localStorage.getItem(STORE_KEY); if (r) local = JSON.parse(r); } catch {}
  const remote = await remotePull();
  const hasRemoteData = remote && remote !== PULL_FAILED; // objet data réel
  // Les deux existent → on FUSIONNE (rien n'est écrasé, l'XP ne peut que monter)
  if (hasRemoteData && local) {
    LAST_LOAD_SYNCED = true; // v2.15.8 — vraie donnée cloud reçue, assignments/customTasks à jour
    const merged = mergeFamily(local, remote);
    if (_famSig(merged) !== _famSig(local)) {
      merged.savedAt = new Date().toISOString();
      try { localStorage.setItem(STORE_KEY, JSON.stringify(merged)); } catch {}
      LAST_SAVED_AT = merged.savedAt;
      remotePush(merged); // on renvoie la fusion au cloud pour converger
      return merged;
    }
    LAST_SAVED_AT = local.savedAt || merged.savedAt || null;
    return local;
  }
  // Seul le cloud a des données → on les prend
  if (hasRemoteData && !local) {
    LAST_LOAD_SYNCED = true; // v2.15.8 — idem, données cloud à jour (pas de copie locale à fusionner)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch {}
    LAST_SAVED_AT = remote.savedAt || null;
    return remote;
  }
  // Cloud JOINT mais VIDE (remote===null) → on peut semer le local sans risque d'écraser quoi que ce soit
  if (remote === null && local) remotePush(local);
  // remote===PULL_FAILED → échec réseau : on NE touche PAS au cloud, on garde le local et la boucle réessaiera.
  // v2.15.8 (cause racine de la casse généralisée des tâches perso, 2026-07-28) : LAST_LOAD_SYNCED reste
  // false ici — cette copie locale peut être périmée (assignments incomplets si l'appareil n'a pas
  // rouvert l'app depuis un moment). Le ménage des tâches orphelines (plus bas) DOIT vérifier ce drapeau
  // avant de tombstoner quoi que ce soit, sinon un simple délai réseau (serveur Canner qui se réveille,
  // ~1-4s selon SYNC.md) suffit à faire supprimer pour toujours des tâches perso bien vivantes ailleurs.
  LAST_LOAD_SYNCED = false;
  LAST_SAVED_AT = local?.savedAt || null;
  return local;
};

// ─── DATA MIGRATION ── préserve les données des enfants entre les pushes ────
// Ajoute les nouveaux champs sans jamais écraser les données existantes
const migrateGameState = (gs) => {
  const hasPin = gs.pin != null;
  const oldAvatar = gs.avatar || {};
  // v2.5.0 (Correctif 1) — reset hebdomadaire des pièces (vendredi minuit, custodyWeekKey — PAS weekKey).
  // Si coinsWeek n'existe pas encore (premier chargement post-déploiement), on SEED sans reset immédiat :
  // le solde actuel des 4 enfants est préservé, seul le prochain changement de semaine déclenchera un reset.
  const cwk = custodyWeekKey();
  // v2.5.26 — reset SEULEMENT si le stamp stocké est PLUS VIEUX que la clé calculée (`<`, pas `!==`).
  // Un stamp "futur" (ex. 2026-07-25 écrit par un vieux client UTC pas encore mis à jour) restait en
  // prod via le merge max — avec `!==`, chaque client À JOUR (clé 2026-07-24) re-effaçait les pièces
  // à CHAQUE chargement jusqu'au vendredi suivant. Comparaison lexicographique sûre (format YYYY-MM-DD).
  const storedWeek = gs.coinsWeek?.week || "";
  const coinsWeekReset = !!gs.coinsWeek && storedWeek < cwk;
  return {
    xp: 0, completed: [], pending: [], owned: [], equipped: {}, boughtRewards: [], badges: [],
    ...gs,
    badges: gs.badges || [],
    owned: (gs.owned || []).filter(id => id !== CHALLENGE_PERFECTION_FRAME_ID), // v2.6.2 — retire l'item fantôme « cadre » accordé par l'ancien défi parfait (jamais défini, rendu vide)
    boughtRewards: gs.boughtRewards || [],
    refundedRewards: gs.refundedRewards || [], // v1.69.0 — tombstone anti-remboursement-infini
    pending: gs.rotativeCleanupV1 ? (gs.pending || []) : [], // v1.108.0 — ménage unique (Gen) : vide les tâches en suspens pour la bascule vers les quêtes rotatives
    rotativeCleanupV1: true, // v1.108.0 — drapeau : ménage de transition Lot 7 appliqué (xp/coins/badges/completed/routines intacts)
    coinsLifetime: gs.coinsLifetime ?? (gs.coins || 0), // v2.5.0 — jamais réinitialisé ni décrémenté (badges Petit Trésor/Oncle Picsou), seedé depuis le solde actuel au premier déploiement
    coins: coinsWeekReset ? 0 : (gs.coins || 0), // v2.5.0 — remis à 0 au changement de semaine de garde (vendredi minuit)
    coinsWeek: { week: storedWeek > cwk ? storedWeek : cwk }, // v2.5.26 — garde le stamp max (cohérent avec le merge v2.5.3) pour ne pas relancer la guerre de stamps avec un vieux client
    pin: gs.pin ?? null,
    mode: gs.mode ?? null,        // v1.13.0 — mode choisi par l'enfant ("routine"|"week"); null = défaut famille
    routines: gs.routines || [],  // v1.13.0 — routines créées par l'enfant: [{id,name,emoji,taskIds:[instanceId]}]
    // v2.15.8 (bug trouvé en reconstruisant les rituels Matin/École/Camp/Soir, 2026-07-28) : contrairement
    // à assignments/customTasks/childTaskProposals, les routines n'avaient AUCUN tombstone — « Supprimer
    // le rituel » (App.jsx ~2924) filtrait juste localement, mais la fusion routines (union-by-id) allait
    // le RESSUSCITER dès qu'un autre appareil (ou le serveur, qui garde l'ancien état) réapparaissait dans
    // la fusion. Même patron que removedProposals/removedAssignments.
    removedRoutineIds: gs.removedRoutineIds || [],
    activeRoutineId: gs.activeRoutineId ?? null, // routine en cours (null = aucune / toutes)
    settings: { sound:true, calm:false, calmCountdown:false, humor:true, focus:false, fontScale:1, readableFont:false, femTitles:false, ...(gs.settings||{}) }, // v1.16.0 — réglages d'accessibilité par enfant (fontScale/readableFont: v1.87.0, Lot 3 #12; femTitles: v2.5.27)
    hiddenRewards: gs.hiddenRewards || [], // v1.23.0 — récompenses cachées cette semaine
    hiddenWeek: gs.hiddenWeek ?? null,
    dailyClaimed: gs.dailyClaimed || { day:null, ids:[] }, // v1.28.0 — objectifs du jour réclamés
    pendingCelebrations: gs.pendingCelebrations || [], // v1.31.0 — fêtes (popup/jeu) différées vers l'appareil de l'enfant
    consumedCelebrationIds: gs.consumedCelebrationIds || [], // v2.12.2 — tombstone anti-résurrection (voir mergeGameState)
    petXp: gs.petMigV2 ? (gs.petXp || {}) : migratePetXpV2(gs.petXp), // v1.52.0 — migration anti-rétrogradation (une seule fois)
    petMigV2: true, // v1.52.0 — drapeau : migration de courbe des familiers appliquée
    petDay: gs.petDay || { day:null, xp:0 }, // v1.52.0 — plafond quotidien d'XP du familier
    petEvo: gs.petEvo || {}, // v1.57.0 — voies d'évolution par familier {petId:{1,2,3}}
    petNickname: gs.petNickname || {}, // v2.4.2 — surnom personnalisé par familier {petId:string}
    dismissedAnnouncements: gs.dismissedAnnouncements || [], // v2.6.0 — annonces parent archivées par l'enfant
    completedAt: gs.completedAt || {}, // v1.60.0 — horodatage de complétion {doneKey:ISO}
    refusedKeys: gs.refusedKeys || [], // v1.64.0 — tombstone des demandes refusées
    refusals: gs.refusals || [], // v1.64.0 — file du message drôle de refus à montrer à l'enfant
    energy: gs.energy == null ? 100 : gs.energy, // v1.41.0 — énergie (sieste/frein sain)
    energyTs: gs.energyTs || null,
    lastFedDay: gs.lastFedDay || null,           // v1.41.0 — Tamagotchi : nourri le jour…
    activeDays: gs.activeDays || [],             // v1.41.0 — jours avec ≥1 quête (pour la série 🔥)
    bossBattle: gs.bossBattle || {bossId:null,earned:0,spent:0,dmg:0}, // v1.42.0 — combat de boss (jetons/dégâts)
    // v2.15.0 — calendrier purement événementiel (demande de Gen) : "devoir"/"examen" agissaient
    // comme des tâches à XP déguisées en calendrier — migration ponctuelle et sans perte : on garde
    // l'entrée (date/heure/récurrence/libellé intacts), seul le type devient "evenement" générique.
    calendar: (gs.calendar || []).map(e => (e && (e.type==="devoir"||e.type==="examen")) ? {...e, type:"evenement"} : e),
    house: gs.house || { wallpaper:null, floor:null, placed:{} }, // v2.8.0 — Ma maison (décor).
    // Fusion : transporté en bloc par le spread ...a,...b de mergeGS (dernière écriture gagne,
    // comme boughtRewards) — AUCUN changement client/serveur requis, miroir server.cjs intouché.
    avatar: {
      skin:"sk1", eyes:"ey1", mouth:"mo1", hair:"ha1",
      back:"bk0", shoes:"sh0", extra:"xt0",       // v2.7.0/v2.12.0 — slots (défaut "Aucun")
      build:"bd_ado",                             // v2.11.0 — silhouette (les 4 enfants sont ados)
      ...oldAvatar,
      configured: oldAvatar.configured ?? hasPin, // v1.6.0 — true = onboarding complété
    },
  };
};

// v2.5.29 — garde une seule entrée changelog par version (la plus récente), plafonnée aux 30
// dernières, en préservant l'ordre. Utilisé au chargement (migrateSavedData) ET à l'ajout (~5127).
const dedupeUpdateFeed = (list) => {
  const seen = new Set(); const out = [];
  for (let i = (list || []).length - 1; i >= 0; i--) {
    const e = list[i];
    if (!e || !e.version || seen.has(e.version)) continue;
    seen.add(e.version); out.unshift(e);
  }
  return out.slice(-30);
};

const migrateSavedData = (data) => {
  if (!data) return null;
  const seenVersions = data.seenVersions || [];
  const newVersions = CHANGELOG.map(c=>c.version).filter(v=>!seenVersions.includes(v));
  // Merge stored config, then apply defaults for missing/undefined fields
  const mergedConfig = { ...(data.config || {}) };
  if (mergedConfig.pin == null) mergedConfig.pin = "1146"; // fix: spread can't override undefined
  if (!Array.isArray(mergedConfig.players)) mergedConfig.players = [];
  if (!Array.isArray(mergedConfig.assignments)) mergedConfig.assignments = [];
  if (!Array.isArray(mergedConfig.childTaskProposals)) mergedConfig.childTaskProposals = []; // v2.5.10 (Correctif 2C)
  if (!Array.isArray(mergedConfig.removedProposals)) mergedConfig.removedProposals = [];
  if (!mergedConfig.rotativeCleanupV1) { // v1.108.0 — ménage unique (demandé par Gen) : bascule vers les quêtes rotatives (Lot 7B) —
    mergedConfig.assignments = [];       // vide les anciennes assignations manuelles pour laisser toute la place à weeklyQuests
    mergedConfig.removalRequests = [];   // demandes de retrait orphelines (pointaient sur des assignations qui disparaissent)
    mergedConfig.rotativeCleanupV1 = true;
  }
  if (!mergedConfig.colorToneDownV1) { // v2.2.0 (Lot 6 #26, demandé par Gen) : les couleurs de joueur sont
    // enregistrées une fois au choix et ne se recalculent plus jamais depuis COLORS — sans cette
    // migration ponctuelle, la palette adoucie n'aurait aucun effet sur les enfants déjà configurés.
    mergedConfig.players = (mergedConfig.players || []).map(p =>
      p && COLOR_DESATURATE_MAP[p.color] ? { ...p, color: COLOR_DESATURATE_MAP[p.color] } : p
    );
    mergedConfig.colorToneDownV1 = true;
  }
  if (!mergedConfig.orphanAssignCleanupV1) { // v2.5.2 (Correctif 2B) — ménage ponctuel (demandé par Gen) :
    // purge les assignations déjà en prod dont le taskId ne correspond à AUCUNE tâche connue (ni
    // TASK_CATALOG ni customTasks) — ~125 orphelines générales + les 16 "cust_hydre_*" du bug boss #1
    // (données de test du 1er juillet jamais nettoyées, jamais complétables). Purge seulement, jamais
    // de reconstruction (le nom/emoji d'origine n'existe plus nulle part).
    const knownTaskIds = new Set([...TASK_CATALOG.map(t=>t.id), ...(mergedConfig.customTasks||[]).map(t=>t.id)]);
    mergedConfig.assignments = (mergedConfig.assignments||[]).filter(a => knownTaskIds.has(a.taskId));
    mergedConfig.orphanAssignCleanupV1 = true;
  }
  let orphanPendingInstanceIds = null; // v2.6.6 — voir ci-dessous, utilisé pour purger `pending` chez tous les enfants
  if (!mergedConfig.orphanAssignCleanupV2) { // v2.6.6 — bug signalé par Gen : tâches fantômes (cust_camp_*
    // et consorts, 125 en prod le 27 juillet) réapparaissent sans cesse dans la file « à valider » — leurs
    // tâches personnalisées ont été supprimées après le passage de V1, mais pas leurs assignations
    // récurrentes (jamais renettoyées depuis, elles régénèrent une entrée `pending` chaque jour). Même
    // purge que V1, réappliquée + weeklyQuests par précaution + nettoyage des `pending` déjà accumulées
    // (voir plus bas, approvePending tombstone maintenant aussi pour éviter que ça ne revienne).
    const knownTaskIds2 = new Set([...TASK_CATALOG.map(t=>t.id), ...(mergedConfig.customTasks||[]).map(t=>t.id)]);
    const before = mergedConfig.assignments || [];
    mergedConfig.assignments = before.filter(a => knownTaskIds2.has(a.taskId));
    const purgedFromStatic = before.filter(a => !knownTaskIds2.has(a.taskId)).map(a => a.instanceId);
    // v2.14.2 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) : les instanceId purgés de
    // weeklyQuests.assignments n'étaient PAS ajoutés à orphanPendingInstanceIds (contrairement à
    // ceux de config.assignments juste au-dessus) — leurs `pending` correspondants survivaient donc
    // indéfiniment, orphelins, et « Valider » ne donnait plus jamais d'XP/pièce pour ces demandes.
    let purgedFromWq = [];
    if (mergedConfig.weeklyQuests) {
      const beforeWq = mergedConfig.weeklyQuests.assignments || [];
      mergedConfig.weeklyQuests = { ...mergedConfig.weeklyQuests, assignments: beforeWq.filter(a => knownTaskIds2.has(a.taskId)) };
      purgedFromWq = beforeWq.filter(a => !knownTaskIds2.has(a.taskId)).map(a => a.instanceId);
    }
    orphanPendingInstanceIds = new Set([...purgedFromStatic, ...purgedFromWq]);
    mergedConfig.orphanAssignCleanupV2 = true;
  }
  // v2.14.2 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) — orphanAssignCleanupV1/V2 ci-dessus
  // sont des ménages À DRAPEAU UNIQUE (ne s'exécutent qu'une fois). Si une tâche personnalisée est
  // supprimée APRÈS leur passage — exactement ce qui est arrivé : 7 tâches rituelles supprimées les
  // 24-28 juillet alors que V2 avait déjà tourné —, l'assignation orpheline qui en résulte n'est plus
  // JAMAIS nettoyée : chaque jour l'enfant la complète, la demande atterrit dans `pending`, et
  // « Valider » échoue silencieusement pour toujours (« Tâche supprimée entretemps », 0 XP/pièce).
  // Même leçon déjà tirée pour `removalRequests` juste en dessous : ce ménage doit tourner à CHAQUE
  // chargement (idempotent — ne retire que des références déjà mortes, aucun coût sur données propres).
  {
    const knownTaskIdsLive = new Set([...TASK_CATALOG.map(t=>t.id), ...(mergedConfig.customTasks||[]).map(t=>t.id)]);
    const beforeLive = mergedConfig.assignments || [];
    mergedConfig.assignments = beforeLive.filter(a => knownTaskIdsLive.has(a.taskId));
    const purgedLiveStatic = beforeLive.filter(a => !knownTaskIdsLive.has(a.taskId)).map(a => a.instanceId);
    let purgedLiveWq = [];
    if (mergedConfig.weeklyQuests) {
      const beforeLiveWq = mergedConfig.weeklyQuests.assignments || [];
      mergedConfig.weeklyQuests = { ...mergedConfig.weeklyQuests, assignments: beforeLiveWq.filter(a => knownTaskIdsLive.has(a.taskId)) };
      purgedLiveWq = beforeLiveWq.filter(a => !knownTaskIdsLive.has(a.taskId)).map(a => a.instanceId);
    }
    if (purgedLiveStatic.length || purgedLiveWq.length) {
      const extra = new Set([...purgedLiveStatic, ...purgedLiveWq]);
      orphanPendingInstanceIds = orphanPendingInstanceIds ? new Set([...orphanPendingInstanceIds, ...extra]) : extra;
    }
  }
  // v2.9.1 (corrigé v2.11.1) — bug signalé par Gen : « plusieurs de ses rituels sont vides » +
  // « demandes de retrait fantômes ». Les rituels (routines[].taskIds) et les demandes de retrait
  // (removalRequests) référencent tous deux des instanceId d'assignation — or les assignations se
  // RÉGÉNÈRENT à chaque semaine de garde (nouveaux instanceId à chaque fois, custodyWeekKey). Un
  // ménage à DRAPEAU UNIQUE (comme les autres ci-dessus) était donc le mauvais patron ici : il ne
  // nettoyait qu'une fois puis se taisait pour toujours, alors que de nouvelles orphelines
  // apparaissent chaque semaine — Olivier/Antoine DR avaient encore des rituels 100% morts après
  // son passage. Recalculé à CHAQUE chargement (peu coûteux, idempotent sur données déjà propres) —
  // ne retire QUE les références mortes, jamais une tâche encore valide.
  const validInstanceIdsForCleanup = new Set([...(mergedConfig.assignments||[]), ...((mergedConfig.weeklyQuests||{}).assignments||[])].map(a=>a.instanceId));
  if (Array.isArray(mergedConfig.removalRequests)) {
    mergedConfig.removalRequests = mergedConfig.removalRequests.filter(r => validInstanceIdsForCleanup.has(r.instanceId));
  }
  if (!Array.isArray(mergedConfig.feed)) mergedConfig.feed = []; // v1.19.0 — fil de famille
  // v2.5.29 — updateFeedEntries s'accumulait SANS plafond ni dédoublonnage (~5127) : chaque appareil
  // ré-ajoutait ses entrées changelog → 2,35 Mo observés en prod, poussés à CHAQUE sync par chaque
  // appareil (et payload familial > MAX_BODY 2 Mo du serveur). Nettoyage au chargement + à l'ajout.
  mergedConfig.updateFeedEntries = dedupeUpdateFeed(mergedConfig.updateFeedEntries);
  const migratedGameStates = (data.gameStates || []).map(migrateGameState).map(gs => {
    let next = gs;
    if (orphanPendingInstanceIds && orphanPendingInstanceIds.size && (next.pending || []).length) {
      // v2.6.6 — purge les entrées `pending` déjà accumulées qui pointent sur une assignation
      // orpheline qu'on vient de retirer ci-dessus (sinon la file "à valider" reste polluée
      // jusqu'à ce que le parent clique sur chacune manuellement — le vrai symptôme signalé).
      const filtered = (next.pending || []).filter(k => {
        const base = k.split("#")[0];
        const inst = base.slice(0, base.lastIndexOf("_"));
        return !orphanPendingInstanceIds.has(inst);
      });
      if (filtered.length !== (next.pending || []).length) next = { ...next, pending: filtered };
    }
    if (Array.isArray(next.routines) && next.routines.length) {
      // v2.9.1 (corrigé v2.11.1) — retire les taskIds morts de chaque rituel, À CHAQUE chargement
      // (voir commentaire plus haut) ; un rituel qui devient vide après ce nettoyage est retiré
      // (une carte "rituel vide" n'aide personne) — activeRoutineId remis à null s'il pointait
      // dessus, pour ne jamais laisser l'app référencer un rituel qui n'existe plus.
      const cleaned = next.routines
        .map(r => ({ ...r, taskIds: (r.taskIds || []).filter(id => validInstanceIdsForCleanup.has(id)) }))
        .filter(r => r.taskIds.length > 0);
      const activeStillThere = cleaned.some(r => r.id === next.activeRoutineId);
      next = { ...next, routines: cleaned, activeRoutineId: activeStillThere ? next.activeRoutineId : null };
    }
    return next;
  });
  return {
    ...data,
    config: mergedConfig,
    gameStates: migratedGameStates,
    seenVersions: [...seenVersions, ...newVersions],
    newChangelogVersions: newVersions,
  };
};

// FUTURE: export family config as JSON for sharing / backup
const exportConfig = (config, gameStates) => {
  const blob = new Blob([JSON.stringify({config, gameStates, exportedAt: new Date().toISOString()}, null, 2)], {type: 'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `livre-de-quetes-${new Date().toISOString().slice(0,10)}.json`; a.click();
};

const importConfig = (file, onSuccess) => {
  const r = new FileReader();
  r.onload = e => { try { const d = JSON.parse(e.target.result); onSuccess(d); } catch { alert('Fichier invalide'); } };
  r.readAsText(file);
};

// ─── FUNNY MESSAGES (#12) ────────────────────────────────────
const FUNNY_MSGS = [
  "Wow. La tâche est faite. La Terre continue de tourner. 🌎",
  "T'as prouvé que tu peux faire des choses! Maintenant recommence.",
  "ALERTE: un enfant a accompli une tâche! NASA informé. 🚀",
  "Légendaire! (C'est-à-dire: ça s'est produit une fois.) 📜",
  "Félicitations! T'es officiellement moins paresseux·se qu'une plante. 🌱",
  "La famille a confirmé: t'as pas juste dit que t'allais le faire. 👀",
  "C'est tellement impressionnant... même le chat fait semblant d'être fier. 🐱",
  "Performance historique. Les archéologues en parleront dans 3000 ans.",
  "Le plancher était là depuis tout ce temps. T'as enfin remarqué. 🧹",
  "Des XP! Des pièces! Et toujours aucun médaillon d'or dans la vraie vie.",
  "INCROYABLE. Ça a pris 45 secondes. Bon, c'est mieux que jamais, disons.",
  "Voilà ce qu'on appelle un niveau de productivité tout à fait acceptable. 👑",
];
// ─── UTILS ───────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0,10);

// ═══════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ─── PLATFORMER MINI-GAME (theme-aware) ─────────────────────
const Platformer = ({ player, onClose }) => {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [collected, setCollected] = useState(0);
  const [done, setDone] = useState(false);
  const pt = getPlayerTheme(player.themeId);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = 600, H = canvas.height = 240;
    const GRAVITY = 0.55, JUMP = -13, SPEED = 3.5;
    const pColor = pt.charBodyColor || player.color;
    const pColor2 = pt.platformColor;
    const bgColor = pt.platformBg;
    const acColor = pt.accent;
    const platItems = pt.platformItems;
    const platforms = [
      {x:0,y:205,w:160,h:14},{x:185,y:172,w:100,h:14},{x:305,y:140,w:110,h:14},
      {x:435,y:172,w:100,h:14},{x:525,y:135,w:75,h:14},
    ];
    const items = [
      {x:240,y:148,r:11,c:false,e:platItems[0]||"⭐"},
      {x:360,y:118,r:11,c:false,e:platItems[1]||"💫"},
      {x:490,y:148,r:11,c:false,e:platItems[2]||"✨"},
      {x:558,y:106,r:11,c:false,e:platItems[3]||"🌟"},
    ];
    const char = {x:28,y:155,w:26,h:34,vx:0,vy:0,onG:false,fr:true};
    let frame=0, cCount=0, finished=false, autoJ=0;
    const nextPX=[185,305,435,525,700]; let nPI=0;
    const keys={};
    const hk=(e)=>{const m={ArrowLeft:"l",ArrowRight:"r"," ":"j",ArrowUp:"j"}; if(m[e.key]){keys[m[e.key]]=e.type==="keydown";e.preventDefault();}};
    window.addEventListener("keydown",hk); window.addEventListener("keyup",hk);

    const loop=()=>{
      frame++;
      char.vx=SPEED; char.fr=true;
      if(keys.l){char.vx=-SPEED;char.fr=false;} if(keys.r){char.vx=SPEED;char.fr=true;}
      if(autoJ>0)autoJ--;
      if(nPI<nextPX.length&&char.x>=nextPX[nPI]-40&&char.onG&&autoJ===0){char.vy=JUMP;autoJ=38;nPI++;}
      if((keys.j)&&char.onG){char.vy=JUMP;SFX.click();}
      char.vy+=GRAVITY; char.x+=char.vx; char.y+=char.vy; char.onG=false;
      for(const p of platforms){if(char.x+char.w>p.x&&char.x<p.x+p.w&&char.y+char.h>p.y&&char.y+char.h<p.y+p.h+10&&char.vy>=0){char.y=p.y-char.h;char.vy=0;char.onG=true;}}
      if(char.y>H){char.y=0;char.vy=0;} if(char.x<0)char.x=0;
      for(const it of items){if(!it.c&&Math.hypot(char.x+13-it.x,char.y+17-it.y)<20){it.c=true;cCount++;setCollected(cCount);SFX.coin();}}
      if(char.x>W-36&&!finished){finished=true;setDone(true);SFX.levelup();}

      // Draw
      ctx.fillStyle=bgColor; ctx.fillRect(0,0,W,H);
      // Animated bg dots
      ctx.fillStyle=`${acColor}40`;
      for(let i=0;i<12;i++){const sx=(i*71+frame*0.4)%W,sy=(i*53)%(H/2);ctx.fillRect(sx,sy,2,2);}
      // Platforms
      for(const p of platforms){
        ctx.fillStyle=pColor2; ctx.fillRect(p.x,p.y,p.w,8);
        ctx.fillStyle=darken(pColor2); ctx.fillRect(p.x,p.y+8,p.w,p.h-8);
        ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=2; ctx.strokeRect(p.x,p.y,p.w,p.h);
      }
      // Items
      ctx.textAlign="center"; ctx.font="18px serif";
      for(const it of items){if(!it.c){const bob=Math.sin(frame*0.08+it.x)*3;ctx.shadowColor=acColor;ctx.shadowBlur=12;ctx.fillText(it.e,it.x,it.y+bob);ctx.shadowBlur=0;}}
      // Character
      const cx=char.x,cy=char.y;
      const bb=char.onG?Math.abs(Math.sin(frame*0.3))*2:0;
      ctx.fillStyle=pColor; ctx.fillRect(cx+3,cy+12+bb,22,18);
      ctx.fillStyle="#FFCC99"; ctx.fillRect(cx+3,cy+bb,22,14);
      ctx.fillStyle="#333";
      if(char.fr){ctx.fillRect(cx+14,cy+4+bb,4,4);ctx.fillRect(cx+19,cy+4+bb,4,4);}
      else{ctx.fillRect(cx+3,cy+4+bb,4,4);ctx.fillRect(cx+8,cy+4+bb,4,4);}
      ctx.fillStyle="#1a3a8a";
      const la=char.onG?Math.sin(frame*0.3)*4:0;
      ctx.fillRect(cx+4,cy+30+bb,9,6+la); ctx.fillRect(cx+15,cy+30+bb,9,6-la);
      // Finish flag
      ctx.shadowBlur=0; ctx.font="28px serif"; ctx.fillText("🏁",W-16,105);
      ctx.globalAlpha=1;
      if(!finished)gameRef.current=requestAnimationFrame(loop);
    };
    gameRef.current=requestAnimationFrame(loop);
    return()=>{cancelAnimationFrame(gameRef.current);window.removeEventListener("keydown",hk);window.removeEventListener("keyup",hk);};
  },[]);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:16,overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.5vw,14px)",color:pt.accent,textShadow:`0 0 16px ${pt.glow}`}}>
        {pt.icon} LEVEL UP — Mini-Niveau! {pt.icon}
      </div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#aaa"}}>Flèches / Espace — Ramasse les {pt.coinName}s!</div>
      <canvas ref={canvasRef} style={{border:`4px solid ${pt.accent}`,borderRadius:4,maxWidth:"100%",boxShadow:`0 0 30px ${pt.glow}`}}/>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:pt.accent}}>
        {pt.platformItems[0]} ×{collected} ramassés!
      </div>
      {done && <button className="btn-press" onClick={()=>onClose(collected)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 24px",background:pt.accent,color:"#0d0d0d",border:"4px solid #0d0d0d",borderRadius:4,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>🏆 CONTINUER →</button>}
      {!done && <button onClick={()=>onClose(collected)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"#666",border:"2px solid #444",cursor:"pointer"}}>Passer</button>}
    </div>
  );
};
const darken = (hex) => { try{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgb(${Math.floor(r*0.6)},${Math.floor(g*0.6)},${Math.floor(b*0.6)})`;}catch{return "#333";} };


// ═══════════════════════════════════════════════════════════════
// GAME ENGINE
// ═══════════════════════════════════════════════════════════════


// ─── PLAYER DASHBOARD ────────────────────────────────────────


// ─── BOSS DE FAMILLE — grand pool de sprites illustrés (v1.103.0) ──────
// v1.103.0 (Lot 6, audit 2.0) — remplace les 4 silhouettes procédurales recolorées
// (même forme générique, seule la couleur changeait) par 18 monstres illustrés
// distincts, choisis et validés un par un avec Gen. handleLaunchBoss() tire déjà
// au hasard dans BOSSES (inchangé) — agrandir ce tableau suffit à faire tourner
// le "grand pool" décidé avec elle, sans toucher à la logique de tirage.
const BOSSES = [
  { id:"tree_root_demon",     name:"Démon des Racines",  image:"/bosses/tree_root_demon.png",     emoji:"🌳" },
  { id:"sand_golem",          name:"Golem des Sables",   image:"/bosses/sand_golem.png",          emoji:"🏜️" },
  { id:"skull_idol_ghost",    name:"Idole Hurlante",     image:"/bosses/skull_idol_ghost.png",    emoji:"👻" },
  { id:"fire_chest_pentagram",name:"Coffre Maudit",      image:"/bosses/fire_chest_pentagram.png",emoji:"🔥" },
  { id:"venus_flytrap",       name:"Plante Carnivore",   image:"/bosses/venus_flytrap.png",       emoji:"🌿" },
  { id:"electric_fence",      name:"Clôture Électrique", image:"/bosses/electric_fence.png",      emoji:"⚡" },
  { id:"fire_lion",           name:"Lion de Braise",     image:"/bosses/fire_lion.png",           emoji:"🔥" },
  { id:"medusa",              name:"Méduse de Pierre",   image:"/bosses/medusa.png",              emoji:"🐍" },
  { id:"dragon_bowser",       name:"Dragon des Ténèbres",image:"/bosses/dragon_bowser.png",       emoji:"🐲" },
  { id:"sea_serpent",         name:"Serpent des Mers",   image:"/bosses/sea_serpent.png",         emoji:"🌊" },
  { id:"enderman_ghost",      name:"Ombre Errante",      image:"/bosses/enderman_ghost.png",      emoji:"👤" },
  { id:"jackalope_shield",    name:"Gardien Cornu",      image:"/bosses/jackalope_shield.png",    emoji:"🦌" },
  { id:"stone_golem_spiral",  name:"Golem Spirale",      image:"/bosses/stone_golem_spiral.png",  emoji:"🌀" },
  { id:"winged_purple_dragon",name:"Dracolet Ailé",      image:"/bosses/winged_purple_dragon.png",emoji:"🦇" },
  { id:"green_hydra",         name:"Hydre des Marais",   image:"/bosses/green_hydra.png",         emoji:"🐉" },
  { id:"yeti_white",          name:"Yéti des Neiges",    image:"/bosses/yeti_white.png",          emoji:"❄️" },
  { id:"loch_ness",           name:"Monstre du Lac",     image:"/bosses/loch_ness.png",           emoji:"🌊" },
  { id:"cerberus_fire",       name:"Meute Infernale",    image:"/bosses/cerberus_fire.png",       emoji:"🔥" },
];
// Dessine un monstre pixel original (corps, ventre, cornes, yeux, dents, taches)
function renderHydraToCtx(ctx, boss, W, H, s){
  // v1.76.0 — sprite HYDRE À DEUX TÊTES (tête gauche = boss.eye, tête droite = boss.belly)
  const body=boss?.color||"#2FA37A", cA=boss?.eye||"#FFD23F", cB=boss?.belly||"#3FA9FF", dk="rgba(0,0,0,0.20)";
  const head=(hx,hy,c)=>{
    ctx.fillStyle="#efe3c0"; ctx.fillRect(hx+s(0),hy-s(1),s(1),s(2)); ctx.fillRect(hx+s(4),hy-s(1),s(1),s(2)); // cornes
    ctx.fillStyle=c; ctx.fillRect(hx,hy,s(6),s(5)); ctx.fillRect(hx+s(1),hy+s(4),s(5),s(2));                // crâne + museau
    ctx.fillStyle=dk; ctx.fillRect(hx+s(1),hy+s(1),s(4),s(1));                                              // écaille front
    ctx.fillStyle="#fff"; ctx.fillRect(hx+s(1),hy+s(2),s(2),s(2)); ctx.fillRect(hx+s(3),hy+s(2),s(2),s(2)); // yeux
    ctx.fillStyle="#111"; ctx.fillRect(hx+s(1),hy+s(2),s(1),s(2)); ctx.fillRect(hx+s(4),hy+s(2),s(1),s(2)); // pupilles fâchées
    ctx.fillStyle="#3a0d0d"; ctx.fillRect(hx+s(2),hy+s(5),s(2),s(1));                                        // gueule
  };
  // corps
  ctx.fillStyle=body; ctx.fillRect(s(6),s(15),s(12),s(7)); ctx.fillRect(s(5),s(17),s(14),s(4));
  ctx.fillStyle=dk; ctx.fillRect(s(9),s(18),s(6),s(3));
  // deux cous (S vers chaque tête)
  ctx.fillStyle=body; ctx.fillRect(s(7),s(9),s(3),s(8)); ctx.fillRect(s(14),s(9),s(3),s(8));
  ctx.fillStyle=dk; ctx.fillRect(s(7),s(11),s(3),s(1)); ctx.fillRect(s(14),s(13),s(3),s(1)); // écailles
  // deux têtes
  head(s(3),s(3),cA);   // gauche = jaune
  head(s(15),s(3),cB);  // droite = bleue
}
function renderBossToCtx(ctx, boss, W=120, H=120){
  const sc=W/24, s=v=>Math.round(v*sc);
  ctx.clearRect(0,0,W,H);
  const col=boss?.color||"#8F72CC", belly=boss?.belly||"#C9B3F7", eye=boss?.eye||"#FFE14D";
  if(boss?.sprite==="hydra" || /hydre|hydra/i.test(boss?.name||"")){ renderHydraToCtx(ctx, boss, W, H, s); ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=Math.max(1,s(0.4)); return; }
  // Cornes
  ctx.fillStyle="#2a2230";
  ctx.fillRect(s(4),s(1),s(3),s(4)); ctx.fillRect(s(17),s(1),s(3),s(4));
  // Corps (bloc arrondi par retraits de coins)
  ctx.fillStyle=col;
  ctx.fillRect(s(3),s(5),s(18),s(15));
  ctx.fillRect(s(2),s(7),s(20),s(11));
  ctx.fillRect(s(1),s(9),s(22),s(7));
  // Ventre
  ctx.fillStyle=belly; ctx.fillRect(s(7),s(13),s(10),s(6));
  // Taches
  ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.fillRect(s(4),s(7),s(2),s(2)); ctx.fillRect(s(18),s(8),s(2),s(2)); ctx.fillRect(s(15),s(6),s(2),s(2));
  // Yeux
  ctx.fillStyle=eye; ctx.fillRect(s(6),s(8),s(4),s(4)); ctx.fillRect(s(14),s(8),s(4),s(4));
  ctx.fillStyle="#111"; ctx.fillRect(s(8),s(10),s(2),s(2)); ctx.fillRect(s(16),s(10),s(2),s(2));
  // Bouche + dents
  ctx.fillStyle="#1a0d1a"; ctx.fillRect(s(8),s(15),s(8),s(3));
  ctx.fillStyle="#fff"; ctx.fillRect(s(9),s(15),s(1),s(2)); ctx.fillRect(s(12),s(15),s(1),s(2)); ctx.fillRect(s(15),s(15),s(1),s(1));
  // Contour
  ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=Math.max(1,s(0.4));
}
function BossSprite({ boss, size=120, style={} }){
  const ref=useRef(null);
  useEffect(()=>{ if(boss?.image) return; const c=ref.current; if(c) renderBossToCtx(c.getContext("2d"), boss, size, size); },[boss,size]);
  // v1.101.0 — boss illustré (image PNG) si boss.image est fourni; sinon repli sur
  // l'ancienne silhouette dessinée sur canvas (compat avec un combat déjà en cours
  // dans le localStorage d'un enfant, lancé avant cette mise à jour).
  if(boss?.image){
    return <img src={boss.image} alt={boss.name||"boss"} width={size} style={{imageRendering:"pixelated",maxHeight:size*1.4,width:size,height:"auto",objectFit:"contain",...style}}/>;
  }
  return <canvas ref={ref} width={size} height={size} style={{imageRendering:"pixelated",...style}}/>;
}

// v1.77.0 — COMBAT FINAL : mini-jeu plateforme (fichier statique /combat-hydre.html) en iframe isolée,
// avec le VRAI avatar (renderAvatarToCtx) et le VRAI familier (renderPetToCtx) de l'enfant.
function HydraFinalGame({ player, pState, color, onClose }){
  const iframeRef = useRef(null);
  // v1.80.0 — filet réseau : un seul enfant (sur 4, en camping avec signal faible) arrivait à charger
  // le jeu — les 3 autres restaient sur un écran noir muet sans savoir si ça chargeait ou avait échoué.
  // Le fichier /combat-hydre.html lui-même est correct et se sert bien (vérifié) : la cause probable
  // est un chargement réseau qui traîne/échoue silencieusement (aucun état d'erreur avant ce fix).
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(()=>{
    setLoaded(false); setFailed(false);
    const t = setTimeout(()=>{ setLoaded(l=>{ if(!l) setFailed(true); return l; }); }, 7000);
    return ()=>clearTimeout(t);
  },[reloadKey]);
  const data = useMemo(()=>{
    const dk=(h)=>{ try{ let c=(h||"#FFD23F").replace("#",""); if(c.length===3)c=c.split("").map(x=>x+x).join(""); const f=v=>Math.max(0,Math.round(parseInt(v,16)*0.6)).toString(16).padStart(2,"0"); return "#"+f(c.slice(0,2))+f(c.slice(2,4))+f(c.slice(4,6)); }catch(e){ return "#7a5a12"; } };
    let hero="", pet="";
    // Chantier F (2026-07-27) — le héros porte maintenant son équipement dans le jeu
    // (renderAvatarSprite compose couches + items équipés, toujours synchrone).
    try{ hero=renderAvatarSprite(pState.avatar||DEFAULT_AVATAR, getPlayerTheme(player.themeId).charBodyColor||player.color,
      { size:96, equipped:pState.equipped, items:ALL_SHOP_ITEMS }).toDataURL("image/png"); }catch(e){}
    try{ const pid=pState.equipped&&pState.equipped.pet; const key=petSpriteKey(pid);
      if(key){ const pc=document.createElement("canvas"); pc.width=pc.height=96;
        const evo=(pState.petEvo||{})[pid]; const lv=petLevel((pState.petXp||{})[pid]||0);
        renderPetToCtx(pc.getContext("2d"), key, 96, petPalOverride(evo), petIsLegendary(evo,lv)); pet=pc.toDataURL("image/png"); } }catch(e){}
    const col=color||player.color||"#FFD23F";
    return { type:"hg-init", name:displayName(player), color:col, dark:dk(col), hero, pet };
  },[player,pState,color]);
  useEffect(()=>{
    const onMsg=(e)=>{ if(e && e.data && e.data.type==="hg-close") onClose && onClose(); };
    window.addEventListener("message", onMsg);
    return ()=>window.removeEventListener("message", onMsg);
  },[onClose]);
  const send=()=>{ try{ iframeRef.current && iframeRef.current.contentWindow.postMessage(data,"*"); }catch(e){} };
  const handleLoad=()=>{ setLoaded(true); setFailed(false); send(); setTimeout(send,250); };
  return (
    <div style={{position:"fixed",inset:0,zIndex:4000,background:"#0d0d0d"}}>
      <iframe key={reloadKey} ref={iframeRef} src="/combat-hydre.html" onLoad={handleLoad} title="Combat final de l'Hydre"
        style={{width:"100%",height:"100%",border:"none",display:"block"}}/>
      {!loaded && !failed && (
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,background:"#140d2b",color:"#fff",fontFamily:"'VT323',monospace",fontSize:20}}>
          <div>⏳ Chargement du combat...</div>
        </div>
      )}
      {failed && (
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,background:"#140d2b",color:"#fff",fontFamily:"'VT323',monospace",fontSize:18,textAlign:"center",padding:24}}>
          <div style={{fontSize:40}}>📶</div>
          <div>Ça n'a pas pu charger — souvent un signal faible.</div>
          <button onClick={()=>setReloadKey(k=>k+1)}
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,lineHeight:1.5,padding:"12px 20px",background:"linear-gradient(#ffe27a,#ffb02e)",color:"#251400",border:"none",borderRadius:12,cursor:"pointer",boxShadow:"0 6px 0 #a86a00"}}>🔁 Réessayer</button>
        </div>
      )}
      <button onClick={onClose} aria-label="Fermer"
        style={{position:"absolute",top:10,right:10,zIndex:4001,width:40,height:40,borderRadius:20,border:"2px solid #fff",background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:20,lineHeight:"36px",cursor:"pointer"}}>✕</button>
    </div>
  );
}
// v2.6.0 — case à cocher locale (éphémère) pour les tâches des annonces parent
function TaskCheck({ text }) {
  const [done, setDone] = useState(false);
  return (
    <div onClick={()=>setDone(!done)} style={{cursor:"pointer",padding:"4px 0",display:"flex",gap:8,alignItems:"flex-start",
      color:done?"#555":"#ddd",textDecoration:done?"line-through":"none",fontSize:14,lineHeight:1.4}}>
      <span style={{flexShrink:0,fontSize:16}}>{done?"✅":"⬜"}</span>
      <span>{text}</span>
    </div>
  );
}
// v2.6.0 — compte à rebours live vers l'heure cible d'une annonce parent
// v2.14.1 — textes personnalisables par annonce (label = suite du temps, doneText = à zéro)
function AnnouncementCountdown({ target, label, doneText }) {
  const [remaining, setRemaining] = useState("");
  useEffect(()=>{
    const suffix = label || "avant que les invités commencent à arriver !";
    const tick = ()=>{
      const diff = new Date(target) - new Date();
      if(diff<=0){ setRemaining(doneText || "Les invités arrivent maintenant ! 🎉"); return; }
      const h = Math.floor(diff/3600000);
      const m = Math.floor((diff%3600000)/60000);
      const s = Math.floor((diff%60000)/1000);
      setRemaining(h>0 ? `⏱ ${h}h ${m}min ${suffix}`
                       : `⏱ ${m}min ${s}s ${suffix}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return ()=>clearInterval(id);
  }, [target, label, doneText]);
  return <div style={{marginTop:10,color:"#FFD54F",fontWeight:"bold",fontSize:14,textAlign:"center"}}>{remaining}</div>;
}

// v1.101.0 (Lot 5 #23) — memo() : App() passe maintenant des callbacks stabilisés (voir plus bas),
// donc un re-render de App() ne force plus systématiquement un re-render de tout le dashboard.
const PlayerDashboard = memo(function PlayerDashboard({ player, playerIdx, pState, config, assignments, allTasks, allRewards, onRequestComplete, onBuy, onEquip, onChildAddTask, onChildPickTask, onChildAddRoutineTask, onRequestRemoval, onUpdatePseudo, onRespondOffer, showToast, onFeedPet, onPlayPet, onRenamePet, onChoosePetEvo, onDismissRefusal, onDismissAnnouncement, onBossAttack, onBossPetAttack, allStates, onLogout, onOpenParentPin, onReportBug, hamOpen, onCloseHam, onUnclaimReward, onHideReward, onClaimDaily, onOpenChest, onUpdateAvatar, parentMode, playerMode, todayDayIdx, onPatchState, onChangeTheme, onDeComplete, onForceComplete, onGoFamily, onGoCalendars, onGoTimer, th, weeklyChallenge, onChallengeCheckin }) {
  const [routineBuilder, setRoutineBuilder] = useState(null); // null | {name, emoji, taskIds:[]}
  const [routineTaskModal, setRoutineTaskModal] = useState(false); // l'enfant crée sa propre tâche pour le rituel
  const [homeTab, setHomeTab] = useState("accueil"); // accueil | jour | sem | shop — barre d'onglets en bas
  const [openRoutineGroups, setOpenRoutineGroups] = useState({}); // mode "Tout" : quels rituels sont dépliés
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false); const [bugText, setBugText] = useState("");
  const [pseudoDraft, setPseudoDraft] = useState(""); // l'enfant change son pseudo
  const [pinDraft, setPinDraft] = useState(""); const [pinDraft2, setPinDraft2] = useState(""); // l'enfant change son code
  const [profileMsg, setProfileMsg] = useState("");
  const [themePicker, setThemePicker] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false); // v1.63.0 — accordéon « tâches planifiées » (replié par défaut)
  const [dailyGoalsOpen, setDailyGoalsOpen] = useState(false); // Backlog UX #13 — accordéon « Défi + Objectifs » (replié par défaut, sous la liste de quêtes)
  const [taskTimerFor, setTaskTimerFor] = useState(null); // Backlog UX #11 — {emoji,label} de la tâche en cours de minutage, ou null
  // v1.57.0 — évolution du familier équipé en attente d'un choix?
  const _eqPetId = pState.equipped?.pet;
  const _eqPetLv = petLevel((pState.petXp||{})[_eqPetId]||0);
  const _eqPetEvo = (pState.petEvo||{})[_eqPetId];
  const _petPendingTier = _eqPetId ? petPendingTier(_eqPetEvo, _eqPetLv) : 0;
  const [chestReveal, setChestReveal] = useState(null); // {item,dup,chest,refund}
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = pState.settings || { sound:true, calm:false, calmCountdown:false, humor:true, focus:false, fontScale:1, readableFont:false };
  const setSetting = (key,val)=> onPatchState && onPatchState({ settings: { ...settings, [key]:val } });
  const [shopTab, setShopTab] = useState("rewards");
  const [avatarOpen, setAvatarOpen] = useState(false);
  // Refonte visuelle Phase 5 — avatar vivant : humeur temporaire (non persistée), revient à
  // "neutral" après `ms`. "tired" est calculé en continu (pas un minuteur) : ≥19h ET plus aucune
  // quête restante aujourd'hui — pas de sprite sheet, juste une surcharge canvas (avatar.jsx).
  const [avatarMood, setAvatarMood] = useState("neutral");
  const moodTimerRef = useRef(null);
  const setMoodFor = (mood, ms)=>{
    clearTimeout(moodTimerRef.current);
    setAvatarMood(mood);
    moodTimerRef.current = setTimeout(()=>setAvatarMood("neutral"), ms);
  };
  useEffect(()=>()=>clearTimeout(moodTimerRef.current),[]);
  // v1.84.0 (Lot 1 #B3) — ouvrir le personnalisateur coûte de l'énergie (frein "plaisir")
  const openAvatar = ()=>{
    if(currentEnergy(pState)<AVATAR_ENERGY){ const m=minsToEnergy(pState,AVATAR_ENERGY); showToast&&showToast(`😴 Ton héros se repose… reviens dans ~${m} min pour changer de look!`,"#85CDD1",3500); return; }
    onPatchState&&onPatchState({energy:Math.max(0,currentEnergy(pState)-AVATAR_ENERGY),energyTs:new Date().toISOString()});
    setAvatarOpen(true);
  };
  // Largeur de la bannière « Ma maison » (accueil) — pleine largeur du contenu, plafonnée.
  const bannerW = Math.min(680, (typeof window!=="undefined"?window.innerWidth:360)-16);
  const [themeRevealed, setThemeRevealed] = useState(false);
  const [badgeInfo, setBadgeInfo] = useState(null); // badge tapé → bulle d'info (tablette-friendly)
  const [finalBattle, setFinalBattle] = useState(false); // v1.77.0 — mini-jeu Combat final de l'Hydre
  const [petNickEditing, setPetNickEditing] = useState(false);
  const [petNickDraft, setPetNickDraft] = useState("");
  const T = th;
  // Resolve random theme per player (stable per session via player.id)
  const resolvedThemeId = player.themeId==="random"
    ? (themeRevealed ? resolveRandomTheme(player.id) : "none")
    : player.themeId;
  const pt = getPlayerTheme(resolvedThemeId);
  const isRandomUnrevealed = player.themeId==="random" && !themeRevealed;
  const lv = getLevel(pState.xp);
  const lvTitle = getLevelTitle(pState.xp, player.themeId, settings.femTitles);
  const xbr = xpBar(pState.xp);
  const xpPct = Math.min(100, (xbr.cur/xbr.needed)*100);
  // Refonte visuelle Phase 5 (suite) — "proud" (badge gagné ou niveau monté) et "levelup" (victoire
  // de boss réclamée pour ce joueur) détectés localement par comparaison à la valeur précédente,
  // sans prop drilling depuis App() : badges/niveau/bossClaimed sont déjà dans `pState`.
  const prevBadgeCountRef = useRef((pState.badges||[]).length);
  const prevLevelRef = useRef(lv.level);
  const prevBossClaimedRef = useRef(pState.bossClaimed);
  useEffect(()=>{
    const badgeCount=(pState.badges||[]).length;
    if(badgeCount>prevBadgeCountRef.current) setMoodFor("proud",4000);
    prevBadgeCountRef.current=badgeCount;
  },[pState.badges]);
  useEffect(()=>{
    if(lv.level>prevLevelRef.current) setMoodFor("proud",4000);
    prevLevelRef.current=lv.level;
  },[lv.level]);
  useEffect(()=>{
    if(pState.bossClaimed && pState.bossClaimed!==prevBossClaimedRef.current) setMoodFor("levelup",4000);
    prevBossClaimedRef.current=pState.bossClaimed;
  },[pState.bossClaimed]);
  const pMode = playerMode || config.mode || "routine";
  const allMine = assignments.filter(a=>a.playerIds.includes(player.id));
  const isWeekAss = (a)=> Array.isArray(a.days) && a.days.length>0;
  const routineMine = allMine.filter(a=>!isWeekAss(a));
  const weekMine = allMine.filter(isWeekAss);
  const myRoutines = pState.routines || [];
  const activeRoutine = pMode==="routine" && pState.activeRoutineId ? myRoutines.find(r=>r.id===pState.activeRoutineId) : null;
  // v1.68.0 (B5) — Fête quand un rituel est complété AU COMPLET (toutes ses tâches faites/en attente
  // aujourd'hui). Avant : finir un rituel ne donnait rien de spécial. 1× par rituel par jour (garde
  // ritualCelebrated, merge-safe). Pas d'XP ici (l'XP vient des quêtes/du minuteur) → 0 risque d'éco.
  const [ritualWin, setRitualWin] = useState(null); // {name, emoji}
  useEffect(()=>{
    if(parentMode) return;
    const day=todayStamp();
    const rc=(pState.ritualCelebrated && pState.ritualCelebrated.day===day) ? (pState.ritualCelebrated.ids||[]) : [];
    const isDone=k=>(pState.completed?.includes(k))||(pState.pending?.includes(k));
    const fresh=[];
    for(const r of (pState.routines||[])){
      const items=(routineMine||[]).filter(a=>r.taskIds?.includes(a.instanceId));
      if(items.length>0 && !rc.includes(r.id) && items.every(a=>isDone(a.instanceId+"_"+player.id+"#"+day))) fresh.push(r);
    }
    if(fresh.length){
      onPatchState&&onPatchState({ ritualCelebrated:{ day, ids:[...rc, ...fresh.map(r=>r.id)] } });
      try{ if(!CALM) spawnParticles(fresh[0].emoji||"⏰"); SFX.epic&&SFX.epic(); }catch{}
      setRitualWin({ name:fresh[0].name, emoji:fresh[0].emoji||"⏰", n:fresh.length });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pState.completed, pState.pending]);
  // v1.87.0 (Lot 3 #16) — message "Nouvelle journée!" au premier retour dans l'app un jour différent :
  // explique pourquoi les tâches sont "décochées" (reset quotidien par clé datée) au lieu de laisser
  // l'enfant deviner. Une fois par ouverture (au montage), pas à chaque re-render.
  useEffect(()=>{
    if(parentMode) return;
    const today=todayStamp();
    if(pState.lastSeenDay && pState.lastSeenDay!==today){
      showToast&&showToast("🌅 Nouvelle journée! Tes routines sont prêtes.","#85CDD1",4000);
    }
    if(pState.lastSeenDay!==today){ onPatchState&&onPatchState({lastSeenDay:today}); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  // Vue Semaine : on met en avant les tâches d'AUJOURD'HUI; le reste de la semaine va dans une section grisée
  const todayWeek = weekMine.filter(a=>Array.isArray(a.days)&&a.days.includes(todayDayIdx));
  const laterWeek = weekMine.filter(a=>!(Array.isArray(a.days)&&a.days.includes(todayDayIdx)));
  // Tâches affichées selon le mode choisi par l'enfant (l'XP des deux se cumule)
  // - mode semaine → tâches d'aujourd'hui
  // - routine ciblée → seulement les tâches choisies pour cette routine
  // - mode routine sans routine ciblée → toutes les tâches de routine
  // v2.6.0 — les quêtes de réparation 🕊️ sont TOUJOURS visibles, peu importe le mode (semaine/rituel)
  // ou le rituel actif : elles concernent la journée et tous les enfants sélectionnés doivent les voir.
  const repairMine = allMine.filter(a=>a.repair);
  const myAssignments = [...repairMine, ...(pMode==="week"
    ? todayWeek
    : (activeRoutine ? routineMine.filter(a=>activeRoutine.taskIds?.includes(a.instanceId)) : routineMine)
  ).filter(a=>!a.repair)];
  // Refonte visuelle Phase 5 — humeur affichée sur l'avatar du header : un événement (happy au
  // tap, voir requestComplete plus bas) est prioritaire ; sinon "tired" si ≥19h ET plus aucune
  // quête restante aujourd'hui (fin de journée paisible, pas un reproche — jamais si 0 quête).
  const _todayDoneKey = a=>a.instanceId+"_"+player.id+"#"+todayStamp();
  const _allDoneToday = myAssignments.length>0 && myAssignments.every(a=>pState.completed?.includes(_todayDoneKey(a)));
  const dashboardMood = avatarMood!=="neutral" ? avatarMood : (new Date().getHours()>=19 && _allDoneToday ? "tired" : "neutral");
  const themedCat = pt.shopCategory;
  const SHOP_TABS = { rewards:"🎁 Récompenses", hats:"🎩 Chapeaux", armors:"🛡️ Armures", pets:"🐾 Familiers", deco:"🏠 Maison", skins:"✨ Spécial", ...(themedCat.items.length>0?{[themedCat.id]:themedCat.label}:{}) };
  // Refonte Phase 7 — icônes pixel art des onglets boutique (repli = l'emoji du libellé).
  // Le libellé SHOP_TABS garde son emoji en tête de string : au rendu on le sépare pour
  // afficher <UIIcon> + texte (l'onglet thématique n'a pas de sprite dédié → emoji).
  const SHOP_TAB_ICONS = { rewards:"shop_rewards", hats:"shop_hats", armors:"shop_armors", pets:"shop_pets", deco:"shop_house", skins:"shop_special" };
  const splitEmojiLabel = (l)=>{ const m=/^(\S+)\s+(.*)$/.exec(l||""); return m?[m[1],m[2]]:[null,l]; };
  // Ma maison (2026-07-27) — items déco visibles : génériques + ceux du thème ACTIF seulement
  const decoItems = decoForTheme(player.themeId||"none");
  const SHOP_ITEMS = BASE_SHOP_ITEMS;
  const eq = pState.equipped || {};
  // hat/armor/pet resolved via allShopItemsFlat after it's declared below

  // Récompenses ALÉATOIRES du jour (reset quotidien); les cachées laissent place à de nouvelles
  const _hiddenRw = (pState.hiddenWeek===todayStamp() ? (pState.hiddenRewards||[]) : []);
  const myRewards = weeklyRewards(REWARD_CATALOG.length).filter(r=>!_hiddenRw.includes(r.id)).slice(0,8);
  const allShopItemsFlat = [
    ...SHOP_ITEMS.hats, ...SHOP_ITEMS.armors, ...SHOP_ITEMS.pets,
    ...(pt.shopCategory?.items||[]),
  ];

  return (
    // v1.87.0 (Lot 3 #12) — accessibilité texte : `zoom` (pas `fontSize`/`rem`) car TOUT le style de
    // l'app est en px/clamp() littéraux, pas en unités relatives — zoom est la seule façon de tout
    // agrandir (texte ET boutons ET espacements) sans réécrire des centaines de styles inline.
    // `readable-font` (classe CSS, voir GLOBAL_CSS) bascule la police pixel-art vers une police
    // système lisible via un sélecteur global — même raison, pas de réécriture site-wide possible ici.
    <div className={settings.readableFont?"readable-font":undefined} style={{display:"flex",flexDirection:"column",gap:10,padding:"10px 8px 92px",zoom:settings.fontScale||1}}>
      {/* v1.68.0 (B5) — bannière de fin de rituel (toute une routine complétée) */}
      {ritualWin && (
        <div onClick={()=>setRitualWin(null)} style={{position:"fixed",inset:0,zIndex:2600,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto",cursor:"pointer"}}>
          <div style={{maxWidth:360,width:"100%",maxHeight:"90vh",overflowY:"auto",textAlign:"center",background:"linear-gradient(160deg,#173a17,#0c220c)",border:`3px solid ${th.accent||"#5CAD68"}`,borderRadius:14,padding:"26px 22px",boxShadow:"0 0 26px rgba(46,204,64,0.5)"}}>
            <div style={{fontSize:60,lineHeight:1}}>{ritualWin.emoji}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.7vw,14px)",color:th.accent||"#5CAD68",margin:"12px 0 6px"}}>RITUEL COMPLÉTÉ!</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#fff",lineHeight:1.3}}>Bravo, tu as fini « {ritualWin.name} » au complet! 🎉</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#9ad29a",marginTop:8}}>Quelle belle job. 👏</div>
            <button className="btn-press" onClick={(e)=>{e.stopPropagation();setRitualWin(null);}} style={{marginTop:16,fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 22px",background:th.accent||"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"3px 3px 0 #0d0d0d"}}>YEAH!</button>
          </div>
        </div>
      )}
      {/* ✨ Évolution du familier — choix d'une voie élémentaire (niveaux 4/8/12) */}
      {!parentMode && _petPendingTier>0 && _eqPetId && (
        <EvolutionModal petId={_eqPetId} tier={_petPendingTier} evo={_eqPetEvo} th={th}
          onChoose={(el)=>{ onChoosePetEvo && onChoosePetEvo(_eqPetId, _petPendingTier, el); }}/>
      )}
      {/* v1.64.0 — message drôle quand une quête a été refusée par le parent */}
      {!parentMode && (pState.refusals||[]).map(r=>(
        <div key={r.key} style={{display:"flex",alignItems:"center",gap:10,background:"#3a2410",border:"2px solid #D99248",borderRadius:8,padding:"9px 11px"}}>
          <span style={{fontSize:20}}>{r.emoji}</span>
          <span style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,color:"#FFD7A0",lineHeight:1.3}}><b>{r.label}</b> — {r.msg}</span>
          <button onClick={()=>{ if(SFX.click)SFX.click(); onDismissRefusal&&onDismissRefusal(r.key); }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px 9px",background:"#D99248",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}}>Archiver</button>
        </div>
      ))}
      {/* ☰ Menu (déclenché depuis le header) — méta : réglages, archives, bug, validation parent, quitter */}
      {hamOpen && (
        <div onClick={()=>onCloseHam&&onCloseHam()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2600,display:"flex",justifyContent:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:pt.bg||"#1a1a2e",borderLeft:`3px solid ${pt.accent||player.color}`,width:"min(280px,82vw)",height:"100%",padding:16,display:"flex",flexDirection:"column",gap:10,overflowY:"auto",boxShadow:"-6px 0 24px rgba(0,0,0,0.5)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:pt.accent||player.color}}>☰ Menu</div>
              <button onClick={()=>onCloseHam&&onCloseHam()} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"5px 10px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
            </div>
            {[
              ["⚙️ Mes réglages", ()=>{onCloseHam&&onCloseHam();setSettingsOpen(true);}],
              ["🗄️ Archives", ()=>{onCloseHam&&onCloseHam();setArchivesOpen(true);}],
              ["🐛 J'ai trouvé un bug", ()=>{onCloseHam&&onCloseHam();setBugOpen(true);}],
              ["🔓 Validation parent", ()=>{onCloseHam&&onCloseHam();onOpenParentPin&&onOpenParentPin();}],
              ["🚪 Quitter / changer d'enfant", ()=>{onCloseHam&&onCloseHam();onLogout&&onLogout();}],
            ].map(([lbl,fn])=>(
              <button key={lbl} onClick={fn}
                style={{textAlign:"left",fontFamily:"'VT323',monospace",fontSize:17,padding:"12px 14px",background:"rgba(0,0,0,0.4)",color:"#ddd",border:`2px solid ${(pt.accent||player.color)}33`,borderRadius:8,cursor:"pointer"}}>{lbl}</button>
            ))}
          </div>
        </div>
      )}
      {/* 🗄️ Archives — quêtes complétées (aujourd'hui) */}
      {archivesOpen && (()=>{
        const stamp="#"+todayStamp();
        const done=(pState.completed||[]).filter(k=>k.endsWith(stamp));
        const rows=done.map(k=>{ const base=k.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_")); const ass=(config.assignments||[]).find(a=>a.instanceId===inst); const t=ass?allTasks.find(x=>x.id===ass.taskId):null; const ts=(pState.completedAt||{})[k]; const time=ts?new Date(ts).toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit"}):""; const cat=t?.cat; return { emoji:t?.emoji||"✅", label:t?.label||(inst.startsWith("cal_")?"Devoir/examen":"Quête"), time, cat }; }).sort((a,b)=>(b.time||"").localeCompare(a.time||""));
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2600,display:"flex",flexDirection:"column",padding:16,overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:pt.accent||player.color}}>🗄️ Archives — aujourd'hui</div>
              <button onClick={()=>setArchivesOpen(false)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#888",marginBottom:8}}>Tes quêtes complétées aujourd'hui ({rows.length}) :</div>
            {rows.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:18}}>Rien encore aujourd'hui. Fais une quête! 💪</div>}
            {rows.map((r,i)=>{ const m=r.cat?catMeta(r.cat):null; return (<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",background:"rgba(0,0,0,0.4)",border:"1px solid #2a2a2a",borderRadius:6,marginBottom:5}}><span style={{fontSize:18}}>{r.emoji}</span><span style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#5CAD68",flex:1}}>{r.label}{m?<span style={{color:m.color,fontSize:13}}> · {m.label}</span>:""}</span>{r.time&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>{r.time}</span>}<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5CAD68"}}>✅</span></div>); })}
            <button onClick={()=>setArchivesOpen(false)} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"13px",marginTop:8,background:pt.accent||player.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer"}}>← Retour</button>
          </div>
        );
      })()}
      {/* 🐛 Signaler un bug → envoyé au parent */}
      {bugOpen && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2600,display:"flex",flexDirection:"column",padding:16,overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:"#D99248"}}>🐛 J'ai trouvé un bug</div>
            <button onClick={()=>{setBugOpen(false);setBugText("");}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:6}}>Explique ce qui ne marche pas — ton parent va le recevoir :</div>
          <textarea value={bugText} onChange={e=>setBugText(e.target.value.slice(0,300))} autoFocus placeholder="ex: quand je clique sur..., il se passe..."
            style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"10px 12px",background:"#111",color:"#fff",border:"2px solid #D99248",borderRadius:6,outline:"none",minHeight:120,resize:"vertical"}}/>
          <button className="btn-press" disabled={!bugText.trim()} onClick={()=>{ if(bugText.trim()&&onReportBug){ const ok=onReportBug(bugText.trim()); if(ok){setBugOpen(false);setBugText("");} } }}
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,11px)",padding:"15px",marginTop:10,background:bugText.trim()?"#D99248":"#333",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:bugText.trim()?"pointer":"not-allowed",opacity:bugText.trim()?1:0.5,boxShadow:"2px 2px 0 #0d0d0d"}}>📨 Envoyer au parent</button>
        </div>
      )}
      {homeTab==="accueil" && (<>
      {/* ── v2.6.0 ANNONCES PARENT ──────────────────────────────── */}
      {!parentMode && (config.announcements||[])
        .filter(a=> !a.expiresAt || a.expiresAt >= todayStamp())
        .filter(a=> a.targetAll || (a.targetPlayerIds||[]).includes(player.id))
        .filter(a=> !(pState.dismissedAnnouncements||[]).includes(a.id))
        .map(a=>(
          <div key={a.id} style={{background:a.secret?"rgba(180,120,0,0.22)":"rgba(60,160,60,0.15)",
            border:`2px solid ${a.secret?"#C8942A":"#4CAF50"}`,borderRadius:10,padding:14,marginBottom:4}}>
            {a.secret && <div style={{color:"#FFB300",fontWeight:"bold",fontSize:11,marginBottom:6,letterSpacing:1,fontFamily:"'Press Start 2P',monospace"}}>🤫 MESSAGE SECRET</div>}
            {a.title && <div style={{color:"#FFD54F",fontWeight:"bold",fontSize:16,marginBottom:10,
              letterSpacing:0.3,textAlign:"center",lineHeight:1.3,fontFamily:"'Press Start 2P',monospace"}}>{a.title}</div>}
            <div style={{fontSize:15,lineHeight:1.5,fontFamily:"'VT323',monospace",color:"#eee"}}>{a.emoji} {a.text}</div>
            {a.countdownTo && <AnnouncementCountdown target={a.countdownTo} label={a.countdownLabel} doneText={a.countdownDoneText}/>}
            {(a.sharedTasks||[]).length>0 && <><div style={{marginTop:12,fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#aaa",letterSpacing:0.5}}>{a.sharedTasksLabel || (a.countdownTo ? "AVANT 10H30 :" : "À FAIRE :")}</div>
              {(a.sharedTasks||[]).map((t,i)=><TaskCheck key={i} text={t}/>)}</>}
            {((a.playerTasks||{})[player.id]||[]).length>0 && <><div style={{marginTop:10,fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#aaa",letterSpacing:0.5}}>{a.playerTasksLabel || "TES MISSIONS (dans la journée) :"}</div>
              {((a.playerTasks||{})[player.id]||[]).map((t,i)=><TaskCheck key={i} text={t}/>)}</>}
            <button onClick={()=>{if(SFX.click)SFX.click();onDismissAnnouncement&&onDismissAnnouncement(a.id);}}
              style={{marginTop:12,padding:"8px 16px",borderRadius:8,fontFamily:"'Press Start 2P',monospace",
                fontSize:8,background:"#333",border:"2px solid #555",color:"#eee",cursor:"pointer",display:"block",width:"100%"}}>
              {a.dismissLabel || "🤐 Compris, je reste discret·e !"}
            </button>
          </div>
        ))
      }
      {/* Player header card */}
      <div style={{background:"rgba(0,0,0,0.5)",border:`2px solid #2a2a2a`,borderTop:`3px solid ${player.color}`,borderRadius:8,padding:14,display:"flex",gap:12,alignItems:"center"}}>
        {/* Avatar — clickable → opens creator/inventory */}
        <div style={{position:"relative",flexShrink:0,cursor:"pointer"}} onClick={openAvatar} title="Personnaliser mon perso">
          <AvatarCanvas avatarDef={pState.avatar||DEFAULT_AVATAR} bodyColor={pt.charBodyColor||player.color} size={72} mood={dashboardMood}
            style={{border:`4px solid ${pt.accent||player.color}`,boxShadow:`0 0 14px ${pt.glow||player.color}50`,display:"block"}}/>
          {/* v1.81.0 — ancré sur la vraie géométrie du corps (EquippedGear), voir plus haut */}
          <EquippedGear eq={eq} items={allShopItemsFlat} size={72} avatarDef={pState.avatar}/>
          {eq.pet   && (petSpriteKey(eq.pet) ? <div style={{position:"absolute",bottom:-8,left:-10,pointerEvents:"none"}}><PetSprite itemId={eq.pet} size={30}/></div> : <span style={{position:"absolute",bottom:-8,left:-6,fontSize:18,pointerEvents:"none"}}>{allShopItemsFlat.find(i=>i.id===eq.pet)?.emoji}</span>)}
          <div style={{position:"absolute",bottom:-18,left:"50%",transform:"translateX(-50%)",fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#555",whiteSpace:"nowrap"}}>✏️ Modifier</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.4vw,14px)",color:player.color,marginBottom:3}}>{displayName(player)}</div>
          {isRandomUnrevealed
            ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#D9BC5C",marginBottom:5}}>❓ THÈME MYSTÈRE</div>
            : <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:pt.accent||"#aaa",marginBottom:5,textShadow:`0 0 8px ${pt.glow}60`}}>Niv.{lvTitle.level} — {lvTitle.title}</div>
          }
          {isRandomUnrevealed && <button className="btn-press" onClick={()=>{setThemeRevealed(true);SFX.epic();spawnParticles("🎲");}}
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px 12px",background:"linear-gradient(90deg,#D97070,#D9BC5C,#44FF44)",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"3px 3px 0 #0d0d0d",marginBottom:4}}>
            🎲 RÉVÉLER MON THÈME!
          </button>}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",marginBottom:2}}>⚡ XP {pState.xp}</div>
          <div style={{height:9,background:"#111",border:"2px solid #333",borderRadius:1,overflow:"hidden",marginBottom:6}}>
            <div style={{height:"100%",width:xpPct+"%",background:`linear-gradient(90deg,${player.color},#85CDD1)`,transition:"width 0.8s ease"}}/>
          </div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,12px)",color:"#D9BC5C"}}><Coin size={14}/> {pState.coins} {pt.coinName||"pièces"}</div>
          {/* v1.84.0 (Lot 1 #B3) — sieste visible ICI aussi (pas juste sur la carte familier) dès
              qu'au moins une activité plaisir (boutique/avatar) est bloquée par l'énergie */}
          {(()=>{ const cur=currentEnergy(pState); const thresh=Math.max(SHOP_ENERGY,AVATAR_ENERGY);
            if(cur>=thresh) return null;
            const m=minsToEnergy(pState,thresh);
            return <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#85CDD1",marginTop:3}}>😴 Ton héros se repose… prêt dans ~{m} min</div>;
          })()}
        </div>
      </div>

      {/* Boutons thème + réglages */}
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>{SFX.click();setThemePicker(true);}}
          style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px",background:"rgba(0,0,0,0.4)",border:`2px solid ${pt.accent||player.color}55`,color:pt.accent||player.color,borderRadius:5,cursor:"pointer"}}>
          🎨 Thème : {pt.name}
        </button>
        <button onClick={()=>{SFX.click();setSettingsOpen(true);}} title="Mes réglages (son, animations…)"
          style={{flexShrink:0,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 12px",background:"rgba(0,0,0,0.4)",border:"2px solid #555",color:"#bbb",borderRadius:5,cursor:"pointer"}}>
          ⚙️
        </button>
      </div>

      {/* 🔥 Série + 🐾 Familier vivant (énergie / sieste / nourrir / jouer) */}
      {(()=>{
        const acc=pt.accent||player.color;
        const streak=streakOf(pState.activeDays);
        // v2.5.21 — fallback sur le catalogue complet (pas seulement le thème courant) : un familier gagné
        // en récompense de boss (pickUltraLegendary, toutes thèmes confondus) ou équipé avant un changement
        // de thème hebdomadaire n'était plus trouvé dans allShopItemsFlat (scopé au thème actuel) → la carte
        // familier retombait sur "Pas de familier équipé" malgré owned[]/equipped.pet valides (perte purement
        // visuelle, aucune donnée perdue).
        const eqPet=allShopItemsFlat.find(i=>i.id===eq.pet) || shopItemById(eq.pet);
        const cur=currentEnergy(pState);
        const fedToday=pState.lastFedDay===todayStamp();
        const eColor=cur>=60?"#5CAD68":cur>=30?"#D9BC5C":"#D98C8C";
        const napping=cur<PLAY_ENERGY;
        // v2.15.7 (demande de Gen, 2026-07-28) : depuis v2.11.3, jouer restait TOUJOURS permis même
        // plafond atteint (seul le message changeait, honnêtement) — décision volontaire à l'époque.
        // Gen veut maintenant un vrai blocage visuel du bouton une fois le plafond quotidien atteint.
        const capReached = pState.petDay?.day===todayStamp() && (pState.petDay.xp||0) >= PET_DAILY_CAP;
        return (
          <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${acc}55`,borderRadius:8,padding:12,display:"flex",flexDirection:"column",gap:10}}>
            {/* Série */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:streak>0?"#D99248":"#666"}}>🔥 Série : {streak} jour{streak>1?"s":""}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#777"}}>{streak>0?"Fais une quête chaque jour!":"Fais une quête pour démarrer ta série!"}</div>
            </div>
            {eqPet ? (()=>{ const xp=(pState.petXp||{})[eqPet.id]||0; const lv=petLevel(xp); const bar=petBar(xp); const pctp=bar.max?100:Math.round(bar.cur/bar.needed*100);
              const _evo=(pState.petEvo||{})[eqPet.id]; const _leg=petIsLegendary(_evo,lv);
              return (<>
                <div style={{display:"flex",alignItems:"center",gap:12}} onClick={openAvatar} >
                  <div style={{width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",filter:`drop-shadow(0 0 6px ${pt.glow||acc})`,opacity:napping?0.6:1}}>
                    {napping ? <div style={{fontSize:48,lineHeight:1}}>😴</div> : petSpriteKey(eqPet.id) ? <PetSprite itemId={eqPet.id} size={48} palOverride={petPalOverride(_evo)} legendary={_leg}/> : <div style={{fontSize:48,lineHeight:1}}>{eqPet.emoji}</div>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      {petNickEditing
                        ? (<><input autoFocus value={petNickDraft}
                            onChange={e=>setPetNickDraft(e.target.value)}
                            onKeyDown={e=>{ if(e.key==="Enter"){ onRenamePet&&onRenamePet(eqPet.id,petNickDraft); setPetNickEditing(false); } if(e.key==="Escape") setPetNickEditing(false); }}
                            onClick={e=>e.stopPropagation()} maxLength={20}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,background:"#111",border:`1px solid ${acc}`,color:acc,borderRadius:3,padding:"2px 5px",width:110}}/>
                          <button onClick={e=>{e.stopPropagation();onRenamePet&&onRenamePet(eqPet.id,petNickDraft);setPetNickEditing(false);}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"2px 5px",background:acc,color:"#0d0d0d",border:"none",borderRadius:3,cursor:"pointer"}}>✔</button></>)
                        : (<><div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:acc}}>{pState.petNickname?.[eqPet.id]||eqPet.name} — Niv.{lv}</div>
                          <button onClick={e=>{e.stopPropagation();setPetNickDraft(pState.petNickname?.[eqPet.id]||eqPet.name);setPetNickEditing(true);}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"1px 3px",background:"transparent",border:`1px solid ${acc}44`,color:acc,borderRadius:3,cursor:"pointer",lineHeight:1,flexShrink:0}} title="Renommer">✏️</button></>)
                      }
                    </div>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#bbb",margin:"1px 0 3px"}}>🐾 {petStage(xp)} {napping?"· 💤 fait la sieste":""}</div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888"}}>XP familier</div>
                    <div style={{height:7,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden",margin:"1px 0 4px"}}><div style={{height:"100%",width:pctp+"%",background:acc}}/></div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888"}}>⚡ Énergie {cur}%</div>
                    <div style={{height:7,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden",marginTop:1}}><div style={{height:"100%",width:cur+"%",background:eColor,transition:"width 0.6s"}}/></div>
                  </div>
                </div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:fedToday?"#5CAD68":"#D9BC5C",lineHeight:1.3}}>
                  {fedToday?"✅ Nourri aujourd'hui — il gagne de l'XP avec tes quêtes!":"🍖 Nourris-le aujourd'hui pour qu'il gagne de l'XP avec tes quêtes!"}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={(e)=>{e.stopPropagation();onFeedPet&&onFeedPet();}} disabled={fedToday}
                    style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"10px",background:fedToday?"#1a1a1a":"#5CAD68",color:fedToday?"#555":"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:5,cursor:fedToday?"default":"pointer",opacity:fedToday?0.6:1}}>🍖 Nourrir</button>
                  <button onClick={(e)=>{e.stopPropagation();if(capReached)return;onPlayPet&&onPlayPet();}} disabled={napping||capReached}
                    style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"10px",background:(napping||capReached)?"#1a1a1a":acc,color:(napping||capReached)?"#777":"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:5,cursor:(napping||capReached)?"default":"pointer",opacity:(napping||capReached)?0.6:1}}>{capReached?"🌙 Demain":napping?"💤 Sieste":"🎾 Jouer"}</button>
                </div>
              </>); })() : (
                <div onClick={openAvatar} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontSize:40,opacity:0.5}}>🐾</div>
                  <div style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa"}}>Pas de familier équipé. Achètes-en un à la boutique 🛒, nourris-le chaque jour et il évoluera avec tes quêtes!</div>
                </div>
              )}
          </div>
        );
      })()}
      {/* 📬 Demandes de pièces reçues (offres en attente que CET enfant doit accepter) */}
      {(()=>{ const offers=(config.coinOffers||[]).filter(o=>o.toId===player.id && o.status==="pending");
        if(!offers.length) return null;
        return (
          <div style={{background:"rgba(94,222,245,0.08)",border:"2px solid #85CDD155",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1",marginBottom:8}}>📬 DEMANDES DE PIÈCES ({offers.length})</div>
            {offers.map(o=>{ const from=config.players.find(p=>p.id===o.fromId); const enough=(pState.coins||0)>=o.amount;
              return (
                <div key={o.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:120,fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}><b style={{color:from?.color||"#fff"}}>{displayName(from)}</b> te demande {o.amount} 🪙</div>
                  <button disabled={!enough} onClick={()=>{SFX.click();onRespondOffer&&onRespondOffer(o.id,true);}} title={enough?"":"Pas assez de pièces"}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 10px",background:enough?"#5CAD68":"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:enough?"pointer":"not-allowed",opacity:enough?1:0.5}}>✅ Donner</button>
                  <button onClick={()=>{SFX.click();onRespondOffer&&onRespondOffer(o.id,false);}}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 10px",background:"#1a1a1a",color:"#D98C8C",border:"2px solid #D98C8C55",borderRadius:4,cursor:"pointer"}}>✕</button>
                </div>
              );
            })}
          </div>
        );
      })()}
      </>)}

      {/* Panneau « Mes réglages » (accessibilité par enfant) */}
      {settingsOpen && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2500,display:"flex",flexDirection:"column",padding:16,overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:pt.accent||player.color}}>⚙️ Mes réglages</div>
            <button onClick={()=>{SFX.click();setSettingsOpen(false);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#888",marginBottom:10}}>Ajuste l'app comme tu l'aimes. Touche pour activer ou désactiver.</div>

          {/* Mon profil — l'enfant change SON pseudo et SON code secret */}
          <div style={{background:"rgba(0,0,0,0.5)",border:`2px solid ${pt.accent||player.color}`,borderRadius:6,padding:12,marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:pt.accent||player.color,marginBottom:8}}>🙂 Mon profil</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa",marginBottom:3}}>Mon pseudo</div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              <input value={pseudoDraft} onChange={e=>setPseudoDraft(e.target.value.slice(0,16))} placeholder={player.pseudo||player.name||"Mon pseudo"}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:16,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none"}}/>
              <button onClick={()=>{ if(pseudoDraft.trim()){ SFX.click(); onUpdatePseudo&&onUpdatePseudo(pseudoDraft.trim()); setProfileMsg("✅ Pseudo changé!"); setPseudoDraft(""); } }}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"0 14px",background:pseudoDraft.trim()?(pt.accent||player.color):"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",opacity:pseudoDraft.trim()?1:0.5}}>✅</button>
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa",marginBottom:3}}>Mon code secret (4 chiffres)</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <input type="password" inputMode="numeric" maxLength={4} value={pinDraft} onChange={e=>setPinDraft(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Nouveau"
                style={{width:92,fontFamily:"'Press Start 2P',monospace",fontSize:13,padding:"9px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center",letterSpacing:3}}/>
              <input type="password" inputMode="numeric" maxLength={4} value={pinDraft2} onChange={e=>setPinDraft2(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Encore"
                style={{width:92,fontFamily:"'Press Start 2P',monospace",fontSize:13,padding:"9px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center",letterSpacing:3}}/>
              <button disabled={!(pinDraft.length===4&&pinDraft===pinDraft2)}
                onClick={()=>{ if(pinDraft.length===4&&pinDraft===pinDraft2){ SFX.click(); onPatchState&&onPatchState({pin:pinDraft}); setProfileMsg("🔑 Code secret changé!"); setPinDraft("");setPinDraft2(""); } }}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"0 14px",alignSelf:"stretch",background:(pinDraft.length===4&&pinDraft===pinDraft2)?(pt.accent||player.color):"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",opacity:(pinDraft.length===4&&pinDraft===pinDraft2)?1:0.5}}>✅</button>
            </div>
            {pinDraft.length===4&&pinDraft2.length===4&&pinDraft!==pinDraft2 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#D98C8C",marginTop:5}}>Les deux codes ne sont pas pareils.</div>}
            {profileMsg && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#5CAD68",marginTop:6}}>{profileMsg}</div>}
          </div>

          {[
            ["sound","🔊 Son","Les petits sons quand tu touches et réussis"],
            ["calm","🎬 Mode calme","Moins d'animations et de clignotements (plus doux pour les yeux)"],
            ["calmCountdown","⏱ Décompte calme","Le minuteur sans rouge ni « dépêche-toi »"],
            ["focus","🎯 Une tâche à la fois","Voir seulement la prochaine quête, pas toute la liste"],
            ["readableFont","🔤 Police plus lisible","Remplace les lettres « jeu vidéo » par une police plus simple à lire"], // v1.87.0 (Lot 3 #12)
            ["femTitles","👑 Titres au féminin","Héroïne, Championne, Chevalière… au lieu de Héros, Champion, Chevalier"], // v2.5.27 — branche titleF/levelsF (item #5 analyse game design)
          ].map(([key,label,desc])=>{
            // v1.82.0 (Lot 1 #4) — "humor" retiré : c'était un réglage sans effet (aucun texte
            // humoristique n'existe dans le code), ça promettait une fonction inexistante à l'enfant.
            const isOn = (key==="sound") ? settings[key]!==false : !!settings[key];
            return (
              <div key={key} onClick={()=>{SFX.click();setSetting(key, !isOn);}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:"rgba(0,0,0,0.5)",border:`2px solid ${isOn?(pt.accent||"#5CAD68"):"#333"}`,borderRadius:6,marginBottom:8,cursor:"pointer"}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:isOn?(pt.accent||"#fff"):"#999"}}>{label}</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888"}}>{desc}</div>
                </div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"6px 10px",borderRadius:20,background:isOn?(pt.accent||"#5CAD68"):"#333",color:isOn?"#0d0d0d":"#888",minWidth:54,textAlign:"center"}}>{isOn?"ON":"OFF"}</div>
              </div>
            );
          })}
          {/* v1.87.0 (Lot 3 #12) — taille du texte : `zoom` sur le conteneur racine (voir plus haut),
              pas un booléen donc en dehors de la liste ON/OFF ci-dessus */}
          <div style={{padding:"11px 12px",background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:6,marginBottom:8}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#ccc",marginBottom:8}}>🔍 Taille du texte</div>
            <div style={{display:"flex",gap:6}}>
              {[["Normal",1],["Grand",1.15],["Très grand",1.3]].map(([lbl,val])=>{ const on=(settings.fontScale||1)===val; return (
                <button key={val} onClick={()=>{SFX.click();setSetting("fontScale",val);}}
                  style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 4px",background:on?(pt.accent||"#5CAD68"):"#1a1a1a",color:on?"#0d0d0d":"#bbb",border:`2px solid ${on?(pt.accent||"#5CAD68"):"#333"}`,borderRadius:4,cursor:"pointer"}}>{lbl}</button>
              ); })}
            </div>
          </div>
          <button className="btn-press" onClick={()=>{SFX.click();setSettingsOpen(false);}}
            style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"14px",marginTop:8,background:pt.accent||player.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
            ← Retour
          </button>
        </div>
      )}

      {/* Sélecteur de thème — un thème par semaine, débloqué par XP */}
      {themePicker && (()=>{
        const canChange = !player.themeChosenAt || weekKey(new Date(player.themeChosenAt)) !== weekKey();
        const list = PT_LIST.filter(t=>!t.secret);
        const nextLocked = list.filter(t=>!isThemeUnlocked(t.id,pState.xp,player.starterThemes||[])).sort((a,b)=>(a.xpUnlock||0)-(b.xpUnlock||0))[0];
        const weeklyFreeId = getWeeklyFreeTheme();
        const weeklyFreeTheme = PLAYER_THEMES[weeklyFreeId];
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2500,display:"flex",flexDirection:"column",padding:16,overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:pt.accent||player.color}}>🎨 Choisis ton thème</div>
              <button onClick={()=>{SFX.click();setThemePicker(false);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:canChange?"#9fe":"#FFA94D",marginBottom:4,lineHeight:1.3}}>
              {canChange ? "Touche un thème débloqué pour le choisir. Il dure toute la semaine 🗓️" : "Tu as déjà choisi ton thème cette semaine. Tu pourras en changer lundi prochain! 🗓️"}
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#888",marginBottom:4}}>🔒 Les autres thèmes se débloquent en gagnant de l'XP.{nextLocked?` Prochain : ${nextLocked.icon} ${nextLocked.name} à ${nextLocked.xpUnlock} XP (tu as ${pState.xp} XP).`:" Tu les as tous débloqués! 🏆"}</div>
            {weeklyFreeTheme && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#D9BC5C",marginBottom:10}}>🎲 Thème de la semaine gratuit : {weeklyFreeTheme.icon} {weeklyFreeTheme.name} — débloqué pour tout le monde, sans XP!</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              {list.map(t=>{
                const unlocked=isThemeUnlocked(t.id,pState.xp,player.starterThemes||[]);
                const current=player.themeId===t.id;
                const selectable=unlocked&&canChange&&!current;
                const isWeeklyFree = t.id===weeklyFreeId;
                return (
                  <button key={t.id} disabled={!selectable}
                    onClick={()=>{ if(selectable){ onChangeTheme&&onChangeTheme(t.id); setThemePicker(false); } }}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"12px 8px",
                      background:current?`${t.accent}25`:unlocked?"rgba(0,0,0,0.6)":"rgba(0,0,0,0.3)",
                      border:`3px solid ${current?t.accent:isWeeklyFree?"#D9BC5C":unlocked?"#555":"#2a2a2a"}`,borderRadius:8,
                      cursor:selectable?"pointer":"default",opacity:unlocked?1:0.5,boxShadow:current?`0 0 14px ${t.glow||t.accent}50`:"none"}}>
                    <span style={{fontSize:30,filter:unlocked?"none":"grayscale(1)"}}>{t.icon}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",color:current?t.accent:unlocked?"#ddd":"#666",textAlign:"center",lineHeight:1.3}}>{t.name}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:current?"#5CAD68":unlocked?(t.accent||"#D9BC5C"):"#777"}}>
                      {current?"✅ ACTUEL":isWeeklyFree&&unlocked?"🎲 Gratuit!":unlocked?"Choisir":`🔒 ${t.xpUnlock} XP`}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="btn-press" onClick={()=>{SFX.click();setThemePicker(false);}}
              style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"14px",marginTop:14,background:pt.accent||player.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
              ← Retour
            </button>
          </div>
        );
      })()}

      {/* v2.15.0 — les rappels devoir/examen (computeCalendarReminders) ont été retirés d'ici :
          le calendrier n'accorde plus d'XP, c'est maintenant purement informationnel (demande de
          Gen) — homeTab==="sem" n'avait plus que ça comme contenu propre, donc plus de wrapper. */}
      {homeTab==="jour" && (<>
      {/* Lot 7A — bannière semaine de pause */}
      {!isCustodyWeek() && (()=>{
        const now2=new Date();
        const daysUntilFri = (5 - now2.getDay() + 7) % 7 || 7; // jours jusqu'au prochain vendredi
        return (
          <div style={{background:"rgba(0,0,0,0.5)",border:"2px solid #85CDD1",borderRadius:6,padding:"10px 13px",marginBottom:4,textAlign:"center"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,8px)",color:"#85CDD1",marginBottom:5}}>📍 SEMAINE CHEZ L'AUTRE PARENT</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#aaa",lineHeight:1.3}}>
              Tes quêtes de la maison reprennent vendredi!{daysUntilFri===1?" (demain)":` (dans ${daysUntilFri} jours)`}
            </div>
          </div>
        );
      })()}
      {/* v2.15.0 — rappels devoir/examen retirés d'ici aussi (voir plus haut) : le calendrier
          est maintenant consulté dans son propre écran, purement informationnel. */}
      {/* ── NAVIGATION CLAIRE À 2 NIVEAUX ──
          1) Gros choix : Semaine (accueil) vs Rituels.  2) Si Rituels : quel rituel. */}
      {(()=>{
        const acc = th.accent||player.color;
        const seg = (active,label,sub,onClick)=>(
          <button onClick={onClick}
            style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,10px)",padding:"12px 8px",
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,lineHeight:1.3,
              background:active?acc:"rgba(0,0,0,0.4)",color:active?"#0d0d0d":"#aaa",
              border:`3px solid ${active?acc:"#333"}`,borderRadius:8,cursor:"pointer",
              boxShadow:active?`0 0 14px ${acc}55`:"none",transition:"all 0.15s"}}>
            <span>{label}</span>
            <span style={{fontFamily:"'VT323',monospace",fontSize:12,opacity:0.85,fontWeight:active?700:400}}>{sub}</span>
          </button>
        );
        return (
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:2}}>
            {/* Niveau 1 : Semaine vs Rituels */}
            <div style={{display:"flex",gap:8}}>
              {/* v1.85.0 (Lot 2 #8) — "📋 Mes tâches" au lieu de "🏠 Semaine" : évite la collision
                  d'icône avec l'onglet du bas "🏠 Accueil" (deux 🏠 pour deux choses différentes)
                  et le mot "Semaine" déjà pris par l'onglet du bas "📅 Semaine" (calendrier). */}
              {seg(pMode==="week","📋 Mes tâches","planifiées cette semaine",()=>{ if(pMode!=="week"){SFX.click();onPatchState({mode:"week",activeRoutineId:null});} })}
              {seg(pMode==="routine","⏰ Rituels",myRoutines.length?`${myRoutines.length} rituel${myRoutines.length>1?"s":""}`:"à créer",()=>{
                if(pMode!=="routine"){ SFX.click(); onPatchState({mode:"routine",activeRoutineId: myRoutines[0]?.id || null}); }
              })}
            </div>
            {/* Niveau 2 : quel rituel (visible seulement en mode Rituels) */}
            {pMode==="routine" && (
              <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,alignItems:"center"}}>
                {myRoutines.map(r=>{ const on=pState.activeRoutineId===r.id; return (
                  <button key={r.id} onClick={()=>{SFX.click();onPatchState({mode:"routine",activeRoutineId:r.id});}}
                    style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"7px 12px",whiteSpace:"nowrap",
                      background:on?acc:"#1a1a1a",color:on?"#0d0d0d":"#bbb",border:`2px solid ${on?acc:"#333"}`,borderRadius:20,cursor:"pointer",fontWeight:on?700:400}}>
                    {r.emoji||"⏰"} {r.name}
                  </button>
                ); })}
                {routineMine.length>0 && (()=>{ const on=!pState.activeRoutineId; return (
                  <button onClick={()=>{SFX.click();onPatchState({mode:"routine",activeRoutineId:null});}}
                    style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"7px 12px",whiteSpace:"nowrap",
                      background:on?acc:"#1a1a1a",color:on?"#0d0d0d":"#bbb",border:`2px solid ${on?acc:"#333"}`,borderRadius:20,cursor:"pointer",fontWeight:on?700:400}}>
                    🗂️ Tout
                  </button>
                ); })()}
                <button onClick={()=>{ SFX.click(); setRoutineBuilder({name:"",emoji:"🌅",taskIds:[]}); }}
                  style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"7px 12px",whiteSpace:"nowrap",
                    background:"rgba(0,0,0,0.4)",border:`2px dashed ${acc}`,color:acc,borderRadius:20,cursor:"pointer"}}>
                  ➕ Nouveau
                </button>
              </div>
            )}
          </div>
        );
      })()}

      </>)}
      {/* Créateur de routine (enfant autonome) */}
      {routineBuilder && (
        <div style={{background:"rgba(0,0,0,0.6)",border:`3px solid ${th.accent||player.color}`,borderRadius:6,padding:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:th.accent||player.color}}>{routineBuilder.editId?"✏️ Modifier mon rituel":"🌟 Mon nouveau rituel"}</div>
            <button onClick={()=>{SFX.click();setRoutineBuilder(null);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"5px 9px",background:"#1a1a1a",color:"#888",border:"2px solid #333",borderRadius:4,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {["🌅","🌙","☀️","🌆","⭐","🏃","🦷","📚"].map(em=>(
              <button key={em} onClick={()=>{SFX.click();setRoutineBuilder(b=>({...b,emoji:em}));}}
                style={{fontSize:18,padding:"5px 8px",background:routineBuilder.emoji===em?`${th.accent||player.color}30`:"#1a1a1a",border:`2px solid ${routineBuilder.emoji===em?(th.accent||player.color):"#333"}`,borderRadius:5,cursor:"pointer"}}>{em}</button>
            ))}
          </div>
          <input value={routineBuilder.name} onChange={e=>setRoutineBuilder(b=>({...b,name:e.target.value.slice(0,16)}))} placeholder="Nom (ex: Matin, Soir...)"
            style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none"}}/>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#888"}}>⏰ Heure de fin (optionnel) :</span>
            <input type="time" value={routineBuilder.endTime||""} onChange={e=>setRoutineBuilder(b=>({...b,endTime:e.target.value}))}
              style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none"}}/>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb"}}>👇 Touche les tâches que tu VEUX faire dans ce rituel.</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777"}}>Une tâche choisie devient verte avec un ✅. Touche encore pour l'enlever.</div>
          <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:"32vh",overflowY:"auto"}}>
            {routineMine.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#888"}}>Tu n'as pas encore de tâche de rituel. Touche « ➕ Créer ma propre tâche » plus bas pour en ajouter une! 👇</div>}
            {routineMine.map(a=>{
              const t=allTasks.find(x=>x.id===a.taskId); if(!t)return null;
              const sel=routineBuilder.taskIds.includes(a.instanceId);
              return (
                <div key={a.instanceId} onClick={()=>{SFX.click();setRoutineBuilder(b=>({...b,taskIds:sel?b.taskIds.filter(x=>x!==a.instanceId):[...b.taskIds,a.instanceId]}));}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:sel?`${th.accent||player.color}25`:"rgba(0,0,0,0.4)",border:`2px solid ${sel?(th.accent||player.color):"#333"}`,borderRadius:4,cursor:"pointer"}}>
                  <span style={{fontSize:18,lineHeight:0}}>{sel?<UIIcon name="check" emoji="✅" size={18}/>:<UIIcon name={"task_"+t.id} emoji={t.emoji} size={18}/>}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",flex:1}}>{t.label}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1"}}><Xp size={9}/>{t.xp}</span>
                </div>
              );
            })}
          </div>
          {/* L'enfant est autonome : il peut créer sa propre tâche et l'ajouter direct au rituel */}
          <button onClick={()=>{SFX.click();setRoutineTaskModal(true);}}
            style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"10px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${th.accent||player.color}`,color:(th.accent||player.color),borderRadius:5,cursor:"pointer"}}>
            ➕ Créer ma propre tâche
          </button>
          {routineTaskModal && <CustomTaskModal title="➕ Ma tâche de rituel" confirmLabel="Ajouter au rituel" th={th}
            onClose={()=>setRoutineTaskModal(false)}
            onCreate={(data)=>{ const newId = onChildAddRoutineTask && onChildAddRoutineTask(data); if(newId) setRoutineBuilder(b=>({...b, taskIds:[...b.taskIds, newId]})); setRoutineTaskModal(false); }}/>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{SFX.click();setRoutineBuilder(null);}}
              style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:"#1a1a1a",color:"#888",border:"2px solid #333",borderRadius:4,cursor:"pointer"}}>Annuler</button>
            <button className="btn-press" disabled={!routineBuilder.name.trim()||routineBuilder.taskIds.length===0}
              onClick={()=>{
                const name=routineBuilder.name.trim(); if(!name||routineBuilder.taskIds.length===0)return;
                const data={name,emoji:routineBuilder.emoji,endTime:routineBuilder.endTime||"",taskIds:routineBuilder.taskIds};
                if(routineBuilder.editId){
                  onPatchState({routines:myRoutines.map(r=>r.id===routineBuilder.editId?{...r,...data}:r),mode:"routine",activeRoutineId:routineBuilder.editId});
                } else {
                  const newR={id:"rt_"+uid(),...data};
                  onPatchState({routines:[...myRoutines,newR],mode:"routine",activeRoutineId:newR.id});
                }
                setRoutineBuilder(null);
              }}
              style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:(routineBuilder.name.trim()&&routineBuilder.taskIds.length)?(th.accent||player.color):"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",opacity:(routineBuilder.name.trim()&&routineBuilder.taskIds.length)?1:0.5,boxShadow:"3px 3px 0 #0d0d0d"}}>{routineBuilder.editId?"✅ Enregistrer":"✅ Créer mon rituel"}</button>
          </div>
        </div>
      )}

      {homeTab==="jour" && (<>
      {/* Tasks */}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"#888",borderBottom:"2px solid #333",paddingBottom:3}}>📋 MES QUÊTES — {pMode==="week"?`AUJOURD'HUI (${DAYS_SHORT[todayDayIdx]}) 📅`:(activeRoutine?`${activeRoutine.emoji||"⏰"} ${activeRoutine.name.toUpperCase()}`:"RITUEL ⏰")}</div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#555",marginBottom:2}}>Quand c'est fait, appuie sur le bouton — tes parents valideront et tu recevras ton XP!</div>
      {/* v1.85.0 (Lot 2 #7) — état vide orientant : si l'AUTRE mode a des tâches, on le dit plutôt
          que de laisser croire qu'il n'y a rien du tout ("on sait jamais où chercher") */}
      {myAssignments.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:16,lineHeight:1.4}}>
        {pMode==="week"
          ? (weekMine.length ? "Rien de prévu aujourd'hui! 🎉"
             : routineMine.length ? <>Pas de tâches planifiées, mais tu as des <b style={{color:"#aaa"}}>rituels ⏰</b> — touche « Rituels » ci-dessus!</>
             : "Aucune quête de semaine pour l'instant. Demande à un parent d'en ajouter (type 📅 Semaine).")
          : (activeRoutine ? "Ce rituel est vide. Modifie-le ou crée-en un nouveau."
             : weekMine.length ? <>Pas de rituels, mais tu as des <b style={{color:"#aaa"}}>tâches planifiées 📋</b> — touche « Mes tâches » ci-dessus!</>
             : "Aucune quête de routine pour l'instant. Demande à un parent d'en ajouter (type ⏰ Rituel).")}
      </div>}
      {(()=>{ const _dk=a=>a.instanceId+"_"+player.id+"#"+todayStamp(); const undone=myAssignments.filter(a=>!pState.completed?.includes(_dk(a)));
        if(settings.focus && myAssignments.length>0 && undone.length===0) return <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:"#5CAD68",textAlign:"center",padding:16}}>🎉 Tout est fait! Bravo!</div>;
        // v1.88.0 (Lot 3 #15) — avertissement de transition : ton neutre/encourageant (pas d'urgence
        // rouge, contrairement au décompte) quand il reste peu de tâches — les transitions sont
        // difficiles pour TSA/TDAH, un signal clair "tu y es presque" aide à anticiper la fin.
        if(!settings.focus && myAssignments.length>=3 && undone.length>0 && undone.length<=2){
          return <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa",textAlign:"center",padding:"6px 4px"}}>
            🌟 Encore {undone.length} tâche{undone.length>1?"s":""}, tu y es presque!
          </div>;
        }
        return null;
      })()}
      {(()=>{
        const renderCard=(ass)=>{
        const task=allTasks.find(t=>t.id===ass.taskId);
        if(!task)return null;
        const doneKey=ass.instanceId+"_"+player.id+"#"+todayStamp(); // clé du jour → se remet à zéro chaque jour
        const done=pState.completed?.includes(doneKey);
        const pending=pState.pending?.includes(doneKey);
        return (
          // Refonte visuelle Phase 3 — bordure neutre .card-n1 (patron Phase 1) au repos, la
          // difficulté quitte la bordure pour un liseré gauche 4px DIFF_COLOR (info conservée,
          // bruit réduit) ; done/pending gardent leur bordure pleine couleur (état, pas décor).
          <div key={ass.instanceId} className={done||pending?"":"texture-grain"} style={{background:done||pending?"rgba(0,0,0,0.55)":"var(--tile-bg)",border:`3px solid ${done?"#5CAD68":pending?"#D9BC5C":"var(--b-soft)"}`,borderTop:done||pending?undefined:"3px solid rgba(255,255,255,0.14)",borderLeft:`4px solid ${DIFF_COLOR(task.diff)}`,boxShadow:done||pending?undefined:"var(--elev3)",borderRadius:8,padding:"10px 12px",position:"relative",transition:"border 0.2s"}}>
            {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"safe center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#5CAD68",borderRadius:5}}>✅ VALIDÉ!</div>}
            {/* v2.15.6 (demande de Gen, 2026-07-28) : ce renderCard n'est utilisé QUE pour la liste
                déjà filtrée à aujourd'hui (myAssignments/list, voir plus bas) — jamais pour la vue
                semaine. Afficher `ass.days` en entier (ex: « Lun Mar Mer Jeu Ven ») sur une carte du
                jour donnait l'impression trompeuse que « le reste de la semaine » s'affichait dans
                Mes tâches, alors que la carte elle-même est bien filtrée à aujourd'hui — seul le
                badge mentait. Le header de section dit déjà « AUJOURD'HUI », donc plus besoin d'un
                badge jour ici : ne garder que l'heure du moment (matin/soir/etc.), le cas échéant. */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",marginBottom:3}}>{ass.time?`⏰ ${ass.time}`:""}</div>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:5}}>
              <span className="icon-tile" style={{width:36,height:36,flex:"0 0 36px"}}><UIIcon name={"task_"+task.id} emoji={task.emoji} size={26} block/></span>
              <span style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#fff",lineHeight:1.3,flex:1}}>{task.label}</span>
            </div>
            {/* v2.6.0 — quête de réparation 🕊️ : les 3 petites étapes descriptives (texte simple, pas de cases) */}
            {Array.isArray(task.steps)&&task.steps.length>0&&<div style={{marginBottom:6}}>
              {task.steps.map((s,si)=>(
                <div key={si} style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#9ED8DE",lineHeight:1.35,paddingLeft:6}}>· {s}</div>
              ))}
            </div>}
            <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
              <span className="chip-cost" style={{color:"#85CDD1",borderColor:"rgba(133,205,209,0.55)",background:"rgba(133,205,209,0.10)"}}><Xp size={9}/>{task.xp} XP</span>
              <span className="chip-cost"><Coin size={9}/>{task.coins}</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:DIFF_COLOR(task.diff),border:`1px solid ${DIFF_COLOR(task.diff)}40`,padding:"1px 4px"}}>{task.diff.toUpperCase()}</span>
              {/* Backlog UX #12 — temps approximatif, dérivé du palier de difficulté (~8/18/25/30 min) */}
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#999",border:"1px solid #444",padding:"1px 4px"}}>⏱️~{estMinOf(task.diff)}min</span>
              {task.cat && (()=>{ const m=catMeta(task.cat); return <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:m.color,background:`${m.color}1A`,border:`1px solid ${m.color}55`,padding:"1px 4px"}}>{m.label}</span>; })()}
            </div>
            {!done&&!pending&&<div style={{display:"flex",gap:6}}>
              <button className="btn-press" onClick={e=>{SFX.click();setMoodFor("happy",5000);onRequestComplete(ass,player.id,e);}}
                style={{flex:1,padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",
                  color:"#0d0d0d",background:player.color,border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",
                  boxShadow:"2px 2px 0 #0d0d0d",transition:"all 0.08s"}}>
                ✔ J'AI FAIT ÇA!
              </button>
              {/* Backlog UX #11 — minuteur pour CETTE tâche précise (outil de concentration, ne complète pas la tâche) */}
              <button onClick={()=>{SFX.click();setTaskTimerFor({emoji:task.emoji,label:task.label});}}
                title="Lancer un minuteur pour cette tâche"
                style={{padding:"9px 11px",fontSize:16,background:"rgba(0,0,0,0.4)",border:`3px solid ${player.color}`,borderRadius:3,cursor:"pointer"}}>
                ⏱
              </button>
            </div>}
            {/* v1.83.0 (Lot 1 #B6) — l'enfant peut demander à retirer une tâche qu'il ne veut plus (le parent approuve) */}
            {!done&&!pending&&(()=>{
              const reqPending=(config.removalRequests||[]).some(r=>r.instanceId===ass.instanceId && r.playerId===player.id);
              return reqPending
                ? <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#FFA94D",textAlign:"center",marginTop:5}}>🗑️ Retrait demandé — en attente du parent…</div>
                : <button onClick={()=>{ if(window.confirm(`Demander à retirer « ${task.label} » de tes tâches?`)){ SFX.click(); onRequestRemoval&&onRequestRemoval(ass.instanceId); } }}
                    style={{width:"100%",padding:"5px",marginTop:5,fontFamily:"'VT323',monospace",fontSize:12,color:"#888",background:"transparent",border:"1px dashed #444",borderRadius:3,cursor:"pointer"}}>
                    🗑️ Je ne veux plus de cette tâche
                  </button>;
            })()}
            {!done&&!pending&&parentMode&&<button onClick={()=>onForceComplete(ass,player.id)}
              style={{width:"100%",padding:"6px",fontFamily:"'Press Start 2P',monospace",fontSize:"7px",
                color:"#0d0d0d",background:"#D99248",border:"2px solid #CC6600",borderRadius:2,cursor:"pointer",marginTop:4}}>
              ⚡ VALIDER SANS CODE (parent)
            </button>}
            {done&&parentMode&&<button onClick={()=>onDeComplete(ass.instanceId+"_"+player.id+"#"+todayStamp(), playerIdx)}
              style={{position:"absolute",top:4,right:4,padding:"3px 7px",fontFamily:"'Press Start 2P',monospace",fontSize:"6px",
                color:"#D97070",background:"rgba(0,0,0,0.7)",border:"1px solid #D97070",borderRadius:2,cursor:"pointer",zIndex:10}}>
              ↩️ Annuler
            </button>}
            {/* v2.6.2 — gratification instantanée : la carte en attente montre les gains RÉSERVÉS
                (grisés — l'octroi réel reste à la validation parent, libellé explicite pour éviter
                tout « mais j'avais déjà mes points! », cadre TOP). bounceIn = tué par .calm-mode. */}
            {pending&&<div style={{textAlign:"center",marginTop:4,animation:"bounceIn 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}>⏳ Bravo! En attente de validation…</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#9a8c56",marginTop:2}}>+{task.xp} XP · +{task.coins} 🪙 réservés — ton parent valide et c'est à toi!</div>
            </div>}
          </div>
        );
        };
        // Mode « Tout » (rituels, sans rituel ciblé) : regrouper par rituel, replié par défaut → fini le scroll infini
        const isTout = pMode==="routine" && !activeRoutine && !settings.focus;
        if(isTout){
          const dk=a=>a.instanceId+"_"+player.id+"#"+todayStamp();
          const used=new Set();
          const groups=myRoutines.map(r=>{
            const items=routineMine.filter(a=>r.taskIds?.includes(a.instanceId) && !used.has(a.instanceId));
            items.forEach(a=>used.add(a.instanceId));
            return {id:r.id, label:`${r.emoji||"⏰"} ${r.name}`, items};
          }).filter(g=>g.items.length>0);
          const orphans=routineMine.filter(a=>!used.has(a.instanceId));
          if(orphans.length) groups.push({id:"__autres", label:"🗂️ Autres tâches", items:orphans});
          // v2.6.0 — les quêtes de réparation 🕊️ s'affichent TOUJOURS, en tête, hors des groupes
          // repliés (cette branche « Tout » lit routineMine directement et ignorait myAssignments).
          const repairCards = repairMine.map(renderCard);
          if(groups.length===0 && repairCards.length===0) return null;
          const acc=th.accent||player.color;
          return [...repairCards, ...groups.map(g=>{
            const open=!!openRoutineGroups[g.id];
            const doneN=g.items.filter(a=>pState.completed?.includes(dk(a))).length;
            const allDone=doneN===g.items.length;
            return (
              <div key={g.id} style={{display:"flex",flexDirection:"column"}}>
                <button onClick={()=>{SFX.click();setOpenRoutineGroups(s=>({...s,[g.id]:!s[g.id]}));}}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",
                    fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",lineHeight:1.4,textAlign:"left",
                    padding:"11px 12px",background:open?`${acc}22`:"rgba(0,0,0,0.45)",
                    color:allDone?"#5CAD68":"#fff",border:`2px solid ${open?acc:"#333"}`,borderRadius:8,cursor:"pointer"}}>
                  <span>{open?"▼":"▶"} {g.label}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:allDone?"#5CAD68":"#888"}}>{allDone?"✅ ":""}{doneN}/{g.items.length}</span>
                </button>
                {open && <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8,marginBottom:4}}>{g.items.map(renderCard)}</div>}
              </div>
            );
          })];
        }
        const _done=a=>pState.completed?.includes(a.instanceId+"_"+player.id+"#"+todayStamp());
        const undoneAll = myAssignments.filter(a=>!_done(a)); // v1.88.0 — nommé pour réutilisation (D'abord→Ensuite)
        const list = settings.focus ? undoneAll.slice(0,1) : undoneAll; // v1.60.0 — les quêtes validées quittent la liste → Archives
        if(list.length===0 && myAssignments.length>0) return <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:"#5CAD68",textAlign:"center",padding:16,lineHeight:1.6}}>🎉 Tout est fait pour aujourd'hui!<br/><span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa"}}>Tes quêtes finies sont rangées dans 🗄️ Archives (menu ☰).</span></div>;
        // v2.11.2 — « Ma journée » sectionnée Matin/Après-midi/Soir en mode Semaine (pas en mode
        // Rituel : les rituels ont déjà leurs propres noms temporels, ni en mode focus : 1 seule
        // carte, rien à sectionner). Réparation reste hors sections, toujours en tête (patron v2.6.0).
        const cards = (pMode==="week" && !settings.focus) ? (()=>{
          const repairCards = list.filter(a=>a.repair).map(renderCard);
          const rest = list.filter(a=>!a.repair);
          const sections = [
            {key:"matin", label:"🌅 Matin", items:rest.filter(a=>a.time==="matin")},
            {key:"apm", label:"☀️ Après-midi", items:rest.filter(a=>a.time==="après-midi")},
            {key:"soir", label:"🌙 Soir", items:rest.filter(a=>a.time==="soir")},
            {key:"autres", label:"🕐 Autres moments", items:rest.filter(a=>a.time!=="matin"&&a.time!=="après-midi"&&a.time!=="soir")},
          ].filter(s=>s.items.length>0);
          const out=[...repairCards];
          sections.forEach(s=>{
            out.push(<div key={"sec-"+s.key} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:th.accent||"#888",marginTop:10,marginBottom:2}}>{s.label}</div>);
            out.push(...s.items.map(renderCard));
          });
          return out;
        })() : list.map(renderCard);
        // v1.88.0 (Lot 3 #14) — "D'abord → Ensuite" : en mode focus (une tâche à la fois), montre
        // ce qui vient après — prévisibilité utile pour TSA/TDAH (savoir à quoi s'attendre).
        if(settings.focus && undoneAll.length>1){
          const next=allTasks.find(t=>t.id===undoneAll[1].taskId);
          cards.push(
            <div key="first-then" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"rgba(0,0,0,0.3)",border:"1px dashed #444",borderRadius:6,fontFamily:"'VT323',monospace",fontSize:14,color:"#777",flexWrap:"wrap"}}>
              <span>👉 Ensuite:</span>
              {next && <UIIcon name={"task_"+next.id} emoji={next.emoji} size={16}/>}
              <span style={{color:"#aaa"}}>{next?next.label:"?"}</span>
            </div>
          );
        }
        return cards;
      })()}

      {/* Backlog UX #13 — Défi de la semaine + Objectifs du jour, repliés par défaut SOUS la liste de
          quêtes (avant : ces 2 blocs poussaient le bouton "J'AI FAIT ÇA!" sous 2 écrans de défilement,
          le constat 🔴 le plus important de l'audit UX). Accordéon même patron visuel que « Tâches planifiées ». */}
      {(()=>{
        const myChallenge = weeklyChallenge?.challenges?.find(c=>c.playerId===player.id);
        const todayC = todayStamp(); // date LOCALE — l'ancien toISOString (UTC) marquait le check-in au LENDEMAIN après 20h
        const challengeDone = myChallenge && myChallenge.checkins?.[todayC];
        const stamp="#"+todayStamp();
        const doneToday=(pState.completed||[]).filter(k=>k.endsWith(stamp));
        const countToday=doneToday.length;
        const axp={}; assignments.forEach(a=>{const t=allTasks.find(x=>x.id===a.taskId); axp[a.instanceId]=t?(t.xp||0):0;});
        const xpToday=doneToday.reduce((s,k)=>{const base=k.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_")); return s+(axp[inst]||0);},0);
        const OBJ=[
          {id:"o3",  label:"Faire 3 quêtes",  prog:Math.min(countToday,3), goal:3,  xp:10, coins:5},
          {id:"o6",  label:"Faire 6 quêtes",  prog:Math.min(countToday,6), goal:6,  xp:15, coins:10},
          {id:"oxp", label:"Gagner 60 XP",    prog:Math.min(xpToday,60),   goal:60, xp:0,  coins:10},
        ];
        const claimed=(pState.dailyClaimed&&pState.dailyClaimed.day===todayStamp())?pState.dailyClaimed.ids:[];
        const readyToClaim = OBJ.filter(o=>o.prog>=o.goal && !claimed.includes(o.id)).length;
        return (
          <div style={{marginTop:6}}>
            <button onClick={()=>{ if(SFX.click)SFX.click(); setDailyGoalsOpen(o=>!o); }}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",textAlign:"left",fontFamily:"'Press Start 2P',monospace",fontSize:7,lineHeight:1.4,color:"#999",background:"rgba(0,0,0,0.3)",border:"1px solid #2a2a2a",borderRadius:6,padding:"9px 11px",cursor:"pointer"}}>
              <span>{dailyGoalsOpen?"▼":"▶"} 🎯 Défi &amp; objectifs du jour</span>
              {readyToClaim>0 && <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#5CAD68"}}>🎁 {readyToClaim}</span>}
            </button>
            {dailyGoalsOpen && <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
              {myChallenge && (
                <div style={{background:"rgba(0,0,0,0.6)",border:`3px solid ${challengeDone?"#5CAD68":"#D9BC5C"}`,borderRadius:6,padding:"11px 13px"}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,8px)",color:"#D9BC5C",marginBottom:6}}>⭐ DÉFI DE LA SEMAINE</div>
                  <div style={{fontSize:"clamp(13px,1.6vw,16px)",color:"#FFF",lineHeight:1.4,marginBottom:8}}>{myChallenge.emoji||"⭐"} {myChallenge.text||"Défi à venir…"}</div>
                  {challengeDone
                    ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",color:"#5CAD68"}}>✅ Défi relevé aujourd'hui!</div>
                    : onChallengeCheckin && <button className="btn-press" onClick={()=>{SFX.click();onChallengeCheckin(todayC,true);}}
                        style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:"#D9BC5C",border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
                        ✅ J'ai réussi aujourd'hui!
                      </button>}
                </div>
              )}
              <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${(th.accent||player.color)}44`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:th.accent||player.color,marginBottom:6}}>🎯 OBJECTIFS DU JOUR</div>
                {OBJ.map(o=>{ const done=o.prog>=o.goal; const isClaimed=claimed.includes(o.id);
                  return (
                    <div key={o.id} style={{marginBottom:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:isClaimed?"#5CAD68":"#ccc"}}>{isClaimed?"✅ ":""}{o.label} <span style={{color:"#85CDD1"}}>+{o.xp} XP{o.coins?` +${o.coins}🪙`:""}</span></span>
                        {done&&!isClaimed&&<button onClick={()=>{SFX.click();onClaimDaily&&onClaimDaily(o);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 8px",background:"#5CAD68",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:3,cursor:"pointer"}}>Réclamer</button>}
                      </div>
                      <div style={{height:8,background:"#111",border:"1px solid #333",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:Math.round(o.prog/o.goal*100)+"%",background:isClaimed?"#5CAD68":`linear-gradient(90deg,${player.color},${th.accent})`,transition:"width 0.5s"}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>}
          </div>
        );
      })()}

      {/* Enfant : ajouter une quête — CHOISIR dans la grille (anti-doublons), repli = créer la sienne */}
      <button onClick={()=>{SFX.click();setChooserOpen(true);}}
        style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"10px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${player.color}`,color:player.color,borderRadius:5,cursor:"pointer",marginTop:2}}>
        ➕ Ajouter une quête à ma journée
      </button>
      {chooserOpen && <TaskChooser allTasks={allTasks} th={th}
        onClose={()=>setChooserOpen(false)}
        onPick={(taskId)=>{ onChildPickTask&&onChildPickTask(taskId); setChooserOpen(false); }}
        onCreateOwn={()=>{ setChooserOpen(false); setAddTaskOpen(true); }}/>}
      {addTaskOpen && <CustomTaskModal title="➕ Ma nouvelle quête" confirmLabel="Ajouter à ma journée" th={th} scopeOptions
        onClose={()=>setAddTaskOpen(false)}
        onCreate={(data)=>{ onChildAddTask&&onChildAddTask(data); setAddTaskOpen(false); }}/>}
      {taskTimerFor && <TaskTimerModal task={taskTimerFor} accent={th.accent||player.color} onClose={()=>setTaskTimerFor(null)}/>}

      </>)}
      {homeTab==="sem" && (<>
      {/* v2.6.1 — Vue Semaine en colonnes (comme un calendrier papier), demandée par Gen.
          Toggle 🗓️/📋 persisté PAR ENFANT (settings.weekCols, défaut colonnes) — repères stables :
          l'ancienne liste reste à un tap. 7 colonnes = les 7 prochains jours à partir d'AUJOURD'HUI,
          défilement horizontal avec snap (téléphone), aujourd'hui encadré à l'accent du thème. */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",color:"#85CDD1"}}>📅 MA SEMAINE</div>
        <div style={{display:"flex",gap:4}}>
          {[["cols","🗓️ Colonnes"],["liste","📋 Liste"]].map(([v,l])=>{
            const active = (settings.weekCols!==false) === (v==="cols");
            return <button key={v} onClick={()=>{ SFX.click&&SFX.click(); onPatchState&&onPatchState({settings:{...settings, weekCols:v==="cols"}}); }}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 7px",background:active?"#85CDD1":"#1a1a1a",color:active?"#0d0d0d":"#777",border:`1px solid ${active?"#85CDD1":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>;
          })}
        </div>
      </div>
      {settings.weekCols!==false && (
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",paddingBottom:6,marginTop:4}}>
          {Array.from({length:7},(_,k)=>{
            const dt=new Date(); dt.setDate(dt.getDate()+k);
            // stamp en date LOCALE (jamais toISOString — leçon v2.5.24)
            const stamp=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
            const dIdx=(dt.getDay()+6)%7;
            const dayTasks=weekMine.filter(a=>Array.isArray(a.days)&&a.days.includes(dIdx)&&(!a.oneDay||a.oneDay===stamp));
            const isToday=k===0;
            const acc=th.accent||player.color;
            const MAXT=5;
            return (
              <div key={stamp} style={{flex:"0 0 auto",width:138,scrollSnapAlign:"start",background:"rgba(0,0,0,0.35)",border:isToday?`2px solid ${acc}`:"1px solid #2a2a2a",borderRadius:6,padding:"7px 7px 9px",boxSizing:"border-box"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:isToday?acc:"#999",marginBottom:2}}>{DAYS_SHORT[dIdx]} {dt.getDate()}</div>
                {isToday && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#0d0d0d",background:acc,borderRadius:2,padding:"2px 4px",display:"inline-block",marginBottom:4}}>AUJOURD'HUI</div>}
                {/* v2.15.3 — les événements du calendrier reviennent ici, épinglés EN HAUT de chaque
                    colonne et visuellement distincts des quêtes (demande de Gen 28 juillet, remplace
                    la décision v2.6.6 "tâches seulement" — elle veut voir l'horaire du camp partout). */}
                {(()=>{
                  const dayEvents=(pState.calendar||[]).filter(e=> e && (e.recur?.freq==="daily" || (e.recur?.freq==="weekly" && e.recur.day===dIdx) || e.date===stamp));
                  return dayEvents.map(e=>(
                    <div key={e.id} style={{display:"flex",gap:4,alignItems:"flex-start",marginTop:3,padding:"3px 5px",background:"rgba(133,205,209,0.12)",border:"1px solid #85CDD155",borderRadius:3}}>
                      <span style={{fontSize:10,lineHeight:"13px"}}><UIIcon name={calEventIconName(e)} emoji={calEventIcon(e)} size={10}/></span>
                      <span style={{fontFamily:"'VT323',monospace",fontSize:12,lineHeight:"13px",color:"#9fd8db",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical"}}>{e.time?`${e.time} · `:""}{e.label}</span>
                    </div>
                  ));
                })()}
                {dayTasks.length===0 && (
                  <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginTop:4}}>🌿 Libre</div>
                )}
                {dayTasks.slice(0,MAXT).map(a=>{
                  const t=allTasks.find(x=>x.id===a.taskId); if(!t) return null;
                  const doneKey=a.instanceId+"_"+player.id+"#"+stamp;
                  const done=isToday && ((pState.completed||[]).includes(doneKey)||(pState.pending||[]).includes(doneKey));
                  return (
                    <div key={a.instanceId} style={{display:"flex",alignItems:"flex-start",gap:4,marginTop:4,opacity:done?0.45:1}}>
                      <span style={{fontSize:12,lineHeight:"14px"}}>{done?"✓":<UIIcon name={"task_"+t.id} emoji={t.emoji} size={12}/>}</span>
                      <span style={{fontFamily:"'VT323',monospace",fontSize:14,lineHeight:"14px",color:"#ccc",textDecoration:done?"line-through":"none",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{t.label}</span>
                    </div>
                  );
                })}
                {dayTasks.length>MAXT && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777",marginTop:3}}>+{dayTasks.length-MAXT} autres quêtes</div>}
              </div>
            );
          })}
        </div>
      )}
      {/* Tâches planifiées (pas aujourd'hui) — accordéon replié par défaut (vue Semaine, mode Liste) */}
      {settings.weekCols===false && pMode==="week" && laterWeek.length>0 && (
        <div style={{marginTop:6}}>
          <button onClick={()=>{ if(SFX.click)SFX.click(); setLaterOpen(o=>!o); }}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",textAlign:"left",fontFamily:"'Press Start 2P',monospace",fontSize:7,lineHeight:1.4,color:"#999",background:"rgba(0,0,0,0.3)",border:"1px solid #2a2a2a",borderRadius:6,padding:"9px 11px",cursor:"pointer"}}>
            <span>{laterOpen?"▼":"▶"} 📅 Tâches planifiées</span>
            <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#888"}}>{laterWeek.length}</span>
          </button>
          {laterOpen && <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:5,opacity:0.85}}>
            {laterWeek.map(ass=>{ const t=allTasks.find(x=>x.id===ass.taskId); if(!t)return null;
              return (
                <div key={ass.instanceId} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 9px",background:"rgba(0,0,0,0.3)",border:"1px solid #2a2a2a",borderRadius:4}}>
                  <UIIcon name={"task_"+t.id} emoji={t.emoji} size={15}/>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa",flex:1}}>{t.label}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#85CDD1"}}>{ass.days.map(d=>DAYS_SHORT[d]).join(" ")}</span>
                </div>
              );
            })}
          </div>}
        </div>
      )}

      </>)}
      {homeTab==="jour" && (<>
      {/* v1.73.0 — minuteur INLINE dans la fenêtre du rituel (3 modes : minuterie / heure butoir / chrono) */}
      {activeRoutine && (
        <InlineRitualTimer endTime={activeRoutine.endTime} accent={th.accent||player.color}/>
      )}
      {/* Minuteur plein écran (heure de fin → XP à la complétion du rituel) */}
      {activeRoutine && onGoTimer && (
        <button onClick={()=>{SFX.click();onGoTimer(activeRoutine.id);}}
          style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:th.accent||player.color,background:"transparent",border:`1px solid ${(th.accent||player.color)}55`,borderRadius:4,cursor:"pointer",marginTop:4}}>
          ⛶ Minuteur plein écran (avec XP){activeRoutine.endTime?` · ${activeRoutine.endTime.replace(":","h")}`:""}
        </button>
      )}
      {/* Terminer la routine → retour au mode Semaine */}
      {activeRoutine && (
        <button className="btn-press" onClick={()=>{
            if(window.confirm("Terminer le rituel et revenir au mode Semaine?")){ onPatchState({mode:"week",activeRoutineId:null}); SFX.epic && SFX.epic(); }
          }}
          style={{width:"100%",padding:"11px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:"#5CAD68",border:"3px solid #0d0d0d",borderRadius:4,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d",marginTop:4}}>
          ✅ J'ai fini mon rituel — revenir au mode Semaine 📅
        </button>
      )}
      {activeRoutine && (
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{ SFX.click(); setRoutineBuilder({editId:activeRoutine.id,name:activeRoutine.name,emoji:activeRoutine.emoji||"🌅",endTime:activeRoutine.endTime||"",taskIds:[...(activeRoutine.taskIds||[])]}); }}
            style={{flex:1,padding:"8px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:th.accent||player.color,background:"transparent",border:`1px solid ${th.accent||player.color}55`,borderRadius:3,cursor:"pointer"}}>
            ✏️ Modifier
          </button>
          <button onClick={()=>{ if(window.confirm(`Supprimer le rituel «${activeRoutine.name}» ? (tes tâches et ton XP restent)`)){ onPatchState({routines:myRoutines.filter(r=>r.id!==activeRoutine.id),removedRoutineIds:[...new Set([...(pState.removedRoutineIds||[]),activeRoutine.id])].slice(-200),activeRoutineId:null,mode:"week"}); } }}
            style={{flex:1,padding:"8px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D98C8C",background:"transparent",border:"1px solid #D98C8C40",borderRadius:3,cursor:"pointer"}}>
            🗑️ Supprimer
          </button>
        </div>
      )}

      </>)}
      {homeTab==="shop" && (<>
      {/* Shop */}
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginTop:6,marginBottom:2}}>Dépense tes pièces pour des accessoires et de vraies récompenses — les quêtes difficiles en rapportent plus!</div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"#888",borderBottom:"2px solid #333",paddingBottom:3,marginTop:0}}><UIIcon name="nav_shop" emoji="🛒" size={11}/> BOUTIQUE — {pState.coins} <Coin size={11}/></div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#777",margin:"2px 0"}}>Touche un item pour l'acheter avec tes pièces 🪙. Gagne des pièces en faisant tes quêtes!</div>

      {/* 🎁 Coffres mystères */}
      {(()=>{ const cur=currentEnergy(pState); if(cur>=CHEST_ENERGY) return null; const m=minsToEnergy(pState,CHEST_ENERGY);
        return <div style={{background:"rgba(94,222,245,0.08)",border:"2px solid #85CDD155",borderRadius:6,padding:"8px 10px",fontFamily:"'VT323',monospace",fontSize:14,color:"#9fd",lineHeight:1.3}}>💤 Ton familier est fatigué et fait une sieste — les coffres reviennent dans ~{m} min. En attendant, va faire tes quêtes! 🌟</div>;
      })()}
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {CHESTS.map(ch=>{ const can=pState.coins>=ch.cost && currentEnergy(pState)>=CHEST_ENERGY; return (
          <button key={ch.id} disabled={!can} onClick={()=>{
              if(pState.coins<ch.cost || currentEnergy(pState)<CHEST_ENERGY)return;
              const pool=allShopItemsFlat.filter(it=>it.slot);
              const item=pickFromChest(pool, ch); if(!item)return;
              const dup=pState.owned?.includes(item.id); const refund=Math.max(3,Math.round(baseCost(item)/3));
              onOpenChest&&onOpenChest({cost:ch.cost,itemId:item.id,dup,refund});
              setChestReveal({item,dup,chest:ch,refund});
              SFX.epic&&SFX.epic(); if(!CALM) spawnParticles("🎉");
            }}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 4px",background:`linear-gradient(180deg,${ch.color}1A,rgba(0,0,0,0.5))`,border:`2px solid ${ch.color}`,borderRadius:8,cursor:can?"pointer":"not-allowed",opacity:can?1:0.45,boxShadow:can?`0 0 8px ${ch.color}40`:"none"}}>
            <ChestSprite open={false} size={48}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:ch.color,textAlign:"center"}}>{ch.name.replace("Coffre ","")}</span>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C"}}>{ch.cost} <Coin size={9}/></span>
          </button>
        ); })}
      </div>

      {chestReveal && (()=>{ const it=chestReveal.item, rar=rarityOf(it.cost);
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:2700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:20,textAlign:"center",overflowY:"auto",boxSizing:"border-box"}}>
            <ChestSprite open={true} size={110}/>
            {/* Refonte visuelle Phase 6 — rayons + popIn (pur CSS, tués par .calm-mode) ; la lueur
                statique (box-shadow) reste visible même figée — la récompense reste "spéciale". */}
            <div style={{position:"relative",width:80,height:80,display:"flex",alignItems:"center",justifyContent:"center",animation:"popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>
              <div className="rays-bg" style={{color:rar.color}}/>
              <div style={{position:"relative",zIndex:1,borderRadius:"50%",boxShadow:`0 0 40px ${rar.color}`}}><ItemSprite itemId={it.id} emoji={it.emoji} size={52}/></div>
            </div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:rar.color}}>{rar.name.toUpperCase()}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#fff"}}>{it.name}</div>
            {chestReveal.dup
              ? <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#D9BC5C"}}>Tu l'avais déjà! Doublon → +{chestReveal.refund} 🪙</div>
              : <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#5CAD68"}}>Nouvel item débloqué! 🎉</div>}
            <button className="btn-press" onClick={()=>{SFX.click();setChestReveal(null);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"14px 28px",background:rar.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>Super!</button>
          </div>
        );
      })()}

      <div className="card-n2" style={{background:"rgba(0,0,0,0.45)",padding:10}}>
        {/* v2.6.6+ — tabs agrandis en style "pastille" (demande de Gen, réf. planche mockup :
            tap-cible plus grand, texte lisible, icône bien visible — les tabs "microscopiques"
            fontSize:6/padding:4px 7px ne l'étaient pas assez). */}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {Object.entries(SHOP_TABS).map(([k,l])=>{ const [em,txt]=splitEmojiLabel(l); return (
            <button key={k} onClick={()=>{setShopTab(k);SFX.click();}} style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px 14px",background:shopTab===k?"#D9BC5C":"#222",color:shopTab===k?"#0d0d0d":"#aaa",border:`2px solid ${shopTab===k?"#D9BC5C":"#444"}`,borderRadius:20,cursor:"pointer",transition:"all 0.12s"}}>{em&&<UIIcon name={SHOP_TAB_ICONS[k]} emoji={em} size={18}/>}{txt}</button>
          );})}
        </div>
        {shopTab==="rewards" && (
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {/* v2.6.2 — récompenses "moment" achetées : à planifier avec un parent, aucune expiration */}
            {(()=>{ const myMoments=(config.momentRequests||[]).filter(m=>m.playerId===player.id && m.status!=="fait");
              if(!myMoments.length) return null;
              return <div style={{background:"rgba(50,40,10,0.35)",border:"2px solid #D9BC5C55",borderRadius:5,padding:"7px 9px",marginBottom:4}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C",marginBottom:5}}>🗓️ MES MOMENTS À VENIR</div>
                {myMoments.map(m=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                    <span style={{fontSize:14}}>{m.emoji}</span>
                    <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",flex:1}}>{m.label}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:m.status==="planifie"?"#5CAD68":"#D9BC5C"}}>{m.status==="planifie"?`📅 ${fmtDateShort(m.plannedDate)}`:"⏳ à planifier"}</span>
                  </div>
                ))}
              </div>; })()}
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888",marginBottom:2}}>🎲 Les récompenses changent chaque semaine — profites-en!</div>
            {myRewards.length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",textAlign:"center",padding:"10px 6px"}}>Pas de récompenses cette semaine.</div>}
            {/* Refonte visuelle Phase 2 — sections Petite/Moyenne/Épique (planche de tiers) au lieu
                d'une liste plate ; l'or ne reste que sur le prix 🪙 et le bouton Acheter. */}
            {["petite","moyenne","epique"].map(tk=>{
              const group=myRewards.filter(r=>tierOf(r)===tk); if(!group.length) return null;
              const T2=REWARD_TIERS[tk];
              return (
                <div key={tk}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:T2.color,margin:"6px 0 3px"}}>{T2.label.toUpperCase()}</div>
                  {group.map(r=>{
                    const rPrice=priceOf(r);
                    const canBuy=pState.coins>=rPrice;
                    const bought=pState.boughtRewards?.includes(r.id);
                    return (
                      <div key={r.id} onClick={()=>canBuy&&!bought&&onBuy(r,player.id)} className={bought?"":T2.cls}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",marginBottom:5,background:"rgba(0,0,0,0.4)",border:bought?"2px solid #5CAD68":undefined,borderRadius:4,cursor:canBuy&&!bought?"pointer":"default",opacity:!canBuy&&!bought?0.4:1}}>
                        <span className="icon-tile" style={{width:38,height:38,flex:"0 0 38px"}}><UIIcon name={r.id} emoji={r.emoji} size={26} block/></span>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:bought?"#5CAD68":"#ddd",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            {r.label}
                            {REWARD_CAT_BADGE[r.cat] && <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#0d0d0d",background:REWARD_CAT_BADGE[r.cat].color,borderRadius:3,padding:"2px 5px"}}>{REWARD_CAT_BADGE[r.cat].label}</span>}
                          </div>
                          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:bought?"#5CAD68":"#D9BC5C"}}>{bought?"RÉCLAMÉ!":<>{rPrice} <Coin size={9}/></>}</div>
                        </div>
                        {!bought&&canBuy&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}>Acheter</span>}
                        {!bought&&!canBuy&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#444"}}><UIIcon name="lock" emoji="🔒" size={12} style={{opacity:0.6}}/></span>}
                        {bought&&<div style={{display:"flex",flexDirection:"column",gap:3}}>
                          <button onClick={(e)=>{e.stopPropagation();SFX.click();onUnclaimReward&&onUnclaimReward(r);}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:"#D99248",border:"1px solid #D99248",borderRadius:3,cursor:"pointer",whiteSpace:"nowrap"}}>↩️ J'ai changé d'idée</button>
                          <button onClick={(e)=>{e.stopPropagation();SFX.click();onHideReward&&onHideReward(r);}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:"#5CAD68",border:"1px solid #5CAD68",borderRadius:3,cursor:"pointer",whiteSpace:"nowrap"}}>✓ Cacher</button>
                        </div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        {shopTab!=="rewards" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
            {(SHOP_ITEMS[shopTab] || (shopTab==="deco" ? decoItems : shopTab===themedCat.id ? themedCat.items : []) || []).map(item=>{
              const owned=pState.owned?.includes(item.id);
              const isDeco=item.slot==="deco"||item.slot==="skin"; // déco + déblocage de peau : jamais « équipé », se gère dans Mon Perso
              const equipped=!isDeco && eq[item.slot]===item.id;
              const iPrice=priceOf(item);
              const canAfford=pState.coins>=iPrice;
              const rar=rarityOf(item.cost);
              // v2.15.7 (bug signalé par Antoine Emery, 2026-07-28 : « je pèse sur Maison/Spécial et
              // rien ne se passe ») : le clic vérifiait déjà les pièces (toast si insuffisant) mais
              // JAMAIS l'énergie avant d'appeler onBuy → handleBuy — qui, lui, bloque bien l'achat si
              // l'énergie manque (App.jsx:6093), mais après coup, avec un message générique sans lien
              // visible avec l'item cliqué. Comme Maison/Spécial contiennent les items les plus chers,
              // c'est là que l'énergie (dépensée par les achats précédents + ouverture de Mon Perso,
              // même pool) s'épuise le plus souvent — d'où l'impression que « rien ne se passe ».
              // Fix : même garde + même toast explicite AVANT le clic, comme pour les pièces.
              const hasEnergy = currentEnergy(pState) >= SHOP_ENERGY;
              return (
                <div key={item.id} onClick={()=>{ if(equipped||(isDeco&&owned))return; if(owned&&item.slot&&!isDeco){setMoodFor("equipped",3000);onEquip(item,player.id);} else if(!owned&&canAfford&&!hasEnergy){SFX.click&&SFX.click();const m=minsToEnergy(pState,SHOP_ENERGY);showToast(`😴 Ton héros se repose… reviens dans ~${m} min pour acheter ça!`,"#85CDD1",3000);} else if(!owned&&canAfford){onBuy(item,player.id);} else if(!owned&&!canAfford){SFX.click&&SFX.click();showToast(`🪙 Pas assez de pièces! Il t'en manque ${iPrice-(pState.coins||0)}.`,"#D98C8C",2600);} }}
                  className={equipped?"":rar.cls}
                  style={{background:equipped?"linear-gradient(180deg,#5CAD6814,rgba(0,0,0,0.45))":undefined,border:equipped?"2px solid #5CAD68":undefined,borderRadius:6,padding:"7px 5px 5px",textAlign:"center",cursor:equipped||(isDeco&&owned)?"default":owned||(canAfford&&hasEnergy)?"pointer":"not-allowed",opacity:!owned&&(!canAfford||!hasEnergy)?0.45:1,position:"relative"}}>
                  <span style={{position:"absolute",top:2,left:0,right:0,fontFamily:"'Press Start 2P',monospace",fontSize:4,color:rar.color}}>{rar.name.toUpperCase()}</span>
                  <span className="icon-tile" style={{width:40,height:40,flex:"none",margin:"8px auto 3px"}}>
                    {isDeco
                      ? <DecoSprite decoId={item.id} emoji={item.emoji} size={30}/>
                      : petSpriteKey(item.id)
                      ? <PetSprite itemId={item.id} size={30}/>
                      : <ItemSprite itemId={item.id} emoji={item.emoji} size={30} style={{fontSize:20}}/>}
                  </span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc",display:"block",marginBottom:2,lineHeight:1.1}}>{item.name}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:equipped?"#5CAD68":owned?"#888":"#D9BC5C"}}>{equipped?"✅ ÉQUIPÉ · retirer":owned?(item.slot==="skin"?"✨ Débloqué":isDeco?"🏠 Mon Perso":"Équiper"):<>{iPrice} <Coin size={9}/></>}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}
      {homeTab==="accueil" && (<>
      {/* ── BANNIÈRE « Ma maison » (demande Gen 2026-07-27) : la chambre de l'enfant en large,
          avec son avatar dedans, sur l'écran d'accueil. Tap → Mon Perso (même gate énergie). ── */}
      <div onClick={openAvatar} style={{marginTop:8,cursor:"pointer"}} title="Ma maison — touche pour personnaliser">
        <HouseScene player={player} pState={pState} width={bannerW} ratio={0.36}/>
      </div>
      {/* ── MENU : accès aux autres écrans (remplace les onglets du haut) ── */}
      {/* v2.6.6 — c'est en fait le SEUL accès enfant à l'écran Calendrier (le footer n'est qu'un
          bouton retour "🏠 Accueil", pas une barre de nav — la nav du haut avec l'onglet 📅 est
          cachée en session enfant). Le point d'accès en double que Gen voulait retirer était
          "Mon calendrier" intégré dans l'onglet Ma semaine, pas celui-ci — retiré séparément. */}
      {(onGoFamily||onGoCalendars||onGoTimer) && (
      <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {onGoFamily && (
          <button onClick={onGoFamily} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.85vw,8px)",lineHeight:1.5,color:"#fff",background:"rgba(0,0,0,0.45)",border:`2px solid ${(pt.accent||"#888")}55`,borderRadius:10,padding:"12px 6px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <span style={{fontSize:22}}>👨‍👩‍👧‍👦</span>Famille</button>)}
        {onGoCalendars && (
          <button onClick={onGoCalendars} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.85vw,8px)",lineHeight:1.5,color:"#fff",background:"rgba(0,0,0,0.45)",border:`2px solid ${(pt.accent||"#888")}55`,borderRadius:10,padding:"12px 6px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <span style={{fontSize:22}}>📅</span>Calendrier</button>)}
        {onGoTimer && (
          // v1.86.0 (Lot 2 #6) — transmet le rituel ACTIF du dashboard (s'il y en a un) au lieu
          // d'ouvrir la minuterie toujours "vierge" : le même rituel reste sélectionné qu'on y
          // arrive par ici (Accueil) ou par "⛶ Minuteur plein écran" depuis l'onglet Rituels.
          <button onClick={()=>onGoTimer(activeRoutine?.id)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.85vw,8px)",lineHeight:1.5,color:"#fff",background:"rgba(0,0,0,0.45)",border:`2px solid ${(pt.accent||"#888")}55`,borderRadius:10,padding:"12px 6px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <span style={{fontSize:22}}>⏱️</span>Minuterie</button>)}
      </div>)}
      {/* ── BADGE SHELF ─────────────────────────────────────── */}
      <div style={{marginTop:8,background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"12px 14px",border:`2px solid ${pt.accent||"#444"}33`}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:pt.accent||"#D9BC5C",marginBottom:4}}>🏅 BADGES</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:8}}>Appuie sur un badge pour voir comment le gagner — certains sont secrets! 🕵️</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {BADGES.filter(b=>b.type==="general"||b.type===resolvedThemeId).map(b=>{
            const earned=(pState.badges||[]).includes(b.id);
            const showing=badgeInfo===b.id;
            return (
              <div key={b.id} title={earned?`${b.name}: ${b.desc}`:`🔒 ${b.desc}`}
                onClick={()=>{SFX.click();setBadgeInfo(showing?null:b.id);}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,width:60,opacity:earned?1:showing?0.7:0.3,transition:"opacity 0.3s",cursor:"pointer",borderRadius:6,outline:showing?`2px solid ${pt.accent||"#D9BC5C"}`:"none",padding:2}}>
                <BadgeIcon badge={b} earned={earned} size={40}/>
                <div style={{fontFamily:"'VT323',monospace",fontSize:11,color:earned?(pt.accent||"#D9BC5C"):"#666",textAlign:"center",lineHeight:1.2,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
              </div>
            );
          })}
        </div>
        {badgeInfo&&(()=>{
          const b=BADGES.find(x=>x.id===badgeInfo);
          if(!b)return null;
          const earned=(pState.badges||[]).includes(b.id);
          return (
            <div style={{marginTop:8,background:"rgba(0,0,0,0.5)",border:`2px solid ${earned?(pt.accent||"#D9BC5C"):"#444"}`,borderRadius:6,padding:"8px 12px",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:24,filter:earned?"none":"grayscale(1)"}}>{b.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:earned?(pt.accent||"#D9BC5C"):"#aaa"}}>{earned?b.name:"🔒 Pas encore gagné"}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#888",lineHeight:1.3}}>{b.desc}</div>
              </div>
              <button onClick={()=>setBadgeInfo(null)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14}}>✕</button>
            </div>
          );
        })()}
        {(pState.badges||[]).length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#555",marginTop:6}}>Complète des quêtes pour débloquer des badges!</div>}
      </div>
      </>)}

      {/* ── ONGLET BOSS : combat familial (jetons d'attaque gagnés en faisant des quêtes) ── */}
      {homeTab==="boss" && config.boss && (()=>{
        const boss=config.boss; const bid=boss.startedAt; const hpMax=boss.hpMax||80;
        const total=bossDamageTotal(allStates||[], bid, config.repairEvents); const hpLeft=Math.max(0,hpMax-total); const hpPct=Math.round(hpLeft/hpMax*100);
        const won=!!boss.defeatedAt; const enraged=!won && hpPct<=30; const fhp=familyHp(boss, enraged); const myJetons=bossJetons(pState,bid);
        const mod=bossModifierOfDay(bid);
        const _petId=pState.equipped?.pet; const _petLv=petLevel((pState.petXp||{})[_petId]||0); const _petReady=!!_petId && pState.lastFedDay===todayStamp() && _petLv>=4;
        const atkBtn=(type,label,sub,enabled)=>(
          <button disabled={!enabled} onClick={()=>{ if(enabled){SFX.click();onBossAttack&&onBossAttack(type);} }}
            style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 6px",lineHeight:1.5,background:enabled?(boss.color||"#FF5555"):"#1a1a1a",color:enabled?"#0d0d0d":"#555",border:"2px solid #0d0d0d",borderRadius:6,cursor:enabled?"pointer":"not-allowed",opacity:enabled?1:0.5,boxShadow:enabled?"2px 2px 0 #0d0d0d":"none"}}>
            {label}<br/><span style={{fontFamily:"'VT323',monospace",fontSize:12}}>{sub}</span>
          </button>
        );
        return (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:"#FF5555"}}>⚔️ COMBAT DE BOSS</div>
            <div style={{background:"rgba(50,18,35,0.55)",border:`3px solid ${boss.color||"#FF5555"}`,borderRadius:12,padding:16,textAlign:"center"}}>
              {boss.forest && <div style={{fontSize:26,letterSpacing:6,marginBottom:-4}}>🌲🌳🌲🌳🌲</div>}
              <BossSprite boss={boss} size={104} style={{filter:won?"grayscale(0.7) opacity(0.7)":"none"}}/>
              {boss.forest && <div style={{fontSize:20,letterSpacing:8,marginTop:2,opacity:0.85}}>🌲🌳🌲</div>}
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:boss.color||"#FF5555",marginTop:8}}>{boss.emoji} {boss.name}</div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",margin:"8px 0 2px"}}>PV DU BOSS</div>
              <div style={{height:18,background:"#111",border:"2px solid #333",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:hpPct+"%",background:"linear-gradient(90deg,#D97070,#D9BC5C)",transition:"width 0.5s"}}/></div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginTop:3}}>{hpLeft} / {hpMax} PV {won?"✓":""}</div>
            </div>
            <button className="btn-press" onClick={()=>{ if(SFX.click)SFX.click(); setFinalBattle(true); }}
              style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:9,lineHeight:1.5,padding:"13px 8px",background:"linear-gradient(90deg,#7B2FF2,#FF5555)",color:"#fff",border:"2px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"2px 3px 0 #0d0d0d"}}>
              🐉 COMBAT FINAL<br/><span style={{fontFamily:"'VT323',monospace",fontSize:13}}>Affronte ta tête d'Hydre en mini-jeu!</span>
            </button>
            {!won && <div style={{background:`${boss.color||"#FF5555"}22`,border:`2px solid ${boss.color||"#FF5555"}55`,borderRadius:8,padding:"7px 10px",textAlign:"center"}}>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}><UIIcon name={"boss_mod_"+mod.id} emoji={mod.emoji} size={11}/> {mod.label} (aujourd'hui)</span>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#eee"}}>{mod.desc}</div>
            </div>}
            {enraged && <div style={{background:"#3a0e0e",border:"2px solid #D97070",borderRadius:8,padding:"7px 10px",textAlign:"center",fontFamily:"'VT323',monospace",fontSize:15,color:"#FF8888"}}>🔥 Le boss ENRAGE! Il vide les PV de la famille 2× plus vite — achevez-le!</div>}
            <div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>❤️ PV DE LA FAMILLE</span><span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:fhp<30?"#D97070":"#5CAD68"}}>{fhp}%</span></div>
              <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:3,overflow:"hidden",marginTop:2}}><div style={{height:"100%",width:fhp+"%",background:fhp<30?"#D97070":"#5CAD68",transition:"width 0.5s"}}/></div>
              {!won && fhp<40 && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#FF8888",marginTop:5,lineHeight:1.3}}>⚠️ Le boss reprend des forces! Faites des quêtes et attaquez vite pour défendre la famille!</div>}
            </div>
            {won ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:"#5CAD68",textAlign:"center",padding:16}}>🏆 BOSS VAINCU!<br/><span style={{fontFamily:"'VT323',monospace",fontSize:16}}>Bravo toute la famille! 🎉</span></div> : (<>
              <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",textAlign:"center"}}>Tu as <b style={{color:"#D9BC5C",fontSize:20}}>{myJetons}</b> jeton{myJetons>1?"s":""} d'attaque ⚡<br/><span style={{fontSize:13,color:"#888"}}>1 jeton par quête validée</span></div>
              <div style={{display:"flex",gap:8}}>
                {atkBtn("petite",`${boss.atkEmoji?.petite||"🗡️"} Petite`,`1 jeton · −${bossAtkDamage("petite",mod)} PV`, myJetons>=1)}
                {atkBtn("grosse",`${boss.atkEmoji?.grosse||"💥"} Grosse`,`3 jetons · −${bossAtkDamage("grosse",mod)} PV`, myJetons>=3)}
              </div>
              <button className="btn-press" onClick={()=>{ if(SFX.click)SFX.click(); onBossPetAttack&&onBossPetAttack(); }}
                style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:8,lineHeight:1.5,padding:"12px 6px",background:(_petReady&&myJetons>=PET_ATTACK_COST)?"#D9BC5C":"#2a2418",color:(_petReady&&myJetons>=PET_ATTACK_COST)?"#0d0d0d":"#999",border:"2px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
                🐾 Attaque du familier<br/><span style={{fontFamily:"'VT323',monospace",fontSize:12}}>{PET_ATTACK_COST} jetons · dégâts selon ton familier{_petReady?"":" — nourris-le, niv.4+"}</span>
              </button>
              {myJetons<1 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#888",textAlign:"center"}}>Va faire des quêtes (onglet ✅ Aujourd'hui) pour gagner des jetons d'attaque! 💪</div>}
            </>)}
          </div>
        );
      })()}

      {/* ── BARRE D'ONGLETS EN BAS (désencombre l'accueil) ── */}
      {/* v1.89.0 (desktop/mobile flex) — la bande reste pleine largeur (continuité visuelle),
          mais les boutons eux-mêmes restent groupés dans une colonne de largeur raisonnable
          au lieu de s'étirer d'un bord à l'autre d'un écran d'ordinateur. */}
      <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:90,display:"flex",justifyContent:"center",background:`${pt.bg||"#1a1a2e"}F2`,borderTop:`2px solid ${(pt.accent||player.color)}55`,backdropFilter:"blur(8px)",boxShadow:"0 -4px 16px rgba(0,0,0,0.45)",paddingBottom:"env(safe-area-inset-bottom)"}}>
        <div style={{display:"flex",width:"100%",maxWidth:900}}>
        {(()=>{ const acc=pt.accent||player.color; const bossActive=config.boss && !config.boss.defeatedAt;
          const tabs=[["accueil","🏠","Accueil","nav_home"],["jour","✅","Aujourd'hui","nav_today"],...(bossActive?[["boss","⚔️","BOSS","nav_boss"]]:[]),["sem","📅","Semaine","nav_week"],["shop","🛒","Boutique","nav_shop"]];
          return tabs.map(([k,ic,lb,icn])=>{ const on=homeTab===k; const isBoss=k==="boss"; const col=isBoss?"#FF5555":acc;
            return (
              <button key={k} onClick={()=>{setHomeTab(k);SFX.click();}}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"9px 2px 11px",background:on?`${col}22`:(isBoss?"#FF55550F":"transparent"),border:"none",borderTop:on?`3px solid ${col}`:"3px solid transparent",cursor:"pointer"}}>
                <span style={{fontSize:20,lineHeight:0,filter:on?"none":"grayscale(0.3) opacity(0.8)",animation:isBoss?"pulse 1.4s infinite":"none"}}><UIIcon name={icn} emoji={ic} size={20} block/></span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,1vw,7px)",color:on?col:(isBoss?"#FF8888":"#888")}}>{lb}</span>
              </button>
            );
          });
        })()}
        </div>
      </div>

    {/* Avatar popup */}
    {avatarOpen && <AvatarPopup player={player} pState={pState} onClose={()=>setAvatarOpen(false)}
      onUpdateAvatar={(av)=>onUpdateAvatar(av,player.id)} onEquip={(item)=>{setMoodFor("equipped",3000);onEquip(item,player.id);}}
      onUpdateHouse={(h)=>onPatchState({house:h})}
      allShopItems={allShopItemsFlat} th={th}/>}
    {finalBattle && <HydraFinalGame player={player} pState={pState} color={player.color} onClose={()=>setFinalBattle(false)}/>}
    </div>
  );
});

// ─── ESPACE FAMILLE (Lot 6 #27) ──────────────────────────────
// Petite scène où les 4 avatars flânent (idle, purement décoratif — aucune position n'est
// enregistrée ni synchronisée, ça repart à zéro à chaque chargement). Clic sur un avatar =
// ouvre son profil (même modal que l'ancien bouton "📊 Profil"). Clic ailleurs dans la scène =
// fait marcher SON PROPRE avatar jusque là (si on est connecté comme un enfant, pas en mode
// parent). Volontairement pas de mécanique de jeu (pas de score, pas de collecte) — un espace
// social, pas un jeu de plus.
// Lot 6 #27 correctif — écarte les positions trop proches (avatars/étiquettes qui se
// chevauchent) en les repoussant le long de l'axe, de gauche à droite puis droite à gauche
// pour rester dans les bornes [8,92] même quand plusieurs avatars sont collés.
const FAMILY_SPACE_MIN_GAP = 16;
function resolveFamilySpaceOverlaps(posMap, playerIds, minGap = FAMILY_SPACE_MIN_GAP) {
  const sorted = [...playerIds].sort((a, b) => (posMap[a] ?? 50) - (posMap[b] ?? 50));
  const out = { ...posMap };
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if ((out[cur] ?? 50) - (out[prev] ?? 50) < minGap) out[cur] = Math.min(92, (out[prev] ?? 50) + minGap);
  }
  for (let i = sorted.length - 2; i >= 0; i--) {
    const next = sorted[i + 1], cur = sorted[i];
    if ((out[next] ?? 50) - (out[cur] ?? 50) < minGap) out[cur] = Math.max(8, (out[next] ?? 50) - minGap);
  }
  return out;
}

function FamilySpace({ config, gameStates, meId, onOpenProfile, th }) {
  const players = config.players || [];
  const playerIds = players.map(p => p.id);
  const [positions, setPositions] = useState(() => {
    const obj = {};
    players.forEach((p, i) => { obj[p.id] = players.length>1 ? 12 + i*(76/(players.length-1)) : 50; });
    return resolveFamilySpaceOverlaps(obj, playerIds);
  });
  // Flânerie ambiante : chaque avatar a une chance de dériver vers une nouvelle position
  // toutes les quelques secondes — juste pour que la scène se sente vivante.
  useEffect(() => {
    const interval = setInterval(() => {
      setPositions(prev => {
        const next = {...prev};
        players.forEach(p => {
          if (Math.random() < 0.5) {
            const cur = next[p.id] ?? 50;
            next[p.id] = Math.max(8, Math.min(92, cur + (Math.random()-0.5)*34));
          }
        });
        return resolveFamilySpaceOverlaps(next, playerIds);
      });
    }, 4000 + Math.random()*2000);
    return () => clearInterval(interval);
  }, [players.length]);

  const handleSceneClick = (e) => {
    if (!meId || meId === "parent") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
    setPositions(prev => resolveFamilySpaceOverlaps({...prev, [meId]: pct}, playerIds));
  };

  return (
    <div onClick={handleSceneClick} style={{position:"relative",height:150,background:`linear-gradient(180deg, ${th.bg||"#1a1a2e"} 0%, ${th.primary||"#2a2a4a"}33 100%)`,borderRadius:10,border:`2px solid ${th.accent||"#5CAD68"}33`,overflow:"hidden",cursor:"pointer",marginBottom:2}}>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:16,background:`${th.accent||"#5CAD68"}22`,borderTop:`2px solid ${th.accent||"#5CAD68"}55`}}/>
      {players.map((p,i)=>{
        const gs = gameStates[i] || {};
        const x = positions[p.id] ?? 50;
        const isMe = p.id===meId;
        // Chantier F (2026-07-27) — humeur réelle dans l'Espace Famille : sourire si le joueur
        // a complété ≥1 quête aujourd'hui (image statique, aucune animation — mode calme ok).
        // (date LOCALE via new Date(ts), pas slice(0,10) qui comparerait la date UTC — piège v2.5.24)
        const _did = Object.values(gs.completedAt||{}).some(ts=>{ const d=ts&&new Date(ts); return d&&!isNaN(d) && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`===todayStamp(); });
        return (
          <div key={p.id}
            onClick={(e)=>{ e.stopPropagation(); SFX.click(); onOpenProfile(i); }}
            className="float-y"
            style={{position:"absolute",bottom:12,left:`${x}%`,transform:"translateX(-50%)",transition:"left 3.5s ease-in-out",cursor:"pointer",textAlign:"center",zIndex:isMe?2:1}}>
            <AvatarCanvas avatarDef={gs.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(p.themeId).charBodyColor||p.color} size={44} mood={_did?"happy":"neutral"}
              style={{border:`2px solid ${p.color}`,borderRadius:6,boxShadow:isMe?`0 0 10px ${p.color}80`:"none"}}/>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:p.color,marginTop:2,textShadow:"1px 1px 0 #0d0d0d"}}>{displayName(p)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── FAMILY OVERVIEW ─────────────────────────────────────────

// v1.95.0 (Lot 5 #23) — memo() : évite un re-render quand ses props n'ont pas vraiment changé
// (efficace maintenant que App() passe des callbacks/allTasks stabilisés, voir plus bas).
const FamilyOverview = memo(function FamilyOverview({ config, gameStates, allTasks, onSelectPlayer, canOpen, th, meId, onLike, onPostChat, onGiveCoins, onCreateOffer }) {
  const [profileIdx, setProfileIdx] = useState(null);
  const [chatText, setChatText] = useState("");
  const mayOpen = (i)=> canOpen ? canOpen(i) : true;
  const feedName = (pid)=> pid==="parent" ? "👤 Parent" : (displayName((config.players||[]).find(p=>p.id===pid))||"?");
  const feedColor = (pid)=> pid==="parent" ? "#D99248" : ((config.players||[]).find(p=>p.id===pid)?.color||"#888");
  const timeAgo = (ts)=>{ const s=Math.floor((Date.now()-(ts||0))/1000); if(s<60)return "à l'instant"; const m=Math.floor(s/60); if(m<60)return `il y a ${m} min`; const h=Math.floor(m/60); if(h<24)return `il y a ${h} h`; return `il y a ${Math.floor(h/24)} j`; };
  return (
    <div style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:10}}>
      {profileIdx!==null&&(
        <PlayerProfile player={config.players[profileIdx]} pState={gameStates[profileIdx]||{xp:0,coins:0,completed:[],badges:[]}} config={config} gameStates={gameStates} th={th} meId={meId} onGiveCoins={onGiveCoins} onCreateOffer={onCreateOffer} onClose={()=>setProfileIdx(null)} assignments={[...(config.assignments||[]),...(isCustodyWeek()?(config.weeklyQuests?.assignments||[]):[])]}/>
      )}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:th.accent,marginBottom:4}}>👨‍👩‍👧‍👦 VUE FAMILLE</div>

      {/* Lot 6 #27 — espace famille : les avatars flânent, clic pour ouvrir un profil ou se déplacer */}
      <FamilySpace config={config} gameStates={gameStates} meId={meId} onOpenProfile={setProfileIdx} th={th}/>

      {/* ⚔️ Boss de famille — PV du boss (attaqué via les jetons gagnés en quêtes) */}
      {config.boss && (()=>{
        const b=config.boss; const hpMax=b.hpMax||80;
        const total=bossDamageTotal(gameStates, b.startedAt, config.repairEvents); const hpLeft=Math.max(0,hpMax-total);
        const pct=Math.min(100,Math.round(hpLeft/hpMax*100));
        const won=!!b.defeatedAt; const fhp=familyHp(b);
        return (
          <div style={{background:won?"rgba(20,55,25,0.5)":"rgba(50,18,35,0.5)",border:`2px solid ${won?"#5CAD68":b.color}`,borderRadius:10,padding:12,display:"flex",gap:12,alignItems:"center"}}>
            <BossSprite boss={b} size={84} style={{flexShrink:0,filter:won?"grayscale(0.6) opacity(0.7)":"none"}}/>
            {b.forest && <span style={{fontSize:22,flexShrink:0}}>🌲{won?"":"🔥"}🌲</span>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:won?"#5CAD68":b.color}}>{won?`🏆 ${b.name} vaincu!`:`${b.emoji} ${b.name}`}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ccc",margin:"3px 0"}}>{won?"Bravo la famille! Vous l'avez battu ensemble! 🎉":"Faites des quêtes → attaquez le boss dans l'onglet ⚔️ BOSS!"}</div>
              <div style={{height:14,background:"#111",border:"2px solid #333",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,#D97070,#D9BC5C)`,transition:"width 0.6s ease"}}/>
              </div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginTop:3}}>{hpLeft} / {hpMax} PV{won?" ✓":` · ❤️ Famille ${fhp}%`}</div>
            </div>
          </div>
        );
      })()}
      {/* Player cards grid */}
      <div className="fo-grid" style={{display:"grid",gridTemplateColumns:`repeat(${Math.min((config.players||[]).length,2)},1fr)`,gap:10,marginTop:14}}>
        {(config.players||[]).map((player,i)=>{
          const ps=gameStates[i]||{xp:0,coins:0,completed:[]};
          const _allAss=[...(config.assignments||[]),...(isCustodyWeek()?(config.weeklyQuests?.assignments||[]):[])];
          const myDone=_allAss.filter(a=>a.playerIds.includes(player.id)&&ps.completed?.includes(a.instanceId+"_"+player.id+"#"+todayStamp())).length;
          const myTotal=_allAss.filter(a=>a.playerIds.includes(player.id)).length;
          const pct=myTotal>0?Math.round((myDone/myTotal)*100):0;
          const lv=getLevel(ps.xp);
          return (
            <div key={player.id} onClick={()=>{SFX.click(); mayOpen(i)?onSelectPlayer(i):setProfileIdx(i);}}
              style={{background:"rgba(0,0,0,0.5)",border:`2px solid ${player.color}99`,borderRadius:8,padding:14,cursor:"pointer",transition:"all 0.15s"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                <AvatarCanvas avatarDef={gameStates[i]?.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(player.themeId).charBodyColor||player.color} size={44}
                  style={{border:`3px solid ${player.color}`,borderRadius:5}}/>
                <div>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,12px)",color:player.color}}>{displayName(player)}</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa"}}>Niv.{getLevelTitle(ps.xp,player.themeId).level} — {getLevelTitle(ps.xp,player.themeId,ps.settings?.femTitles).title}</div>
                </div>
              </div>
              {/* Progress */}
              <div style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>Quêtes</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:player.color}}>{myDone}/{myTotal}</span>
                </div>
                <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,${player.color},${th.accent})`,transition:"width 0.8s ease"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1"}}>⚡ {ps.xp}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}><Coin size={10}/> {ps.coins}</span>
              </div>
              <div style={{display:"flex",gap:6,marginTop:8}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:player.color,flex:1,alignSelf:"center"}}>{mayOpen(i)?"Voir mes quêtes →":"Voir le profil →"}</div>
                <button onClick={e=>{e.stopPropagation();SFX.click();setProfileIdx(i);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:th.accent,border:`1px solid ${th.accent}`,borderRadius:3,cursor:"pointer",flexShrink:0}}>📊 Profil</button>
              </div>
            </div>
          );
        })}
      </div>
      {/* 📊 Progrès de la semaine — XP par jour par membre (calculé depuis les quêtes validées) */}
      {(()=>{
        const ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        // v2.9.1 — bug signalé par Gen : « toutes les stats de la semaine à 0 » pour 3 enfants sur 4
        // le lundi matin. Ce graphique calculait la semaine en ISO (lundi→dimanche) via
        // `(monday.getDay()+6)%7` — un lundi, "cette semaine" ne couvrait alors QUE lundi→dimanche
        // À VENIR, excluant tout le vendredi/samedi/dimanche déjà fait (la vraie semaine de garde,
        // vendredi→jeudi). Rien n'était perdu (vérifié : xp/coins/completed/badges intacts en prod)
        // — seul ce graphique regardait la mauvaise fenêtre. Même patron que custodyWeekKey
        // (recurring.js) utilisé partout ailleurs dans l'app pour "cette semaine".
        const custodyStart = new Date(); custodyStart.setHours(0,0,0,0);
        custodyStart.setDate(custodyStart.getDate() - ((custodyStart.getDay() + 2) % 7)); // recule au vendredi précédent
        const weekDates = [...Array(7)].map((_,i)=>{ const d=new Date(custodyStart); d.setDate(custodyStart.getDate()+i); return ds(d); });
        const custodyDayLabels = [...DAYS_SHORT.slice(4), ...DAYS_SHORT.slice(0,4)]; // Ven Sam Dim Lun Mar Mer Jeu — aligné sur weekDates
        const todayDs = ds(new Date());
        // v2.6.6 — bug signalé par Gen : « pas encore d'XP » alors que des dizaines de quêtes rotatives
        // étaient validées — assXp ne lisait que config.assignments (l'ancien système statique), jamais
        // config.weeklyQuests.assignments (le système rotatif de garde depuis le 24 juillet), qui porte
        // désormais quasi toute l'activité réelle.
        const assXp = {}; [...(config.assignments||[]), ...(config.weeklyQuests?.assignments||[])].forEach(a=>{ const t=(allTasks||[]).find(x=>x.id===a.taskId); assXp[a.instanceId]= t?(t.xp||0):0; });
        const xpFor = (ps,dateStr)=> (ps.completed||[]).reduce((sum,k)=>{ if(!k.endsWith("#"+dateStr)) return sum; const inst=k.split("#")[0].slice(0,k.split("#")[0].lastIndexOf("_")); return sum + (assXp[inst]||0); },0);
        const players=config.players||[];
        const perPlayer = players.map((p,i)=>{ const ps=gameStates[i]||{completed:[]}; const days=weekDates.map(d=>xpFor(ps,d)); return {p, days, total:days.reduce((a,b)=>a+b,0)}; });
        const maxDay = Math.max(1, ...perPlayer.flatMap(x=>x.days));
        const leader = [...perPlayer].sort((a,b)=>b.total-a.total);
        const anyXp = perPlayer.some(x=>x.total>0);
        return (
          <div style={{marginTop:6,background:"rgba(0,0,0,0.4)",border:`2px solid ${th.accent}33`,borderRadius:8,padding:"12px 12px"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:th.accent,marginBottom:8}}>📊 PROGRÈS DE LA SEMAINE</div>
            {!anyXp && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#777"}}>Pas encore d'XP cette semaine. Faites des quêtes pour remplir le graphique! 💪</div>}
            {anyXp && perPlayer.map(({p,days,total})=>(
              <div key={p.id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:p.color}}>{displayName(p)}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1"}}>⚡{total}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,alignItems:"end",height:46}}>
                  {days.map((v,di)=>(
                    <div key={di} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                      <div style={{width:"100%",height:`${Math.max(3,(v/maxDay)*38)}px`,background:weekDates[di]===todayDs?p.color:`${p.color}99`,borderRadius:"2px 2px 0 0",border:weekDates[di]===todayDs?`1px solid #fff`:"none"}} title={`${v} XP`}/>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:weekDates[di]===todayDs?th.accent:"#666",marginTop:2}}>{custodyDayLabels[di]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {anyXp && leader.length>1 && leader[0].total>0 && (
              <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#D9BC5C",marginTop:4,textAlign:"center"}}>🏆 En tête cette semaine : <b style={{color:leader[0].p.color}}>{displayName(leader[0].p)}</b> ({leader[0].total} XP) — continuez! 🔥</div>
            )}
          </div>
        );
      })()}

      {/* 📣 Fil de famille — accomplissements + ❤️ + petit chat */}
      <div style={{marginTop:6,background:"rgba(0,0,0,0.4)",border:`2px solid ${th.accent}33`,borderRadius:8,padding:"12px 12px"}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:th.accent,marginBottom:8}}>📣 FIL DE FAMILLE</div>
        {/* Chat */}
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <input value={chatText} onChange={e=>setChatText(e.target.value.slice(0,140))} placeholder="Écris un mot à la famille…" maxLength={140}
            style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:5,outline:"none"}}/>
          <button onClick={()=>{ if(chatText.trim()){ onPostChat&&onPostChat(chatText.trim()); setChatText(""); SFX.click(); } }}
            style={{flexShrink:0,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 12px",background:th.accent,color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:5,cursor:"pointer"}}>Envoyer</button>
        </div>
        {(config.feed||[]).length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#777"}}>Rien encore. Les accomplissements de chacun s'afficheront ici! 🌟</div>}
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:"40vh",overflowY:"auto"}}>
          {(()=>{ // Regroupe les quêtes consécutives d'un même enfant pour éviter le flood
            const src=config.feed||[]; const grouped=[];
            for(let i=0;i<src.length;){ const f=src[i];
              if(f.type==="task"){ let j=i, likes=[...(f.likes||[])];
                while(j+1<src.length && src[j+1].type==="task" && src[j+1].playerId===f.playerId){ j++; likes.push(...(src[j].likes||[])); }
                const count=j-i+1;
                grouped.push(count>1 ? {...f, likes:_uniq(likes), emoji:"🔥", text:`${feedName(f.playerId)} a accompli ${count} quêtes!`} : f);
                i=j+1;
              } else { grouped.push(f); i++; }
            }
            // Lot 6 #28 — en-têtes de jour (Aujourd'hui/Hier/jour de semaine/date) pour mieux
            // repérer où on est dans le temps sur une liste par ailleurs plate.
            const dayLabel=(ts)=>{
              const d=new Date(ts), now=new Date();
              const yest=new Date(now); yest.setDate(yest.getDate()-1);
              if(d.toDateString()===now.toDateString()) return "Aujourd'hui";
              if(d.toDateString()===yest.toDateString()) return "Hier";
              const diffDays=Math.floor((now-d)/86400000);
              return diffDays<7 ? d.toLocaleDateString('fr-CA',{weekday:'long'}) : d.toLocaleDateString('fr-CA',{day:'numeric',month:'long'});
            };
            let lastDay=null; const out=[];
            grouped.forEach(f=>{ const dl=dayLabel(f.ts); if(dl!==lastDay){ out.push({__dayHeader:true,label:dl,key:"day_"+dl+"_"+f.ts}); lastDay=dl; } out.push(f); });
            return out;
          })().map(f=>{
            if(f.__dayHeader) return <div key={f.key} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#666",textTransform:"uppercase",margin:"8px 0 2px",paddingBottom:3,borderBottom:"1px solid #2a2a2a"}}>{f.label}</div>;
            const liked=(f.likes||[]).includes(meId);
            // Lot 6 #28 — accent de couleur par type d'événement (même sémantique que le reste de l'app :
            // vert=quête, cyan=niveau/XP, or=badge, rouge=boss, orange=rituel) pour distinguer d'un coup d'œil.
            const TYPE_ACCENT={task:"#5CAD68",level:"#85CDD1",badge:"#D9BC5C",boss:"#D98C8C",ritual:"#D99248",repair:"#7FD6E0"}; // v2.6.0 — 🕊️
            const accent=f.type==="chat"?feedColor(f.playerId):(TYPE_ACCENT[f.type]||"#2a2a2a");
            return (
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid #2a2a2a",borderLeft:`3px solid ${accent}`,borderRadius:6}}>
                <span style={{fontSize:18}}>{f.emoji||"✨"}</span>
                <div style={{flex:1,minWidth:0}}>
                  {f.type==="chat"
                    ? <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",lineHeight:1.25}}><b style={{color:feedColor(f.playerId)}}>{feedName(f.playerId)}:</b> {f.text}</div>
                    : <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",lineHeight:1.25}}>{f.text}</div>}
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#666",marginTop:2}}>{timeAgo(f.ts)}</div>
                </div>
                <button onClick={()=>{onLike&&onLike(f.id);SFX.click();}}
                  style={{flexShrink:0,fontFamily:"'VT323',monospace",fontSize:15,padding:"4px 8px",background:liked?"#3a1a1a":"transparent",color:liked?"#D98C8C":"#888",border:`1px solid ${liked?"#D98C8C":"#444"}`,borderRadius:14,cursor:"pointer"}}>
                  {liked?"❤️":"🤍"} {(f.likes||[]).length||""}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

// ─── PARENT PANEL ────────────────────────────────────────────
const ParentPanel = memo(function ParentPanel({ config, gameStates, parentMode, actionLog, undoStack,
  allTasks, onApprovePending, onRefusePending, onAddAssignment, onAssignRoutine, onLaunchBoss, bossActive, onRemoveAssignment, onApproveRemoval, onRefuseRemoval, onClearChildTasks, onAddCustomTask,
  onApproveProposal, onRefuseProposal,
  onClose, onExitParent, onUndo, onReset, onResetPlayer, onAdjustXP, onAdjustCoins, onChangePin,
  onExport, onImport, onSetup, players, th, onUpdateChallenge,
  onCreateAnnouncement, onDeleteAnnouncement, onResendAnnouncement, onCreateRepairQuest, onPlanMoment, onMarkMomentDone }) {
  const nbPending = gameStates.reduce((s,gs)=>s+(gs.pending||[]).length,0);
  const removalReqs = config.removalRequests||[]; // v1.83.0 (Lot 1 #B6)
  const proposals = config.childTaskProposals||[]; // v2.5.10 (Correctif 2C)
  const nbValid = nbPending + removalReqs.length + proposals.length;
  const [tab, setTab] = useState(nbValid>0?"valid":"actions"); // valid | tasks | actions | cal | log | pin | export
  const [xpPlayer, setXpPlayer] = useState(0);
  const [xpDelta, setXpDelta] = useState(10);
  const [pinVal, setPinVal] = useState("");
  const [addTaskId, setAddTaskId] = useState("");
  const [addPlayerIds, setAddPlayerIds] = useState(players.map(p=>p.id));
  // v2.6.0 — quête de réparation 🕊️ : sélection d'enfants (min 2) + modèle (ou texte libre = -1)
  const [repPlayerIds, setRepPlayerIds] = useState([]);
  const [repPresetIdx, setRepPresetIdx] = useState(0);
  const [repCustomText, setRepCustomText] = useState("");
  const [momentDates, setMomentDates] = useState({}); // v2.6.2 — {momentId: "YYYY-MM-DD"} brouillon de date avant "Prévu pour…"
  const [addType, setAddType] = useState("routine"); // "routine" | "week"
  const [addDays, setAddDays] = useState([0,1,2,3,4]); // v1.71.0 — jours choisis pour la récurrence (mode planifié)
  const [addTime, setAddTime] = useState(""); // v2.11.2 — moment de la journée (sectionnement "Ma journée")
  const [tasksShowAllDays, setTasksShowAllDays] = useState(false); // v2.13.1 — "TÂCHES ACTUELLES" filtrée à aujourd'hui par défaut (Gen : la liste complète donnait l'impression que tout était dû le jour même)
  const todayDayIdx = (new Date().getDay()+6)%7; // Mon=0 — recalculé à chaque rendu, comme partout ailleurs dans l'app
  const [customOpen, setCustomOpen] = useState(false); // modale création tâche perso
  const [chooserOpen, setChooserOpen] = useState(false); // v1.82.0 (Lot 1 #3/B7) — grille TaskChooser au lieu du <select> plat
  const [errLogsOpen, setErrLogsOpen] = useState(false); // v1.90.0 — section logs techniques repliée par défaut
  const [defiDraft, setDefiDraft] = useState({}); // Lot 7C — {[playerId]: {text, emoji}} pour l'édition des défis
  // v2.6.0 — formulaire création d'annonce parent
  const [annDraft, setAnnDraft] = useState({ emoji:"📣", title:"", text:"", secret:false, targetAll:true, targetPlayerIds:[], countdownTo:"", countdownLabel:"", countdownDoneText:"", dismissLabel:"", sharedTasksDraft:"", sharedTasksLabel:"", expiresAt:"", playerTasksDraft:{} });
  const [rChildIdx, setRChildIdx] = useState(0); // assignation de routine: enfant ciblé
  const [rName, setRName] = useState("");
  const [rTaskIds, setRTaskIds] = useState([]);
  const T = th;

  const TabBtn = ({k,l,icon,em}) => (
    <button onClick={()=>setTab(k)} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",
      padding:"8px 4px",background:tab===k?"#D99248":"#222",color:tab===k?"#0d0d0d":"#888",
      border:`2px solid ${tab===k?"#D99248":"#444"}`,borderRadius:3,cursor:"pointer"}}>
      {icon&&<><UIIcon name={icon} emoji={em} size={11}/> </>}{l}
    </button>
  );
  const Row = ({children,style={}}) => <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,...style}}>{children}</div>;
  const PBtn = ({onClick,color="#333",textColor="#fff",children,style={}}) => (
    <button className="btn-press" onClick={onClick} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",
      padding:"8px 12px",background:color,color:textColor,border:"2px solid #0d0d0d",borderRadius:3,
      cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d",flexShrink:0,...style}}>
      {children}
    </button>
  );

  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:"min(340px,90vw)",
      background:"#0d0d0d",borderLeft:"4px solid #D99248",zIndex:500,
      display:"flex",flexDirection:"column",boxShadow:"-4px 0 30px rgba(255,140,0,0.3)",
      animation:"slideInRight 0.25s ease"}}>
      <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      {/* Header */}
      <div style={{background:"#D99248",padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,11px)",color:"#0d0d0d"}}>🔓 MODE PARENT</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={onExitParent} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,
            padding:"6px 9px",background:"#0d0d0d",color:"#D99248",border:"none",cursor:"pointer",borderRadius:2}}>🔒 Quitter</button>
          <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,
            padding:"5px 10px",background:"#0d0d0d",color:"#D99248",border:"none",cursor:"pointer",borderRadius:2}}>✕</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,padding:"8px 10px",flexShrink:0,background:"#111",flexWrap:"wrap"}}>
        <TabBtn k="valid"    icon="parent_validate" em="✅" l={`À valider${nbValid>0?` (${nbValid})`:""}`}/>
        <TabBtn k="tasks"    icon="parent_tasks"    em="📋" l="Tâches"/>
        <TabBtn k="defis"    icon="parent_defis"    em="🌟" l="Défis"/>
        <TabBtn k="actions"  icon="parent_actions"  em="⚡" l="Actions"/>
        <TabBtn k="annonces" icon="parent_annonces" em="📣" l="Annonces"/>
        <TabBtn k="log"      icon="parent_journal"  em="🕐" l="Journal"/>
        <TabBtn k="pin"      icon="parent_code"     em="🔐" l="Code"/>
        <TabBtn k="export"   icon="parent_save"     em="💾" l="Sauvegarde"/>
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px"}}>

        {/* À VALIDER TAB */}
        {tab==="valid" && (()=>{
          const items=[];
          gameStates.forEach((gs,i)=>{
            const pl=players[i];
            (gs.pending||[]).forEach(k=>{
              const instanceId=k.slice(0,k.lastIndexOf("_"));
              let emoji="📋", label="Tâche", xp=null, coins=null, orphaned=false, taskId=null;
              if(instanceId.startsWith("cal_")){
                const entry=(gs.calendar||[]).find(e=>"cal_"+e.id===instanceId);
                const exam=entry?.type==="examen";
                emoji=exam?"📝":"📚";
                label=entry?(exam?"Étudier: ":"Devoir: ")+entry.label:"Devoir/examen";
                xp=exam?20:10; coins=exam?5:3;
              } else {
                const _allAss=[...(config.assignments||[]),...(config.weeklyQuests?.assignments||[])];
                const ass=_allAss.find(a=>a.instanceId===instanceId);
                const task=ass?allTasks.find(t=>t.id===ass.taskId):null;
                if(task){emoji=task.emoji;label=task.label;xp=task.xp;coins=task.coins;taskId=task.id;}
                // Bug signalé par Gen (25 juillet) : assignation ou tâche personnalisée supprimée
                // ENTRE le moment où l'enfant a demandé la validation et maintenant (ex: tâche perso
                // effacée, ou semaine de garde régénérée entretemps) — le contenu original est
                // irrécupérable (tombstone = juste un id). Marqué distinctement : valider ceci ne
                // donne AUCUNE récompense (voir approvePending), donc le parent doit le savoir avant
                // de cliquer, pas après.
                else orphaned=true;
              }
              items.push({playerIdx:i,doneKey:k,pl,emoji,label,xp,coins,orphaned,taskId});
            });
          });
          // Regrouper les demandes PAR ENFANT
          const byChild=[]; players.forEach((pl,i)=>{ const its=items.filter(x=>x.playerIdx===i); if(its.length) byChild.push({pl,i,its}); });
          return (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>DEMANDES DES ENFANTS{items.length>0?` (${items.length})`:""}</div>
              {items.length===0&&removalReqs.length===0&&proposals.length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:20}}>Rien à valider — tout est à jour! 🎉</div>}
              {byChild.map(({pl,i,its})=>(
                <div key={pl.id} style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,paddingBottom:4,borderBottom:`2px solid ${pl.color}55`}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:pl.color}}>{displayName(pl)}</span>
                    <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#888"}}>{its.length} à valider</span>
                    <button onClick={()=>its.forEach(it=>onApprovePending(it.playerIdx,it.doneKey))}
                      style={{marginLeft:"auto",fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 8px",background:"#1a3a1a",color:"#5CAD68",border:"1px solid #5CAD6855",borderRadius:3,cursor:"pointer"}}>✅ Tout valider</button>
                  </div>
                  {its.map(it=>(
                <div key={it.doneKey} style={{background:it.orphaned?"rgba(180,120,0,0.12)":"rgba(0,0,0,0.4)",border:`2px solid ${it.orphaned?"#C8942A":(it.pl?.color||"#444")}50`,borderRadius:5,padding:"10px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:18,lineHeight:0}}>{it.orphaned?"⚠️":<UIIcon name={it.taskId?"task_"+it.taskId:null} emoji={it.emoji} size={18}/>}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:it.orphaned?"#FFB300":"#ddd",lineHeight:1.2}}>{it.orphaned?"Tâche supprimée entretemps":it.label}</div>
                      <div style={{display:"flex",gap:8,marginTop:2}}>
                        {it.xp!=null&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1"}}><Xp size={9}/>{it.xp}</span>}
                        {it.coins!=null&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C"}}><Coin size={9}/>{it.coins}</span>}
                      </div>
                    </div>
                  </div>
                  {it.orphaned && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#C8942A",lineHeight:1.4,marginBottom:8}}>Le contenu original est perdu (tâche ou assignation supprimée depuis la demande). « Valider » ne donnera AUCUN XP/pièce — si tu sais que {it.pl?displayName(it.pl):"l'enfant"} a vraiment fait quelque chose, ajoute une récompense manuelle depuis son profil avant de nettoyer cette demande.</div>}
                  <div style={{display:"flex",gap:6}}>
                    <PBtn onClick={()=>onApprovePending(it.playerIdx,it.doneKey)} color="#1a3a1a" textColor="#5CAD68" style={{flex:1}}>{it.orphaned?"🧹 Nettoyer (0 récompense)":"✅ Valider"}</PBtn>
                    <PBtn onClick={()=>onRefusePending(it.playerIdx,it.doneKey)} color="#3a1a1a" textColor="#FF6464" style={{flex:1}}>✗ Refuser</PBtn>
                  </div>
                </div>
                  ))}
                </div>
              ))}
              {/* v1.83.0 (Lot 1 #B6) — demandes de retrait de tâche envoyées par les enfants */}
              {removalReqs.length>0 && (
                <div style={{marginTop:18,paddingTop:14,borderTop:"2px solid #333"}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFA94D",marginBottom:8}}>🗑️ DEMANDES DE RETRAIT ({removalReqs.length})</div>
                  {removalReqs.map(req=>{
                    const pl=players.find(p=>p.id===req.playerId);
                    const ass=(config.assignments||[]).find(a=>a.instanceId===req.instanceId);
                    const task=ass?allTasks.find(t=>t.id===ass.taskId):null;
                    if(!task) return null;
                    return (
                      <div key={req.id} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pl?.color||"#444"}50`,borderRadius:5,padding:"10px",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <UIIcon name={"task_"+task.id} emoji={task.emoji} size={18}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",lineHeight:1.2}}>{task.label}</div>
                            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:pl?.color||"#888"}}>{pl?displayName(pl):""}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <PBtn onClick={()=>onApproveRemoval(req.id)} color="#1a3a1a" textColor="#5CAD68" style={{flex:1}}>✅ Retirer la tâche</PBtn>
                          <PBtn onClick={()=>onRefuseRemoval(req.id)} color="#3a1a1a" textColor="#FF6464" style={{flex:1}}>✗ Garder la tâche</PBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* v2.5.10 (Correctif 2C) — tâches personnalisées proposées par les enfants ("proposer à toute
                  la famille"), séparée de l'onglet "Tâches" (qui sert à AJOUTER, pas à approuver). */}
              {proposals.length>0 && (
                <div style={{marginTop:18,paddingTop:14,borderTop:"2px solid #333"}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#8FCCE8",marginBottom:8}}>🧑‍🤝‍🧑 TÂCHES PERSONNALISÉES DES ENFANTS ({proposals.length})</div>
                  {proposals.map(prop=>{
                    const pl=players.find(p=>p.id===prop.playerId);
                    return (
                      <div key={prop.id} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pl?.color||"#444"}50`,borderRadius:5,padding:"10px",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <span style={{fontSize:18}}>{prop.emoji}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",lineHeight:1.2}}>{prop.label}</div>
                            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:pl?.color||"#888"}}>Proposée par {pl?displayName(pl):"?"}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <PBtn onClick={()=>onApproveProposal(prop.id)} color="#1a3a1a" textColor="#5CAD68" style={{flex:1}}>✅ Approuver</PBtn>
                          <PBtn onClick={()=>onRefuseProposal(prop.id)} color="#3a1a1a" textColor="#FF6464" style={{flex:1}}>✗ Refuser</PBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* TÂCHES TAB */}
        {tab==="tasks" && (
          <div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>AJOUTER UNE TÂCHE</div>
            {/* v1.82.0 (Lot 1 #3/B7) — grille catégorisée (TaskChooser), même composant que côté enfant,
                au lieu d'un <select> plat qui devenait long à parcourir à mesure que le catalogue grossit. */}
            <button onClick={()=>{SFX.click();setChooserOpen(true);}}
              style={{width:"100%",textAlign:"left",background:"#111",border:"2px solid #D99248",color:addTaskId?"#fff":"#888",padding:"10px",fontFamily:"'VT323',monospace",fontSize:16,borderRadius:3,marginBottom:8,cursor:"pointer"}}>
              {(()=>{ const t=allTasks.find(x=>x.id===addTaskId); return t ? `${t.emoji} ${t.label} (⚡${t.xp} 🪙${t.coins})` : "— Choisir une tâche —"; })()}
            </button>
            {chooserOpen && <TaskChooser allTasks={allTasks} th={{accent:"#D99248"}}
              onPick={(id)=>{setAddTaskId(id);setChooserOpen(false);}}
              onCreateOwn={()=>{setChooserOpen(false);setCustomOpen(true);}}
              onClose={()=>setChooserOpen(false)}/>}
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
              {players.map(pl=>{
                const sel=addPlayerIds.includes(pl.id);
                return <div key={pl.id} onClick={()=>setAddPlayerIds(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#0d0d0d":"#555",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {displayName(pl)}
                </div>;
              })}
            </div>
            {/* v1.71.0 — Quand : rituel (chaque jour, sans planif) OU planifié (jours choisis = récurrence) */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",margin:"2px 0 5px"}}>QUAND?</div>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[["routine","⏰ Rituel"],["week","📅 Planifié"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setAddType(k);SFX.click();}}
                  style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px",background:addType===k?"#D99248":"#1a1a1a",color:addType===k?"#0d0d0d":"#888",border:`2px solid ${addType===k?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
            </div>
            {addType==="week" && (()=>{ const eq=(dd)=>JSON.stringify([...addDays].sort((a,b)=>a-b))===JSON.stringify([...dd].sort((a,b)=>a-b)); return (
              <div style={{marginBottom:8}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",marginBottom:5}}>RÉCURRENCE — QUELS JOURS?</div>
                <div style={{display:"flex",gap:5,marginBottom:6,flexWrap:"wrap"}}>
                  {[["Chaque jour",[0,1,2,3,4,5,6]],["Lun–Ven",[0,1,2,3,4]],["Fin de sem.",[5,6]]].map(([lbl,dd])=>(
                    <button key={lbl} onClick={()=>{SFX.click();setAddDays(dd);}} style={{fontFamily:"'VT323',monospace",fontSize:14,padding:"4px 10px",background:eq(dd)?"#D99248":"#1a1a1a",color:eq(dd)?"#0d0d0d":"#bbb",border:"2px solid #444",borderRadius:14,cursor:"pointer"}}>{lbl}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:3}}>
                  {DAYS_SHORT.map((d,i)=>{ const on=addDays.includes(i); return (
                    <button key={i} onClick={()=>{SFX.click();setAddDays(a=>on?a.filter(x=>x!==i):[...a,i]);}} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px 0",background:on?"#D99248":"#1a1a1a",color:on?"#0d0d0d":"#666",border:`2px solid ${on?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>{d[0]}</button>
                  );})}
                </div>
              </div>
            ); })()}
            {/* v2.11.2 — moment de la journée (sectionnement "Ma journée" côté enfant) */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",margin:"2px 0 5px"}}>MOMENT DE LA JOURNÉE?</div>
            <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
              {[["","🕐 N'importe quand"],["matin","🌅 Matin"],["après-midi","☀️ Après-midi"],["soir","🌙 Soir"]].map(([k,l])=>(
                <button key={k||"any"} onClick={()=>{SFX.click();setAddTime(k);}}
                  style={{flex:"1 1 auto",fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"7px 5px",background:addTime===k?"#D99248":"#1a1a1a",color:addTime===k?"#0d0d0d":"#888",border:`2px solid ${addTime===k?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
            </div>
            <PBtn onClick={()=>{ if(addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)){ onAddAssignment(addTaskId,addPlayerIds,addType,addDays,addTime); setAddTaskId(""); } }}
              color={addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)?"#D99248":"#333"} textColor="#0d0d0d" style={{width:"100%",opacity:addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)?1:0.5,marginBottom:8}}>
              ➕ Ajouter {addType==="week"?`(${addDays.length} jour${addDays.length>1?"s":""}/sem.)`:"(rituel)"}
            </PBtn>
            <button onClick={()=>{ SFX.click(); setCustomOpen(true); }}
              style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px",background:"rgba(0,0,0,0.4)",border:"2px dashed #D9924860",color:"#D99248",borderRadius:4,cursor:"pointer",marginBottom:14}}>
              + Créer une tâche personnalisée
            </button>
            {customOpen && <CustomTaskModal title="Nouvelle tâche personnalisée" confirmLabel="Créer la tâche" th={{accent:"#D99248"}}
              onClose={()=>setCustomOpen(false)}
              onCreate={(data)=>{ const id=onAddCustomTask(data); if(id)setAddTaskId(id); setCustomOpen(false); }}/>}

            {/* v2.13.1 — filtrée à AUJOURD'HUI par défaut (Gen : la liste complète, sans indication de
                jour, donnait l'impression que toutes les tâches de la semaine étaient dues aujourd'hui).
                todayDayIdx est recalculé à chaque rendu (comme partout ailleurs dans l'app) — le
                filtre bascule donc tout seul à minuit, sans mécanisme de déclenchement séparé.
                Les tâches "routine" (rituel quotidien, days:[]) restent toujours visibles. Un lien
                permet de voir la semaine complète pour gérer les autres jours. */}
            {(()=>{
              const all=config.assignments||[];
              const isToday=ass=>!(Array.isArray(ass.days)&&ass.days.length>0) || ass.days.includes(todayDayIdx);
              const visible=tasksShowAllDays?all:all.filter(isToday);
              const hiddenCount=all.length-visible.length;
              return (<>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",margin:"6px 0 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>TÂCHES {tasksShowAllDays?"— TOUTE LA SEMAINE":"D'AUJOURD'HUI"} ({visible.length})</span>
                </div>
                {visible.map(ass=>{
                  const task=allTasks.find(t=>t.id===ass.taskId);
                  const assignees=players.filter(p=>ass.playerIds.includes(p.id));
                  if(!task)return null;
                  return (
                    <div key={ass.instanceId} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:"rgba(0,0,0,0.4)",border:"1px solid #333",borderRadius:4,marginBottom:5}}>
                      <UIIcon name={"task_"+task.id} emoji={task.emoji} size={16}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.label}</div>
                        <div style={{display:"flex",gap:6}}>
                          {assignees.map(p=><span key={p.id} style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:p.color}}>{displayName(p)}</span>)}
                          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:(Array.isArray(ass.days)&&ass.days.length>0)?"#85CDD1":"#FFA94D"}}>{(Array.isArray(ass.days)&&ass.days.length>0)?`📅 ${ass.days.map(d=>DAYS_SHORT[d]).join(" ")}`:"⏰ routine"}</span>
                          {ass.time&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888"}}>⏰{ass.time}</span>}
                        </div>
                      </div>
                      <button onClick={()=>onRemoveAssignment(ass.instanceId)} style={{background:"none",border:"none",color:"#D97070",cursor:"pointer",fontSize:16,padding:4}}>×</button>
                    </div>
                  );
                })}
                <button onClick={()=>setTasksShowAllDays(s=>!s)} style={{width:"100%",fontFamily:"'VT323',monospace",fontSize:13,padding:"6px",marginTop:2,background:"transparent",border:"1px dashed #444",color:"#888",borderRadius:4,cursor:"pointer"}}>
                  {tasksShowAllDays ? "▲ Revenir à aujourd'hui seulement" : `▼ Voir toute la semaine${hiddenCount?` (+${hiddenCount})`:""}`}
                </button>
              </>);
            })()}
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#444",marginTop:8,lineHeight:1.4}}>
              Pour les horaires et les jours de la semaine, passe par ⚙️ Modifier le livre (onglet Actions).
            </div>
            {/* 🧹 Ménage : supprimer les tâches qu'un enfant s'est créées */}
            {(config.customTasks||[]).some(t=>t.child) && (
              <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #333"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D99248",marginBottom:6}}>🧹 MÉNAGE — TÂCHES PERSO DES ENFANTS</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888",marginBottom:8}}>Supprime d'un coup les tâches qu'un enfant s'est inventées (les vraies tâches du catalogue ne sont pas touchées).</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {players.map((pl,i)=>{ const childTaskIds=new Set((config.customTasks||[]).filter(t=>t.child).map(t=>t.id)); const n=(config.assignments||[]).filter(a=>a.playerIds?.includes(pl.id)&&childTaskIds.has(a.taskId)).length; if(!n) return null;
                    return <button key={pl.id} onClick={()=>{ if(window.confirm(`Supprimer les ${n} tâche(s) perso de ${displayName(pl)}?`)){ onClearChildTasks&&onClearChildTasks(i); } }}
                      style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"7px 9px",background:"#3a1a1a",color:"#FF6464",border:"2px solid #FF646455",borderRadius:4,cursor:"pointer"}}>🗑️ {displayName(pl)} ({n})</button>;
                  })}
                </div>
              </div>
            )}

            {/* ── Assigner une routine à un enfant ───────────────── */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",margin:"16px 0 8px",borderTop:"2px solid #333",paddingTop:12}}>🧩 ASSIGNER UN RITUEL</div>
            {(()=>{
              const child=players[rChildIdx];
              const childRoutineTasks=child?(config.assignments||[]).filter(a=>a.playerIds.includes(child.id)&&!(Array.isArray(a.days)&&a.days.length>0)):[];
              return (
                <div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888",marginBottom:6}}>Crée un rituel prêt pour un enfant (il pourra le lancer sans le refaire).</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                    {players.map((pl,i)=>(
                      <div key={pl.id} onClick={()=>{setRChildIdx(i);setRTaskIds([]);SFX.click();}}
                        style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:rChildIdx===i?pl.color:"#1a1a1a",color:rChildIdx===i?"#0d0d0d":"#666",border:`2px solid ${rChildIdx===i?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>
                    ))}
                  </div>
                  <input value={rName} onChange={e=>setRName(e.target.value.slice(0,16))} placeholder="Nom du rituel (ex: Matin)"
                    style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,marginBottom:8,outline:"none"}}/>
                  {childRoutineTasks.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#666",marginBottom:8}}>Cet enfant n'a pas encore de tâche de type ⏰ Rituel. Ajoute-lui-en en haut (type Routine).</div>}
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8,maxHeight:"26vh",overflowY:"auto"}}>
                    {childRoutineTasks.map(a=>{ const t=allTasks.find(x=>x.id===a.taskId); if(!t)return null; const sel=rTaskIds.includes(a.instanceId);
                      return (
                        <div key={a.instanceId} onClick={()=>{SFX.click();setRTaskIds(ids=>sel?ids.filter(x=>x!==a.instanceId):[...ids,a.instanceId]);}}
                          style={{display:"flex",alignItems:"center",gap:8,padding:"6px 9px",background:sel?"#1a3a1a":"rgba(0,0,0,0.4)",border:`2px solid ${sel?"#5CAD68":"#333"}`,borderRadius:4,cursor:"pointer"}}>
                          <span style={{fontSize:15,lineHeight:0}}>{sel?<UIIcon name="check" emoji="✅" size={15}/>:<UIIcon name={"task_"+t.id} emoji={t.emoji} size={15}/>}</span>
                          <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",flex:1}}>{t.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <PBtn onClick={()=>{ if(rName.trim()&&rTaskIds.length){ onAssignRoutine&&onAssignRoutine(rChildIdx,{name:rName.trim(),emoji:"🌅",taskIds:rTaskIds}); setRName("");setRTaskIds([]); } }}
                    color={rName.trim()&&rTaskIds.length?"#5CAD68":"#333"} textColor="#0d0d0d" style={{width:"100%",opacity:rName.trim()&&rTaskIds.length?1:0.5}}>
                    🧩 Assigner ce rituel à {child?displayName(child):"…"}
                  </PBtn>
                </div>
              );
            })()}
          </div>
        )}

        {/* DÉFIS TAB — Lot 7C : gestion des défis perso hebdomadaires */}
        {tab==="defis" && (()=>{
          const cwk = custodyWeekKey();
          const inCustody = isCustodyWeek();
          const challenges = config.weeklyChallenge?.challenges || [];
          const checkinCount = (ch) => Object.values(ch.checkins||{}).filter(Boolean).length;
          return (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>🌟 DÉFIS PERSONNELS DE LA SEMAINE</div>
              {!inCustody && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#888",marginBottom:10}}>📍 Semaine de pause — les défis reprennent vendredi.</div>}
              {players.map(pl=>{
                const ch = challenges.find(c=>c.playerId===pl.id);
                const n = checkinCount(ch||{});
                const draft = defiDraft[pl.id] || { text: ch?.text||"", emoji: ch?.emoji||"⭐" };
                const saved = draft.text===(ch?.text||"") && draft.emoji===(ch?.emoji||"⭐");
                return (
                  <div key={pl.id} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pl.color}50`,borderRadius:5,padding:"10px",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:pl.color,flexShrink:0}}/>
                      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:pl.color}}>{displayName(pl)}</div>
                      <div style={{marginLeft:"auto",fontFamily:"'VT323',monospace",fontSize:15,color:"#D9BC5C"}}>{n}/7 jours ⭐</div>
                    </div>
                    <div style={{display:"flex",gap:5,marginBottom:6}}>
                      <input value={draft.emoji} maxLength={2}
                        style={{width:34,boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:18,padding:"4px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,textAlign:"center"}}
                        onChange={e=>setDefiDraft(d=>({...d,[pl.id]:{...draft,emoji:e.target.value||"⭐"}}))}/>
                      <input value={draft.text} placeholder="Décris le défi…" maxLength={80}
                        style={{flex:1,boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:`2px solid ${saved?"#333":"#D99248"}`,borderRadius:4,outline:"none"}}
                        onChange={e=>setDefiDraft(d=>({...d,[pl.id]:{...draft,text:e.target.value}}))}/>
                    </div>
                    {!saved && onUpdateChallenge && (
                      <button onClick={()=>{ onUpdateChallenge(pl.id, draft.text, draft.emoji); setDefiDraft(d=>{const n2={...d}; delete n2[pl.id]; return n2;}); }}
                        style={{width:"100%",padding:"7px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#0d0d0d",background:"#D99248",border:"2px solid #0d0d0d",borderRadius:3,cursor:"pointer",marginBottom:6}}>
                        💾 Enregistrer le défi
                      </button>
                    )}
                    {ch && <div style={{display:"flex",gap:2,flexWrap:"wrap",marginTop:4}}>
                      {Array.from({length:7},(_,i)=>{
                        const d = new Date(cwk+"T12:00:00"); d.setDate(d.getDate()+i);
                        const stamp=d.toISOString().slice(0,10);
                        const done=ch.checkins?.[stamp];
                        return <div key={stamp} style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"3px 4px",background:done?"#1a3a1a":"#111",color:done?"#5CAD68":"#555",border:`1px solid ${done?"#5CAD68":"#333"}`,borderRadius:3}}>J{i+1}{done?" ✓":""}</div>;
                      })}
                    </div>}
                  </div>
                );
              })}
              {inCustody && (
                <div style={{marginTop:8,borderTop:"2px solid #333",paddingTop:12}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:8}}>📅 QUÊTES RÉCURRENTES</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#666"}}>
                    {(config.weeklyQuests?.assignments||[]).length} tâches auto-générées pour la semaine de garde (rotation déterministe).
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ACTIONS TAB */}
        {tab==="actions" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>ACTIONS GLOBALES</div>
          {/* Boss de famille surprise */}
          <div style={{background:"rgba(50,18,35,0.4)",border:"2px solid #8F72CC",borderRadius:6,padding:"10px",marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#C9B3F7",marginBottom:5}}>🐉 BOSS DE FAMILLE</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#999",marginBottom:8}}>Lance un boss : chaque quête faite donne un jeton d'attaque. La famille l'attaque dans l'onglet ⚔️ BOSS. Choisis sa difficulté (ses PV).</div>
            {bossActive
              ? <PBtn onClick={()=>{}} color="#333" textColor="#fff" style={{width:"100%",opacity:0.6}}>⚔️ Un boss est déjà en cours…</PBtn>
              : <div style={{display:"flex",gap:6}}>
                  {[["facile","Facile"],["moyen","Moyen"],["costaud","Costaud"]].map(([k,l])=>(
                    <PBtn key={k} onClick={()=>{ onLaunchBoss&&onLaunchBoss(k); }} color="#8F72CC" textColor="#fff" style={{flex:1}}>{l}</PBtn>
                  ))}
                </div>}
          </div>
          {/* v2.6.0 — Quête de réparation 🕊️ : après un moment difficile entre enfants, une quête
              commune; quand TOUS l'ont faite et que c'est validé, effet collectif (boss −50 PV, ou
              +10 🪙 chacun sans boss). Texte volontairement sans « conflit/dispute/faute ». */}
          <div style={{background:"rgba(18,45,50,0.4)",border:"2px solid #7FD6E0",borderRadius:6,padding:"10px",marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#7FD6E0",marginBottom:5}}>🕊️ QUÊTE DE RÉPARATION</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#999",marginBottom:8}}>Après un moment difficile, propose une quête commune. Quand chacun l'a complétée et que tu as validé, la famille retrouve son équilibre : le boss recule de 50 PV (ou +10 🪙 chacun s'il n'y a pas de boss).</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
              {players.map(pl=>{
                const sel=repPlayerIds.includes(pl.id);
                return <div key={pl.id} onClick={()=>setRepPlayerIds(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#0d0d0d":"#555",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {displayName(pl)}
                </div>;
              })}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
              {REPAIR_PRESETS.map((pr,i)=>(
                <div key={i} onClick={()=>{setRepPresetIdx(i);SFX.click();}}
                  style={{padding:"7px 10px",background:repPresetIdx===i?"rgba(127,214,224,0.15)":"rgba(0,0,0,0.3)",border:`2px solid ${repPresetIdx===i?"#7FD6E0":"#333"}`,borderRadius:4,cursor:"pointer"}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:repPresetIdx===i?"#7FD6E0":"#999"}}>{pr.emoji} {pr.label}</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777",marginTop:2}}>{pr.steps.join(" · ")}</div>
                </div>
              ))}
              <div onClick={()=>{setRepPresetIdx(-1);SFX.click();}}
                style={{padding:"7px 10px",background:repPresetIdx===-1?"rgba(127,214,224,0.15)":"rgba(0,0,0,0.3)",border:`2px solid ${repPresetIdx===-1?"#7FD6E0":"#333"}`,borderRadius:4,cursor:"pointer"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:repPresetIdx===-1?"#7FD6E0":"#999"}}>✏️ Autre chose…</div>
                {repPresetIdx===-1 && <input value={repCustomText} onChange={e=>setRepCustomText(e.target.value)} placeholder="Ex: Refaire la tour de blocs ensemble"
                  style={{width:"100%",marginTop:6,fontFamily:"'VT323',monospace",fontSize:16,padding:"7px 9px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",boxSizing:"border-box"}}/>}
              </div>
            </div>
            {(()=>{ const ok = repPlayerIds.length>=2 && (repPresetIdx>=0 || repCustomText.trim().length>=3);
              return <PBtn onClick={()=>{ if(!ok) return;
                  const preset = repPresetIdx>=0 ? REPAIR_PRESETS[repPresetIdx] : {emoji:"🕊️", label:repCustomText.trim(), steps:[]};
                  onCreateRepairQuest&&onCreateRepairQuest(preset, repPlayerIds);
                  setRepCustomText(""); setRepPresetIdx(0); }}
                color={ok?"#7FD6E0":"#333"} textColor="#0d0d0d" style={{width:"100%",opacity:ok?1:0.5}}>
                🕊️ Créer la quête ({repPlayerIds.length>=2?repPlayerIds.length+" enfants":"choisis au moins 2 enfants"})
              </PBtn>; })()}
          </div>
          {/* v2.6.2 — Récompenses "moment" à planifier ensemble (décision Gen). Aucune expiration :
              une entrée reste ici jusqu'à "✔ Fait", peu importe le délai. */}
          {(()=>{ const toPlan=(config.momentRequests||[]).filter(m=>m.status!=="fait");
            if(!toPlan.length) return null;
            return <div style={{background:"rgba(50,40,10,0.4)",border:"2px solid #D9BC5C",borderRadius:6,padding:"10px",marginBottom:12}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginBottom:5}}>🗓️ À PLANIFIER ENSEMBLE ({toPlan.length})</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {toPlan.map(m=>{
                  const pl=players.find(p=>p.id===m.playerId);
                  return <div key={m.id} style={{padding:"8px 10px",background:"rgba(0,0,0,0.3)",border:"1px solid #4a3a10",borderRadius:4}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>{m.emoji}</span>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}>{m.label}</div>
                        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:pl?.color||"#888"}}>{displayName(pl||{})}{m.plannedDate?` · prévu ${fmtDateShort(m.plannedDate)}`:""}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:7}}>
                      <input type="date" value={momentDates[m.id]||m.plannedDate||""} onChange={e=>setMomentDates(d=>({...d,[m.id]:e.target.value}))}
                        style={{flex:1,fontFamily:"'VT323',monospace",fontSize:14,padding:"5px 7px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none"}}/>
                      <PBtn onClick={()=>{ const d=momentDates[m.id]||m.plannedDate; if(d) onPlanMoment&&onPlanMoment(m.id,d); }}
                        color="#D9BC5C" textColor="#0d0d0d" style={{fontSize:11,padding:"5px 9px"}}>📅 Prévu</PBtn>
                      <PBtn onClick={()=>onMarkMomentDone&&onMarkMomentDone(m.id)} color="#1a3a1a" textColor="#5CAD68" style={{fontSize:11,padding:"5px 9px"}}>✔ Fait</PBtn>
                    </div>
                  </div>;
                })}
              </div>
            </div>; })()}
          <Row>
            {undoStack.length>0
              ? <PBtn onClick={onUndo} color="#FF6464" textColor="#0d0d0d" style={{flex:1}}>↩️ Annuler dernière</PBtn>
              : <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#444"}}>Rien à annuler</div>}
          </Row>
          <Row>
            <PBtn onClick={()=>onSetup()} color="#333" textColor="#888" style={{flex:1}}>⚙️ Modifier le livre (joueurs, tâches…)</PBtn>
          </Row>

          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",margin:"14px 0 8px"}}>PAR JOUEUR</div>
          {players.map((pl,i)=>(
            <div key={pl.id} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pl.color}30`,borderRadius:5,padding:"10px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:pl.color,flexShrink:0}}/>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:pl.color}}>{displayName(pl)}</span>
                <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#666",marginLeft:"auto"}}>
                  ⚡{gameStates[i]?.xp||0} 🪙{gameStates[i]?.coins||0}
                </span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <PBtn onClick={()=>onAdjustXP(i,10)} color="#1a3a1a" textColor="#5CAD68" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+10 XP</PBtn>
                <PBtn onClick={()=>onAdjustXP(i,25)} color="#1a3a1a" textColor="#5CAD68" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+25 XP</PBtn>
                <PBtn onClick={()=>onAdjustXP(i,-10)} color="#3a1a1a" textColor="#FF6464" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>-10 XP</PBtn>
                <PBtn onClick={()=>onResetPlayer(i)} color="#2a0a0a" textColor="#D97070" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>🔄 À zéro</PBtn>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                <PBtn onClick={()=>onAdjustCoins&&onAdjustCoins(i,10)} color="#3a3000" textColor="#D9BC5C" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+10 🪙</PBtn>
                <PBtn onClick={()=>onAdjustCoins&&onAdjustCoins(i,50)} color="#3a3000" textColor="#D9BC5C" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+50 🪙</PBtn>
                <PBtn onClick={()=>{const v=parseInt(prompt("Combien de pièces ajouter (ou négatif pour retirer)?","50")||"0",10); if(v)onAdjustCoins&&onAdjustCoins(i,v);}} color="#3a3000" textColor="#D9BC5C" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>🪙 Montant…</PBtn>
                <PBtn onClick={()=>onAdjustCoins&&onAdjustCoins(i,-10)} color="#3a1a1a" textColor="#FF6464" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>-10 🪙</PBtn>
              </div>
            </div>
          ))}
        </>}

        {/* LOG TAB */}
        {/* v2.15.0 — l'onglet "➕ Ajouter au calendrier" a été retiré : une seule section calendrier
            reste dans l'app (demande de Gen), celle accessible via le pied de page collant côté
            enfant / le bouton "📅 Calendriers" de la barre parent — voir view==="calendars". */}

        {/* ── v2.6.0 ANNONCES PARENT ──────────────────────────── */}
        {tab==="annonces" && <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Annonces existantes */}
          {(config.announcements||[]).length===0
            ? <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#666",textAlign:"center",padding:"20px 0"}}>Aucune annonce active.</div>
            : (config.announcements||[]).map(a=>{
              // v2.15.1 — enfants ciblés qui ont fermé cette annonce (candidats au renvoi)
              const closedBy=(players||[]).filter((p,i)=>{
                const gs=gameStates[i];
                if(!gs||!(gs.dismissedAnnouncements||[]).includes(a.id)) return false;
                return a.targetAll || (a.targetPlayerIds||[]).includes(p.id);
              });
              return (
              <div key={a.id} style={{background:"rgba(180,120,0,0.12)",border:"2px solid #C8942A55",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#FFD54F",marginBottom:4}}>{a.emoji} {a.title||a.text.slice(0,40)}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#aaa",marginBottom:6}}>{a.text.slice(0,80)}{a.text.length>80?"…":""}</div>
                {closedBy.length>0 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#C8942A",marginBottom:6}}>Fermée par : {closedBy.map(p=>p.name).join(", ")}</div>}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#666"}}>Expire : {a.expiresAt||"—"}</span>
                  {closedBy.length>0 && <button onClick={()=>onResendAnnouncement&&onResendAnnouncement(a.id)}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"5px 8px",background:"#1a3a5a",color:"#6bb8ff",border:"2px solid #6bb8ff44",borderRadius:4,cursor:"pointer"}}>🔄 Renvoyer ({closedBy.length})</button>}
                  <button onClick={()=>onDeleteAnnouncement&&onDeleteAnnouncement(a.id)}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"5px 8px",background:"#5a1a1a",color:"#ff6b6b",border:"2px solid #ff6b6b44",borderRadius:4,cursor:"pointer"}}>🗑 Supprimer</button>
                </div>
              </div>
            );})
          }
          {/* Formulaire nouvelle annonce */}
          <div style={{background:"rgba(0,0,0,0.4)",border:"2px solid #444",borderRadius:8,padding:"12px 14px",marginTop:4}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#D99248",marginBottom:10}}>➕ Nouvelle annonce</div>
            <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
              <input value={annDraft.emoji} onChange={e=>setAnnDraft(d=>({...d,emoji:e.target.value.slice(0,4)}))}
                style={{width:48,fontFamily:"'VT323',monospace",fontSize:20,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,textAlign:"center"}}/>
              <input placeholder="Grand titre (ex: LIS CECI SANS RÉACTION)" value={annDraft.title}
                onChange={e=>setAnnDraft(d=>({...d,title:e.target.value}))}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:14,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4}}/>
            </div>
            <textarea placeholder="Message…" value={annDraft.text} onChange={e=>setAnnDraft(d=>({...d,text:e.target.value}))}
              style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,minHeight:80,resize:"vertical",marginBottom:8}}/>
            <label style={{display:"flex",gap:8,alignItems:"center",fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",marginBottom:8,cursor:"pointer"}}>
              <input type="checkbox" checked={annDraft.secret} onChange={e=>setAnnDraft(d=>({...d,secret:e.target.checked}))} style={{width:16,height:16}}/>
              🤫 Message secret (ne pas réagir)
            </label>
            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa"}}>Countdown :</span>
              <input type="datetime-local" value={annDraft.countdownTo} onChange={e=>setAnnDraft(d=>({...d,countdownTo:e.target.value}))}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:13,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4}}/>
            </div>
            {annDraft.countdownTo && <>
              <input placeholder='Texte pendant le compte (ex: "avant le départ !") — suit le temps affiché' value={annDraft.countdownLabel}
                onChange={e=>setAnnDraft(d=>({...d,countdownLabel:e.target.value}))}
                style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,marginBottom:8}}/>
              <input placeholder='Texte à zéro (ex: "C&#39;est l&#39;heure ! 🎉")' value={annDraft.countdownDoneText}
                onChange={e=>setAnnDraft(d=>({...d,countdownDoneText:e.target.value}))}
                style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,marginBottom:8}}/>
            </>}
            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa"}}>Bouton :</span>
              <input placeholder='Texte du bouton (défaut : "🤐 Compris, je reste discret·e !")' value={annDraft.dismissLabel}
                onChange={e=>setAnnDraft(d=>({...d,dismissLabel:e.target.value}))}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:13,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4}}/>
            </div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#aaa",marginBottom:6}}>TÂCHES COMMUNES (pour tous) :</div>
            <input placeholder='Titre de la section (défaut : "À FAIRE :")' value={annDraft.sharedTasksLabel}
              onChange={e=>setAnnDraft(d=>({...d,sharedTasksLabel:e.target.value}))}
              style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,marginBottom:6}}/>
            <textarea placeholder="Une tâche par ligne…" value={annDraft.sharedTasksDraft}
              onChange={e=>setAnnDraft(d=>({...d,sharedTasksDraft:e.target.value}))}
              style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,minHeight:50,resize:"vertical",marginBottom:8}}/>
            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa"}}>Expiration :</span>
              <input type="date" value={annDraft.expiresAt} onChange={e=>setAnnDraft(d=>({...d,expiresAt:e.target.value}))}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:13,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4}}/>
            </div>
            <label style={{display:"flex",gap:8,alignItems:"center",fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",marginBottom:8,cursor:"pointer"}}>
              <input type="checkbox" checked={annDraft.targetAll} onChange={e=>setAnnDraft(d=>({...d,targetAll:e.target.checked}))} style={{width:16,height:16}}/>
              Pour tous les enfants
            </label>
            {!annDraft.targetAll && <div style={{marginBottom:8}}>{players.map(p=>(
              <label key={p.id} style={{display:"flex",gap:8,alignItems:"center",fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",cursor:"pointer",marginBottom:4}}>
                <input type="checkbox" checked={(annDraft.targetPlayerIds||[]).includes(p.id)}
                  onChange={e=>setAnnDraft(d=>({...d,targetPlayerIds:e.target.checked?[...(d.targetPlayerIds||[]),p.id]:(d.targetPlayerIds||[]).filter(x=>x!==p.id)}))} style={{width:14,height:14}}/>
                {p.name}
              </label>
            ))}</div>}
            {/* Tâches chouchoutage par enfant */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#aaa",marginBottom:6}}>TÂCHES CHOUCHOUTAGE (par enfant) :</div>
            {players.map(p=>(
              <div key={p.id} style={{marginBottom:6}}>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#D99248",marginBottom:3}}>{p.name} :</div>
                <textarea placeholder={`Ex: Demander à Carl s'il veut un café…`}
                  value={((annDraft.playerTasksDraft||{})[p.id]||"")}
                  onChange={e=>setAnnDraft(d=>({...d,playerTasksDraft:{...(d.playerTasksDraft||{}),[p.id]:e.target.value}}))}
                  style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,minHeight:50,resize:"vertical"}}/>
                <div style={{fontFamily:"'VT323',monospace",fontSize:11,color:"#555"}}>Une tâche par ligne</div>
              </div>
            ))}
            <button disabled={!annDraft.text.trim()} onClick={()=>{
              if(!annDraft.text.trim())return;
              const playerTasks={};
              for(const p of players){
                const raw=(annDraft.playerTasksDraft||{})[p.id]||"";
                const tasks=raw.split("\n").map(s=>s.trim()).filter(Boolean);
                if(tasks.length) playerTasks[p.id]=tasks;
              }
              const sharedTasks=(annDraft.sharedTasksDraft||"").split("\n").map(s=>s.trim()).filter(Boolean);
              onCreateAnnouncement&&onCreateAnnouncement({
                emoji:annDraft.emoji||"📣",
                title:annDraft.title.trim()||undefined,
                text:annDraft.text.trim(),
                secret:annDraft.secret,
                targetAll:annDraft.targetAll,
                targetPlayerIds:annDraft.targetAll?[]:annDraft.targetPlayerIds,
                countdownTo:annDraft.countdownTo||undefined,
                countdownLabel:annDraft.countdownLabel.trim()||undefined,
                countdownDoneText:annDraft.countdownDoneText.trim()||undefined,
                dismissLabel:annDraft.dismissLabel.trim()||undefined,
                sharedTasks:sharedTasks.length?sharedTasks:undefined,
                sharedTasksLabel:annDraft.sharedTasksLabel.trim()||undefined,
                expiresAt:annDraft.expiresAt||undefined,
                playerTasks:Object.keys(playerTasks).length?playerTasks:undefined,
              });
              setAnnDraft({emoji:"📣",title:"",text:"",secret:false,targetAll:true,targetPlayerIds:[],countdownTo:"",countdownLabel:"",countdownDoneText:"",dismissLabel:"",sharedTasksDraft:"",sharedTasksLabel:"",expiresAt:"",playerTasksDraft:{}});
            }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px",background:annDraft.text.trim()?"#D99248":"#333",
              color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:annDraft.text.trim()?"pointer":"not-allowed",
              width:"100%",opacity:annDraft.text.trim()?1:0.5,boxShadow:"2px 2px 0 #0d0d0d",marginTop:4}}>
              📣 Envoyer l'annonce
            </button>
          </div>
        </div>}

        {tab==="log" && <>
          {/* 🐛 Bugs signalés par les enfants */}
          {(config.bugs||[]).length>0 && (
            <div style={{background:"rgba(255,140,0,0.08)",border:"2px solid #D9924855",borderRadius:6,padding:"10px 12px",marginBottom:12}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D99248",marginBottom:8}}>🐛 BUGS SIGNALÉS ({(config.bugs||[]).length})</div>
              {(config.bugs||[]).map(b=>(
                <div key={b.id} style={{marginBottom:8,paddingBottom:6,borderBottom:"1px solid #D9924822"}}>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",lineHeight:1.3}}>{b.text}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:3}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888"}}>{b.who}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#666"}}>{new Date(b.ts).toLocaleString("fr-CA",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* v1.90.0 — logs techniques (erreurs JS capturées automatiquement) : repliable, discret,
              pour ne pas noyer les vrais bugs signalés par les enfants juste au-dessus */}
          {(config.errorLogs||[]).length>0 && (
            <div style={{background:"rgba(255,255,255,0.04)",border:"2px solid #444",borderRadius:6,padding:"10px 12px",marginBottom:12}}>
              <div onClick={()=>setErrLogsOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#999"}}>🔧 LOGS TECHNIQUES ({(config.errorLogs||[]).length})</div>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#666"}}>{errLogsOpen?"▲":"▼"}</span>
              </div>
              {errLogsOpen && (config.errorLogs||[]).map(e=>(
                <div key={e.id} style={{marginTop:8,paddingBottom:6,borderBottom:"1px solid #333"}}>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ccc",lineHeight:1.3,wordBreak:"break-word"}}>{e.message}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:3}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#777"}}>{e.who} · v{e.appVersion}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#666"}}>{new Date(e.ts).toLocaleString("fr-CA",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>HISTORIQUE ({actionLog.length})</div>
          {/* Changelog de mise à jour */}
          {(config.updateFeedEntries||[]).map((entry,i)=>(
            <div key={`update-${i}`} style={{background:"rgba(94,222,245,0.07)",border:"2px solid #85CDD155",borderRadius:6,padding:"10px 12px",marginBottom:8}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1",marginBottom:6}}>📖 LIVRE DE QUÊTES v{entry.version} — NOUVELLES PAGES!</div>
              {entry.features.map((f,j)=>(
                <div key={j} style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ccc",lineHeight:1.4,paddingLeft:8}}>• {f}</div>
              ))}
            </div>
          ))}
          {actionLog.length===0 && (config.updateFeedEntries||[]).length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#444"}}>Aucune action encore.</div>}
          {actionLog.map((entry,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid #1a1a1a"}}>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#555",flexShrink:0,marginTop:2}}>{entry.time}</span>
              <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:entry.color||"#aaa",lineHeight:1.3}}>{entry.msg}</span>
            </div>
          ))}
        </>}

        {/* PIN TAB */}
        {tab==="pin" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:14}}>CHANGER LE CODE PARENT</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",marginBottom:10}}>Code actuel : {config.pin}</div>
          <input type="password" inputMode="numeric" maxLength={4} value={pinVal}
            onChange={e=>setPinVal(e.target.value.replace(/\D/g,"").slice(0,4))}
            placeholder="Nouveau PIN (4 chiffres)"
            style={{width:"100%",background:"#111",border:"2px solid #D99248",color:"#fff",
              padding:"12px",fontFamily:"'Press Start 2P',monospace",fontSize:18,
              borderRadius:3,textAlign:"center",letterSpacing:8,marginBottom:10}}/>
          <PBtn onClick={()=>{if(pinVal.length===4){onChangePin(pinVal);setPinVal("");}}}
            color={pinVal.length===4?"#D99248":"#333"} textColor="#0d0d0d" style={{width:"100%",opacity:pinVal.length===4?1:0.5}}>
            ✓ Confirmer
          </PBtn>
        </>}

        {/* EXPORT TAB */}
        {tab==="export" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:14}}>SAUVEGARDE</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",marginBottom:12,lineHeight:1.4}}>
            Télécharge une copie du livre de quêtes pour le transférer sur un autre appareil ou garder une sauvegarde.
          </div>
          <PBtn onClick={onExport} color="#1a3a1a" textColor="#5CAD68" style={{width:"100%",marginBottom:10}}>
            📤 Télécharger la sauvegarde
          </PBtn>
          <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:8}}>Restaurer une sauvegarde :</div>
          <label style={{display:"block",padding:"10px",background:"#111",border:"2px dashed #444",
            borderRadius:3,cursor:"pointer",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",textAlign:"center"}}>
            📥 Choisir le fichier de sauvegarde
            <input type="file" accept=".json" onChange={e=>e.target.files[0]&&onImport(e.target.files[0])} style={{display:"none"}}/>
          </label>
        </>}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// MINI-GAME RUNNER — dino-style endless runner
// ═══════════════════════════════════════════════════════════════
// v1.90.0 (Lot 4 #18) — paliers de récompense centralisés ici, réutilisés par
// chaque mini-jeu ET par l'écran de choix/intro (pour les afficher avant de jouer).
const MINIGAME_TIERS = {
  runner: { xp:[0, 5, 12, 22, 35], coins:[0, 2,  6, 12, 20] },
  pacman: { xp:[0, 5, 12, 24, 40], coins:[0, 2,  7, 14, 22] },
  whack:  { xp:[0, 8, 18, 30],     coins:[0, 4, 10, 18] },
};

function MiniGameRunner({ pt, level, onFinish }) {
  const canvasRef = useRef(null);
  const stRef = useRef(null);
  const [phase, setPhase] = useState("intro");
  const phaseRef = useRef("intro");

  const BONUS_XP    = MINIGAME_TIERS.runner.xp;
  const BONUS_COINS = MINIGAME_TIERS.runner.coins;
  const W = 320, H = 160, GROUND = 120;
  const GRAVITY = 0.6, JUMP_VY = -11;
  const DURATION = 16000;

  const initState = () => ({
    px: 50, py: GROUND, vy: 0, onGround: true,
    obstacles: [], coins: [], score: 0,
    startTime: performance.now(), lastObs: 0, lastCoin: 0,
    rafId: null,
  });

  const startGame = () => {
    stRef.current = initState();
    phaseRef.current = "play";
    setPhase("play");
  };

  // Démarre tout seul (le wrapper a déjà fait l'intro + le décompte GO)
  useEffect(() => { startGame(); }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const st = stRef.current;

    const jump = () => { if (st.onGround) { st.vy = JUMP_VY; st.onGround = false; SFX.click(); } };
    const onKey = e => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); } };
    // « Appuie n'importe où pour sauter » → on écoute sur TOUTE la fenêtre (pas juste le canvas)
    const onTap = (e) => { if(e&&e.cancelable) e.preventDefault(); jump(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onTap);
    window.addEventListener("touchstart", onTap, { passive:false });

    const loop = (now) => {
      if (phaseRef.current !== "play") return;
      const elapsed = now - st.startTime;

      // Physics
      st.vy += GRAVITY;
      st.py += st.vy;
      if (st.py >= GROUND) { st.py = GROUND; st.vy = 0; st.onGround = true; }

      // Speed ramps up over time (plus lent qu'avant)
      const speed = 2 + elapsed / 9000;

      // Spawn obstacles (espacés, avec un plancher pour ne jamais devenir trop rapide)
      if (now - st.lastObs > 1700 - Math.min(800, elapsed / 120)) {
        const h = 16 + Math.random() * 16;
        st.obstacles.push({ x: W + 10, h });
        st.lastObs = now;
      }
      // Spawn coins
      if (now - st.lastCoin > 1800) {
        st.coins.push({ x: W + 10, y: GROUND - 30 - Math.random() * 30, collected: false });
        st.lastCoin = now;
      }

      // Move & collide obstacles
      st.obstacles = st.obstacles.filter(o => {
        o.x -= speed;
        // collision with player (rect 20×28)
        if (o.x < st.px + 18 && o.x + 12 > st.px && GROUND - o.h < st.py + 4) {
          // hit — end game
          phaseRef.current = "done";
          setPhase("done");
        }
        return o.x > -20;
      });

      // Move & collect coins
      st.coins = st.coins.filter(c => {
        c.x -= speed;
        if (!c.collected && Math.abs(c.x - st.px) < 22 && Math.abs(c.y - st.py) < 22) {
          c.collected = true; st.score++; SFX.coin();
        }
        return c.x > -20 && !c.collected;
      });

      // End by time
      if (elapsed >= DURATION && phaseRef.current === "play") {
        phaseRef.current = "done";
        setPhase("done");
      }

      // Draw
      ctx.clearRect(0, 0, W, H);
      // Sky gradient
      ctx.fillStyle = "#0d0d1a";
      ctx.fillRect(0, 0, W, H);
      // Ground
      ctx.fillStyle = pt.primary + "99";
      ctx.fillRect(0, GROUND + 28, W, H - GROUND - 28);
      ctx.fillStyle = pt.accent;
      ctx.fillRect(0, GROUND + 27, W, 2);

      // Player (character body)
      ctx.fillStyle = pt.charBodyColor || "#4A90D9";
      ctx.fillRect(st.px - 10, st.py - 24, 20, 28);
      // Eyes
      ctx.fillStyle = "#fff";
      ctx.fillRect(st.px + 2, st.py - 20, 5, 5);
      ctx.fillStyle = "#0d0d0d";
      ctx.fillRect(st.px + 4, st.py - 19, 3, 3);

      // Obstacles (themed cacti/blocks)
      ctx.fillStyle = pt.accent;
      st.obstacles.forEach(o => {
        ctx.fillRect(o.x - 6, GROUND + 28 - o.h, 12, o.h);
        ctx.fillRect(o.x - 10, GROUND + 28 - o.h * 0.6, 20, o.h * 0.3);
      });

      // Coins
      ctx.fillStyle = "#D9BC5C";
      st.coins.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff9";
        ctx.beginPath();
        ctx.arc(c.x - 2, c.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#D9BC5C";
      });

      // Score & timer
      ctx.fillStyle = pt.accent;
      ctx.font = "bold 10px 'Press Start 2P', monospace";
      ctx.fillText(`🪙 ${st.score}`, 10, 18);
      const tLeft = Math.max(0, Math.ceil((DURATION - elapsed) / 1000));
      ctx.fillText(`${tLeft}s`, W - 30, 18);

      st.rafId = requestAnimationFrame(loop);
    };

    st.rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(st.rafId);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onTap);
      window.removeEventListener("touchstart", onTap);
    };
  }, [phase]);

  const score = stRef.current?.score ?? 0;
  const tier = Math.min(4, score);
  const bonusXp = BONUS_XP[tier];
  const bonusCoins = BONUS_COINS[tier];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:12,padding:16,overflowY:"auto",boxSizing:"border-box"}}>
      {phase === "intro" && (<>
        <div style={{fontSize:36}}>🏃</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent,textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#aaa",textAlign:"center",lineHeight:2.2}}>RUNNER!{"\n"}Saute les obstacles, ramasse les pièces!{"\n"}ESPACE ou TAP pour sauter</div>
        <button onClick={startGame} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",boxShadow:`0 0 16px ${pt.primary}80`}}>COURIR! 🏃</button>
      </>)}

      {phase === "play" && (
        <canvas ref={canvasRef} width={W} height={H}
          style={{border:`3px solid ${pt.accent}`,borderRadius:8,imageRendering:"pixelated",boxShadow:`0 0 20px ${pt.glow||pt.accent}60`,cursor:"pointer"}}/>
      )}

      {phase === "done" && (<>
        <div style={{fontSize:36}}>{tier>=4?"🏆":tier>=3?"🥇":tier>=2?"🥈":tier>=1?"🥉":"😅"}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#fff",marginTop:4}}>PIÈCES: {score} 🪙</div>
        {bonusXp>0&&<div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#D9BC5C"}}>+{bonusXp} XP  +{bonusCoins} 🪙</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME PACMAN — pac-man style maze
// ═══════════════════════════════════════════════════════════════
function MiniGamePacman({ pt, level, onFinish }) {
  const canvasRef = useRef(null);
  const stRef = useRef(null);
  const [phase, setPhase] = useState("intro");
  const phaseRef = useRef("intro");

  const BONUS_XP    = MINIGAME_TIERS.pacman.xp;
  const BONUS_COINS = MINIGAME_TIERS.pacman.coins;
  const CS = 22; // cell size
  const MOVE_INTERVAL = 200;
  const GHOST_INTERVAL = 380; // fantômes plus lents (moins stressant)
  const DURATION = 30000;

  const MAZE_TEMPLATE = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,0,2,0,2,0,2,0,2,0,2,1],
    [1,0,1,1,0,1,1,1,0,1,1,0,1],
    [1,2,1,0,2,0,0,0,2,0,1,2,1],
    [1,0,0,2,1,1,0,1,1,2,0,0,1],
    [1,2,0,0,0,2,0,2,0,0,0,2,1],
    [1,0,0,2,1,1,0,1,1,2,0,0,1],
    [1,2,1,0,2,0,0,0,2,0,1,2,1],
    [1,0,1,1,0,1,1,1,0,1,1,0,1],
    [1,2,0,2,0,2,0,2,0,2,0,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  const COLS = 13, ROWS = 11;
  const CW = COLS * CS, CH = ROWS * CS;

  const initState = () => {
    const maze = MAZE_TEMPLATE.map(r => [...r]);
    const total = maze.reduce((s,r) => s + r.filter(c=>c===2).length, 0);
    return {
      maze, total,
      px: 6, py: 5, pdir: {dx:1,dy:0}, pNextDir: {dx:1,dy:0},
      pMoveTimer: 0,
      gx: 1, gy: 1, gdir: {dx:1,dy:0},
      gMoveTimer: 0,
      score: 0, eaten: 0,
      startTime: performance.now(),
      rafId: null, lastTime: performance.now(),
    };
  };

  const canMove = (maze, col, row) =>
    col >= 0 && col < COLS && row >= 0 && row < ROWS && maze[row][col] !== 1;

  const ghostAI = (st) => {
    const { gx, gy, px, py, gdir, maze } = st;
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const reverse = {dx:-gdir.dx,dy:-gdir.dy};
    // prefer moving toward player, avoid reversing
    const valid = dirs.filter(d =>
      !(d.dx===reverse.dx && d.dy===reverse.dy) &&
      canMove(maze, gx+d.dx, gy+d.dy)
    );
    if (valid.length === 0) return gdir;
    return valid.reduce((best, d) => {
      const nx = gx+d.dx, ny = gy+d.dy;
      const nb = gx+best.dx, nb2 = gy+best.dy;
      return (Math.abs(nx-px)+Math.abs(ny-py)) < (Math.abs(nb-px)+Math.abs(nb2-py)) ? d : best;
    }, valid[0]);
  };

  const startGame = () => {
    stRef.current = initState();
    phaseRef.current = "play";
    setPhase("play");
  };

  // Démarre tout seul (le wrapper a déjà fait l'intro + le décompte GO)
  useEffect(() => { startGame(); }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const st = stRef.current;

    const DIRS = { ArrowLeft:{dx:-1,dy:0}, ArrowRight:{dx:1,dy:0}, ArrowUp:{dx:0,dy:-1}, ArrowDown:{dx:0,dy:1},
                   a:{dx:-1,dy:0}, d:{dx:1,dy:0}, w:{dx:0,dy:-1}, s:{dx:0,dy:1} };
    const onKey = e => {
      const d = DIRS[e.key];
      if (d) { e.preventDefault(); st.pNextDir = d; }
    };
    window.addEventListener("keydown", onKey);

    const loop = (now) => {
      if (phaseRef.current !== "play") return;
      const dt = now - st.lastTime;
      st.lastTime = now;
      const elapsed = now - st.startTime;

      // Move player
      st.pMoveTimer += dt;
      if (st.pMoveTimer >= MOVE_INTERVAL) {
        st.pMoveTimer -= MOVE_INTERVAL;
        const nd = st.pNextDir;
        const nx = st.px + nd.dx, ny = st.py + nd.dy;
        if (canMove(st.maze, nx, ny)) { st.pdir = nd; st.px = nx; st.py = ny; }
        else {
          const nx2 = st.px + st.pdir.dx, ny2 = st.py + st.pdir.dy;
          if (canMove(st.maze, nx2, ny2)) { st.px = nx2; st.py = ny2; }
        }
        // Eat pellet
        if (st.maze[st.py][st.px] === 2) {
          st.maze[st.py][st.px] = 0;
          st.score++; st.eaten++;
          SFX.coin();
        }
      }

      // Move ghost
      st.gMoveTimer += dt;
      if (st.gMoveTimer >= GHOST_INTERVAL) {
        st.gMoveTimer -= GHOST_INTERVAL;
        const gd = ghostAI(st);
        st.gdir = gd;
        st.gx += gd.dx; st.gy += gd.dy;
      }

      // Ghost catches player
      if (st.gx === st.px && st.gy === st.py) {
        phaseRef.current = "done";
        setPhase("done");
      }

      // All pellets eaten or time up
      if (st.eaten >= st.total || elapsed >= DURATION) {
        phaseRef.current = "done";
        setPhase("done");
      }

      // Draw
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = "#0d0d1a";
      ctx.fillRect(0, 0, CW, CH);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = c*CS, y = r*CS;
          if (st.maze[r][c] === 1) {
            ctx.fillStyle = pt.primary;
            ctx.fillRect(x+1, y+1, CS-2, CS-2);
            ctx.strokeStyle = pt.accent;
            ctx.lineWidth = 1;
            ctx.strokeRect(x+1.5, y+1.5, CS-3, CS-3);
          } else if (st.maze[r][c] === 2) {
            ctx.fillStyle = "#D9BC5C";
            ctx.beginPath();
            ctx.arc(x+CS/2, y+CS/2, 3, 0, Math.PI*2);
            ctx.fill();
          }
        }
      }

      // Pac-man (mouth opens/closes)
      const mouthAngle = (Math.floor(now/80) % 2 === 0) ? 0.3 : 0.05;
      const angle = st.pdir.dx===1 ? 0 : st.pdir.dx===-1 ? Math.PI : st.pdir.dy===1 ? Math.PI/2 : -Math.PI/2;
      ctx.fillStyle = pt.charBodyColor || "#D9BC5C";
      ctx.beginPath();
      ctx.moveTo(st.px*CS+CS/2, st.py*CS+CS/2);
      ctx.arc(st.px*CS+CS/2, st.py*CS+CS/2, CS/2-2, angle+mouthAngle, angle+Math.PI*2-mouthAngle);
      ctx.closePath();
      ctx.fill();

      // Ghost
      const gx2 = st.gx*CS, gy2 = st.gy*CS;
      ctx.fillStyle = pt.accent;
      ctx.beginPath();
      ctx.arc(gx2+CS/2, gy2+CS/2-2, CS/2-2, Math.PI, 0);
      ctx.lineTo(gx2+CS-2, gy2+CS-2);
      for (let i=0;i<3;i++) {
        ctx.arc(gx2+CS-2-(i*(CS-4)/3)-(CS-4)/6, gy2+CS-2, (CS-4)/6, 0, Math.PI, true);
      }
      ctx.lineTo(gx2+2, gy2+CS-2);
      ctx.closePath();
      ctx.fill();
      // Ghost eyes
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(gx2+CS/2-4, gy2+CS/2-3, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx2+CS/2+4, gy2+CS/2-3, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#00f";
      ctx.beginPath(); ctx.arc(gx2+CS/2-3, gy2+CS/2-2, 1.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx2+CS/2+5, gy2+CS/2-2, 1.5, 0, Math.PI*2); ctx.fill();

      // HUD
      ctx.fillStyle = pt.accent;
      ctx.font = "bold 9px 'Press Start 2P', monospace";
      const tLeft = Math.max(0, Math.ceil((DURATION - elapsed)/1000));
      ctx.fillText(`${st.score}/${st.total} 🪙  ${tLeft}s`, 6, CH - 5);

      st.rafId = requestAnimationFrame(loop);
    };

    st.rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(st.rafId);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

  const score = stRef.current?.score ?? 0;
  const total = stRef.current?.total ?? 1;
  const tier = Math.min(4, Math.floor(score/total * 4 * 1.6));
  const bonusXp = BONUS_XP[tier];
  const bonusCoins = BONUS_COINS[tier];

  const dpad = (dx, dy) => { if (stRef.current) stRef.current.pNextDir = {dx,dy}; };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:8,padding:12,overflowY:"auto",boxSizing:"border-box"}}>
      {phase === "intro" && (<>
        <div style={{fontSize:36}}>👻</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent,textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#aaa",textAlign:"center",lineHeight:2.2}}>PAC-QUEST!{"\n"}Mange les pellets, évite le fantôme!{"\n"}Flèches ou WASD</div>
        <button onClick={startGame} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",boxShadow:`0 0 16px ${pt.primary}80`}}>JOUER! 👾</button>
      </>)}

      {phase === "play" && (<>
        <canvas ref={canvasRef} width={CW} height={CH}
          style={{border:`3px solid ${pt.accent}`,borderRadius:4,imageRendering:"pixelated",boxShadow:`0 0 20px ${pt.glow||pt.accent}60`,maxWidth:"95vw",maxHeight:"50vh"}}/>
        {/* Touch D-pad */}
        <div style={{display:"grid",gridTemplateColumns:"44px 44px 44px",gridTemplateRows:"44px 44px",gap:4,marginTop:4}}>
          {[null,{dx:0,dy:-1,"l":"▲"},null,{dx:-1,dy:0,"l":"◀"},{dx:0,dy:1,"l":"▼"},{dx:1,dy:0,"l":"▶"}].map((d,i)=>
            d ? <button key={i} onPointerDown={()=>dpad(d.dx,d.dy)}
              style={{fontFamily:"monospace",fontSize:18,background:"#222",border:`2px solid ${pt.accent}`,color:pt.accent,borderRadius:6,cursor:"pointer",userSelect:"none"}}>{d.l}</button>
              : <div key={i}/>
          )}
        </div>
      </>)}

      {phase === "done" && (<>
        <div style={{fontSize:36}}>{tier>=4?"🏆":tier>=3?"🥇":tier>=2?"🥈":tier>=1?"🥉":"😅"}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#fff"}}>PELLETS: {score}/{total}</div>
        {bonusXp>0&&<div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#D9BC5C"}}>+{bonusXp} XP  +{bonusCoins} 🪙</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME WHACK — mini-jeu whack-a-mole thématique au level-up
// ═══════════════════════════════════════════════════════════════
function MiniGameWhack({ pt, level, onFinish }) {
  const ROUNDS = 3;
  const ROUND_MS = 2300; // plus lent (était 1400)
  const BONUS_XP = MINIGAME_TIERS.whack.xp;
  const BONUS_COINS = MINIGAME_TIERS.whack.coins;
  const TARGET = pt.platformItems?.[0] || "⭐";

  const [phase, setPhase] = useState("intro"); // intro|play|done
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [active, setActive] = useState(-1);
  const roundRef = useRef(0);
  const scoreRef = useRef(0);
  const timerRef = useRef(null);

  const showNext = useCallback(() => {
    const cell = Math.floor(Math.random() * 9);
    setActive(cell);
    timerRef.current = setTimeout(() => {
      setActive(-1);
      roundRef.current++;
      setRound(roundRef.current);
      if (roundRef.current >= ROUNDS) { setTimeout(() => setPhase("done"), 400); }
      else { setTimeout(showNext, 600); }
    }, ROUND_MS);
  }, []);

  const handleHit = (i) => {
    if (phase !== "play" || active !== i) return;
    clearTimeout(timerRef.current);
    scoreRef.current++; setScore(scoreRef.current);
    setActive(-1); SFX.coin();
    roundRef.current++; setRound(roundRef.current);
    if (roundRef.current >= ROUNDS) { setTimeout(() => setPhase("done"), 350); }
    else { setTimeout(showNext, 500); }
  };

  const start = () => {
    roundRef.current = 0; scoreRef.current = 0;
    setRound(0); setScore(0); setPhase("play");
    setTimeout(showNext, 700);
  };

  // Démarre tout seul (le wrapper a déjà fait l'intro + le décompte GO)
  useEffect(() => { start(); }, []);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const bonusXp = BONUS_XP[score] ?? 0;
  const bonusCoins = BONUS_COINS[score] ?? 0;
  const stars = Array.from({length:3}, (_,i) => i < score ? "⭐" : "⬛").join(" ");
  const medal = score === 3 ? "🏆" : score >= 2 ? "🥈" : score === 1 ? "🥉" : "😅";
  const msg = score === 3 ? "PARFAIT! 🔥" : score >= 2 ? "Bien joué!" : score === 1 ? "Pas mal!" : "La prochaine fois!";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:20,overflowY:"auto",boxSizing:"border-box"}}>
      {phase === "intro" && (<>
        <div style={{fontSize:40}}>{TARGET}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:pt.accent,textAlign:"center",textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#aaa",textAlign:"center",lineHeight:2.2}}>Mini-jeu!{"\n"}Tape les {TARGET} le plus vite possible!</div>
        <button onClick={start} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",marginTop:8,boxShadow:`0 0 16px ${pt.primary}80`}}>JOUER! 🎮</button>
      </>)}

      {phase === "play" && (<>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",letterSpacing:2}}>TOUR {round+1}/{ROUNDS} · SCORE {score}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:240}}>
          {Array.from({length:9}, (_,i) => (
            <button key={i} onClick={()=>handleHit(i)}
              style={{height:72,fontSize:active===i?32:0,background:active===i?pt.primary:"#181818",border:`2px solid ${active===i?pt.accent:"#2a2a2a"}`,borderRadius:10,cursor:active===i?"pointer":"default",transition:"all 0.07s",transform:active===i?"scale(1.1)":"scale(1)",boxShadow:active===i?`0 0 18px ${pt.glow}60`:"none"}}>
              {active===i ? TARGET : ""}
            </button>
          ))}
        </div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#555"}}>Réflexes de champion!</div>
      </>)}

      {phase === "done" && (<>
        <div style={{fontSize:48}}>{medal}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:14,color:pt.accent,letterSpacing:3}}>{stars}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#ddd"}}>{msg}</div>
        {bonusXp > 0 && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#D9BC5C",textShadow:"0 0 8px #D9BC5C"}}>+{bonusXp} XP · +{bonusCoins} 🪙</div>}
        {bonusXp === 0 && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#555"}}>Pas de bonus cette fois...</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME ROUTER — choisi aléatoirement au level-up
// ═══════════════════════════════════════════════════════════════
const MINIGAME_LIST = ["whack", "runner", "pacman"];
const MINIGAME_INFO = {
  whack:  { icon:"🔨", name:"Tape vite!",   how:"👆 Touche les cibles avec ton doigt (ou clique avec la souris) le plus vite possible avant qu'elles disparaissent!" },
  runner: { icon:"🏃", name:"Cours et saute!", how:"👆 Appuie N'IMPORTE OÙ sur l'écran — ou la barre d'espace ⎵ / flèche du haut ⬆️ — pour SAUTER par-dessus les obstacles. Ramasse les pièces!" },
  pacman: { icon:"😋", name:"Mange tout!",  how:"👆 Glisse ton doigt dans une direction — ou utilise les flèches du clavier ⬆️⬇️⬅️➡️ — pour te déplacer. Mange toutes les pastilles en évitant les fantômes!" },
};
// v1.90.0 (Lot 4 #18) — paliers d'un jeu, du meilleur score au moins bon, pour affichage AVANT de jouer.
function minigameTierRow(type) {
  const tiers = MINIGAME_TIERS[type];
  const rows = tiers.xp.map((xp,i)=>({tier:i,xp,coins:tiers.coins[i]})).filter(r=>r.tier>0).reverse();
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",maxWidth:360}}>
      {rows.map(r=>(
        <div key={r.tier} style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",background:"rgba(0,0,0,0.35)",borderRadius:6,padding:"4px 9px"}}>
          {"⭐".repeat(r.tier)} +{r.xp} XP · +{r.coins}🪙
        </div>
      ))}
    </div>
  );
}

function MiniGame({ player, playerThemeId, level, onFinish, forcedType, isGift }) {
  const pt = getPlayerTheme(playerThemeId || "none");
  const forced = forcedType && MINIGAME_LIST.includes(forcedType) ? forcedType : null;
  // v1.90.0 (Lot 4 #18) — l'enfant choisit son jeu (sauf cadeau imposé, ex Pac-Man) : nouvelle
  // phase "choice" avant l'intro, qui affiche aussi les paliers de récompense de chaque jeu.
  const [type, setType] = useState(forced);
  const [phase, setPhase] = useState(forced ? "intro" : "choice"); // choice | intro | countdown | play
  const [count, setCount] = useState(3);
  const INFO = type ? MINIGAME_INFO[type] : null;

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count < 0) { setPhase("play"); return; }
    if (count === 0 && SFX.epic) SFX.epic();
    const t = setTimeout(() => setCount(c => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, count]);

  if (phase === "choice") {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:24,textAlign:"center",overflowY:"auto"}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:"#D9BC5C"}}>{isGift ? "🎁 CADEAU SURPRISE!" : `🎉 NIVEAU ${level} ATTEINT!`}</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(17px,2.4vw,20px)",color:"#fff"}}>Choisis ton mini-jeu! 🎮</div>
        {MINIGAME_LIST.map(g => (
          <button key={g} onClick={()=>{SFX.click&&SFX.click();setType(g);setPhase("intro");}}
            style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:6,alignItems:"center",fontFamily:"'Press Start 2P',monospace",padding:"14px 12px",background:"#1a1a1a",color:"#fff",border:`3px solid ${pt.accent}`,borderRadius:8,cursor:"pointer"}}>
            <div style={{fontSize:32}}>{MINIGAME_INFO[g].icon}</div>
            <div style={{fontSize:"clamp(9px,1.4vw,12px)",color:pt.accent}}>{MINIGAME_INFO[g].name}</div>
            {minigameTierRow(g)}
          </button>
        ))}
        <button onClick={()=>onFinish(0)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"#666",border:"2px solid #444",cursor:"pointer",borderRadius:3}}>Passer</button>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:18,padding:24,textAlign:"center",overflowY:"auto"}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:"#D9BC5C"}}>{isGift ? "🎁 CADEAU SURPRISE!" : `🎉 NIVEAU ${level} ATTEINT!`}</div>
        <div style={{fontSize:64,lineHeight:1}}>{INFO.icon}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,18px)",color:pt.accent,textShadow:`0 0 14px ${pt.glow}80`}}>{INFO.name}</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(17px,2.6vw,21px)",color:"#fff",maxWidth:380,lineHeight:1.35}}>{INFO.how}</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#D9BC5C"}}>🏆 Paliers de récompense :</div>
        {minigameTierRow(type)}
        <button className="btn-press" onClick={()=>{SFX.click&&SFX.click();setCount(3);setPhase("countdown");}}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,14px)",padding:"16px 30px",background:pt.accent,color:"#0d0d0d",border:"4px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"5px 5px 0 #0d0d0d",marginTop:6}}>
          ✅ JE SUIS PRÊT!
        </button>
        {!forced && <button onClick={()=>{SFX.click&&SFX.click();setPhase("choice");}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#1a1a1a",color:pt.accent,border:`2px solid ${pt.accent}`,cursor:"pointer",borderRadius:3}}>🔀 Changer de jeu</button>}
        <button onClick={()=>onFinish(0)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"#666",border:"2px solid #444",cursor:"pointer",borderRadius:3}}>Passer</button>
      </div>
    );
  }
  if (phase === "countdown") {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:12,padding:16,overflowY:"auto",boxSizing:"border-box"}}>
        <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#aaa"}}>{INFO.icon} {INFO.name}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:count>0?"clamp(44px,12vw,90px)":"clamp(30px,9vw,64px)",color:count>0?"#fff":"#5CAD68",textShadow:`0 0 30px ${pt.glow}`,animation:"bounceIn 0.3s ease"}}>
          {count>0 ? count : "GO!"}
        </div>
      </div>
    );
  }
  if (type === "runner") return <MiniGameRunner pt={pt} level={level} onFinish={onFinish}/>;
  if (type === "pacman") return <MiniGamePacman pt={pt} level={level} onFinish={onFinish}/>;
  return <MiniGameWhack pt={pt} level={level} onFinish={onFinish}/>;
}


// ═══════════════════════════════════════════════════════════════
// LOGIN SCREEN — "Qui joue?" + PIN par joueur
// ═══════════════════════════════════════════════════════════════
// ─── CALENDAR HELPERS ────────────────────────────────────────────────────────
// Libellé lisible d'une récurrence
const recurLabel = (e) => {
  if (e?.recur?.freq==="daily") return "Chaque jour";
  if (e?.recur?.freq==="weekly") return "Chaque "+(DAYS[e.recur.day]||"?");
  return e?.date||"";
};
// v2.6.6 — refonte calendrier (demande de Gen) : sections par moment de journée + heure optionnelle.
// `time` ("HH:MM") est un champ optionnel sur les entrées de calendrier — sans heure, l'événement
// tombe dans la section "Toute la journée". Libellés texte seul (sans emoji, demande de Gen) —
// l'icône du type d'événement à côté de chaque entrée suffit, doubler avec un emoji par section
// était du bruit visuel.
const DAY_PARTS = [
  { key:"dejeuner",  label:"Lever",       from:6*60,        to:10*60 },
  { key:"avantmidi", label:"Matin",       from:10*60,       to:11*60+30 },
  { key:"diner",     label:"Dîner",       from:11*60+30,    to:13*60+30 },
  { key:"apresmidi", label:"Après-midi",  from:13*60+30,    to:17*60 },
  { key:"souper",    label:"Souper",      from:17*60,       to:19*60+30 },
  { key:"soir",      label:"Soirée",      from:19*60+30,    to:30*60 }, // >24h = avant 6h le lendemain
];
const dayPartOf = (time) => {
  if (!time) return null; // pas d'heure → section "Toute la journée"
  const [h,m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  let mins = h*60+(m||0);
  if (mins < 6*60) mins += 24*60; // avant 6h du matin = fin de la section "Soir" de la veille
  return DAY_PARTS.find(p => mins>=p.from && mins<p.to) || DAY_PARTS[DAY_PARTS.length-1];
};
// Prochaines dates (ISO) d'un événement sur N jours (gère récurrence)
const upcomingOccurrences = (e, days=14) => {
  const out=[]; const today=new Date(); today.setHours(0,0,0,0);
  for(let d=0; d<days; d++){
    const dt=new Date(today); dt.setDate(today.getDate()+d); const iso=dt.toISOString().slice(0,10);
    let hit=false;
    if(e?.recur?.freq==="daily") hit=true;
    else if(e?.recur?.freq==="weekly") hit=((dt.getDay()+6)%7)===e.recur.day;
    else hit=(e?.date===iso);
    if(hit) out.push(iso);
  }
  return out;
};

// ─── MINUTERIE (chrono + rituel + encouragements) ────────────
const TIMER_ENCOURAGE=["Continue, tu es capable! 💪","Super rythme! ⚡","Tu gères ça comme un·e champion·ne! 🔥","Presque là, lâche pas! 🌟","Wow, quelle belle énergie! 🚀","Tu fais ça super bien! 👏"];
function TimerView({ config, gameStates, sessionPlayer, parentMode, th, onComplete, initialRitualId, onCompleteTask }){
  const [childIdx,setChildIdx]=useState(sessionPlayer!=null?sessionPlayer:0);
  const [mode,setMode]=useState("deadline"); // deadline = heure de fin · down = minutes · up = chrono
  const [ritualId,setRitualId]=useState(initialRitualId||null);
  const [taskLabel,setTaskLabel]=useState("");
  const [targetMin,setTargetMin]=useState(5);
  const [endTime,setEndTime]=useState("07:30"); // heure de fin (départ des gars)
  const [startTs,setStartTs]=useState(null);
  const [timeUp,setTimeUp]=useState(false);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{ if(!startTs)return; const i=setInterval(()=>setNow(Date.now()),250); return()=>clearInterval(i); },[startTs]);
  // Rituel présélectionné (ouvert depuis la vue rituel) → charge son heure de fin
  useEffect(()=>{ if(!initialRitualId)return; const idx=sessionPlayer!=null?sessionPlayer:childIdx; const r=(gameStates[idx]?.routines||[]).find(x=>x.id===initialRitualId); if(r){ setRitualId(r.id); if(r.endTime){ setMode("deadline"); setEndTime(r.endTime); } } },[initialRitualId]);
  const lockChild = sessionPlayer!=null && !parentMode;
  const cidx = lockChild?sessionPlayer:childIdx;
  const child=config.players[cidx]; const routines=(gameStates[cidx]?.routines)||[];
  const ritual=routines.find(r=>r.id===ritualId);
  const acc=th.accent||(child?.color)||"#D9BC5C";
  // v1.68.0 (B4) — les TÂCHES du rituel, pour les cocher pendant le minuteur (avant : on n'y avait pas accès)
  const _allT=[...TASK_CATALOG, ...((config&&config.customTasks)||[])];
  const _pid=child?.id;
  const _cgs=gameStates[cidx]||{};
  const ritualTasks = ritual ? (ritual.taskIds||[]).map(iid=>{ const ass=(config.assignments||[]).find(a=>a.instanceId===iid); if(!ass)return null; const t=_allT.find(x=>x.id===ass.taskId); return t?{iid,ass,t}:null; }).filter(Boolean) : [];
  const _taskStatus=(iid)=>{ const k=iid+"_"+_pid+"#"+todayStamp(); return _cgs.completed?.includes(k)?"done":(_cgs.pending?.includes(k)?"pending":null); };
  const ritualChecklistEl = (ritual && ritualTasks.length>0) ? (
    <div style={{display:"flex",flexDirection:"column",gap:6,background:"rgba(0,0,0,0.32)",borderRadius:8,padding:"9px 11px"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:acc}}>📋 Tâches de « {ritual.name} »</div>
      {ritualTasks.map(({iid,ass,t})=>{ const st=_taskStatus(iid); return (
        <div key={iid} style={{display:"flex",alignItems:"center",gap:8}}>
          <UIIcon name={"task_"+t.id} emoji={t.emoji} size={18}/>
          <span style={{flex:1,fontFamily:"'VT323',monospace",fontSize:16,color:st==="done"?"#5CAD68":"#eee",textDecoration:st?"line-through":"none",opacity:st?0.65:1}}>{t.label}</span>
          {st==="done" ? <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5CAD68"}}>✅</span>
           : st==="pending" ? <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFC107"}}>⏳ attente</span>
           : <button onClick={()=>{ SFX.click&&SFX.click(); onCompleteTask&&onCompleteTask(ass,_pid); }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"7px 10px",background:"#5CAD68",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer"}}>Fait!</button>}
        </div> ); })}
    </div>
  ) : null;
  const elapsed=startTs?now-startTs:0;
  // Heure de fin : on vise HH:MM aujourd'hui (calculé au démarrage)
  const deadlineMs=(()=>{ if(mode!=="deadline"||!startTs) return 0; const [h,m]=endTime.split(":").map(Number); const dt=new Date(startTs); dt.setHours(h,m,0,0); if(dt.getTime()<startTs) dt.setDate(dt.getDate()+1); return dt.getTime(); })();
  const remaining=mode==="deadline"?Math.max(0,deadlineMs-now):(mode==="down"?Math.max(0,targetMin*60000-elapsed):elapsed);
  useEffect(()=>{ if(startTs&&!timeUp&&((mode==="down"&&elapsed>=targetMin*60000)||(mode==="deadline"&&now>=deadlineMs&&deadlineMs>0))){ setTimeUp(true); try{if(!CALM)spawnParticles("⏰");SFX.epic&&SFX.epic();}catch{} } },[now]); // temps écoulé
  const mm=Math.floor(remaining/60000), ss=Math.floor((remaining%60000)/1000);
  const urgent5 = (mode==="down"||mode==="deadline") && !timeUp && remaining<=300000; // « Let's go! » à 5 min
  const lowTime = (mode==="down"||mode==="deadline") && remaining<=60000 && !timeUp; // rouge à 1 min
  const reset=()=>{ setStartTs(null); setTimeUp(false); setRitualId(null); };
  const taskName=()=> ritual? ritual.name : (taskLabel.trim()||"Défi minuté");
  const succeed=()=>{ const mins=mode==="down"?targetMin:Math.max(1,Math.round(elapsed/60000)); onComplete&&onComplete(cidx, ritual||{name:taskName(),emoji:"⏳"}, mins); reset(); };
  const fail=()=>{ SFX.click&&SFX.click(); reset(); }; // pas d'XP en cas d'échec
  const start=()=>{ SFX.epic&&SFX.epic(); setTimeUp(false); setStartTs(Date.now()); setNow(Date.now()); };
  return (
    <div style={{padding:"12px 10px",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:acc}}>⏱ MINUTERIE</div>
      {!lockChild && <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {config.players.map((pl,i)=>(<div key={pl.id} onClick={()=>{setChildIdx(i);setRitualId(null);setStartTs(null);setTimeUp(false);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:cidx===i?pl.color:"#1a1a1a",color:cidx===i?"#0d0d0d":"#666",border:`2px solid ${cidx===i?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>))}
      </div>}

      {!startTs && (<>
        {/* Choix du mode */}
        <div style={{display:"flex",gap:6}}>
          {[["deadline","🕐 Heure de fin"],["down","⏳ Minutes"],["up","⏱ Chrono"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setMode(k);SFX.click();}}
              style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,0.85vw,7px)",padding:"11px 4px",background:mode===k?acc:"#1a1a1a",color:mode===k?"#0d0d0d":"#999",border:`2px solid ${mode===k?acc:"#333"}`,borderRadius:6,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        {/* Quelle tâche on chronomètre (libre) */}
        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb"}}>Qu'est-ce que tu chronomètres?</div>
        <input value={taskLabel} onChange={e=>{setTaskLabel(e.target.value.slice(0,40));setRitualId(null);}} placeholder="ex: Ranger ma chambre, brosser mes dents…"
          style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"9px 11px",background:"#111",color:"#fff",border:`2px solid ${ritualId?"#333":acc}`,borderRadius:6,outline:"none"}}/>
        {routines.length>0 && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <span style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777",alignSelf:"center"}}>ou un rituel (donne de l'XP 🎁) :</span>
          {routines.map(r=>(<button key={r.id} onClick={()=>{setRitualId(r.id);setTaskLabel("");if(r.endTime){setMode("deadline");setEndTime(r.endTime);}SFX.click();}} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 11px",background:ritualId===r.id?acc:"#1a1a1a",color:ritualId===r.id?"#0d0d0d":"#bbb",border:`2px solid ${ritualId===r.id?acc:"#333"}`,borderRadius:20,cursor:"pointer"}}>{r.emoji||"⏰"} {r.name}{r.endTime?` · ${r.endTime.replace(":","h")}`:""}</button>))}
        </div>}
        {/* Rappel clair : outil vs rituel */}
        <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:ritual?"#5CAD68":"#888",lineHeight:1.3,background:"rgba(0,0,0,0.3)",borderRadius:5,padding:"6px 9px"}}>
          {ritual ? `🎁 Rituel « ${ritual.name} » : le réussir dans les temps donne de l'XP!` : "🛠️ Minuterie libre : c'est juste un outil pour t'aider — pas de récompense. Choisis un rituel ci-dessus pour gagner de l'XP."}
        </div>
        {/* v1.68.0 (B4) — les tâches du rituel, cochables ici même */}
        {ritualChecklistEl}
        {/* Durée (compte à rebours) */}
        {mode==="down" && <>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginTop:2}}>Combien de minutes? <b style={{color:acc}}>{targetMin} min</b></div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {[1,2,5,10,15,20].map(v=>(
              <button key={v} onClick={()=>{setTargetMin(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 11px",background:targetMin===v?acc:"#1a1a1a",color:targetMin===v?"#0d0d0d":acc,border:`2px solid ${acc}`,borderRadius:5,cursor:"pointer"}}>{v}</button>
            ))}
            <input type="number" min="1" max="120" value={targetMin} onChange={e=>setTargetMin(Math.max(1,Math.min(120,parseInt(e.target.value)||1)))}
              style={{width:60,fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:5,outline:"none",textAlign:"center"}}/>
          </div>
        </>}
        {/* Heure de fin (départ) */}
        {mode==="deadline" && <>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginTop:2}}>À quelle heure tu dois être prêt? <b style={{color:acc}}>{endTime.replace(":","h")}</b></div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {["07:00","07:30","08:00"].map(v=>(
              <button key={v} onClick={()=>{setEndTime(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 11px",background:endTime===v?acc:"#1a1a1a",color:endTime===v?"#0d0d0d":acc,border:`2px solid ${acc}`,borderRadius:5,cursor:"pointer"}}>{v.replace(":","h")}</button>
            ))}
            <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value||"07:30")}
              style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:5,outline:"none"}}/>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777"}}>Le minuteur va compter jusqu'à cette heure. À 5 minutes : « Let's go! » 🚀</div>
        </>}
        <button className="btn-press" onClick={start}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d",marginTop:4}}>
          ▶️ {mode==="deadline"?`Partir (jusqu'à ${endTime.replace(":","h")})`:mode==="down"?`Partir (${targetMin} min)`:"Partir le chrono"}
        </button>
      </>)}

      {startTs && !timeUp && (<>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:acc,textAlign:"center"}}>{ritual?`${ritual.emoji||"⏰"} ${ritual.name}`:`⏳ ${taskName()}`}{mode==="deadline"?` — jusqu'à ${endTime.replace(":","h")}`:""}</div>
        {mode==="deadline" && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:urgent5?"#D98C8C":"#bbb",textAlign:"center"}}>il reste <b>{Math.ceil(remaining/60000)}</b> min</div>}
        {/* v1.88.0 (Lot 3 #13) — disque visuel, seulement quand on a une vraie durée totale (pas en chrono libre) */}
        {(mode==="down"||mode==="deadline") && (()=>{ const totalMs = mode==="down" ? targetMin*60000 : Math.max(1,deadlineMs-(startTs||0)); return (
          <TimeTimerDisc progress={remaining/totalMs} color={acc} urgent={lowTime}/>
        ); })()}
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(34px,9vw,64px)",color:lowTime?"#D98C8C":urgent5?"#FFA94D":"#fff",textAlign:"center",letterSpacing:2,animation:lowTime?"pulse 0.6s infinite":"none"}}>{String(mm).padStart(2,"0")}:{String(ss).padStart(2,"0")}</div>
        {mode==="down" && <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:Math.round(remaining/(targetMin*60000)*100)+"%",background:lowTime?"#D98C8C":acc,transition:"width 0.25s linear"}}/></div>}
        {urgent5
          ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,15px)",color:"#FFA94D",textAlign:"center",animation:"pulse 0.7s infinite"}}>🚀 LET'S GO! Plus que {Math.ceil(remaining/60000)} min!</div>
          : <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:acc,textAlign:"center",minHeight:24}}>{TIMER_ENCOURAGE[Math.floor(elapsed/20000)%TIMER_ENCOURAGE.length]}</div>}
        {/* v1.68.0 (B4) — coche les tâches du rituel pendant que le minuteur tourne */}
        {ritualChecklistEl}
        <button className="btn-press" onClick={succeed}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>🎉 J'ai réussi!</button>
        <button onClick={fail} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px",background:"#1a1a1a",color:"#888",border:"2px solid #333",borderRadius:5,cursor:"pointer"}}>✕ Abandonner</button>
      </>)}

      {startTs && timeUp && (<>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,16px)",color:acc,textAlign:"center"}}>⏰ Temps écoulé!</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#ddd",textAlign:"center",lineHeight:1.3}}>As-tu réussi « {taskName()} »?</div>
        <button className="btn-press" onClick={succeed}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>🎉 Oui, réussi!</button>
        <button onClick={fail}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"13px",background:"#1a1a1a",color:"#FFA94D",border:"2px solid #FFA94D55",borderRadius:8,cursor:"pointer"}}>😅 Oups, prochaine fois (pas de récompense)</button>
      </>)}
    </div>
  );
}

function LoginScreen({ config, gameStates, onSelectPlayer, onParentLogin, onSetPlayerPin, onCompleteOnboarding, onNewSetup }) {
  // mode: "who" | "child-select" | "onboarding" | "pin" | "parent" | "info"
  const [mode, setMode] = useState("who");
  const [selIdx, setSelIdx] = useState(null);

  // Onboarding steps: "theme" | "avatar" | "pseudo" | "pin-create" | "pin-confirm"
  const [obStep, setObStep] = useState("theme");
  const [draftTheme, setDraftTheme] = useState(null);
  const [draftAvatar, setDraftAvatar] = useState({skin:"sk1",eyes:"ey1",mouth:"mo1",hair:"ha1"});
  const [avatarTab, setAvatarTab] = useState("hair");
  const [draftPseudo, setDraftPseudo] = useState("");
  const [obFirstPin, setObFirstPin] = useState("");
  const [obPin, setObPin] = useState("");

  // Returning player PIN
  const [pPin, setPPin] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [firstPin, setFirstPin] = useState("");
  const pPinRef = useRef("");
  const firstPinRef = useRef("");
  const confirmStepRef = useRef(false);

  // Parent PIN
  const [ppPin, setPpPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const ppPinRef = useRef("");

  const reset = () => {
    setMode("who"); setSelIdx(null);
    setObStep("theme"); setDraftTheme(null); setDraftAvatar({skin:"sk1",eyes:"ey1",mouth:"mo1",hair:"ha1"});
    setDraftPseudo(""); setObFirstPin(""); setObPin("");
    setPPin(""); pPinRef.current = ""; setConfirmStep(false); confirmStepRef.current = false; setFirstPin(""); firstPinRef.current = "";
    setPpPin(""); ppPinRef.current = ""; setPinError(false);
  };
  const triggerError = (resetFn) => { setPinError(true); SFX.error?.(); setTimeout(()=>{ resetFn(); setPinError(false); }, 700); };

  const handleChildSelect = (i) => {
    SFX.click(); setSelIdx(i);
    const ps = gameStates[i] || {};
    const isFirstLogin = !ps.avatar?.configured && !ps.pin;
    if (isFirstLogin) {
      const pl = config.players[i];
      const starters = pl.starterThemes || [];
      setDraftTheme(starters[0] || pl.themeId || "none");
      setDraftAvatar({skin:"sk1",eyes:"ey1",mouth:"mo1",hair:"ha1"});
      setDraftPseudo(pl.pseudo || "");
      setObStep("theme"); setObPin(""); setObFirstPin("");
      setMode("onboarding");
    } else {
      pPinRef.current = ""; setPPin(""); confirmStepRef.current = false; setConfirmStep(false); firstPinRef.current = ""; setFirstPin(""); setPinError(false);
      setMode("pin");
    }
  };

  // Returning player PIN — ref-based (no useCallback needed: deps change every render anyway)
  const gameStatesRef = useRef(gameStates);
  gameStatesRef.current = gameStates;
  const selIdxRef = useRef(selIdx);
  selIdxRef.current = selIdx;

  // Core submit logic — reads from refs, safe to call anytime
  const doPlayerSubmit = () => {
    const entered = pPinRef.current;
    if (entered.length !== 4) return;
    const ps = gameStatesRef.current[selIdxRef.current] || {};
    if (!ps.pin) {
      if (!confirmStepRef.current) {
        firstPinRef.current = entered; setFirstPin(entered);
        pPinRef.current = ""; setPPin("");
        confirmStepRef.current = true; setConfirmStep(true);
      } else if (entered === firstPinRef.current) {
        onSetPlayerPin(selIdxRef.current, entered);
        onSelectPlayer(selIdxRef.current);
      } else {
        triggerError(()=>{ pPinRef.current=""; setPPin(""); confirmStepRef.current=false; setConfirmStep(false); firstPinRef.current=""; setFirstPin(""); });
      }
    } else {
      if (entered === String(ps.pin)) { onSelectPlayer(selIdxRef.current); }
      else triggerError(()=>{ pPinRef.current=""; setPPin(""); });
    }
  };

  const handlePlayerDigit = (d) => {
    if (pPinRef.current.length >= 4) return;
    pPinRef.current = pPinRef.current + d;
    setPPin(pPinRef.current);
    setPinError(false);
    // Auto-submit au 4e chiffre (régression v1.10.1 — le bouton VALIDER reste en filet de sécurité)
    if (pPinRef.current.length === 4) setTimeout(doPlayerSubmit, 120);
  };

  // Parent PIN — ref-based
  const configPinRef = useRef(config?.pin);
  configPinRef.current = config?.pin;

  const doParentSubmit = () => {
    const entered = ppPinRef.current;
    if (entered.length !== 4) return;
    const storedPin = configPinRef.current != null ? String(configPinRef.current) : "1146";
    if (entered === storedPin) { ppPinRef.current = ""; onParentLogin(); }
    else triggerError(()=>{ ppPinRef.current=""; setPpPin(""); });
  };

  const handleParentDigit = (d) => {
    if (ppPinRef.current.length >= 4) return;
    ppPinRef.current = ppPinRef.current + d;
    setPpPin(ppPinRef.current);
    setPinError(false);
    // Auto-submit au 4e chiffre (régression v1.10.1 — le bouton VALIDER reste en filet de sécurité)
    if (ppPinRef.current.length === 4) setTimeout(doParentSubmit, 120);
  };

  // Onboarding PIN
  const handleObPinDigit = (d) => {
    const next = (obPin + d).slice(0, 4);
    setObPin(next); setPinError(false);
    if (next.length < 4) return;
    if (obStep === "pin-create") { setObFirstPin(next); setObPin(""); setObStep("pin-confirm"); }
    else {
      if (next === obFirstPin) {
        const pl = config.players[selIdx];
        onCompleteOnboarding(selIdx, {
          themeId: draftTheme || (pl.starterThemes||[])[0] || "none",
          avatar: {...draftAvatar, configured: true},
          pseudo: draftPseudo.trim() || pl.name,
          pin: next,
        });
        onSelectPlayer(selIdx);
      } else {
        triggerError(()=>{ setObPin(""); setObStep("pin-create"); setObFirstPin(""); });
      }
    }
  };

  const player = selIdx !== null ? config.players[selIdx] : null;
  const ps = selIdx !== null ? (gameStates[selIdx] || {}) : {};
  const accentColor = player?.color || "#D9BC5C";

  const BtnBack = ({onClick, label="← Retour"}) => (
    <button onClick={()=>{SFX.click();onClick();}} style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#444",background:"none",border:"none",cursor:"pointer",marginTop:8}}>{label}</button>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0d0d0d",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",padding:"20px 16px",position:"relative",overflow:"hidden"}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 0%,#85CDD120 0%,transparent 60%)",pointerEvents:"none"}}/>

      {/* ── Écran 1 : Tu es...? ── */}
      {mode === "who" && (
        <div style={{textAlign:"center",width:"100%",maxWidth:380}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,2.5vw,15px)",color:"#D9BC5C",textShadow:"3px 3px 0 #0d0d0d,0 0 20px #D9BC5C80",marginBottom:10}}>⚔️ MON LIVRE DE QUÊTES</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:24,color:"#666",marginBottom:36}}>Tu es...?</div>
          <div style={{display:"flex",gap:16,justifyContent:"center"}}>
            {[["🧒","Enfant","#85CDD1",()=>{SFX.click();setMode("child-select");}],
              ["👨‍👩","Parent","#D99248",()=>{SFX.click();setMode("parent");setPpPin("");setPinError(false);}]
            ].map(([icon,label,color,fn])=>(
              <button key={label} onClick={fn}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"20px 22px",background:"rgba(0,0,0,0.7)",color,border:`3px solid ${color}`,borderRadius:10,cursor:"pointer",lineHeight:2.2,minWidth:120,transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 22px ${color}55`;e.currentTarget.style.transform="translateY(-3px)";}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
                <span style={{fontSize:28,display:"block"}}>{icon}</span>{label}
              </button>
            ))}
          </div>
          <button onClick={()=>{SFX.click();setMode("info");}}
            style={{marginTop:28,fontFamily:"'VT323',monospace",fontSize:16,color:"#444",background:"none",border:"none",cursor:"pointer",letterSpacing:1,transition:"color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.color="#888"}
            onMouseLeave={e=>e.currentTarget.style.color="#444"}>
            ℹ️ C'est quoi cette appli?
          </button>
        </div>
      )}

      {/* ── Écran info : Présentation pour enfants ── */}
      {mode === "info" && (
        <div style={{width:"100%",maxWidth:400,display:"flex",flexDirection:"column",gap:0}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,2.2vw,13px)",color:"#D9BC5C",textShadow:"3px 3px 0 #0d0d0d,0 0 20px #D9BC5C80",marginBottom:6}}>⚔️ MON LIVRE DE QUÊTES</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#888"}}>Ton guide d'aventurier·ère</div>
          </div>

          <div style={{background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:12,padding:"16px 18px",marginBottom:12}}>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#85CDD1",marginBottom:8}}>💡 C'est quoi cette appli?</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#ccc",lineHeight:1.5}}>
              Tu fais des tâches dans la vraie vie, et ici tu gagnes des XP et des pièces! Monte de niveau, choisis ton thème, débloque des badges et échange tes pièces contre de vraies récompenses. C'est comme un jeu vidéo, mais les points sont vrais. 🎮
            </div>
          </div>

          {[
            ["📋","Tes Quêtes","C'est ici que tu vois ce que tu dois faire (ranger ta chambre, la vaisselle…). Une fois que tu l'as fait, clique «J'AI FAIT ÇA!» et attends que ton parent valide!"],
            ["⚡","XP & Niveaux","Chaque quête validée te donne de l'XP. Plus tu en accumules, plus tu montes de niveau et débloques un titre cool selon ton thème. Il y a 5 niveaux!"],
            ["🪙","Pièces & Boutique","Les quêtes donnent aussi des pièces. Dans la boutique, tu peux acheter des accessoires pour ton perso ET les récompenses créées par tes parents."],
            ["🎨","13 Thèmes","Minecraft, Harry Potter, Marvel, Ghibli, Roblox… Chaque thème change les couleurs et les titres de toute la page. Tu choisis le tien à ta première connexion!"],
            ["🏅","Badges","Des badges secrets à débloquer en faisant des tâches. Streaks, premières fois, défis épiques… survole un badge pour voir comment le gagner!"],
            ["📅","Calendrier","Note tes devoirs et examens ici! Un rappel va apparaître automatiquement quand la date approche, avec de l'XP bonus pour compléter."],
            ["🎮","Mini-jeux","Quand tu montes de niveau, choisis TOI-MÊME ton mini-jeu! 🎮 Trois jeux possibles: Whack-a-Mole (tape les monstres!), Runner (saute les obstacles!) ou Pac-Quest (mange les pellets, évite le fantôme!). Les paliers de récompense sont affichés avant de jouer — fais un score parfait pour gagner le max de XP et de pièces bonus. 🏆"],
            ["🔒","Portail parent","La section Parent est réservée aux adultes (protégée par un code secret). C'est là qu'ils valident tes quêtes et créent des récompenses. Tu peux aussi avoir ton propre code PIN pour protéger ton profil!"],
          ].map(([icon,title,desc])=>(
            <div key={title} style={{display:"flex",gap:12,background:"rgba(0,0,0,0.35)",border:"1px solid #222",borderRadius:8,padding:"10px 14px",marginBottom:8}}>
              <span style={{fontSize:22,flexShrink:0,marginTop:2}}>{icon}</span>
              <div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginBottom:4}}>{title}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#aaa",lineHeight:1.45}}>{desc}</div>
              </div>
            </div>
          ))}

          <div style={{background:"rgba(93,236,245,0.07)",border:"2px solid #85CDD144",borderRadius:10,padding:"12px 16px",marginTop:4,marginBottom:4}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1",marginBottom:8}}>⚡ COMMENT GAGNER PLUS D'XP?</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ccc",lineHeight:1.7}}>
              📋 Faire tes quêtes du jour (surtout les épiques!)<br/>
              🔥 Garder un <span style={{color:"#D9BC5C"}}>streak</span> — plusieurs jours de suite<br/>
              📅 Valider tes devoirs et examens dans le calendrier<br/>
              🎮 Faire un score parfait au mini-jeu de niveau<br/>
              🏅 Débloquer de nouveaux badges
            </div>
          </div>

          <div style={{textAlign:"center",marginTop:4,marginBottom:8}}>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#333",marginBottom:12}}>v{APP_VERSION}</div>
            <button onClick={()=>{SFX.click();setMode("who");}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px 24px",background:"rgba(0,0,0,0.7)",color:"#D9BC5C",border:"3px solid #D9BC5C",borderRadius:8,cursor:"pointer",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 0 16px #D9BC5C55";}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";}}>
              ← RETOUR
            </button>
          </div>
        </div>
      )}

      {/* ── Écran 2 : Qui es-tu? ── */}
      {mode === "child-select" && (
        <div style={{textAlign:"center",width:"100%",maxWidth:380}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,2.5vw,15px)",color:"#D9BC5C",textShadow:"3px 3px 0 #0d0d0d,0 0 20px #D9BC5C80",marginBottom:10}}>⚔️ MON LIVRE DE QUÊTES</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:22,color:"#666",marginBottom:20}}>Qui es-tu?</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            {(config?.players||[]).map((pl, i) => {
              const psi = gameStates[i] || {};
              const isNew = !psi.avatar?.configured && !psi.pin;
              return (
                <button key={pl.id} onClick={()=>handleChildSelect(i)}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px 16px 10px 10px",background:"rgba(0,0,0,0.7)",color:pl.color,border:`3px solid ${pl.color}`,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"all 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 16px ${pl.color}55`;e.currentTarget.style.transform="translateX(4px)";}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
                  {/* v2.5.12 — portrait avatar bien visible (avant: 36px noyé dans la ligne) : même cadre
                      carré à coins arrondis que les avatars de la Vue Famille (FamilySpace) et du profil. */}
                  <AvatarCanvas avatarDef={psi.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(pl.themeId).charBodyColor||pl.color} size={56}
                    style={{flexShrink:0,border:`2px solid ${pl.color}`,borderRadius:8,background:`${pl.color}15`}}/>
                  <span style={{flex:1,textAlign:"left"}}>{pl.name}</span>
                  {isNew && <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#5CAD68",fontWeight:"bold"}}>NOUVEAU ✨</span>}
                  {!isNew && psi.pin && <span style={{color:"#444",fontSize:12}}>🔑</span>}
                </button>
              );
            })}
            <button onClick={()=>{SFX.click();onNewSetup?.();}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"14px 16px",background:"rgba(0,0,0,0.5)",color:"#4ade80",border:"3px dashed #4ade8066",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"safe center",gap:10,transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#4ade80";e.currentTarget.style.boxShadow="0 0 16px #4ade8033";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#4ade8066";e.currentTarget.style.boxShadow="none";}}>
              📖 Nouveau livre de quêtes
            </button>
          </div>
          <BtnBack onClick={()=>setMode("who")}/>
        </div>
      )}

      {/* ── Onboarding 1er login ── */}
      {mode === "onboarding" && player && (
        <div style={{width:"100%",maxWidth:400,textAlign:"center"}}>

          {/* Étape 1 : Thème */}
          {obStep === "theme" && (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>🎨 TON THÈME · ÉTAPE 1/4</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#888",marginBottom:4}}>Touche l'univers que tu préfères</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#666",marginBottom:20}}>⏳ Ce thème dure toute la semaine — choisis bien!</div>
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
                {(player.starterThemes||[player.themeId||"none"]).map(tid=>{
                  const t = getPlayerTheme(tid);
                  const sel = draftTheme === tid;
                  return (
                    <button key={tid} onClick={()=>{SFX.click();setDraftTheme(tid);}}
                      style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"14px 16px",background:sel?`${t.primary}30`:"rgba(0,0,0,0.7)",color:sel?t.accent:"#888",border:`3px solid ${sel?t.accent:"#333"}`,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",transition:"all 0.15s",boxShadow:sel?`0 0 16px ${t.accent}40`:"none"}}>
                      <span style={{fontSize:28}}>{t.icon}</span>
                      <span style={{flex:1}}>{t.name}</span>
                      {sel&&<span style={{fontSize:16}}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {draftTheme && (
                <button onClick={()=>{SFX.click();setObStep("avatar");}}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>
                  Continuer →
                </button>
              )}
              <div><BtnBack onClick={()=>{setMode("child-select");setSelIdx(null);}}/></div>
            </div>
          )}

          {/* Étape 2 : Avatar */}
          {obStep === "avatar" && (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>👾 TON AVATAR · ÉTAPE 2/4</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#888",marginBottom:4}}>Crée ton personnage 8-bit</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#666",marginBottom:12}}>Touche un onglet (Cheveux, Peau…) puis touche ce que tu aimes.</div>
              <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
                <AvatarCanvas avatarDef={draftAvatar} bodyColor={getPlayerTheme(draftTheme||"none").charBodyColor||accentColor} size={80}
                  style={{border:`3px solid ${accentColor}`,borderRadius:8}}/>
              </div>
              {/* Silhouette (demande Gen 2026-07-27) — choix à la création de compte. Pas d'effet
                  visuel sur le rendu procédural : sélectionnera le personnage détaillé (chantier E). */}
              <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:10}}>
                {AVATAR_PARTS.build.map(b=>(
                  <button key={b.id} onClick={()=>{setDraftAvatar(d=>({...d,build:b.id}));SFX.click();}}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:(draftAvatar.build||"bd_ado")===b.id?accentColor:"#1a1a1a",color:(draftAvatar.build||"bd_ado")===b.id?"#0d0d0d":"#888",border:`2px solid ${(draftAvatar.build||"bd_ado")===b.id?accentColor:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                    {b.emoji} {b.label}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:10,flexWrap:"wrap"}}>
                {[["hair","Cheveux"],["skin","Peau"],["eyes","Yeux"],["mouth","Bouche"]].map(([k,l])=>(
                  <button key={k} onClick={()=>{setAvatarTab(k);SFX.click();}}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 8px",background:avatarTab===k?accentColor:"#1a1a1a",color:avatarTab===k?"#0d0d0d":"#666",border:`2px solid ${avatarTab===k?accentColor:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{maxHeight:150,overflowY:"auto",marginBottom:14}}>
                {avatarTab === "hair" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                    {AVATAR_PARTS.hair.map(h=>(
                      <div key={h.id} onClick={()=>{setDraftAvatar(a=>({...a,hair:h.id}));SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 4px",background:draftAvatar.hair===h.id?`${h.color}30`:"rgba(0,0,0,0.5)",border:`2px solid ${draftAvatar.hair===h.id?h.color:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                        <div style={{width:24,height:12,background:h.color,borderRadius:"3px 3px 0 0",border:"1px solid #0d0d0d"}}/>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:10,color:"#ccc"}}>{h.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {avatarTab === "skin" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                    {AVATAR_PARTS.skin.map(s=>(
                      <div key={s.id} onClick={()=>{setDraftAvatar(a=>({...a,skin:s.id}));SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 4px",background:draftAvatar.skin===s.id?`${s.color}30`:"rgba(0,0,0,0.5)",border:`2px solid ${draftAvatar.skin===s.id?s.color:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                        <div style={{width:24,height:24,background:s.color,borderRadius:3,border:"1px solid #0d0d0d"}}/>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:10,color:"#ccc"}}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {avatarTab === "eyes" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                    {AVATAR_PARTS.eyes.map(e=>(
                      <div key={e.id} onClick={()=>{setDraftAvatar(a=>({...a,eyes:e.id}));SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",background:draftAvatar.eyes===e.id?`${e.eyeColor}20`:"rgba(0,0,0,0.5)",border:`2px solid ${draftAvatar.eyes===e.id?e.eyeColor:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                        <span style={{fontSize:22}}>{e.emoji}</span>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:10,color:"#ccc"}}>{e.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {avatarTab === "mouth" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                    {AVATAR_PARTS.mouth.map(m=>(
                      <div key={m.id} onClick={()=>{setDraftAvatar(a=>({...a,mouth:m.id}));SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",background:draftAvatar.mouth===m.id?`${m.color}20`:"rgba(0,0,0,0.5)",border:`2px solid ${draftAvatar.mouth===m.id?m.color:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                        <span style={{fontSize:22}}>{m.emoji}</span>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:10,color:"#ccc"}}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={()=>{SFX.click();setObStep("pseudo");}}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>
                Continuer →
              </button>
              <div><BtnBack onClick={()=>setObStep("theme")}/></div>
            </div>
          )}

          {/* Étape 3 : Surnom */}
          {obStep === "pseudo" && (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>✏️ TON SURNOM · ÉTAPE 3/4</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#888",marginBottom:6}}>Comment veux-tu t'appeler?</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:20}}>Ton vrai nom reste privé pour tes parents.</div>
              <input
                value={draftPseudo}
                onChange={e=>setDraftPseudo(e.target.value.slice(0,16))}
                placeholder={player.name}
                maxLength={16}
                autoFocus
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 16px",background:"rgba(0,0,0,0.7)",color:accentColor,border:`3px solid ${accentColor}`,borderRadius:6,width:"100%",textAlign:"center",outline:"none",marginBottom:20,boxSizing:"border-box"}}
              />
              <button onClick={()=>{SFX.click();setObStep("pin-create");setObPin("");setObFirstPin("");}}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>
                Continuer →
              </button>
              <div><BtnBack onClick={()=>setObStep("avatar")}/></div>
            </div>
          )}

          {/* Étape 4 : PIN création/confirmation */}
          {(obStep === "pin-create" || obStep === "pin-confirm") && (
            <div style={{background:`linear-gradient(160deg,rgba(0,0,0,0.9),${accentColor}10)`,border:`3px solid ${accentColor}`,borderRadius:12,padding:"24px 28px"}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
                <AvatarCanvas avatarDef={draftAvatar} bodyColor={getPlayerTheme(draftTheme||"none").charBodyColor||accentColor} size={52}
                  style={{border:`3px solid ${accentColor}`,borderRadius:8}}/>
              </div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:4}}>
                {obStep==="pin-create" ? "CRÉE TON CODE SECRET · ÉTAPE 4/4" : "CONFIRME TON CODE · ÉTAPE 4/4"}
              </div>
              {obStep==="pin-create"&&<div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:12}}>Choisis 4 chiffres faciles à retenir pour TOI. C'est ton code pour entrer dans ton compte.</div>}
              <PinDots value={obPin} error={pinError} color={accentColor}/>
              <PinKeypad
                onDigit={handleObPinDigit}
                onBack={()=>setObPin(p=>p.slice(0,-1))}
                onClose={()=>{ obStep==="pin-confirm"?( setObStep("pin-create"),setObFirstPin(""),setObPin("") ):(setObStep("pseudo")); }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── PIN joueur retour ── */}
      {mode === "pin" && player && (
        <div style={{background:`linear-gradient(160deg,rgba(0,0,0,0.9),${accentColor}10)`,border:`3px solid ${accentColor}`,borderRadius:12,padding:"24px 28px",textAlign:"center",maxWidth:300,width:"100%"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
            <AvatarCanvas avatarDef={ps.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(player.themeId).charBodyColor||accentColor} size={52}
              style={{border:`3px solid ${accentColor}`,borderRadius:8}}/>
          </div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:accentColor,marginBottom:4}}>{displayName(player)}</div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:16,lineHeight:1.8}}>
            {!ps.pin ? (confirmStep ? "CONFIRME TON CODE" : "CRÉE TON CODE SECRET") : "TON CODE SECRET"}
          </div>
          {!ps.pin&&!confirmStep&&<div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:12}}>Choisis 4 chiffres que tu n'oublies pas...</div>}
          <PinDots value={pPin} error={pinError} color={accentColor}/>
          <PinKeypad
            onDigit={handlePlayerDigit}
            onBack={()=>{ pPinRef.current=pPinRef.current.slice(0,-1); setPPin(pPinRef.current); }}
            onClose={()=>{ if(confirmStepRef.current){confirmStepRef.current=false;setConfirmStep(false);firstPinRef.current="";setFirstPin("");pPinRef.current="";setPPin("");}else{setMode("child-select");setSelIdx(null);} }}
            onSubmit={pPin.length===4?doPlayerSubmit:undefined}
          />
          {pPin.length===4&&<button onClick={doPlayerSubmit} style={{marginTop:10,width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"10px 0",background:accentColor,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>✅ VALIDER</button>}
        </div>
      )}

      {/* ── PIN parent ── */}
      {mode === "parent" && (
        <div style={{background:"rgba(0,0,0,0.85)",border:"3px solid #D99248",borderRadius:12,padding:"24px 28px",textAlign:"center",maxWidth:300,width:"100%"}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#D99248",marginBottom:16}}>🔐 PIN PARENT</div>
          <PinDots value={ppPin} error={pinError} color="#D99248"/>
          <PinKeypad
            onDigit={handleParentDigit}
            onBack={()=>{ ppPinRef.current=ppPinRef.current.slice(0,-1); setPpPin(ppPinRef.current); }}
            onClose={()=>{setMode("who");setPpPin("");setPinError(false);}}
            onSubmit={ppPin.length===4?doParentSubmit:undefined}
          />
          {ppPin.length===4&&<button onClick={doParentSubmit} style={{marginTop:10,width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"10px 0",background:"#D99248",color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>✅ VALIDER</button>}
        </div>
      )}

      <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#2a2a2a",marginTop:24}}>v{APP_VERSION}</div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("loading"); // loading|setup|login|game
  const [config, setConfig] = useState(null);
  const [gameStates, setGameStates] = useState([]); // per-player
  const [view, setView] = useState("family"); // "family"|0|1|2|3
  const [parentPinOpen, setParentPinOpen] = useState(false);
  const [parentMode, setParentMode] = useState(false);
  const [sessionPlayer, setSessionPlayer] = useState(null); // enfant connecté (idx) — null = parent/aucun
  const [returnToPlayer, setReturnToPlayer] = useState(null); // v2.5.3 (Correctif 3) — enfant à restaurer en sortant du mode parent, SEULEMENT si on y est entré depuis sa session (pas depuis l'écran de login)
  const [editingBook, setEditingBook] = useState(false); // true = "Modifier le livre" (édite la config existante)
  const [parentPanel, setParentPanel] = useState(false); // slide-out panel
  const [hamOpen, setHamOpen] = useState(false); // menu ☰ enfant (piloté depuis le header)
  const [timerRitual, setTimerRitual] = useState(null); // rituel pré-sélectionné en ouvrant la minuterie
  // v2.6.6 — calendrier consolidé (menu du bas) : formulaire d'ajout/modification pour l'enfant connecté.
  const [myCalOpen, setMyCalOpen] = useState(false);
  const [myCalForm, setMyCalForm] = useState({ editId:null, ownerIdx:null, type:"evenement", label:"", date:"", time:"", recur:"none", day:0 });
  const [myCalTargets, setMyCalTargets] = useState([]); // v2.15.0 — enfant(s) ciblé(s) par un ajout en mode parent (checkboxes, comme l'ancien onglet parent retiré)
  const [actionLog, setActionLog] = useState([]); // [{time,msg,color}]
  const [undoStack, setUndoStack] = useState([]);
  const [pinChangeMode, setPinChangeMode] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [toast, setToast] = useState(null);
  const [rewardPopup, setRewardPopup] = useState(null);
  const [bossWin, setBossWin] = useState(null); // v1.72.0 — célébration de victoire de boss
  const [miniGame, setMiniGame] = useState(null); // {player,playerIdx,level,playerThemeId,pendingReward}
  const [syncedAt, setSyncedAt] = useState(0); // dernier instant de synchro cloud réussie
  const [now, setNow] = useState(new Date());

  // v1.94.0 (Lot 5 #22) — ralenti de 1s à 30s : rien ici (barre de progression, compte à
  // rebours, indicateur de synchro) n'a besoin d'une précision à la seconde près, et ce
  // tick re-render tout l'arbre App() (voir HeaderClock ci-dessus pour l'affichage H:M
  // qui, lui, garde un tick de 1s mais isolé dans son propre composant).
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),30000); return()=>clearInterval(i); },[]);

  // Load + migration automatique des données
  useEffect(()=>{
    load().then(raw=>{
      const data = migrateSavedData(raw);
      if(data?.config&&data?.gameStates){
        // 🧹 Nettoyage des tâches « à usage unique » d'un jour passé (anti-accumulation)
        const today=todayStamp();
        const expired=(data.config.assignments||[]).filter(a=>a.oneDay && a.oneDay!==today).map(a=>a.instanceId);
        if(expired.length){
          const rm=new Set(expired);
          data.config={...data.config,
            assignments:(data.config.assignments||[]).filter(a=>!rm.has(a.instanceId)),
            removedAssignments:_uniq([...(data.config.removedAssignments||[]), ...expired]).slice(-800)};
        }
        // 🧹 v1.55.0 — ménage des tâches perso ORPHELINES (plus aucune assignation) → tombstone durable
        // v2.15.8 (CAUSE RACINE de la casse généralisée des tâches perso de toute la famille, trouvée
        // le 2026-07-28 en reconstruisant les rituels Matin/École/Camp/Soir) : ce ménage tournait à
        // CHAQUE chargement, sur CHAQUE appareil, sans aucune protection, avec deux failles combinées :
        // (1) ne regardait QUE config.assignments, jamais config.weeklyQuests.assignments (Lot 7) ;
        // (2) tournait même quand load() retombait sur la copie LOCALE seule après un échec réseau
        // (LAST_LOAD_SYNCED=false — serveur Canner qui se réveille, ~1-4s, ou simple délai wifi,
        // documenté dans SYNC.md) — une copie locale peut alors être périmée (n'a pas encore vu les
        // assignations créées ailleurs depuis sa dernière vraie synchro), faisant passer des tâches
        // BIEN VIVANTES pour orphelines, tombstonées pour toujours et repoussées au cloud aussitôt
        // (save() plus bas). Fix : n'agir QUE sur une synchro cloud confirmée, et inclure weeklyQuests.
        if (LAST_LOAD_SYNCED) {
          const usedTaskIds=new Set([...(data.config.assignments||[]).map(a=>a.taskId), ...((data.config.weeklyQuests||{}).assignments||[]).map(a=>a.taskId)]);
          const orphans=(data.config.customTasks||[]).filter(t=>t&&t.id&&!usedTaskIds.has(t.id)).map(t=>t.id);
          if(orphans.length){
            const orphSet=new Set(orphans);
            data.config={...data.config,
              customTasks:(data.config.customTasks||[]).filter(t=>!orphSet.has(t.id)),
              removedCustomTasks:_uniq([...(data.config.removedCustomTasks||[]), ...orphans]).slice(-1000)};
          }
        }
        setConfig(data.config);
        setGameStates(data.gameStates);
        // Toujours persister les données migrées (pin par défaut, seenVersions, etc.)
        save({...data, newChangelogVersions:[]});
        // Injecter les nouvelles versions dans le feed famille
        if(data.newChangelogVersions?.length){
          const newEntries = data.newChangelogVersions
            .map(v=>CHANGELOG.find(c=>c.version===v))
            .filter(Boolean)
            .map(c=>({ type:"update", version:c.version, features:c.features, ts:new Date().toISOString() }));
          setConfig(cfg=>({...cfg, updateFeedEntries: dedupeUpdateFeed([...(cfg.updateFeedEntries||[]),...newEntries])})); // v2.5.29 — fini l'accumulation sans plafond (2,35 Mo en prod)
        }
        // Les tâches en attente d'hier restent simplement dans la file
        // "À valider" du portail parent (plus de modal en libre-service).
        setScreen("login");
      } else setScreen("setup"); // No valid saved data → first-time setup
    });
  },[]);

  const persist = useCallback((cfg,gs) => save({config:cfg,gameStates:gs,savedAt:new Date().toISOString()}), []);

  // Refs pour lire l'état courant dans des callbacks (fil de famille)
  const cfgRef = useRef(config); cfgRef.current = config;
  const gsRef = useRef(gameStates); gsRef.current = gameStates;
  const viewRef = useRef(view); viewRef.current = view; // pour ne pas casser l'écran courant pendant la sync
  // v1.90.0 — capture globale des erreurs JS techniques → config.errorLogs (synced comme config.bugs),
  // pour aider au troubleshooting à distance (voir MAINTENANCE.md, chantier "logs techniques" du 21
  // juillet). Discret : aucune UI enfant, lisible seulement par le parent (ParentPanel, onglet Journal)
  // et par les passes de maintenance qui lisent /api/famille. Anti-spam : même erreur < 1 min ignorée
  // (évite qu'une erreur qui boucle remplisse les 80 places d'un coup).
  const lastErrRef = useRef({ key: "", ts: 0 });
  useEffect(() => {
    const logError = (message, stack, source) => {
      const key = (message || "") + "|" + (stack || "").slice(0, 200);
      const now = Date.now();
      if (lastErrRef.current.key === key && now - lastErrRef.current.ts < 60000) return;
      lastErrRef.current = { key, ts: now };
      const cfg = cfgRef.current || {};
      const who = (() => { const v = viewRef.current; return typeof v === "number" ? (cfg.players?.[v]?.name || "?") : "?"; })();
      const entry = { id: "err_" + uid(), ts: now, who, message: (message || "").slice(0, 300), stack: (stack || "").slice(0, 500), source: source || "", appVersion: APP_VERSION };
      const n = { ...cfg, errorLogs: [entry, ...(cfg.errorLogs || [])].slice(0, 80) };
      setConfig(n); persist(n, gsRef.current);
    };
    const onError = (event) => { try { logError(event.message, event.error?.stack, event.filename); } catch {} };
    const onRejection = (event) => { try { const r = event.reason; logError(r?.message || String(r), r?.stack, "promise"); } catch {} };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, [persist]);
  // Ajoute une entrée au fil de famille (auto: quêtes, niveaux; manuel: chat)
  const pushFeed = useCallback((entry)=>{
    const cfg=cfgRef.current||{}; const fe={ id:"f_"+uid(), ts:Date.now(), likes:[], ...entry };
    const n={...cfg, feed:[fe,...(cfg.feed||[])].slice(0,60)};
    setConfig(n); persist(n, gsRef.current);
  },[persist]);
  const toggleFeedLike = useCallback((feedId, byId)=>{
    const cfg=cfgRef.current||{};
    const feed=(cfg.feed||[]).map(f=> f.id!==feedId ? f : {...f, likes: (f.likes||[]).includes(byId) ? f.likes.filter(x=>x!==byId) : [...(f.likes||[]),byId]});
    const n={...cfg, feed}; setConfig(n); persist(n, gsRef.current);
  },[persist]);

  // ── Boucle de sync : tire les changements faits sur les autres appareils ──
  // (remotePull retourne null en ~0ms si aucun mode sync n'est disponible)
  useEffect(()=>{
    let stop=false;
    const tick=async()=>{
      const remote=await remotePull();
      if(stop||!remote||remote===PULL_FAILED)return; // rien à faire si cloud vide ou échec réseau
      let local=null; try{const r=localStorage.getItem(STORE_KEY); if(r)local=JSON.parse(r);}catch{}
      // Pas de local : on adopte le remote s'il est plus récent (comportement d'origine)
      if(!local){
        if(isNewer(remote.savedAt, LAST_SAVED_AT)){
          const data=migrateSavedData(remote);
          if(data?.config&&data?.gameStates){
            LAST_SAVED_AT=data.savedAt;
            try{localStorage.setItem(STORE_KEY,JSON.stringify(data));}catch{}
            setConfig(data.config); setGameStates(data.gameStates);
          }
        }
        return;
      }
      // Les deux existent → fusion non-destructive
      const merged=mergeFamily(local, remote);
      // ⚠️ Ne pas casser l'écran de l'enfant qui joue : on garde SON mode/rituel courant
      // (sinon la sync d'un autre appareil le ramène ailleurs au bout de 25s).
      const vi=viewRef.current;
      if(typeof vi==="number" && merged.gameStates?.[vi] && gsRef.current?.[vi]){
        merged.gameStates[vi]={...merged.gameStates[vi], mode:gsRef.current[vi].mode, activeRoutineId:gsRef.current[vi].activeRoutineId};
      }
      if(_famSig(merged)!==_famSig(local)){
        merged.savedAt=new Date().toISOString();
        const data=migrateSavedData(merged);
        if(data?.config&&data?.gameStates){
          LAST_SAVED_AT=data.savedAt;
          try{localStorage.setItem(STORE_KEY,JSON.stringify(data));}catch{}
          setConfig(data.config); setGameStates(data.gameStates);
          remotePush(data);
        }
      } else if(isNewer(local.savedAt, remote.savedAt)){
        remotePush(local); // contenu identique mais le cloud est en retard → on le remet à jour
      }
    };
    const iv=setInterval(tick,25000); // toutes les 25s
    const onVis=()=>{ if(document.visibilityState==="visible") tick(); }; // + au retour sur l'app
    document.addEventListener("visibilitychange",onVis);
    return ()=>{ stop=true; clearInterval(iv); document.removeEventListener("visibilitychange",onVis); };
  },[]);

  // Indicateur de synchro : écoute les synchros cloud réussies (push/pull)
  useEffect(()=>{
    const onSync=()=>setSyncedAt(Date.now());
    window.addEventListener("lq-synced",onSync);
    return ()=>window.removeEventListener("lq-synced",onSync);
  },[]);

  // v1.79.0 — FILET DE SÉCURITÉ victoire du boss (fix "boss jamais vaincu")
  // Avant : la victoire n'était calculée QUE dans handleBossAttack/handleBossPetAttack, au moment d'un clic.
  // Si les dégâts cumulés dépassaient déjà les PV (ex: dégâts arrivés par synchro d'un autre appareil APRÈS
  // le dernier clic, ou tous les jetons de la famille dépensés avant que le total franchisse le seuil),
  // plus personne ne pouvait re-déclencher le calcul de victoire → boss bloqué pour toujours, sans le jeu
  // de fin ni les récompenses (vécu avec l'Hydre à deux têtes du 1er juillet, jamais vaincue malgré des
  // dégâts cumulés très supérieurs à ses PV). Ce filet réévalue la victoire à CHAQUE changement d'état
  // (sync, validation de quête…), pas seulement au clic — donc impossible de rester bloqué.
  useEffect(()=>{
    const boss = cfgRef.current?.boss;
    if(!boss || boss.defeatedAt) return;
    const HPMAX = boss.hpMax||80;
    const totalDmg = bossDamageTotal(gameStates, boss.startedAt, cfgRef.current?.repairEvents); // v2.6.0 — inclut les réparations 🕊️
    if(totalDmg < HPMAX) return;
    if(!bossQuestsAllDone(cfgRef.current, gameStates)) return;
    const bid = boss.startedAt;
    if(gameStates.some(g=>g.bossClaimed===bid)) return; // v2.5.25 — idempotence : un autre chemin (clic attaque/familier) a déjà accordé la victoire pour ce boss
    const now = new Date().toISOString();
    const n = gameStates.map(g=>{
      const _it = pickUltraLegendary();
      return {...g, coins:(g.coins||0)+40, coinsLifetime:(g.coinsLifetime||0)+40, xp:(g.xp||0)+50,
        owned:[...new Set([...(g.owned||[]), _it.id])],
        badges:[...new Set([...(g.badges||[]),"b_boss"])],
        bossClaimed: bid,
        pendingCelebrations:[...(g.pendingCelebrations||[]), {id:"c_"+uid(), bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]};
    });
    const nb = {...boss, defeatedAt:now};
    const fe = {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`};
    const ncfg = {...cfgRef.current, boss:nb, feed:[fe,...(cfgRef.current.feed||[])].slice(0,60)};
    setConfig(ncfg); setGameStates(n); persist(ncfg, n);
  },[gameStates, config?.boss, config?.repairEvents]); // v2.6.0 — re-évalue aussi quand une réparation 🕊️ ajoute des dégâts

  // v2.6.0 — 🕊️ Effet collectif des quêtes de réparation. Exactly-once : config.repairEvents
  // (union-by-id des deux côtés du merge, id = instanceId de l'assignation) — un event existe ⇒
  // l'effet a déjà été accordé, même après fusion multi-appareils. Actif SEULEMENT en mode parent :
  // le portail est ouvert au moment de la DERNIÈRE validation (approvePending), donc un seul
  // appareil détecteur en pratique — fenêtre de course quasi nulle, et l'union-by-id couvre le reste.
  // ⚠️ Ne JAMAIS stocker sur config.boss (merge shallow last-write-wins).
  useEffect(()=>{
    if(!parentMode) return;
    const cfg = cfgRef.current; if(!cfg?.players?.length) return;
    const granted = new Set((cfg.repairEvents||[]).map(e=>e.id));
    const ready = (cfg.assignments||[]).filter(a =>
      a.repair && Array.isArray(a.playerIds) && a.playerIds.length>=2 && !granted.has(a.instanceId) &&
      a.playerIds.every(pid=>{
        const idx=(cfg.players||[]).findIndex(p=>p.id===pid); if(idx<0) return false;
        const key=a.instanceId+"_"+pid+"#"+(a.oneDay||todayStamp());
        return (gameStates[idx]?.completed||[]).includes(key);
      }));
    if(!ready.length) return;
    const boss = (cfg.boss && !cfg.boss.defeatedAt) ? cfg.boss : null;
    let n = gameStates; let feed = [...(cfg.feed||[])]; const events = [...(cfg.repairEvents||[])];
    const nameOf = pid => { const pl=(cfg.players||[]).find(p=>p.id===pid); return pl ? displayName(pl) : null; };
    for(const a of ready){
      const names = a.playerIds.map(nameOf).filter(Boolean);
      const listTxt = names.length>1 ? names.slice(0,-1).join(", ")+" et "+names[names.length-1] : (names[0]||"");
      if(boss){
        const bid=boss.startedAt, HPMAX=boss.hpMax||80;
        const cur = bossDamageTotal(n, bid, events);
        // Cap HPMAX-1 si le verrou des corvées du boss est actif (même règle que les attaques)
        const room = bossQuestsAllDone(cfg, n) ? 50 : Math.max(0,(HPMAX-1)-cur);
        const dmg = Math.min(50, room);
        events.push({ id:a.instanceId, bossStartedAt:bid, dmg, bonusCoins:0, ts:Date.now() });
        feed.unshift({ id:"f_"+uid(), ts:Date.now(), likes:[], type:"repair", playerId:"parent", emoji:"🕊️", text:`🕊️ ${listTxt} ont réparé quelque chose ensemble — le boss recule de ${dmg} PV!` });
      } else {
        events.push({ id:a.instanceId, bossStartedAt:null, dmg:0, bonusCoins:10, ts:Date.now() });
        n = n.map((g,i)=> a.playerIds.includes((cfg.players||[])[i]?.id) ? {...g, coins:(g.coins||0)+10, coinsLifetime:(g.coinsLifetime||0)+10} : g);
        feed.unshift({ id:"f_"+uid(), ts:Date.now(), likes:[], type:"repair", playerId:"parent", emoji:"🕊️", text:`🕊️ ${listTxt} ont réparé quelque chose ensemble — la famille a retrouvé son équilibre! +10 🪙 chacun` });
      }
    }
    const ncfg = {...cfg, repairEvents:events, feed:feed.slice(0,60)};
    setConfig(ncfg); if(n!==gameStates) setGameStates(n); persist(ncfg, n);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gameStates, parentMode]);

  // Lot 7A — génération auto des quêtes récurrentes au début de chaque semaine de garde
  useEffect(()=>{
    if(!config?.players?.length) return;
    const cwk = custodyWeekKey();
    if(isCustodyWeek() && config.weeklyQuests?.generatedForWeek !== cwk){
      const newAss = generateCustodyWeekAssignments(config.players, cwk);
      const n = {...config, weeklyQuests:{ generatedForWeek:cwk, assignments:newAss }};
      setConfig(n); persist(n, gameStates);
    } else if(!isCustodyWeek() && config.weeklyQuests?.generatedForWeek){
      // Semaine de pause — vider les quêtes récurrentes
      const n = {...config, weeklyQuests: null};
      setConfig(n); persist(n, gameStates);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[config?.players, config?.weeklyQuests?.generatedForWeek]);

  // v2.6.2 — Défi hebdo GRADUÉ (décision Gen 26 juillet) : fini le tout-ou-rien du « défi parfait ».
  // Paliers 3/5/7 jours cochés (NON consécutifs — rien ne se perd, aucun reproche sous 3 jours),
  // payés dès qu'atteints : +10 🪙, +15 🪙, +25 🪙 + badge « Maître de soi » au 7/7.
  // Remplace le cadre fantôme frame_maitre_de_soi (jamais défini dans aucun catalogue — bug #2
  // de l'analyse game design) et l'écriture pendingCelebration au singulier que rien ne lisait
  // (bug #1). Idempotence multi-appareils : payé UNIQUEMENT sur l'appareil de l'enfant connecté
  // (sessionPlayer), marqueur semaine+paliers dans SON gameState (challengeTiers).
  useEffect(()=>{
    if(parentMode || sessionPlayer==null) return;
    if(!config?.weeklyChallenge?.challenges?.length) return;
    const cwk = custodyWeekKey();
    if(config.weeklyChallenge.weekKey && config.weeklyChallenge.weekKey!==cwk) return; // défi d'une autre semaine
    const player=config.players[sessionPlayer]; if(!player) return;
    const ch=config.weeklyChallenge.challenges.find(c=>c.playerId===player.id); if(!ch) return;
    const nDays=challengeDaysCount(ch.checkins, cwk);
    if(nDays<CHALLENGE_TIERS[0].days) return;
    setGameStates(gs=>{
      const s=gs[sessionPlayer]; if(!s) return gs;
      const claimed=(s.challengeTiers&&s.challengeTiers.week===cwk)?(s.challengeTiers.tiers||[]):[];
      const due=CHALLENGE_TIERS.filter(t=>nDays>=t.days && !claimed.includes(t.days));
      if(!due.length) return gs;
      const coins=due.reduce((a,t)=>a+t.coins,0);
      const hit7=due.some(t=>t.days===7);
      const newBadge=hit7 && !(s.badges||[]).includes("b_maitre");
      const celeb={ id:"c_"+uid(), level:null, taskEmoji:ch.emoji||"🌟",
        taskLabel:`Défi de la semaine : ${nDays} jour${nDays>1?"s":""} réussi${nDays>1?"s":""}!`,
        xp:0, coins, themeId:player.themeId||"none",
        badges:newBadge?[{id:"b_maitre",emoji:"🧘",name:"Maître de soi"}]:[] };
      const n=[...gs];
      n[sessionPlayer]={...s,
        coins:(s.coins||0)+coins, coinsLifetime:(s.coinsLifetime||0)+coins,
        badges:hit7?[...new Set([...(s.badges||[]),"b_maitre"])]:(s.badges||[]),
        challengeTiers:{week:cwk, tiers:[...claimed, ...due.map(t=>t.days)]},
        pendingCelebrations:[...(s.pendingCelebrations||[]), celeb]};
      persist(config,n);
      return n;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[config?.weeklyChallenge, sessionPlayer, parentMode]);

  const showToast = useCallback((msg,color="",dur=3000)=>{ setToast({msg,color}); setTimeout(()=>setToast(null),dur); },[]);
  const logAction = useCallback((msg,color="#D99248")=>{
    const entry={time:new Date().toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit"}),msg,color};
    setActionLog(l=>[entry,...l.slice(0,19)]);
  },[]);

  const todayDayIdx = (now.getDay()+6)%7; // Mon=0

  // Report des tâches récurrentes non faites (carry-over, approuvé par Gen le 2026-07-25) — Lun-Jeu seulement.
  useEffect(()=>{
    if(!isCustodyWeek()) return;
    if(!config?.weeklyQuests?.assignments?.length) return;
    const { assignments: nextAss, changed } = carryOverUnfinishedTasks(config.weeklyQuests.assignments, gameStates, config.players, todayDayIdx);
    if(!changed) return;
    const n = {...config, weeklyQuests:{...config.weeklyQuests, assignments: nextAss}};
    setConfig(n); persist(n, gameStates);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[config?.weeklyQuests?.assignments, todayDayIdx]);

  // Handle setup complete
  const handleSetupDone = useCallback((cfg) => {
    const gs = cfg.players.map(()=>({ xp:0, coins:0, completed:[], pending:[], owned:[], equipped:{}, boughtRewards:[], badges:[], pin:null }));
    setConfig(cfg); setGameStates(gs); setScreen("login"); setView("family");
    persist(cfg,gs);
    setTimeout(()=>SFX.welcome(),300);
  },[persist]);

  // Request complete
  // L'enfant envoie sa tâche en validation — autonome, pas de code à entrer.
  // Le parent valide ensuite depuis le portail (onglet "À valider").
  const requestComplete = useCallback((ass,playerId) => {
    const playerIdx = config.players.findIndex(p=>p.id===playerId);
    if(playerIdx<0)return;
    const gs=gameStates[playerIdx];
    // Calendrier = clé sans date (persiste jusqu'à l'examen); tâches = clé du jour (reset quotidien)
    const isCal=String(ass.instanceId).startsWith("cal_");
    const doneKey=isCal ? ass.instanceId+"_"+playerId : ass.instanceId+"_"+playerId+"#"+todayStamp();
    if(gs.completed?.includes(doneKey)||gs.pending?.includes(doneKey))return;
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],pending:[...new Set([...(n[playerIdx].pending||[]),doneKey])]}; persist(config,n); return n; });
    // v2.6.2 — gratification instantanée (décision Gen 26 juillet) : le TAP lui-même est célébré
    // (mini pluie d'étoiles, gardée par CALM à l'intérieur de spawnParticles + son léger), même si
    // l'octroi réel d'XP/pièces reste 100 % à la validation parent. Modèle Joon : le cerveau TDAH a
    // besoin d'un retour immédiat — sans tricher sur la supervision.
    try{ const _t=[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId); spawnParticles(_t?.emoji||"⭐", false); SFX.click&&SFX.click(); }catch{}
    // v2.5.28 (item #6 analyse game design) — l'info « familier pas nourri = pas d'XP » existait mais
    // n'était montrée nulle part au bon moment. L'XP familier est accordée à la VALIDATION parent
    // (petFedToday, ~5385), donc nourrir plus tard aujourd'hui compte encore — le message est une
    // invitation douce, pas une punition (un seul toast à la fois, d'où le message combiné).
    const petHungry = !!gs.equipped?.pet && gs.lastFedDay !== todayStamp();
    if(petHungry) showToast("📨 Envoyée à tes parents! 🍖 Psst : ton familier a faim — nourris-le aujourd'hui pour qu'il gagne de l'XP avec tes quêtes!","#85CDD1",5500);
    else showToast("📨 Envoyée à tes parents pour validation!","#85CDD1",3500);
  },[config,gameStates,persist,showToast]);

  // Retrouve la tâche (catalogue, perso ou calendrier) derrière un doneKey
  const resolvePendingTask = useCallback((playerIdx, doneKey)=>{
    const base=doneKey.split("#")[0]; // retire le tampon de date éventuel
    const instanceId=base.slice(0,base.lastIndexOf("_"));
    if(instanceId.startsWith("cal_")){
      const entry=(gameStates[playerIdx]?.calendar||[]).find(e=>"cal_"+e.id===instanceId);
      if(!entry)return null;
      const exam=entry.type==="examen";
      return { emoji:exam?"📝":"📚", label:(exam?"Étudier: ":"Devoir: ")+entry.label, xp:exam?20:10, coins:exam?5:3 };
    }
    const allAss=[...(config.assignments||[]),...(config.weeklyQuests?.assignments||[])];
    const ass=allAss.find(a=>a.instanceId===instanceId);
    if(!ass)return null;
    return [...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId)||null;
  },[config,gameStates]);

  // Validation parent (portail) : donne XP/pièces/badges + popup/mini-jeu
  const approvePending = useCallback((playerIdx, doneKey)=>{
    const task=resolvePendingTask(playerIdx,doneKey);
    const player=config.players[playerIdx];
    if(!task){ // assignation disparue → on nettoie sans récompense
      // v2.6.6 — bug signalé par Gen : approuver une tâche fantôme ne l'empêchait PAS de revenir
      // (contrairement à refuser, qui tombstone via refusedKeys) — une assignation récurrente
      // orpheline régénérait donc la même fausse demande chaque jour malgré l'approbation répétée.
      setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
        n[playerIdx]={...p,
          pending:(p.pending||[]).filter(k=>k!==doneKey),
          refusedKeys:[...new Set([...(p.refusedKeys||[]), doneKey])].slice(-400)};
        persist(config,n); return n; });
      return;
    }
    setGameStates(gs=>{
      const p=gs[playerIdx];
      if(p.completed?.includes(doneKey))return gs;
      const prevLv=getLevel(p.xp).level;
      const newXp=p.xp+task.xp, newCoins=p.coins+task.coins;
      const newLv=getLevel(newXp).level;
      // Count tasks done today for streak badge (clés du jour: ..._player#YYYY-MM-DD)
      const today="#"+todayStamp();
      const todayCount=(p.completed||[]).filter(k=>k.endsWith(today)).length+1;
      const updatedPs={...p,xp:newXp,coins:newCoins,coinsLifetime:(p.coinsLifetime||0)+(task.coins||0),completed:[...new Set([...(p.completed||[]),doneKey])],pending:(p.pending||[]).filter(k=>k!==doneKey),completedAt:{...(p.completedAt||{}), [doneKey]:new Date().toISOString()}};
      const newBadgeIds=checkBadges(updatedPs,player,todayCount, completionCatCounts(updatedPs, cfgRef.current||config));
      if(newBadgeIds.length) updatedPs.badges=[...(p.badges||[]),...newBadgeIds];
      // Le familier ÉQUIPÉ gagne de l'XP — SEULEMENT s'il est « en forme » (nourri aujourd'hui).
      // C'est la boucle Tamagotchi : nourris-le chaque jour pour qu'il grandisse avec tes quêtes.
      const eqPet=p.equipped?.pet;
      const petFedToday=p.lastFedDay===todayStamp();
      if(eqPet && petFedToday){ const _g=gainPet(p,eqPet,task.xp||0); updatedPs.petXp=_g.petXp; updatedPs.petDay=_g.petDay; }
      // Série 🔥 : marquer aujourd'hui comme jour actif (quête accomplie)
      updatedPs.activeDays=_uniq([...(p.activeDays||[]), todayStamp()]);
      const n=[...gs]; n[playerIdx]=updatedPs;
      // Fil de famille : on enregistre l'accomplissement (+ niveau / badges) dans le MÊME save
      const now=Date.now(); const fents=[{ id:"f_"+uid(), ts:now, likes:[], type:"task", playerId:player.id, text:`${displayName(player)} a accompli « ${task.label} »`, emoji:task.emoji||"✅" }];
      if(prevLv<newLv) fents.unshift({ id:"f_"+uid(), ts:now+1, likes:[], type:"level", playerId:player.id, text:`${displayName(player)} passe au niveau ${newLv}!`, emoji:"⭐" });
      for(const bid of newBadgeIds){ const b=BADGES.find(x=>x.id===bid); if(b) fents.unshift({ id:"f_"+uid(), ts:now+2, likes:[], type:"badge", playerId:player.id, text:`${displayName(player)} a gagné le badge « ${b.name} »`, emoji:b.emoji||"🏅" }); }
      let feedAcc=[...fents, ...((config.feed)||[])];
      let bossNow=config.boss;
      // Combat de boss : chaque quête accomplie donne 1 JETON d'attaque (dépensé dans l'onglet BOSS)
      if(bossNow && !bossNow.defeatedAt){
        const bid=bossNow.startedAt;
        const cur=(updatedPs.bossBattle&&updatedPs.bossBattle.bossId===bid)?updatedPs.bossBattle:{bossId:bid,earned:0,spent:0,dmg:0};
        updatedPs.bossBattle={...cur, earned:(cur.earned||0)+1};
        n[playerIdx]=updatedPs;
      }
      // La célébration (popup + jeu de niveau) est DIFFÉRÉE vers l'appareil de l'enfant,
      // jouée à SA prochaine connexion — pas sur l'écran du parent qui valide.
      const celeb={ id:"c_"+uid(), level: prevLv<newLv?newLv:null, taskEmoji:task.emoji||"✅", taskLabel:task.label||"", xp:task.xp||0, coins:task.coins||0, themeId:player.themeId||"none",
        badges:newBadgeIds.map(id=>BADGES.find(b=>b.id===id)).filter(Boolean).map(b=>({id:b.id,emoji:b.emoji,name:b.name})) };
      n[playerIdx]={...n[playerIdx], pendingCelebrations:[...(n[playerIdx].pendingCelebrations||[]), celeb]};
      const newCfg={...config, boss:bossNow, feed:feedAcc.slice(0,60)};
      setConfig(newCfg);
      persist(newCfg,n);
      setUndoStack(u=>[...u.slice(-9),{doneKey,playerIdx,xp:task.xp,coins:task.coins}]);
      showToast(`✅ Validé! ${displayName(player)} aura sa surprise${prevLv<newLv?" et son jeu de niveau":""} à sa prochaine connexion 🎉`,"#5CAD68",4000);
      return n;
    });
    logAction(`✅ Validé: ${displayName(player)} — ${task.label}`,"#5CAD68");
  },[config,persist,resolvePendingTask,logAction,showToast]);

  // v1.64.0 — l'enfant « archive » (efface) un message de refus
  const handleDismissRefusal = useCallback((playerIdx, key)=>{
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]; n[playerIdx]={...p, refusals:(p.refusals||[]).filter(r=>r.key!==key)}; persist(config,n); return n; });
  },[config,persist]);

  // v2.6.0 — annonces parent : archivage par l'enfant
  const handleDismissAnnouncement = useCallback((playerIdx, announcementId)=>{
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]; n[playerIdx]={...p, dismissedAnnouncements:[...(p.dismissedAnnouncements||[]), announcementId]}; persist(config,n); return n; });
  },[config,persist]);
  // v2.6.0 — création d'une annonce parent
  const handleCreateAnnouncement = useCallback((announcement)=>{
    const newCfg={...config, announcements:[...(config.announcements||[]), {...announcement, id:uid(), createdAt:todayStamp()}]};
    setConfig(newCfg); persist(newCfg, gameStates);
  },[config,gameStates,persist]);
  // v2.6.0 — suppression d'une annonce parent
  const handleDeleteAnnouncement = useCallback((announcementId)=>{
    const newCfg={...config, announcements:(config.announcements||[]).filter(a=>a.id!==announcementId)};
    setConfig(newCfg); persist(newCfg, gameStates);
  },[config,gameStates,persist]);
  // v2.15.1 — renvoyer une annonce aux enfants qui l'ont fermée (copie ciblée, nouvel id —
  // seule façon fiable de la faire réapparaître : dismissedAnnouncements est une union entre appareils)
  const handleResendAnnouncement = useCallback((announcementId)=>{
    const orig=(config.announcements||[]).find(a=>a.id===announcementId);
    if(!orig) return 0;
    const dismissedBy=(config.players||[]).filter((p,i)=>{
      const gs=gameStates[i];
      if(!gs||!(gs.dismissedAnnouncements||[]).includes(announcementId)) return false;
      return orig.targetAll || (orig.targetPlayerIds||[]).includes(p.id);
    }).map(p=>p.id);
    if(!dismissedBy.length) return 0;
    const copy={...orig, id:uid(), targetAll:false, targetPlayerIds:dismissedBy, createdAt:todayStamp()};
    const newCfg={...config, announcements:[...(config.announcements||[]), copy]};
    setConfig(newCfg); persist(newCfg, gameStates);
    return dismissedBy.length;
  },[config,gameStates,persist]);

  // Refus parent : retire la demande sans XP
  const refusePending = useCallback((playerIdx, doneKey)=>{
    const task=resolvePendingTask(playerIdx,doneKey);
    const player=config.players[playerIdx];
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      const refusal={ key:doneKey, label:task?.label||"Quête", emoji:task?.emoji||"✗", msg:refusMsg(doneKey), ts:Date.now() };
      n[playerIdx]={...p,
        pending:(p.pending||[]).filter(k=>k!==doneKey),
        refusedKeys:[...new Set([...(p.refusedKeys||[]), doneKey])].slice(-400), // tombstone → ne revient plus au portail parent
        refusals:[...(p.refusals||[]).filter(r=>r.key!==doneKey), refusal].slice(-10) }; // message drôle pour l'enfant
      persist(config,n); return n; });
    logAction(`✗ Refusé: ${displayName(player)} — ${task?.label||doneKey}`,"#D99248");
    showToast(`✗ Demande refusée`,"#D99248");
  },[config,persist,resolvePendingTask,logAction,showToast]);

  // Mini-game ended — apply bonus then show reward popup
  const handleMiniGameEnd = useCallback((bonusXp,bonusCoins)=>{
    if(!miniGame)return;
    const {playerIdx,pendingReward}=miniGame;
    setMiniGame(null);
    if(bonusXp>0||bonusCoins>0){
      setGameStates(gs=>{
        const n=[...gs];
        n[playerIdx]={...n[playerIdx],xp:n[playerIdx].xp+bonusXp,coins:n[playerIdx].coins+bonusCoins,coinsLifetime:(n[playerIdx].coinsLifetime||0)+Math.max(0,bonusCoins)};
        persist(config,n);
        return n;
      });
      showToast(`🎮 Bonus mini-jeu! +${bonusXp} XP · +${bonusCoins} 🪙`,"#D9BC5C",4000);
    }
    setRewardPopup(pendingReward);
  },[miniGame,config,persist,showToast]);

  // À la connexion de l'enfant : jouer les fêtes différées (validées par le parent sur un autre appareil)
  // puis vider la file pour qu'elles ne rejouent pas.
  const consumeCelebrations = useCallback((idx)=>{
    const ps=gameStates[idx]; if(!ps) return;
    const queue=ps.pendingCelebrations||[]; if(!queue.length) return;
    const player=config.players[idx]; if(!player) return;
    const _bw=queue.find(c=>c.bossWin); const _wonItems=queue.filter(c=>c.itemId).map(c=>({id:c.itemId,name:c.itemName,emoji:c.itemEmoji})); // v1.74.0 — victoire de boss différée
    // On regroupe la file en UNE fête (cumul XP/pièces, tous les badges, le plus haut niveau atteint)
    const totXp=queue.reduce((s,c)=>s+(c.xp||0),0);
    const totCoins=queue.reduce((s,c)=>s+(c.coins||0),0);
    // Dédoublonne les badges par id (sinon un même badge gagné sur 2 appareils s'affiche 2 fois)
    const allBadges=(()=>{ const seen=new Set(), out=[]; for(const b of queue.flatMap(c=>c.badges||[])){ if(b&&!seen.has(b.id)){seen.add(b.id);out.push(b);} } return out; })();
    const levels=queue.map(c=>c.level).filter(l=>l!=null);
    const topLevel=levels.length?Math.max(...levels):null;
    const label=queue.length===1?(queue[0].taskLabel||"Quête validée!"):`${queue.length} quêtes validées pendant ton absence!`;
    const emoji=queue.length===1?(queue[0].taskEmoji||"✅"):"🎉";
    const forcedType=queue.map(c=>c.game).find(Boolean)||null; // jeu imposé (ex: cadeau Pac-Man)
    // Cadeau pur (0 XP / 0 pièce / aucun badge) → on ne montre pas de popup de récompense vide
    const pendingRwd=(totXp||totCoins||allBadges.length)?{ task:{emoji,label,xp:totXp,coins:totCoins}, player, newBadges:allBadges }:null;
    // On vide la file tout de suite ET on marque ces ids comme consommés (tombstone v2.12.2 —
    // le simple vidage à [] ne suffit plus à empêcher une résurrection par fusion, voir mergeGameState).
    const consumedIds=queue.map(c=>c.id).filter(Boolean);
    setGameStates(gs=>{ const n=[...gs]; if(n[idx]) n[idx]={...n[idx], pendingCelebrations:[], consumedCelebrationIds:[...new Set([...(n[idx].consumedCelebrationIds||[]), ...consumedIds])].slice(-300)}; persist(config,n); return n; });
    setTimeout(()=>{
      // v1.88.0 (Lot 3 #11) — intensité réduite pour une célébration de tâche(s) ordinaire(s);
      // pleine intensité si un vrai jalon est dedans (level-up ou victoire de boss)
      spawnParticles(emoji, topLevel!=null || !!_bw);
      if(_bw){ try{ if(!CALM)spawnParticles("🏆"); SFX.epic&&SFX.epic(); }catch{} setBossWin({..._bw.bossWin, items:_wonItems}); } // notif de victoire à la connexion
      if(topLevel!=null||forcedType){ SFX.epic(); setMiniGame({player,playerIdx:idx,level:topLevel||getLevel(ps.xp||0).level,playerThemeId:player.themeId||"none",pendingReward:pendingRwd,forcedType,isGift:topLevel==null}); }
      else if(pendingRwd){ SFX.task(); setRewardPopup(pendingRwd); }
    },500);
  },[gameStates,config,persist,spawnParticles]);

  // v1.67.0 (fix B1) — Avant, le mini-jeu/fête de niveau ne se jouait QU'à la connexion
  // (consumeCelebrations dans onSelectPlayer). Si le parent validait pendant que l'enfant
  // était DÉJÀ connecté, la file pendingCelebrations grandissait via la sync mais rien ne
  // se déclenchait → l'enfant voyait la notif au fil mais « le jeu ne partait jamais ».
  // Cet effet consomme la file AUSSI en cours de session (sans couper une fête en cours).
  useEffect(()=>{
    if(sessionPlayer==null || parentMode) return;
    if(miniGame || rewardPopup) return;            // ne pas interrompre une fête déjà à l'écran
    const q=gameStates[sessionPlayer]?.pendingCelebrations;
    if(q && q.length) consumeCelebrations(sessionPlayer);
  },[sessionPlayer,parentMode,gameStates,miniGame,rewardPopup,consumeCelebrations]);

  // Buy / equip
  const handleBuy = useCallback((item,playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    // v1.84.0 (Lot 1 #B3) — magasiner coûte de l'énergie (frein "plaisir", jamais les corvées)
    const p0=gameStates[idx];
    if(currentEnergy(p0)<SHOP_ENERGY){ const m=minsToEnergy(p0,SHOP_ENERGY); showToast(`😴 Ton héros se repose… la boutique rouvre dans ~${m} min!`,"#85CDD1",3500); return; }
    const isReward=!item.slot;
    const price=priceOf(item); // items (.cost) ET récompenses (.coins), ×PRICE_MULT
    if((p0.coins||0)<price) return; // pas assez de pièces — rien à faire (même garde qu'avant, remontée hors de l'updater)
    // v2.6.2 — l'entrée "moment" (mr, uid() inclus) est construite ICI, dans le corps de handleBuy
    // (appelé UNE FOIS par vrai clic) — jamais dans l'updater passé à setGameStates, que StrictMode
    // double-invoque en dev : un uid()+setConfig générés à CHAQUE invocation créait 2 entrées
    // dupliquées par achat (trouvé en test navigateur). Précédent apparenté : v2.5.23.
    let newCfg = config;
    if(isReward && item.moment){
      const mr={ id:"mr_"+uid(), playerId, rewardId:item.id, emoji:item.emoji, label:item.label, coins:price, status:"attente", plannedDate:null, createdAt:new Date().toISOString() };
      newCfg = {...config, momentRequests:[...(config.momentRequests||[]), mr]};
      setConfig(newCfg);
    }
    SFX.buy();
    setGameStates(gs=>{
      const p=gs[idx];
      // v2.16.2 — double-clic/double-tap rapide sur "Acheter" (avant que le bouton se réaffiche en
      // ÉQUIPÉ/RÉCLAMÉ) pouvait re-passer ce test : p0 ci-dessus vient d'une fermeture figée au rendu
      // du clic, donc un 2e clic quasi simultané le relit encore "pas assez cher" → 2e débit réel de
      // pièces alors que owned/boughtRewards restent dédupliqués par Set (achat visible une seule fois,
      // pièces perdues deux fois). Idempotence sur l'état FRAIS de l'updater : déjà possédé → no-op.
      const alreadyHave = isReward ? (p.boughtRewards||[]).includes(item.id) : (p.owned||[]).includes(item.id);
      if(alreadyHave) return gs;
      if((p.coins||0)<price)return gs;
      const n=[...gs]; n[idx]={...p,coins:(p.coins||0)-price,owned:[...new Set([...(p.owned||[]),item.id])],boughtRewards:isReward?[...new Set([...(p.boughtRewards||[]),item.id])]:p.boughtRewards,equipped:item.slot?{...(p.equipped||{}),[item.slot]:item.id}:(p.equipped||{}),energy:Math.max(0,currentEnergy(p)-SHOP_ENERGY),energyTs:new Date().toISOString()};
      persist(newCfg,n); // newCfg identique à chaque (double-)invocation → persist reste idempotent
      return n;
    });
    showToast(item.moment ? `🎉 ${item.emoji} ${item.label} — à planifier avec ton parent! 🗓️` : `🎉 ${item.emoji} ${item.name||item.label} acheté!`,"#D9BC5C", item.moment?4200:3000);
    spawnParticles(item.emoji||"🎉");
  },[config,gameStates,persist,showToast]);

  const handleUpdateAvatar = useCallback((avatarDef, playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{ const n=[...gs]; n[idx]={...n[idx],avatar:avatarDef}; persist(config,n); return n; });
  },[config,persist]);

  const handleEquip = useCallback((item,playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    // v2.13.x (retour Gen : « on peut pas le déséquiper? ») — TOGGLE : retaper l'item équipé le retire.
    const already = (gameStates[idx]?.equipped||{})[item.slot]===item.id;
    setGameStates(gs=>{ const n=[...gs]; n[idx]={...n[idx],equipped:{...(n[idx].equipped||{}),[item.slot]:already?null:item.id}}; persist(config,n); return n; });
    showToast(already?`↩️ ${item.emoji} retiré`:`✅ ${item.emoji} équipé!`, already?"#85CDD1":"#5CAD68");
  },[config,gameStates,persist,showToast]);

  // ── Parent mode actions ──────────────────────────────────
  const handleDeComplete = useCallback((doneKey, playerIdx) => {
    const player = config.players[playerIdx];
    const assId = doneKey.split("_")[0];
    const ass = config.assignments.find(a=>a.instanceId===assId);
    const task = ass ? [...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId) : null;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      n[playerIdx]={...p, xp:Math.max(0,p.xp-(task?.xp||0)), coins:Math.max(0,p.coins-(task?.coins||0)),
        completed:(p.completed||[]).filter(k=>k!==doneKey)};
      persist(config,n); return n; });
    logAction(`↩️ ${player?.name}: tâche annulée (${task?.label||doneKey})`,"#D99248");
    showToast(`↩️ Tâche annulée pour ${player?.name}`,"#D99248");
  },[config,persist,logAction,showToast]);

  const handleAdjustXP = useCallback((playerIdx, delta) => {
    const player = config.players[playerIdx];
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],xp:Math.max(0,n[playerIdx].xp+delta),coins:Math.max(0,n[playerIdx].coins+(delta>0?Math.abs(Math.floor(delta/2)):0))}; persist(config,n); return n; });
    logAction(`${delta>0?"+":""}${delta} XP → ${player?.name}`,"#85CDD1");
    showToast(`${delta>0?"+":""}${delta} XP pour ${player?.name}`,"#85CDD1");
  },[config,persist,logAction,showToast]);

  // Ajuster les pièces seulement (ex: rembourser une récompense)
  const handleAdjustCoins = useCallback((playerIdx, delta) => {
    const player = config.players[playerIdx];
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],coins:Math.max(0,(n[playerIdx].coins||0)+delta)}; persist(config,n); return n; });
    logAction(`${delta>0?"+":""}${delta} 🪙 → ${player?.name}`,"#D9BC5C");
    showToast(`${delta>0?"+":""}${delta} 🪙 pour ${player?.name}`,"#D9BC5C");
  },[config,persist,logAction,showToast]);

  const handleForceComplete = useCallback((ass, playerId) => {
    const playerIdx=config.players.findIndex(p=>p.id===playerId); if(playerIdx<0)return;
    const player=config.players[playerIdx];
    const isCal=String(ass.instanceId).startsWith("cal_");
    const doneKey=isCal ? ass.instanceId+"_"+playerId : ass.instanceId+"_"+playerId+"#"+todayStamp();
    const task=[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId);
    if(!task)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      if(p.completed?.includes(doneKey))return gs;
      n[playerIdx]={...p,xp:p.xp+task.xp,coins:p.coins+task.coins,coinsLifetime:(p.coinsLifetime||0)+(task.coins||0),
        completed:[...new Set([...(p.completed||[]),doneKey])],
        pending:(p.pending||[]).filter(k=>k!==doneKey)};
      persist(config,n); return n; });
    logAction(`✅ Override: ${player?.name} — ${task.label}`,"#5CAD68");
    showToast(`✅ Tâche forcée pour ${player?.name}`,"#5CAD68");
    spawnParticles(task.emoji);
  },[config,persist,logAction,showToast]);

  // ── Gestion des tâches depuis le portail parent ──────────
  // Ajoute une tâche pour chaque joueur coché (copies indépendantes, comme le wizard)
  const handleAddAssignment = useCallback((taskId, playerIds, assType, customDays, time)=>{
    if(!taskId||!playerIds?.length)return;
    // assType: "week" → tâche planifiée (jours choisis = récurrence hebდo par jour); sinon → routine (sans jour)
    const days = assType==="week" ? ((Array.isArray(customDays)&&customDays.length)?[...customDays].sort((a,b)=>a-b):[0,1,2,3,4]) : [];
    const newAss = playerIds.map(pid=>({instanceId:uid(),taskId,playerIds:[pid],days,time:time||"",createdAt:Date.now()}));
    const newCfg={...config,assignments:[...(config.assignments||[]),...newAss]};
    setConfig(newCfg); persist(newCfg,gameStates);
    const task=[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===taskId);
    logAction(`➕ Tâche ajoutée: ${task?.label||taskId} (${playerIds.length} joueur${playerIds.length>1?"s":""})`,"#5CAD68");
    showToast("➕ Tâche ajoutée!","#5CAD68");
  },[config,gameStates,persist,logAction,showToast]);

  // v2.6.0 — Quête de réparation 🕊️ (chantier approuvé le 25 juillet) : le PARENT crée une tâche
  // à la volée (cat "reparation", champs figés après création — le merge union-by-id ne fusionne
  // pas champ par champ) + UNE assignation multi-enfants (patron rc_brassee — PAS handleAddAssignment
  // qui splitte en une assignation par enfant). oneDay = aujourd'hui (auto-nettoyée demain, ~5121).
  // Cadrage TOP/AuDHD : texte symétrique, récompenses égales (20 XP / 10 🪙 via approvePending normal).
  const handleCreateRepairQuest = useCallback((preset, playerIds)=>{
    if(!preset?.label || !Array.isArray(playerIds) || playerIds.length<2) return;
    const taskId = "cust_rep_"+uid();
    const task = { id:taskId, emoji:preset.emoji||"🕊️", label:preset.label, xp:20, coins:10, diff:"medium", cat:"reparation", repair:true, steps:Array.isArray(preset.steps)?preset.steps.slice(0,3):[] };
    const todayIdx=(new Date().getDay()+6)%7;
    const ass = { instanceId:uid(), taskId, playerIds:[...playerIds], days:[todayIdx], time:"", oneDay:todayStamp(), repair:true, createdAt:Date.now() };
    const newCfg = {...config, customTasks:[...(config.customTasks||[]), task], assignments:[...(config.assignments||[]), ass]};
    setConfig(newCfg); persist(newCfg, gameStates);
    logAction(`🕊️ Quête de réparation créée: ${task.label} (${playerIds.length} enfants)`,"#7FD6E0");
    showToast("🕊️ Quête de réparation créée — chacun la verra dans sa journée.","#7FD6E0",4000);
  },[config,gameStates,persist,logAction,showToast]);

  // v2.6.2 — le parent choisit une date pour une récompense "moment" : ajoute un vrai événement
  // calendrier (type "recompense" 🎁, visible enfant+parent) et fait avancer le statut vers "planifie".
  const handlePlanMoment = useCallback((momentId, date)=>{
    if(!date) return;
    const cfg=cfgRef.current||config;
    const mr=(cfg.momentRequests||[]).find(m=>m.id===momentId); if(!mr) return;
    const idx=config.players.findIndex(p=>p.id===mr.playerId); if(idx<0) return;
    const calId=Date.now()+"_"+Math.random().toString(36).slice(2,6);
    setGameStates(gs=>{ const n=[...gs];
      const e={ id:calId, type:"recompense", label:`${mr.emoji} ${mr.label}`, date, recur:null };
      n[idx]={...n[idx], calendar:[...(n[idx].calendar||[]), e]};
      const newCfg={...cfg, momentRequests:(cfg.momentRequests||[]).map(m=>m.id===momentId?{...m,status:"planifie",plannedDate:date,calId:"cal_"+calId}:m)};
      setConfig(newCfg);
      persist(newCfg,n);
      return n;
    });
    showToast("🗓️ Moment planifié — ajouté au calendrier!","#85CDD1",3500);
  },[config,persist,showToast]);

  // v2.6.2 — le moment a été vécu → statut "fait" (retiré de la liste "à planifier", aucune
  // pression temporelle : reste "à planifier" indéfiniment tant que ce bouton n'est pas cliqué).
  const handleMarkMomentDone = useCallback((momentId)=>{
    const cfg=cfgRef.current||config;
    const newCfg={...cfg, momentRequests:(cfg.momentRequests||[]).map(m=>m.id===momentId?{...m,status:"fait"}:m)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("✅ Moment vécu ensemble! 💛","#5CAD68",3500);
  },[config,gameStates,persist,showToast]);

  // Lance un boss de famille — le parent choisit la difficulté (PV du boss)
  const handleLaunchBoss = useCallback((difficulty="moyen")=>{
    const nPlayers = Math.max(1,(config.players||[]).length);
    const base = BOSSES[Math.floor(Math.random()*BOSSES.length)];
    const diff = BOSS_DIFF[difficulty] || BOSS_DIFF.moyen;
    const now = new Date().toISOString();
    // PV adaptés au nombre d'enfants (1 jeton par quête ≈ ~5 quêtes/enfant/jour)
    const hpMax = Math.round(diff.hp * (0.6 + 0.4*nPlayers));
    const boss = {...base, hpMax, lastHitTs:now, difficulty, startedAt:now, defeatedAt:null};
    const fe={id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:boss.emoji,text:`⚔️ Un ${boss.name} (${diff.label}, ${hpMax} PV) apparaît! Faites des quêtes pour l'attaquer dans l'onglet BOSS!`};
    const newCfg={...config, boss, feed:[fe,...(config.feed||[])].slice(0,60)};
    setConfig(newCfg); persist(newCfg, gameStates);
    showToast(`${boss.emoji} ${boss.name} apparaît! Battez-le en famille!`,"#D98C8C",4500);
  },[config,gameStates,persist,showToast]);

  // Attaque du boss : dépense des jetons (gagnés en faisant des quêtes) → enlève des PV
  const handleBossAttack = useCallback((playerIdx, type)=>{
    const atk = ATTACKS[type]; const boss = cfgRef.current?.boss;
    if(!atk || !boss || boss.defeatedAt) return;
    const bid = boss.startedAt;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      const bb=(p.bossBattle&&p.bossBattle.bossId===bid)?p.bossBattle:{bossId:bid,earned:0,spent:0,dmg:0};
      if((bb.earned-bb.spent) < atk.cost) return gs; // pas assez de jetons
      const mod = bossModifierOfDay(bid); const dmg = bossAtkDamage(type, mod); // v1.58.0 — modificateur du jour
      const newBB={...bb, spent:bb.spent+atk.cost, dmg:bb.dmg+dmg};
      n[playerIdx]={...p, bossBattle:newBB};
      let totalDmg = n.reduce((s,g)=> s + ((g.bossBattle&&g.bossBattle.bossId===bid)?(g.bossBattle.dmg||0):0), 0) + repairDamageFor(cfgRef.current?.repairEvents, bid); // v2.6.0 — inclut les réparations 🕊️ dans le cap et le seuil de victoire
      let nb = {...boss, lastHitTs:new Date().toISOString()};
      const HPMAX=(boss.hpMax||80), questsDone=bossQuestsAllDone(cfgRef.current, n);
      if(!questsDone && totalDmg > HPMAX-1){ const over=totalDmg-(HPMAX-1); newBB.dmg=Math.max(bb.dmg||0, newBB.dmg-over); n[playerIdx]={...p, bossBattle:newBB}; totalDmg=HPMAX-1; }
      const locked = !questsDone && totalDmg >= HPMAX-1;
      const defeated = questsDone && totalDmg >= HPMAX;
      const alreadyClaimed = n.some(g=>g.bossClaimed===bid); // v2.5.25 — idempotence : le filet de sécurité ou le familier a peut-être déjà accordé la victoire
      if(defeated && !alreadyClaimed){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, coinsLifetime:(n[i].coinsLifetime||0)+40, xp:(n[i].xp||0)+50, owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], bossClaimed:bid, pendingCelebrations:[...(n[i].pendingCelebrations||[]), {id:"c_"+uid(), bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } } // v1.74.0 — +40🪙 +50XP + badge + item ULTRA LÉGENDAIRE + notif différée à chaque enfant
      else if(defeated && alreadyClaimed){ nb.defeatedAt = nb.defeatedAt || new Date().toISOString(); }
      const fe = (defeated && !alreadyClaimed) ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated && !alreadyClaimed){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#D9BC5C",5000); },150); }
      else if(!defeated){ setTimeout(()=>{ try{ if(!CALM) spawnParticles(locked?(boss.emoji||"🐉"):atk.emoji); SFX.task&&SFX.task(); }catch{} showToast(locked?`${boss.emoji||"🐉"} ${boss.name||"Le boss"} RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`:(dmg>0?`${atk.emoji} −${dmg} PV au boss!`:`🛡️ La carapace bloque — vise plus gros!`),"#D98C8C",locked?3600:2200); },60); }
      return n;
    });
  },[persist,showToast]);

  // v1.58.0 — attaque du FAMILIER : il frappe le boss s'il est en forme (nourri) et assez évolué (niv ≥4). Légendaire = bonus de dégâts.
  const handleBossPetAttack = useCallback((playerIdx)=>{
    const boss = cfgRef.current?.boss; if(!boss || boss.defeatedAt) return;
    const p0 = gameStates[playerIdx]; const petId = p0?.equipped?.pet;
    if(!petId){ showToast("Équipe un familier pour qu'il attaque! 🐾","#D99248",2800); return; }
    if(p0.lastFedDay!==todayStamp()){ showToast("Ton familier a faim — nourris-le pour qu'il se batte! 🍖","#D99248",3000); return; }
    const petLv = petLevel((p0.petXp||{})[petId]||0);
    if(petLv<4){ showToast("Ton familier est trop jeune pour se battre (niv. 4) 🐣","#D99248",3000); return; }
    const bid = boss.startedAt;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      const bb=(p.bossBattle&&p.bossBattle.bossId===bid)?p.bossBattle:{bossId:bid,earned:0,spent:0,dmg:0};
      if((bb.earned-bb.spent) < PET_ATTACK_COST){ setTimeout(()=>showToast(`Il faut ${PET_ATTACK_COST} jetons (fais des quêtes) pour lancer ton familier!`,"#D99248",3000),0); return gs; }
      const mod = bossModifierOfDay(bid); const legend = petIsLegendary((p.petEvo||{})[petId], petLv);
      const dmg = petAttackDamage(petLv, legend, mod);
      const newBB={...bb, spent:bb.spent+PET_ATTACK_COST, dmg:bb.dmg+dmg};
      n[playerIdx]={...p, bossBattle:newBB};
      let totalDmg = n.reduce((s,g)=> s + ((g.bossBattle&&g.bossBattle.bossId===bid)?(g.bossBattle.dmg||0):0), 0) + repairDamageFor(cfgRef.current?.repairEvents, bid); // v2.6.0 — inclut les réparations 🕊️ dans le cap et le seuil de victoire
      let nb = {...boss, lastHitTs:new Date().toISOString()};
      const HPMAX=(boss.hpMax||80), questsDone=bossQuestsAllDone(cfgRef.current, n);
      if(!questsDone && totalDmg > HPMAX-1){ const over=totalDmg-(HPMAX-1); newBB.dmg=Math.max(bb.dmg||0, newBB.dmg-over); n[playerIdx]={...p, bossBattle:newBB}; totalDmg=HPMAX-1; }
      const locked = !questsDone && totalDmg >= HPMAX-1;
      const defeated = questsDone && totalDmg >= HPMAX;
      const alreadyClaimed = n.some(g=>g.bossClaimed===bid); // v2.5.25 — idempotence : le filet de sécurité ou une attaque de joueur a peut-être déjà accordé la victoire
      if(defeated && !alreadyClaimed){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, coinsLifetime:(n[i].coinsLifetime||0)+40, xp:(n[i].xp||0)+50, owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], bossClaimed:bid, pendingCelebrations:[...(n[i].pendingCelebrations||[]), {id:"c_"+uid(), bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } } // v1.74.0 — +40🪙 +50XP + badge + item ULTRA LÉGENDAIRE + notif différée à chaque enfant
      else if(defeated && alreadyClaimed){ nb.defeatedAt = nb.defeatedAt || new Date().toISOString(); }
      const fe = (defeated && !alreadyClaimed) ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated && !alreadyClaimed){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#D9BC5C",5000); },150); }
      else if(!defeated){ setTimeout(()=>{ try{ if(!CALM) spawnParticles(locked?(boss.emoji||"🐉"):"🐾"); SFX.epic&&SFX.epic(); }catch{} showToast(locked?`${boss.emoji||"🐉"} ${boss.name||"Le boss"} RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`:`🐾 Ton familier frappe! −${dmg} PV${legend?" — Légendaire! 👑":""}`,"#D9BC5C",locked?3600:2800); },60); }
      return n;
    });
  },[gameStates,persist,showToast]);

  // Le parent crée/assigne une routine à un enfant (atterrit dans gs[idx].routines)
  const handleAssignRoutine = useCallback((playerIdx, routine)=>{
    if(playerIdx==null||!routine?.name?.trim()||!(routine.taskIds||[]).length)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]||{}; const r={id:"rt_"+uid(), emoji:"🌅", endTime:"", ...routine, name:routine.name.trim()}; n[playerIdx]={...p, routines:[...(p.routines||[]), r]}; persist(config,n); return n; });
    logAction(`🧩 Routine « ${routine.name.trim()} » assignée à ${config.players[playerIdx]?.name||""}`,"#5CAD68");
    showToast("✅ Routine assignée à l'enfant!","#5CAD68");
  },[config,persist,logAction,showToast]);

  const handleRemoveAssignment = useCallback((instanceId)=>{
    const ass=(config.assignments||[]).find(a=>a.instanceId===instanceId);
    const task=ass?[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId):null;
    // Tombstone : la fusion ré-ajouterait l'assignation sinon → on mémorise les supprimées
    const newCfg={...config,
      assignments:(config.assignments||[]).filter(a=>a.instanceId!==instanceId),
      removedAssignments:_uniq([...(config.removedAssignments||[]), instanceId]).slice(-800)};
    setConfig(newCfg); persist(newCfg,gameStates);
    logAction(`🗑️ Tâche retirée: ${task?.label||instanceId}`,"#D99248");
    showToast("🗑️ Tâche retirée","#D99248");
  },[config,gameStates,persist,logAction,showToast]);

  // v1.83.0 (Lot 1 #B6) — l'enfant DEMANDE à retirer une tâche (pas de suppression directe :
  // le parent approuve, même esprit que la validation des tâches complétées).
  const handleRequestRemoval = useCallback((playerIdx, instanceId)=>{
    const pid=config.players[playerIdx]?.id; if(!pid) return;
    if((config.removalRequests||[]).some(r=>r.instanceId===instanceId && r.playerId===pid)) return; // déjà demandé
    const req={id:"rmreq_"+uid(), instanceId, playerId:pid, requestedAt:Date.now()};
    const newCfg={...config, removalRequests:[...(config.removalRequests||[]), req]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("🗑️ Demande envoyée au parent","#D9BC5C");
  },[config,gameStates,persist,showToast]);

  const handleApproveRemoval = useCallback((reqId)=>{
    const req=(config.removalRequests||[]).find(r=>r.id===reqId); if(!req) return;
    const ass=(config.assignments||[]).find(a=>a.instanceId===req.instanceId);
    const task=ass?[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId):null;
    const newCfg={...config,
      assignments:(config.assignments||[]).filter(a=>a.instanceId!==req.instanceId),
      removedAssignments:_uniq([...(config.removedAssignments||[]), req.instanceId]).slice(-800),
      removalRequests:(config.removalRequests||[]).filter(r=>r.id!==reqId)};
    setConfig(newCfg); persist(newCfg,gameStates);
    logAction(`🗑️ Retrait approuvé: ${task?.label||req.instanceId}`,"#D99248");
    showToast("🗑️ Tâche retirée","#D99248");
  },[config,gameStates,persist,logAction,showToast]);

  const handleRefuseRemoval = useCallback((reqId)=>{
    const newCfg={...config, removalRequests:(config.removalRequests||[]).filter(r=>r.id!==reqId)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("Demande de retrait refusée","#FF6464");
  },[config,gameStates,persist,showToast]);

  // Ménage : supprimer TOUTES les tâches qu'un enfant s'est créées (child:true)
  const handleClearChildTasks = useCallback((playerIdx)=>{
    const pid=config.players[playerIdx]?.id; if(!pid) return;
    const childTaskIds=new Set((config.customTasks||[]).filter(t=>t.child).map(t=>t.id));
    const toRemove=(config.assignments||[]).filter(a=>a.playerIds?.includes(pid) && childTaskIds.has(a.taskId)).map(a=>a.instanceId);
    if(!toRemove.length){ showToast("Aucune tâche perso à supprimer 👍","#888"); return; }
    const removedSet=new Set(toRemove);
    const newCfg={...config,
      assignments:(config.assignments||[]).filter(a=>!removedSet.has(a.instanceId)),
      removedAssignments:_uniq([...(config.removedAssignments||[]), ...toRemove]).slice(-800)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast(`🗑️ ${toRemove.length} tâche(s) perso supprimée(s)`,"#D99248");
  },[config,gameStates,persist,showToast]);

  const handleAddCustomTask = useCallback((data)=>{
    if(!data?.label?.trim())return null;
    const label=data.label.trim();
    // v1.82.0 (Lot 1 #3/B7) — anti-doublon côté parent, même règle que côté enfant (v1.53.0,
    // handleChildAddTask) : un libellé déjà présent réutilise la tâche existante au lieu d'en
    // empiler une nouvelle — évite que le catalogue/menu de choix grossisse à l'infini.
    const existing=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(label));
    if(existing){ showToast(`${existing.emoji} «${existing.label}» existe déjà — réutilisée!`,"#D9BC5C",4000); return existing.id; }
    const newTask={id:"cust_"+uid(),emoji:data.emoji||"⭐",label,xp:20,coins:10,diff:"medium",cat:"custom"};
    const newCfg={...config,customTasks:[...(config.customTasks||[]),newTask]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast(`${newTask.emoji} «${newTask.label}» créée — assigne-la maintenant!`,"#5CAD68",4000);
    return newTask.id;
  },[config,gameStates,persist,showToast]);

  // Enfant : ajoute une quête à SA journée (type routine, aujourd'hui). Le parent valide à la fin.
  const handleChildAddTask = useCallback((playerIdx, data)=>{
    const pid=config.players[playerIdx]?.id; if(!pid||!data?.label?.trim())return;
    const label=data.label.trim();
    // v2.5.10 (Correctif 2C) — l'enfant choisit la portée de sa tâche : A) once (comportement d'origine,
    // 1 jour, nettoyée le lendemain), B) reusable (privée mais permanente, ownerId posé), C) propose
    // (rien n'est créé tout de suite — va dans config.childTaskProposals, en attente d'approbation parent).
    const scope=data.scope||"once";
    if(scope==="propose"){
      // anti-doublon élargi : si une tâche de ce nom existe déjà (catalogue ou perso) ou est déjà proposée,
      // pas la peine de proposer un doublon — on informe l'enfant plutôt que de créer une 2e demande.
      const already=[...TASK_CATALOG,...(config.customTasks||[])].some(t=>normLabel(t.label)===normLabel(label))
        || (config.childTaskProposals||[]).some(p=>normLabel(p.label)===normLabel(label));
      if(already){ showToast(`«${label}» existe déjà — pas besoin de la proposer!`,"#D9BC5C",3500); return; }
      const prop={id:"prop_"+uid(), playerId:pid, label, emoji:data.emoji||"⭐", diff:data.diff||"medium", requestedAt:Date.now()};
      const newCfg={...config, childTaskProposals:[...(config.childTaskProposals||[]),prop]};
      setConfig(newCfg); persist(newCfg,gameStates);
      showToast("🧑‍🤝‍🧑 Proposée à la famille — en attente d'un parent!","#D9BC5C",4000);
      return;
    }
    // v1.53.0 anti-doublon : si une tâche au MÊME libellé existe déjà, on la réutilise au lieu d'en recréer une
    const existing=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(label));
    const _dp=CHILD_DIFF_PRESETS[data.diff]||CHILD_DIFF_PRESETS.medium; // plafond anti-farm
    const taskId=existing?existing.id:("cust_"+uid());
    const newTask={id:taskId,emoji:data.emoji||"⭐",label,xp:_dp.xp,coins:_dp.coins,diff:data.diff||"medium",cat:"custom",child:true,
      ...(scope==="reusable"&&!existing?{ownerId:pid}:{})}; // v2.5.10 — portée B : privée mais réutilisable, jamais nettoyée
    // La quête doit apparaître dans la vue ACTUELLE de l'enfant : si mode Semaine → aujourd'hui; si Routine → tâche de routine
    const pmode=gameStates[playerIdx]?.mode||config.mode||"routine";
    const todayIdx=(new Date().getDay()+6)%7;
    const days=pmode==="week" ? [todayIdx] : [];
    const ass={instanceId:uid(),taskId,playerIds:[pid],days,time:data.timeOfDay||"",createdAt:Date.now(),
      ...(scope==="reusable"?{}:{oneDay:todayStamp()})}; // v2.5.10 — portée A seulement : à usage unique (nettoyée après aujourd'hui)
    const customTasks=existing?(config.customTasks||[]):[...(config.customTasks||[]),newTask];
    const newCfg={...config, customTasks, assignments:[...(config.assignments||[]),ass]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast(scope==="reusable"?"🔁 Quête perso ajoutée — elle reste pour toi!":"➕ Quête ajoutée à ta journée!","#5CAD68");
  },[config,gameStates,persist,showToast]);

  // v2.5.10 (Correctif 2C) — le parent approuve une tâche proposée : elle rejoint le catalogue familial
  // partagé (même forme que handleAddCustomTask), disponible pour tous via TaskChooser. Aucune
  // auto-assignation — le parent (ou l'enfant) l'assigne ensuite normalement, même flux que d'habitude.
  const handleApproveProposal = useCallback((propId)=>{
    const prop=(config.childTaskProposals||[]).find(p=>p.id===propId); if(!prop) return;
    const pl=config.players.find(p=>p.id===prop.playerId);
    const already=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(prop.label));
    const newTask=already||{id:"cust_"+uid(),emoji:prop.emoji||"⭐",label:prop.label,xp:20,coins:10,diff:prop.diff||"medium",cat:"custom"};
    const newCfg={...config,
      customTasks:already?(config.customTasks||[]):[...(config.customTasks||[]),newTask],
      childTaskProposals:(config.childTaskProposals||[]).filter(p=>p.id!==propId),
      removedProposals:_uniq([...(config.removedProposals||[]),propId]).slice(-800)};
    setConfig(newCfg); persist(newCfg,gameStates);
    logAction(`✅ Tâche approuvée: ${newTask.label} (proposée par ${pl?displayName(pl):"?"})`,"#5CAD68");
    showToast(`✅ «${newTask.label}» ajoutée aux tâches de la famille!`,"#5CAD68");
  },[config,gameStates,persist,logAction,showToast]);

  const handleRefuseProposal = useCallback((propId)=>{
    const prop=(config.childTaskProposals||[]).find(p=>p.id===propId); if(!prop) return;
    const playerIdx=config.players.findIndex(p=>p.id===prop.playerId);
    const newCfg={...config,
      childTaskProposals:(config.childTaskProposals||[]).filter(p=>p.id!==propId),
      removedProposals:_uniq([...(config.removedProposals||[]),propId]).slice(-800)};
    setConfig(newCfg);
    if(playerIdx>=0){
      // même patron que refusPending (v1.64.0) : message drôle affiché à l'enfant, archivable, réutilise
      // exactement le même mécanisme d'affichage (PlayerDashboard, aucune nouvelle UI nécessaire)
      const key="propref_"+propId;
      const refusal={ key, label:prop.label, emoji:prop.emoji||"✗", msg:refusMsg(key), ts:Date.now() };
      setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
        n[playerIdx]={...p, refusals:[...(p.refusals||[]).filter(r=>r.key!==key), refusal].slice(-10)};
        persist(newCfg,n); return n; });
    } else persist(newCfg,gameStates);
    logAction(`✗ Tâche proposée refusée: ${prop.label}`,"#D99248");
    showToast("Proposition refusée","#FF6464");
  },[config,gameStates,persist,logAction,showToast]);

  // v1.57.0 — l'enfant choisit la voie d'évolution de son familier (tier 1/2/3 → élément)
  const handleChoosePetEvo = useCallback((playerIdx, petId, tier, element)=>{
    if(playerIdx==null||!petId||!tier||!element)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]||{}; const pe={...(p.petEvo||{})}; pe[petId]={...(pe[petId]||{}), [tier]:element}; n[playerIdx]={...p, petEvo:pe}; persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("✨"); SFX.epic&&SFX.epic(); }catch{} },120);
    showToast("✨ Ton familier a évolué!","#D9BC5C",3500);
  },[config,persist,showToast]);

  // v1.53.0 — l'enfant CHOISIT une tâche existante (grille) : on réutilise le taskId → aucun doublon créé
  const handleChildPickTask = useCallback((playerIdx, taskId)=>{
    const pid=config.players[playerIdx]?.id; if(!pid||!taskId)return;
    const pmode=gameStates[playerIdx]?.mode||config.mode||"routine";
    const todayIdx=(new Date().getDay()+6)%7;
    const days=pmode==="week" ? [todayIdx] : [];
    const ass={instanceId:uid(),taskId,playerIds:[pid],days,time:"",oneDay:todayStamp(),createdAt:Date.now()};
    const newCfg={...config, assignments:[...(config.assignments||[]),ass]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("➕ Quête ajoutée à ta journée!","#5CAD68");
  },[config,gameStates,persist,showToast]);

  // L'enfant crée sa propre tâche de RITUEL (days:[] = type rituel) et on retourne l'instanceId
  // pour l'ajouter immédiatement au rituel qu'il est en train de bâtir.
  const handleChildAddRoutineTask = useCallback((playerIdx, data)=>{
    const pid=config.players[playerIdx]?.id; if(!pid||!data?.label?.trim())return null;
    const taskId="cust_"+uid();
    const _dp=CHILD_DIFF_PRESETS[data.diff]||CHILD_DIFF_PRESETS.medium; // plafond anti-farm
    const newTask={id:taskId,emoji:data.emoji||"⭐",label:data.label.trim(),xp:_dp.xp,coins:_dp.coins,diff:data.diff||"medium",cat:"custom",child:true};
    const instanceId=uid();
    const ass={instanceId,taskId,playerIds:[pid],days:[],time:""}; // days:[] → tâche de rituel (persiste dans SON rituel)
    const newCfg={...config, customTasks:[...(config.customTasks||[]),newTask], assignments:[...(config.assignments||[]),ass]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("➕ Tâche ajoutée à ton rituel!","#5CAD68");
    return instanceId;
  },[config,gameStates,persist,showToast]);

  // Lot 7C — cocher le défi personnel du jour
  const handleChallengeCheckin = useCallback((playerId, date, val)=>{
    const cwk = custodyWeekKey();
    const prev = config.weeklyChallenge || { weekKey: cwk, challenges: [] };
    const idx = prev.challenges.findIndex(c=>c.playerId===playerId);
    let challenges;
    if(idx>=0){
      challenges = prev.challenges.map((c,i)=> i===idx ? {...c, checkins:{...(c.checkins||{}), [date]:val}} : c);
    } else {
      const player = config.players.find(p=>p.id===playerId);
      challenges = [...prev.challenges, { playerId, text:"", emoji:"⭐", checkins:{ [date]:val }, playerName:player?.pseudo||"" }];
    }
    const n={...config, weeklyChallenge:{...prev, weekKey:cwk, challenges}};
    setConfig(n); persist(n,gameStates);
  },[config,gameStates,persist]);

  // Lot 7C — parent met à jour le texte du défi
  const handleUpdateChallenge = useCallback((playerId, text, emoji)=>{
    const cwk = custodyWeekKey();
    const prev = config.weeklyChallenge || { weekKey: cwk, challenges: [] };
    const idx = prev.challenges.findIndex(c=>c.playerId===playerId);
    let challenges;
    if(idx>=0){
      challenges = prev.challenges.map((c,i)=> i===idx ? {...c, text, emoji} : c);
    } else {
      const player = config.players.find(p=>p.id===playerId);
      challenges = [...prev.challenges, { playerId, text, emoji, checkins:{}, playerName:player?.pseudo||"" }];
    }
    const n={...config, weeklyChallenge:{...prev, weekKey:cwk, challenges}};
    setConfig(n); persist(n,gameStates);
  },[config,gameStates,persist]);

  // Échange de pièces entre enfants (l'un DONNE à l'autre)
  const handleGiveCoins = useCallback((fromId, toId, amount)=>{
    const amt=Math.max(0, Math.round(amount||0));
    const fi=config.players.findIndex(p=>p.id===fromId);
    const ti=config.players.findIndex(p=>p.id===toId);
    if(fi<0||ti<0||fi===ti||amt<=0) return false;
    let ok=false;
    setGameStates(gs=>{ const n=[...gs];
      if((n[fi]?.coins||0) < amt) return gs; // pas assez de pièces
      n[fi]={...n[fi], coins:(n[fi].coins||0)-amt};
      n[ti]={...n[ti], coins:(n[ti].coins||0)+amt};
      ok=true; persist(config,n); return n; });
    if(ok){
      const fromP=config.players[fi], toP=config.players[ti];
      pushFeed({type:"gift",playerId:fromId,emoji:"🪙",text:`${displayName(fromP)} a donné ${amt} pièces à ${displayName(toP)} 💛`});
      showToast(`🪙 ${amt} pièces envoyées à ${displayName(toP)}!`,"#D9BC5C",3000);
    } else { showToast("Pas assez de pièces 😅","#D98C8C",2500); }
    return ok;
  },[config,persist,showToast,pushFeed]);

  // 🐛 Signalement de bug → stocké dans config.bugs, visible dans le portail parent
  const handleReportBug = useCallback((text, who)=>{
    const t=(text||"").trim(); if(!t) return false;
    const cfg=cfgRef.current||{};
    const bug={ id:"bug_"+uid(), ts:Date.now(), who:who||"?", text:t.slice(0,300) };
    const n={...cfg, bugs:[bug, ...(cfg.bugs||[])].slice(0,50)};
    setConfig(n); persist(n, gsRef.current);
    showToast("🐛 Merci! Le bug a été envoyé au parent.","#5CAD68",3500);
    return true;
  },[persist,showToast]);

  // OFFRE : un enfant DEMANDE des pièces à un frère (fromId=demandeur, toId=détenteur qui paie)
  const handleCreateOffer = useCallback((fromId, toId, amount)=>{
    const amt=Math.max(1, Math.round(amount||0));
    const cfg=cfgRef.current||{};
    if(fromId===toId || amt<=0 || !cfg.players?.some(p=>p.id===fromId) || !cfg.players?.some(p=>p.id===toId)) return false;
    const offer={ id:"of_"+uid(), fromId, toId, amount:amt, ts:Date.now(), status:"pending" };
    const n={...cfg, coinOffers:[offer, ...(cfg.coinOffers||[])].slice(0,40)};
    setConfig(n); persist(n, gsRef.current);
    const toP=cfg.players.find(p=>p.id===toId);
    showToast(`📨 Demande envoyée à ${displayName(toP)} (${amt} 🪙)`,"#85CDD1",3000);
    return true;
  },[persist,showToast]);

  // RÉPONSE à une offre (par le détenteur toId) : accepter = transférer, refuser = marquer refusé
  const handleRespondOffer = useCallback((offerId, accept)=>{
    const cfg=cfgRef.current||{};
    const offer=(cfg.coinOffers||[]).find(o=>o.id===offerId);
    if(!offer || offer.status!=="pending") return;
    const hi=cfg.players.findIndex(p=>p.id===offer.toId);   // détenteur (paie)
    const ri=cfg.players.findIndex(p=>p.id===offer.fromId); // demandeur (reçoit)
    if(!accept){
      const ncfg={...cfg, coinOffers:(cfg.coinOffers||[]).map(o=>o.id===offerId?{...o,status:"declined"}:o)};
      setConfig(ncfg); persist(ncfg, gsRef.current); showToast("Demande refusée","#888",2500); return;
    }
    let ok=false;
    setGameStates(gs=>{ const n=[...gs];
      if((n[hi]?.coins||0) < offer.amount) return gs; // pas assez
      n[hi]={...n[hi], coins:(n[hi].coins||0)-offer.amount};
      n[ri]={...n[ri], coins:(n[ri].coins||0)+offer.amount};
      ok=true;
      const c=cfgRef.current||{};
      const ncfg={...c, coinOffers:(c.coinOffers||[]).map(o=>o.id===offerId?{...o,status:"accepted"}:o)};
      setConfig(ncfg); persist(ncfg, n); return n;
    });
    if(ok){ const toP=cfg.players[hi], fromP=cfg.players[ri];
      pushFeed({type:"gift",playerId:offer.toId,emoji:"🪙",text:`${displayName(toP)} a envoyé ${offer.amount} pièces à ${displayName(fromP)} 💛`});
      showToast(`✅ ${offer.amount} 🪙 envoyées!`,"#D9BC5C",3000);
    } else showToast("Tu n'as pas assez de pièces 😅","#D98C8C",2500);
  },[persist,showToast,pushFeed]);

  // L'enfant change SON pseudo (dans config.players)
  const handleUpdatePseudo = useCallback((playerIdx, pseudo)=>{
    const clean=(pseudo||"").trim().slice(0,16); if(!clean||!config.players[playerIdx])return;
    const newCfg={...config, players:config.players.map((pl,i)=>i===playerIdx?{...pl,pseudo:clean}:pl)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("✅ Pseudo changé!","#5CAD68");
  },[config,gameStates,persist,showToast]);

  // Annuler une récompense réclamée (remet les pièces) — accessible enfant ET parent
  const handleUnclaimReward = useCallback((playerId, reward)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    // v1.69.0 — VRAI fix « pièces infinies » : le remboursement est IDEMPOTENT par semaine.
    // Cause restante (post-v1.63) : coins/boughtRewards sont en dernière-écriture-gagne au niveau
    // FAMILLE → l'appareil d'un AUTRE enfant qui pousse un instantané périmé ressuscitait la
    // récompense remboursée (le bouton revenait) → re-remboursement sans fin. On pose un tombstone
    // `refundedRewards` (id#semaine, fusionné en UNION = increvable) : on ne rembourse qu'UNE fois.
    const key=reward.id+"#"+weekKey();
    let did=false;
    setGameStates(gs=>{ const n=[...gs]; const p=n[idx];
      if(!(p.boughtRewards||[]).includes(reward.id)) return gs; // pas réclamée → rien
      if((p.refundedRewards||[]).includes(key)){
        // déjà remboursée cette semaine (revenue via une synchro) → on retire juste le bouton, AUCUNE pièce
        n[idx]={...p, boughtRewards:(p.boughtRewards||[]).filter(r=>r!==reward.id), owned:(p.owned||[]).filter(id=>id!==reward.id)}; persist(config,n); return n;
      }
      did=true;
      n[idx]={...p,
        boughtRewards:(p.boughtRewards||[]).filter(r=>r!==reward.id),
        owned:(p.owned||[]).filter(id=>id!==reward.id),              // v2.5.23 — sinon un double-tap Acheter→"J'ai changé d'idée" laisse l'id orphelin dans owned[] pour toujours
        coins:(p.coins||0)+priceOf(reward),                         // rembourse ce qui a été payé (×PRICE_MULT)
        refundedRewards:[...new Set([...(p.refundedRewards||[]), key])].slice(-200) };
      persist(config,n); return n; });
    // v2.6.4 — même piège que v2.5.23 (owned[] orphelin) mais pour les moments : si le remboursement
    // a eu lieu ET que la demande n'a pas encore été engagée par le parent (statut "attente"),
    // on la retire — sinon un fantôme reste pour toujours dans "à planifier". Une demande déjà
    // "planifie"/"fait" (le parent s'est déjà engagé) n'est JAMAIS effacée automatiquement.
    if(did && reward.moment){
      const cfg=cfgRef.current||config;
      const newCfg={...cfg, momentRequests:(cfg.momentRequests||[]).filter(m=>!(m.playerId===playerId && m.rewardId===reward.id && m.status==="attente"))};
      setConfig(newCfg); persist(newCfg,gameStates);
    }
    if(did) showToast("↩️ J'ai changé d'idée — pièces remises!","#D99248");
  },[config,gameStates,persist,showToast]);

  // Minuterie : l'enfant a complété un rituel chronométré → bonus XP + entrée au fil
  const handleRitualTimerDone = useCallback((playerIdx, ritual, minutes)=>{
    const player=config.players[playerIdx]; if(!player)return;
    // XP SEULEMENT si c'est un vrai rituel enregistré (avec id). La minuterie libre = outil, pas de récompense.
    const isRealRoutine = !!(ritual && ritual.id);
    if(!isRealRoutine){
      showToast(`⏱ Minuterie terminée! C'est un outil — pas de récompense. 🙂`,"#888",4000);
      return;
    }
    const bonus=Math.min(40, 5*Math.max(1,(ritual?.taskIds?.length||1)));
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]||{}; n[playerIdx]={...p, xp:(p.xp||0)+bonus};
      const txt=`${displayName(player)} a complété son rituel « ${ritual.name} » en ${minutes} min! (+${bonus} XP)`;
      const fe={id:"f_"+uid(),ts:Date.now(),likes:[],type:"ritual",playerId:player.id,emoji:ritual?.emoji||"⏱",text:txt};
      const newCfg={...config, feed:[fe,...(config.feed||[])].slice(0,60)};
      setConfig(newCfg); persist(newCfg,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("⏱"); SFX.epic&&SFX.epic(); }catch{} showToast(`⏱ Rituel fini en ${minutes} min! +${bonus} XP 🎉`,"#D9BC5C",4500); },150);
  },[config,persist,showToast]);

  // Parent : ajoute un événement au calendrier d'un ou plusieurs enfants (récurrent ou daté)
  const handleAddCalendarEvent = useCallback((playerIds, entry)=>{
    if(!playerIds?.length || !entry?.label?.trim())return;
    setGameStates(gs=>{ const n=[...gs];
      playerIds.forEach(pid=>{ const i=config.players.findIndex(p=>p.id===pid); if(i<0)return;
        const e={ id:Date.now()+"_"+Math.random().toString(36).slice(2,6), type:entry.type||"evenement", label:entry.label.trim(), date:entry.date||null, time:entry.time||null, recur:entry.recur||null, updatedAt:Date.now() };
        n[i]={...n[i], calendar:[...(n[i].calendar||[]), e]};
      });
      persist(config,n); return n; });
    showToast("📅 Événement ajouté au calendrier!","#85CDD1");
  },[config,persist,showToast]);
  // v2.6.6 — modifier/supprimer un événement depuis l'onglet Calendrier parent (retrouvé par
  // playerName car allEntries est agrégé cross-enfants ; le nom est stable, fixé à la création du profil).
  const handleUpdateCalendarEvent = useCallback((playerName, entry)=>{
    const i=config.players.findIndex(p=>(p.name||"")===playerName); if(i<0)return;
    const updated={...entry, updatedAt:Date.now()}; // v2.7.0 — pour que le merge multi-appareils garde la version la plus récente
    setGameStates(gs=>{ const n=[...gs];
      n[i]={...n[i], calendar:(n[i].calendar||[]).map(e=>e.id===entry.id?updated:e)};
      persist(config,n); return n; });
    showToast("📅 Événement modifié!","#85CDD1");
  },[config,persist,showToast]);
  const handleDeleteCalendarEvent = useCallback((playerName, entryId)=>{
    const i=config.players.findIndex(p=>(p.name||"")===playerName); if(i<0)return;
    setGameStates(gs=>{ const n=[...gs];
      // v2.7.0 — tombstone : empêche un appareil pas encore synchronisé de faire « ressusciter » l'événement au prochain merge
      n[i]={...n[i], calendar:(n[i].calendar||[]).filter(e=>e.id!==entryId), removedCalendarIds:[...(n[i].removedCalendarIds||[]), entryId].slice(-400)};
      persist(config,n); return n; });
  },[config,persist]);

  // Objectif du jour réclamé → bonus XP/pièces (une fois par jour)
  const handleClaimDaily = useCallback((playerIdx, obj)=>{
    const wk=todayStamp();
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]; const dc=(p.dailyClaimed&&p.dailyClaimed.day===wk)?p.dailyClaimed:{day:wk,ids:[]};
      if(dc.ids.includes(obj.id))return gs;
      n[playerIdx]={...p, xp:(p.xp||0)+(obj.xp||0), coins:(p.coins||0)+(obj.coins||0), coinsLifetime:(p.coinsLifetime||0)+(obj.coins||0), dailyClaimed:{day:wk,ids:[...dc.ids,obj.id]}};
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🎯"); SFX.epic&&SFX.epic(); }catch{} },120);
    showToast(`🎯 Objectif réussi! +${obj.xp} XP${obj.coins?` +${obj.coins} 🪙`:""}`,"#5CAD68",3500);
  },[config,persist,showToast]);

  // Ouvrir un coffre : déduit le coût, ajoute l'item (ou rembourse un doublon)
  const handleOpenChest = useCallback((playerId, payload)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[idx]; if((p.coins||0)<payload.cost)return gs;
      // Ouvrir un coffre dépense aussi de l'ÉNERGIE (frein sain)
      n[idx]={...p, coins:(p.coins||0)-payload.cost+(payload.dup?(payload.refund||0):0), owned:payload.dup?(p.owned||[]):[...new Set([...(p.owned||[]),payload.itemId])],
        energy:Math.max(0, currentEnergy(p)-CHEST_ENERGY), energyTs:new Date().toISOString()};
      persist(config,n); return n; });
  },[config,persist]);

  // 🍖 Nourrir le familier (1×/jour) → recharge l'énergie + rend le familier content (+XP)
  const handleFeedPet = useCallback((playerIdx)=>{
    const p=gameStates[playerIdx]; if(!p) return;
    const today=todayStamp();
    if(p.lastFedDay===today){ showToast("Ton familier a déjà mangé aujourd'hui 🐾 Reviens demain!","#D99248",3000); return; }
    const eqPet=p.equipped?.pet;
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]; const _g=gainPet(q,eqPet,12);
      n[playerIdx]={...q, lastFedDay:today, energy:Math.min(ENERGY_MAX, currentEnergy(q)+FEED_ENERGY), energyTs:new Date().toISOString(),
        petXp:_g.petXp, petDay:_g.petDay };
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🍖"); SFX.coin&&SFX.coin(); }catch{} },80);
    showToast("🍖 Miam! Ton familier est rassasié et plein d'énergie!","#5CAD68",3000);
  },[gameStates,config,persist,showToast]);

  // 🎾 Jouer avec le familier → coûte de l'énergie, donne de l'XP au familier
  // v2.11.3 — bug_lyr5812 (signalé par un enfant : « familier peut jouer à l'infini ») : la vraie
  // cause n'était pas l'absence de plafond quotidien (gainPet le respecte déjà, PET_DAILY_CAP=50)
  // mais le toast qui affirmait « gagne de l'XP » à CHAQUE clic, même une fois le plafond atteint —
  // l'enfant pouvait donc jouer sans fin en croyant progresser alors que 0 XP était accordé. Fix :
  // toast honnête selon le gain réel, jeu (énergie, animation) toujours permis — pas de blocage dur,
  // cohérent avec le principe directeur (mise en scène OUI, jamais de fausse récompense).
  const handlePlayPet = useCallback((playerIdx)=>{
    const p=gameStates[playerIdx]; if(!p) return;
    const eqPet=p.equipped?.pet;
    if(!eqPet){ showToast("Équipe d'abord un familier 🐾","#D99248",2500); return; }
    if(currentEnergy(p)<PLAY_ENERGY){ const m=minsToEnergy(p,PLAY_ENERGY); showToast(`💤 Ton familier fait une sieste… reviens dans ~${m} min!`,"#85CDD1",3500); return; }
    const today=todayStamp();
    const roomBefore=Math.max(0, PET_DAILY_CAP-((p.petDay&&p.petDay.day===today)?(p.petDay.xp||0):0));
    const gained=Math.min(10,roomBefore)>0;
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]; const _g=gainPet(q,eqPet,10);
      n[playerIdx]={...q, energy:Math.max(0, currentEnergy(q)-PLAY_ENERGY), energyTs:new Date().toISOString(),
        petXp:_g.petXp, petDay:_g.petDay };
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🎾"); SFX.click&&SFX.click(); }catch{} },80);
    showToast(gained ? "🎾 Vous vous êtes bien amusés! Ton familier gagne de l'XP 🌟" : "🎾 Vous vous êtes bien amusés! (Ton familier a atteint son max d'XP du jour — reviens demain 🌙)","#D9BC5C",2800);
  },[gameStates,config,persist,showToast]);

  // v2.4.2 — l'enfant donne un surnom à son familier équipé
  const handleRenamePet = useCallback((playerIdx, petId, nickname)=>{
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]||{};
      n[playerIdx]={...q, petNickname:{...(q.petNickname||{}), [petId]: nickname.trim().slice(0,20)}};
      persist(config,n); return n; });
  },[config,persist]);

  // Cacher une récompense (terminée/utilisée) → une nouvelle prend sa place
  const handleHideReward = useCallback((playerId, reward)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    const wk=todayStamp();
    setGameStates(gs=>{ const n=[...gs]; const p=n[idx]; const sameWeek=p.hiddenWeek===wk; const hidden=sameWeek?[...(p.hiddenRewards||[])]:[]; if(!hidden.includes(reward.id))hidden.push(reward.id); n[idx]={...p, hiddenRewards:hidden, hiddenWeek:wk}; persist(config,n); return n; });
    showToast("✅ Récompense rangée — une nouvelle apparaît!","#5CAD68");
  },[config,persist,showToast]);

  const handleResetPlayer = useCallback((playerIdx) => {
    const player=config.players[playerIdx];
    if(!window.confirm(`Reset ${player?.name}? XP, pièces et tâches seront à 0.`))return;
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={xp:0,coins:0,coinsLifetime:0,coinsWeek:{week:custodyWeekKey()},completed:[],pending:[],owned:[],equipped:{},boughtRewards:[],badges:[],avatar:n[playerIdx].avatar}; persist(config,n); return n; });
    logAction(`🔄 Reset complet: ${player?.name}`,"#D97070");
    showToast(`🔄 ${player?.name} réinitialisé`,"#D97070");
  },[config,persist,logAction,showToast]);

  const handleExport = useCallback(() => {
    exportConfig(config, gameStates);
    logAction("📤 Config exportée","#888");
    showToast("📤 Fichier téléchargé!","#888");
  },[config, gameStates, logAction, showToast]);

  const handleImport = useCallback((file) => {
    importConfig(file, ({config:c, gameStates:gs}) => {
      setConfig(c); setGameStates(gs); setScreen("game");
      persist(c, gs);
      showToast("📥 Config importée!","#5CAD68");
      logAction("📥 Config importée","#5CAD68");
    });
  },[persist, showToast, logAction]);

  const handleChangePin = useCallback((p) => {
    if(p.length!==4||!/^\d{4}$/.test(p))return;
    const newConfig={...config,pin:p};
    setConfig(newConfig);
    persist(newConfig,gameStates);
    logAction(`🔐 PIN changé`,"#888");
    showToast("🔐 PIN mis à jour!","#888");
    setPinChangeMode(false); setNewPin("");
  },[config,gameStates,persist,logAction,showToast]);

  const handleUndo = useCallback(()=>{
    if(!undoStack.length)return;
    const last=undoStack[undoStack.length-1]; setUndoStack(u=>u.slice(0,-1));
    setGameStates(gs=>{ const n=[...gs]; const p=n[last.playerIdx]; n[last.playerIdx]={...p,xp:Math.max(0,p.xp-last.xp),coins:Math.max(0,p.coins-last.coins),completed:(p.completed||[]).filter(k=>k!==last.doneKey)}; persist(config,n); return n; });
    showToast("↩️ Action annulée!","#D99248");
  },[undoStack,config,persist,showToast]);

  // v1.95.0 (Lot 5 #23) — useMemo : sans ça, allTasks/allRewards étaient de nouveaux tableaux
  // à CHAQUE render, ce qui aurait annulé React.memo sur FamilyOverview/ParentPanel/PlayerDashboard
  // (les 3 les reçoivent en prop) même après avoir stabilisé leurs callbacks.
  const allTasks = useMemo(()=>[...TASK_CATALOG,...(config?.customTasks||[])], [config?.customTasks]);
  const allRewards = useMemo(()=>[...REWARD_CATALOG,...(config?.customRewards||[])], [config?.customRewards]);
  // Resolve week theme (random_week → pick based on current week number) — fallback famille
  const weekNum = Math.ceil(new Date().getDate()/7) + new Date().getMonth()*4;
  const resolvedWeekTheme = config?.theme==="random_week"
    ? THEMES[resolveWeekRandomTheme(weekNum)] || THEMES.minecraft
    : THEMES[config?.theme||"minecraft"];
  // Un seul thème à choisir : en vue joueur, tout l'écran (fond, bordures, titres)
  // suit le thème personnel du joueur. La vue famille garde l'ambiance par défaut.
  const viewedPlayer = typeof view==="number" ? config?.players?.[view] : null;
  const th = useMemo(()=>{
    if (!viewedPlayer) return resolvedWeekTheme;
    const ptv = getPlayerTheme(viewedPlayer.themeId==="random" ? resolveRandomTheme(viewedPlayer.id) : viewedPlayer.themeId);
    return { name:ptv.name, bg:ptv.bg, primary:ptv.primary, accent:ptv.accent, card:"rgba(0,0,0,0.5)", text:"#fff" };
  },[viewedPlayer, resolvedWeekTheme]);

  // Mode effectif : chaque enfant choisit le sien (routine|week). Vue famille/parent = accueil Semaine (pas de gros chrono rouge).
  const effectiveMode = typeof view==="number" ? (gameStates[view]?.mode || config?.mode || "routine") : "week";
  // Réglages d'accessibilité de l'enfant affiché → pilotent son/animations/décompte
  const curSettings = (typeof view==="number" ? gameStates[view]?.settings : null) || { sound:true, calm:false, calmCountdown:false, humor:true, focus:false, fontScale:1, readableFont:false };
  setSfxMuted(curSettings.sound === false);
  setCalm(curSettings.calm);
  // Le décompte de routine ne s'affiche que pour un enfant en mode routine, et seulement dans une fenêtre du matin
  // (sinon une routine d'hier soir laisse un gros « EN RETARD » rouge en permanence).
  // Heure de fin: celle de la routine active si elle en a une, sinon l'heure de routine famille
  const activeRoutineObj = (typeof view==="number" && effectiveMode==="routine" && gameStates[view]?.activeRoutineId)
    ? (gameStates[view].routines||[]).find(r=>r.id===gameStates[view].activeRoutineId) : null;
  const countdownEnd = activeRoutineObj
    ? (activeRoutineObj.endTime || "")               // routine ciblée: seulement si elle a une heure de fin
    : (config?.routineEnd || "08:30");               // mode "Toutes les routines": heure famille
  const showCountdown = (()=>{
    if(typeof view!=="number" || effectiveMode!=="routine" || !config || !countdownEnd) return false;
    const [eh,em]=countdownEnd.split(":").map(Number);
    const nowMin=now.getHours()*60+now.getMinutes();
    return nowMin <= (eh*60+em+90); // jusqu'à 90 min après l'heure de fin
  })();

  // Date display (l'affichage H:M est dans <HeaderClock/>, isolé — voir v1.94.0)
  const daysArr=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],mthArr=["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];
  const dateStr=`${daysArr[now.getDay()]} ${now.getDate()} ${mthArr[now.getMonth()]}`;

  // Day progress (routine: 6h–routineEnd, week: Mon–Sun)
  const dayPct = useMemo(()=>{
    if(!config)return 0;
    if(effectiveMode==="routine"){ const [eh,em]=(config.routineEnd||"08:30").split(":").map(Number); const s=new Date();s.setHours(6,0,0,0); const e=new Date();e.setHours(eh,em,0,0); return Math.max(0,Math.min(100,((now-s)/(e-s))*100)); }
    if(effectiveMode==="week"){ return Math.round((todayDayIdx/6)*100); }
    return 0;
  },[config,now,todayDayIdx,effectiveMode]);

  // v1.95.0 (Lot 5 #23) — callbacks stabilisés (useCallback) pour que React.memo sur
  // FamilyOverview/ParentPanel serve à quelque chose : sans ça, ces props recréées
  // en ligne à chaque render de App() auraient toujours été "différentes" pour le
  // comparateur de memo, qui aurait donc re-render ces enfants de toute façon.
  // Placés AVANT les "return" précoces ci-dessous (screen loading/setup/login) — les Hooks
  // doivent être appelés dans le même ordre à chaque render, jamais après un retour conditionnel.
  // config peut être null ici (écrans loading/setup) → chaînage optionnel partout.
  const familyMeId = parentMode ? "parent" : (sessionPlayer!=null ? config?.players?.[sessionPlayer]?.id : "parent");
  const onFamilySelectPlayer = useCallback(i=>{ setView(i); SFX.click(); }, []);
  const onFamilyCanOpen = useCallback(i=> parentMode || sessionPlayer===i, [parentMode, sessionPlayer]);
  const onFamilyLike = useCallback((fid)=> toggleFeedLike(fid, familyMeId), [toggleFeedLike, familyMeId]);
  const onFamilyPostChat = useCallback((text)=>{ pushFeed({type:"chat",playerId:familyMeId,text,emoji:"💬"}); }, [pushFeed, familyMeId]);

  const onParentPanelClose = useCallback(()=>setParentPanel(false), []);
  const onParentPanelExit = useCallback(()=>{ setParentMode(false); setParentPanel(false);
    if(returnToPlayer!=null){ setSessionPlayer(returnToPlayer); setView(returnToPlayer); setReturnToPlayer(null); } // v2.5.3 (Correctif 3) — restaure la session enfant si on est entré depuis elle
    showToast("🔒 Mode parent quitté","#D99248"); }, [showToast, returnToPlayer]);
  const onParentPanelReset = useCallback(()=>{ if(window.confirm("Remettre tous les joueurs à zéro?")){ (config?.players||[]).forEach((_,i)=>handleResetPlayer(i)); } }, [config?.players, handleResetPlayer]);
  const onParentPanelSetup = useCallback(()=>{ setEditingBook(true); setScreen("setup"); setParentPanel(false); }, []);

  // v1.101.0 (Lot 5 #23) — même traitement que FamilyOverview/ParentPanel ci-dessus, mais pour
  // PlayerDashboard : ~26 props callback étaient recréées en ligne à chaque render (curry sur
  // `view`, ou logique courte), rendant un futur React.memo(PlayerDashboard) inefficace. Chaque
  // handler `handleXxx` sous-jacent est déjà un useCallback stable — seule la couche de currying
  // par `view`/`config` manquait. Comportement identique, juste la couche stable ajoutée.
  const onDashUpdateAvatar = useCallback((av,pid)=>{
    const i=config.players.findIndex(p=>p.id===pid); if(i<0)return;
    setGameStates(gs=>{ const n=[...gs]; n[i]={...n[i],avatar:av}; persist(config,n); return n; });
  }, [config, persist]);
  const onDashChildAddTask = useCallback((data)=>handleChildAddTask(view,data), [view, handleChildAddTask]);
  const onDashChildPickTask = useCallback((taskId)=>handleChildPickTask(view,taskId), [view, handleChildPickTask]);
  const onDashChildAddRoutineTask = useCallback((data)=>handleChildAddRoutineTask(view,data), [view, handleChildAddRoutineTask]);
  const onDashRequestRemoval = useCallback((instanceId)=>handleRequestRemoval(view,instanceId), [view, handleRequestRemoval]);
  const onDashUpdatePseudo = useCallback((pseudo)=>handleUpdatePseudo(view,pseudo), [view, handleUpdatePseudo]);
  const onDashFeedPet = useCallback(()=>handleFeedPet(view), [view, handleFeedPet]);
  const onDashPlayPet = useCallback(()=>handlePlayPet(view), [view, handlePlayPet]);
  const onDashRenamePet = useCallback((petId,nickname)=>handleRenamePet(view,petId,nickname), [view, handleRenamePet]);
  const onDashChoosePetEvo = useCallback((petId,tier,el)=>handleChoosePetEvo(view,petId,tier,el), [view, handleChoosePetEvo]);
  const onDashDismissRefusal = useCallback((key)=>handleDismissRefusal(view,key), [view, handleDismissRefusal]);
  const onDashDismissAnnouncement = useCallback((id)=>handleDismissAnnouncement(view,id), [view, handleDismissAnnouncement]); // v2.6.0
  const onDashBossAttack = useCallback((type)=>handleBossAttack(view,type), [view, handleBossAttack]);
  const onDashBossPetAttack = useCallback(()=>handleBossPetAttack(view), [view, handleBossPetAttack]);
  const onDashLogout = useCallback(()=>{SFX.click();setParentMode(false);setSessionPlayer(null);setParentPanel(false);setParentPinOpen(false);setView("family");setScreen("login");}, []);
  const onDashOpenParentPin = useCallback(()=>{SFX.click();setParentPinOpen(true);}, []);
  const onDashReportBug = useCallback((text)=>handleReportBug(text, displayName(config.players[view])), [config, view, handleReportBug]);
  const onDashCloseHam = useCallback(()=>setHamOpen(false), []);
  const onDashGoFamily = useCallback(()=>{setView("family");SFX.click();}, []);
  const onDashGoCalendars = useCallback(()=>{setView("calendars");SFX.click();}, []);
  const onDashGoTimer = useCallback((ritualId)=>{setTimerRitual(ritualId&&typeof ritualId==="string"?ritualId:null);setView("timer");SFX.click();}, []);
  const onDashUnclaimReward = useCallback((reward)=>handleUnclaimReward(config.players[view]?.id, reward), [config, view, handleUnclaimReward]);
  const onDashHideReward = useCallback((reward)=>handleHideReward(config.players[view]?.id, reward), [config, view, handleHideReward]);
  const onDashClaimDaily = useCallback((obj)=>handleClaimDaily(view, obj), [view, handleClaimDaily]);
  const onDashOpenChest = useCallback((payload)=>handleOpenChest(config.players[view]?.id, payload), [config, view, handleOpenChest]);
  const onDashPatchState = useCallback((patch)=>{
    setGameStates(gs=>{ const n=[...gs]; n[view]={...n[view],...patch}; persist(config,n); return n; });
    SFX.click();
  }, [view, config, persist]);
  const onDashChangeTheme = useCallback((themeId)=>{
    const now=new Date().toISOString();
    const newCfg={...config, players: config.players.map((pl,i)=> i===view ? {...pl, themeId, themeChosenAt:now} : pl)};
    setConfig(newCfg); persist(newCfg, gameStates); SFX.epic&&SFX.epic();
    showToast("🎨 Nouveau thème activé pour la semaine!","#D9BC5C",3000);
  }, [view, config, gameStates, persist, showToast]);
  if(screen==="loading") return <div style={{minHeight:"100vh",background:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"safe center"}}><style>{GLOBAL_CSS}</style><div style={{fontFamily:"'Press Start 2P',monospace",fontSize:12,color:"#D9BC5C",animation:"pulse 1s infinite"}}>⚔️ Chargement…</div></div>;
  if(screen==="setup") return <SetupWizard existing={editingBook?config:null} onDone={(d)=>{setEditingBook(false);handleSetupDone(d);}}
    onCancel={editingBook?()=>{setEditingBook(false);setScreen("game");setParentPanel(true);}:null}/>;
  if(screen==="login"&&!config) return <SetupWizard existing={null} onDone={handleSetupDone}/>;
  if(screen==="login") return <LoginScreen config={config} gameStates={gameStates}
    onSelectPlayer={(idx)=>{
      // À la connexion, l'enfant arrive sur l'écran d'accueil Semaine (pas au milieu d'une routine)
      setGameStates(gs=>{ const n=[...gs]; if(n[idx]) n[idx]={...n[idx],mode:"week",activeRoutineId:null}; persist(config,n); return n; });
      setSessionPlayer(idx); setParentMode(false); setView(idx); setScreen("game"); SFX.click();
      // Jouer les fêtes différées (quêtes validées par le parent sur un autre appareil)
      consumeCelebrations(idx);
    }}
    onParentLogin={()=>{ setParentMode(true); setSessionPlayer(null); setView("family"); setScreen("game"); SFX.click(); }}
    onNewSetup={()=>{ setEditingBook(false); setScreen("setup"); }}
    onSetPlayerPin={(idx, newPin)=>{
      const gs = [...gameStates]; gs[idx]={...gs[idx], pin:newPin};
      setGameStates(gs); save({config, gameStates:gs, savedAt:new Date().toISOString()});
    }}
    onCompleteOnboarding={(idx, {themeId, avatar, pseudo, pin})=>{
      const now = new Date().toISOString();
      const newConfig = {...config};
      newConfig.players = config.players.map((pl,i)=> i===idx
        ? {...pl, themeId, pseudo, themeChosenAt:now}
        : pl
      );
      const gs = [...gameStates];
      gs[idx] = {...gs[idx], pin, avatar:{...avatar, configured:true}};
      setConfig(newConfig); setGameStates(gs);
      save({config:newConfig, gameStates:gs, savedAt:now});
    }}/>;


  const currentPlayerView = typeof view==="number" ? view : null;
  const currentPlayer = currentPlayerView!==null ? config.players[currentPlayerView] : null;
  const currentPlayerState = currentPlayerView!==null ? gameStates[currentPlayerView] : null;

  return (
    <div className={"game-root vignette-bg"+(CALM?" calm-mode":"")} style={{minHeight:"100vh",background:th.bg,position:"relative",overflowX:"hidden"}}>
      <style>{GLOBAL_CSS+`
        .nav-btn:hover{opacity:0.85;}
        .task-card:hover{transform:translateY(-1px);}
      `}</style>
      <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at 30% 0%,${th.primary}0E 0%,transparent 55%)`,zIndex:0,pointerEvents:"none"}}/>

      {/* ── HEADER ── */}
      {/* v1.89.0 (desktop/mobile flex) — largeur plafonnée + centrée (comme le contenu et la barre
          d'onglets) pour que l'app reste une colonne confortable au lieu de s'étirer sur un écran
          d'ordinateur — le fond dégradé de game-root reste visible de chaque côté. */}
      <div style={{position:"sticky",top:0,zIndex:100,maxWidth:900,margin:"0 auto",background:`${th.bg}F2`,borderBottom:`2px solid ${th.accent}55`,padding:"9px 12px",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        {/* Title + mode badge */}
        <div style={{flex:1,minWidth:120}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,12px)",color:th.accent}}>{currentPlayer ? `⚔️ Les quêtes de ${displayName(currentPlayer)}` : (sessionPlayer!=null && config.players[sessionPlayer] ? `⚔️ Les quêtes de ${displayName(config.players[sessionPlayer])}` : "⚔️ LIVRE DE QUÊTES")}</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888"}}>{effectiveMode==="routine"?"Mode Rituel ⏰":"Mode Semaine 📅"} — {th.name}</div>
        </div>
        {/* Clock (discrète : heure:minute, sans clignotement) — composant isolé, v1.94.0 */}
        <HeaderClock style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,14px)",color:"#7aa"}}/>
        {/* Indicateur de synchro cloud */}
        {syncedAt>0 && (()=>{ const fresh=(now.getTime()-syncedAt)<40000;
          return <div title={fresh?"Progression synchronisée sur tous les appareils":"En attente de synchro…"}
            style={{fontFamily:"'VT323',monospace",fontSize:13,color:fresh?"#5CAD68":"#666",whiteSpace:"nowrap"}}>☁️{fresh?" ✓":" …"}</div>; })()}
        {/* Contrôles header */}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {parentMode ? (<>
            <button onClick={()=>{SFX.click();setParentPanel(true);}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 12px",background:"#D99248",color:"#0d0d0d",border:"2px solid #D99248",borderRadius:3,cursor:"pointer",boxShadow:"0 0 10px #D9924860",position:"relative"}}>
              🔓 PARENT ▸
              {(()=>{ const nb=gameStates.reduce((s,gs)=>s+(gs.pending||[]).length,0);
                return nb>0?<span style={{position:"absolute",top:-7,right:-7,background:"#D97070",color:"#fff",borderRadius:"50%",minWidth:16,height:16,fontSize:9,lineHeight:"16px",fontFamily:"'Press Start 2P',monospace",padding:"0 2px",border:"2px solid #0d0d0d"}}>{nb}</span>:null; })()}
            </button>
            <button onClick={()=>{SFX.click();setParentMode(false);setParentPanel(false); if(returnToPlayer!=null){ setSessionPlayer(returnToPlayer); setView(returnToPlayer); setReturnToPlayer(null); } showToast("🔒 Mode parent quitté","#D99248");}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 10px",background:"#222",color:"#D99248",border:"2px solid #D99248",borderRadius:3,cursor:"pointer"}} title="Quitter le mode parent">🔒</button>
          </>) : sessionPlayer!=null ? (
            // ☰ Menu enfant (contient réglages, archives, bug, validation parent, quitter)
            <button onClick={()=>{SFX.click(); if(typeof view!=="number") setView(sessionPlayer); setHamOpen(true);}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 14px",background:"#222",color:th.accent,border:`2px solid ${th.accent}66`,borderRadius:3,cursor:"pointer"}} title="Menu">☰ Menu</button>
          ) : (
            <button onClick={()=>{SFX.click();setParentMode(false);setSessionPlayer(null);setParentPanel(false);setParentPinOpen(false);setView("family");setScreen("login");}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 10px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:3,cursor:"pointer"}} title="Déconnexion">🚪</button>
          )}
        </div>
      </div>

      {/* ── ROUTINE COUNTDOWN (sticky below header) ── */}
      {showCountdown&&<div style={{position:"sticky",top:72,zIndex:90,maxWidth:900,margin:"0 auto",padding:"6px 12px",background:`${th.bg}EE`,backdropFilter:"blur(6px)"}}><Countdown endTime={countdownEnd} th={th} calm={curSettings.calmCountdown}/></div>}

      {/* ── DAY PROGRESS ── */}
      <div style={{maxWidth:900,margin:"0 auto",padding:"6px 12px",background:"rgba(0,0,0,0.55)",borderBottom:"2px solid #333"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>{effectiveMode==="routine"?"6h00":"Lun"}</span>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:th.accent}}>
            {effectiveMode==="routine"?"⏱ Progression":"📅 Semaine — "+DAYS_SHORT[todayDayIdx]}
          </span>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>{effectiveMode==="routine"?config.routineEnd:"Dim"}</span>
        </div>
        <div style={{height:12,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden",position:"relative"}}>
          <div style={{height:"100%",width:dayPct+"%",background:`linear-gradient(90deg,${th.primary},${th.accent})`,transition:"width 1s ease",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)",animation:"shimmer 2s infinite"}}/>
          </div>
          {effectiveMode==="week"&&DAYS_SHORT.map((d,i)=><div key={i} style={{position:"absolute",top:0,left:`${(i/6)*100}%`,width:1,height:"100%",background:"rgba(255,255,255,0.1)"}}/>)}
        </div>
      </div>

      {/* ── PLAYER NAV ── (cachée en session enfant : la nav passe par l'accueil-menu + footer) */}
      {!(sessionPlayer!=null && !parentMode) &&
      <div style={{display:"flex",gap:0,maxWidth:900,margin:"0 auto",background:"rgba(0,0,0,0.6)",borderBottom:"2px solid #333",overflowX:"auto"}}>
        <button onClick={()=>{setView("family");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="family"?th.accent:"transparent",color:view==="family"?"#0d0d0d":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          👨‍👩‍👧‍👦 Famille
        </button>
        <button onClick={()=>{setView("calendars");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="calendars"?th.accent:"transparent",color:view==="calendars"?"#0d0d0d":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          📅 Calendriers
        </button>
        <button onClick={()=>{setView("timer");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="timer"?th.accent:"transparent",color:view==="timer"?"#0d0d0d":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          ⏱ Minuterie
        </button>
        {/* Un enfant connecté ne voit QUE son onglet. Le parent voit tout le monde.
            v2.5.8 (Backlog UX item 3) — préfixe "👁️" en mode parent : ces onglets affichent la
            page de l'enfant EN LECTURE (même écran que lui), pas un panneau de gestion — ajuster
            XP/pièces se fait dans le tiroir MODE PARENT → Actions. */}
        {(config.players||[]).map((pl,i)=>({pl,i})).filter(({i})=> parentMode || sessionPlayer===null || sessionPlayer===i).map(({pl,i})=>(
          <button key={pl.id} onClick={()=>{setView(i);SFX.click();}} className="nav-btn"
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view===i?pl.color:"transparent",color:view===i?"#0d0d0d":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,borderBottom:view===i?`3px solid ${pl.color}`:"none"}}>
            {parentMode?"👁️ Voir ":""}{displayName(pl)}
          </button>
        ))}
      </div>}

      {/* ── FOOTER COLLANT enfant : retour à l'accueil depuis Famille/Calendrier/Minuterie ── */}
      {(sessionPlayer!=null && !parentMode && (view==="family"||view==="calendars"||view==="timer")) && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:60,background:"rgba(0,0,0,0.92)",borderTop:"2px solid #333",display:"flex",justifyContent:"center",padding:"8px 10px",paddingBottom:"calc(8px + env(safe-area-inset-bottom))"}}>
          <button onClick={()=>{setView(sessionPlayer);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:th.accent,border:"none",borderRadius:10,padding:"12px 26px",cursor:"pointer"}}>🏠 Accueil</button>
        </div>
      )}

      {/* ── CONTENT ── */}
      {/* paddingBottom dégage le footer fixe pour que la dernière tâche reste atteignable */}
      <div style={{position:"relative",maxWidth:view==="week"?"100%":900,margin:"0 auto",paddingBottom:48}}>
        {view==="calendars"&&(()=>{
          // v2.15.0 — SEULE section calendrier de l'app (demande de Gen, celle accessible via le
          // pied de page collant côté enfant / le bouton "📅 Calendriers" côté parent — l'ancien
          // onglet séparé du tiroir parent a été retiré). Purement événementiel : plus de
          // devoir/examen (ces "tâches à XP" ont été retirées du calendrier, voir migration
          // migrateGameState). Tout le monde peut modifier : le parent peut éditer n'importe quelle
          // entrée de n'importe quel enfant (y compris santé/sport/intervenant/camp, qu'il gère) ;
          // l'enfant connecté peut modifier ses propres entrées "événement".
          const order=(config.players||[]).map((p,i)=>i).sort((a,b)=> (a===sessionPlayer?-1:b===sessionPlayer?1:0));
          const TYPE_OPTIONS = parentMode
            ? [["evenement","📅 Événement"],["sante",CAL_TYPES.sante.label],["sport",CAL_TYPES.sport.label],["intervenant",CAL_TYPES.intervenant.label],["camp",CAL_TYPES.camp.label]]
            : [["evenement","📅 Événement"]];
          const blankForm = { editId:null, ownerIdx:null, type:"evenement", label:"", date:"", time:"", recur:"none", day:0 };
          const resetForm=()=>{ setMyCalForm(blankForm); setMyCalTargets(sessionPlayer!=null?[config.players[sessionPlayer]?.id].filter(Boolean):[]); setMyCalOpen(false); };
          const startEdit=(e,ownerIdx)=>{
            setMyCalForm({editId:e.id,ownerIdx,type:e.type||"evenement",label:e.label,date:e.date||"",time:e.time||"",recur:e.recur?e.recur.freq:"none",day:e.recur?.day??0});
            setMyCalOpen(true);
          };
          const saveForm=()=>{
            if(!myCalForm.label.trim()||(myCalForm.recur==="none"&&!myCalForm.date)) return;
            const payload={
              type: myCalForm.type,
              label: myCalForm.label.trim(),
              date: myCalForm.recur==="none" ? myCalForm.date : null,
              time: myCalForm.time || null,
              recur: myCalForm.recur==="none" ? null : (myCalForm.recur==="weekly" ? {freq:"weekly",day:myCalForm.day} : {freq:"daily"}),
            };
            if(myCalForm.editId!=null){
              const owner=config.players[myCalForm.ownerIdx];
              if(owner) handleUpdateCalendarEvent(owner.name, {...payload, id:myCalForm.editId});
            } else if(myCalTargets.length){
              handleAddCalendarEvent(myCalTargets, payload);
            } else return;
            SFX.click();
            resetForm();
          };
          const deleteEntry=(id,ownerIdx)=>{
            const owner=config.players[ownerIdx];
            if(owner) handleDeleteCalendarEvent(owner.name, id);
            SFX.click();
          };
          return (
            <div style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:th.accent}}>📅 CALENDRIER</div>
              {(sessionPlayer!=null || parentMode) && (
                <div>
                  <button onClick={()=>{ if(myCalOpen) resetForm(); else { setMyCalForm(blankForm); setMyCalTargets(sessionPlayer!=null?[config.players[sessionPlayer]?.id].filter(Boolean):[]); setMyCalOpen(true); } SFX.click(); }}
                    style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"12px",
                      background:myCalOpen?"#1a1a1a":th.accent,color:myCalOpen?th.accent:"#0d0d0d",
                      border:`3px solid ${myCalOpen?th.accent:"#0d0d0d"}`,borderRadius:5,cursor:"pointer",
                      boxShadow:myCalOpen?"none":"4px 4px 0 #0d0d0d",transition:"all 0.12s"}}>
                    {myCalOpen?"✕ Fermer":"➕ Ajouter un événement"}
                  </button>
                  {myCalOpen && (
                    <div style={{marginTop:8,background:"rgba(0,0,0,0.5)",border:`2px solid ${th.accent}`,borderRadius:5,padding:10,display:"flex",flexDirection:"column",gap:6}}>
                      {TYPE_OPTIONS.length>1 && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {TYPE_OPTIONS.map(([v,l])=>(
                          <button key={v} onClick={()=>{setMyCalForm(f=>({...f,type:v}));SFX.click();}}
                            style={{flex:"1 0 auto",fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px 8px",background:myCalForm.type===v?th.accent:"#1a1a1a",color:myCalForm.type===v?"#0d0d0d":"#888",border:`2px solid ${myCalForm.type===v?th.accent:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                            {l}
                          </button>
                        ))}
                      </div>}
                      <input value={myCalForm.label} onChange={e=>setMyCalForm(f=>({...f,label:e.target.value.slice(0,50)}))} placeholder="Cours de natation, rendez-vous..."
                        style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none",width:"100%",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {[["none","Une date"],["weekly","Chaque semaine"],["daily","Chaque jour"]].map(([v,l])=>(
                          <button key={v} onClick={()=>{setMyCalForm(f=>({...f,recur:v}));SFX.click();}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 8px",background:myCalForm.recur===v?"#D99248":"#1a1a1a",color:myCalForm.recur===v?"#0d0d0d":"#888",border:`2px solid ${myCalForm.recur===v?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>
                        ))}
                      </div>
                      {myCalForm.recur==="none" && <input type="date" value={myCalForm.date} onChange={e=>setMyCalForm(f=>({...f,date:e.target.value}))}
                        style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none",width:"100%",boxSizing:"border-box"}}/>}
                      {myCalForm.recur==="weekly" && <select value={myCalForm.day} onChange={e=>setMyCalForm(f=>({...f,day:+e.target.value}))}
                        style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4}}>{DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}</select>}
                      <div>
                        <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888",marginBottom:2}}>Heure (optionnel)</div>
                        <input type="time" value={myCalForm.time} onChange={e=>setMyCalForm(f=>({...f,time:e.target.value}))}
                          style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none"}}/>
                      </div>
                      {parentMode && myCalForm.editId==null && (
                        <div>
                          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888",marginBottom:4}}>Pour quel enfant?</div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {config.players.map(pl=>{ const sel=myCalTargets.includes(pl.id); return (
                              <div key={pl.id} onClick={()=>setMyCalTargets(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#0d0d0d":"#555",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>
                            ); })}
                          </div>
                        </div>
                      )}
                      <button onClick={saveForm}
                        style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px",background:th.accent,color:"#0d0d0d",border:"none",borderRadius:3,cursor:"pointer"}}>
                        ✓ {myCalForm.editId!=null?"Modifier":"Enregistrer"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* v2.15.2 — colonnes flex qui s'ajustent (demande de Gen) : les calendriers des
                  enfants se placent côte à côte quand l'écran le permet, et s'empilent sur mobile. */}
              <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-start"}}>
              {order.map(i=>{ const p=config.players[i]; const cal=(gameStates[i]?.calendar)||[];
                const mine=i===sessionPlayer;
                const items=cal.flatMap(e=>upcomingOccurrences(e,14).map(d=>({d,e}))).sort((a,b)=>a.d.localeCompare(b.d)||(a.e.time||"").localeCompare(b.e.time||"")).slice(0,20);
                // Regroupement par date, puis par section de moment de journée à l'intérieur de chaque date.
                const byDate=new Map(); for(const it of items){ if(!byDate.has(it.d)) byDate.set(it.d,[]); byDate.get(it.d).push(it.e); }
                return (
                  <div key={p.id} style={{background:"rgba(0,0,0,0.5)",border:`2px solid ${p.color}99`,borderRadius:8,padding:12,flex:"1 1 300px",minWidth:0}}>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:p.color,marginBottom:6}}>{displayName(p)}{mine?" (toi)":""}</div>
                    {byDate.size===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#777"}}>Rien de prévu dans les 2 prochaines semaines.</div>}
                    {[...byDate.entries()].map(([d,evs])=>{
                      const noTime=evs.filter(e=>!e.time);
                      const withTime=evs.filter(e=>e.time);
                      // Colonnes flex verticales séparées par section (demande de Gen) — un bloc par
                      // moment de journée, chacun empilant ses entrées, avec un filet de séparation
                      // entre blocs plutôt qu'un simple retrait de texte.
                      const sections=[{label:"Toute la journée",evs:noTime}, ...DAY_PARTS.map(p2=>({label:p2.label,evs:withTime.filter(e=>dayPartOf(e.time)?.key===p2.key)}))].filter(s=>s.evs.length>0);
                      return (
                        <div key={d} style={{marginBottom:10}}>
                          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",marginBottom:4}}>{fmtDateShort(d)}</div>
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>
                            {sections.map(sec=>(
                              <div key={sec.label} style={{display:"flex",flexDirection:"column",gap:4,paddingTop:6,borderTop:"1px solid #262626"}}>
                                <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#777"}}>{sec.label}</div>
                                {sec.evs.map((e,k)=>{
                                  const editable = parentMode || (mine && (e.type||"evenement")==="evenement");
                                  return (
                                  <div key={k} style={{display:"flex",gap:8,alignItems:"center",padding:"3px 0"}}>
                                    <span style={{fontSize:14}}><UIIcon name={calEventIconName(e)} emoji={calEventIcon(e)} size={14}/></span>
                                    {e.time && <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",minWidth:34}}>{e.time}</span>}
                                    <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",flex:1}}>{e.label}</span>
                                    {editable && <>
                                      <button onClick={()=>startEdit(e,i)} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:13,lineHeight:1}}>✏️</button>
                                      <button onClick={()=>deleteEntry(e.id,i)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:14,lineHeight:1}}>✕</button>
                                    </>}
                                  </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              </div>
            </div>
          );
        })()}
        {view==="timer"&&(
          <TimerView config={config} gameStates={gameStates} sessionPlayer={sessionPlayer} parentMode={parentMode} th={th} onComplete={handleRitualTimerDone} initialRitualId={timerRitual} onCompleteTask={requestComplete}/>
        )}
        {view==="family"&&(()=>{
          // v1.60.0 — stats familiales : quêtes accomplies par étiquette, agrégées sur tous les enfants
          // v2.6.6 — même bug que le graphique XP : ignorait config.weeklyQuests.assignments, donc
          // sous-comptait "quêtes accomplies ensemble" pour tout ce qui passe par le système rotatif.
          const catByInst={}; [...(config.assignments||[]), ...(config.weeklyQuests?.assignments||[])].forEach(a=>{ const t=allTasks.find(x=>x.id===a.taskId); if(t) catByInst[a.instanceId]=t.cat; });
          const counts={}; let total=0;
          (gameStates||[]).forEach(gs=>{ (gs.completed||[]).forEach(k=>{ const base=k.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_")); const cat=catByInst[inst]; if(cat){ counts[cat]=(counts[cat]||0)+1; total++; } }); });
          if(total===0) return null;
          const cats=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
          const maxN=Math.max(...cats.map(c=>counts[c]));
          return (
            <div style={{background:th.card||"rgba(0,0,0,0.5)",border:`2px solid ${(th.accent||"#D9BC5C")}55`,borderRadius:10,padding:14,margin:"4px 0 12px"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:th.accent||"#D9BC5C",marginBottom:4}}>📊 Stats de la famille</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#fff",marginBottom:10}}>{total} quêtes accomplies ensemble! 🎉</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {cats.map(c=>{ const m=catMeta(c); const w=Math.round(counts[c]/maxN*100); return (
                  <div key={c}>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}><span style={{color:m.color}}>{m.label}</span><span>{counts[c]}</span></div>
                    <div style={{height:10,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:w+"%",background:m.color,transition:"width 0.6s"}}/></div>
                  </div>
                );})}
              </div>
            </div>
          );
        })()}
        {view==="family"&&(
          <FamilyOverview config={config} gameStates={gameStates} allTasks={allTasks} onSelectPlayer={onFamilySelectPlayer} canOpen={onFamilyCanOpen} th={th}
            onGiveCoins={handleGiveCoins}
            onCreateOffer={handleCreateOffer}
            meId={familyMeId}
            onLike={onFamilyLike}
            onPostChat={onFamilyPostChat}/>
        )}
        {typeof view==="number"&&(
          <PlayerDashboard
            player={config.players[view]}
            playerIdx={view}
            pState={gameStates[view]||{xp:0,coins:0,completed:[],pending:[],owned:[],equipped:{},boughtRewards:[],calendar:[]}}
            config={config}
            assignments={[...(config.assignments||[]),...(isCustodyWeek()?(config.weeklyQuests?.assignments||[]):[])]}
            weeklyChallenge={isCustodyWeek()?config.weeklyChallenge:null}
            onChallengeCheckin={(date,val)=>handleChallengeCheckin(config.players[view].id,date,val)}
            allTasks={allTasks}
            allRewards={allRewards}
            onRequestComplete={requestComplete}
            onBuy={handleBuy}
            onEquip={handleEquip}
            onUpdateAvatar={onDashUpdateAvatar}
            onChildAddTask={onDashChildAddTask}
            onChildPickTask={onDashChildPickTask}
            onChildAddRoutineTask={onDashChildAddRoutineTask}
            onRequestRemoval={onDashRequestRemoval}
            showToast={showToast}
            onUpdatePseudo={onDashUpdatePseudo}
            onRespondOffer={handleRespondOffer}
            onFeedPet={onDashFeedPet}
            onPlayPet={onDashPlayPet}
            onRenamePet={onDashRenamePet}
            onChoosePetEvo={onDashChoosePetEvo}
            onDismissRefusal={onDashDismissRefusal}
            onDismissAnnouncement={onDashDismissAnnouncement}
            onBossAttack={onDashBossAttack}
            onBossPetAttack={onDashBossPetAttack}
            allStates={gameStates}
            onLogout={onDashLogout}
            onOpenParentPin={onDashOpenParentPin}
            onReportBug={onDashReportBug}
            hamOpen={hamOpen} onCloseHam={onDashCloseHam}
            onGoFamily={onDashGoFamily}
            onGoCalendars={onDashGoCalendars}
            onGoTimer={onDashGoTimer}
            onUnclaimReward={onDashUnclaimReward}
            onHideReward={onDashHideReward}
            onClaimDaily={onDashClaimDaily}
            onOpenChest={onDashOpenChest}
            parentMode={parentMode}
            playerMode={gameStates[view]?.mode || config.mode || "routine"}
            todayDayIdx={todayDayIdx}
            onPatchState={onDashPatchState}
            onChangeTheme={onDashChangeTheme}
            onDeComplete={handleDeComplete}
            onForceComplete={handleForceComplete}
            th={th}
          />
        )}
      </div>

      {/* ── MODALS ── */}
      {/* Parent Panel slide-out */}
      {parentMode && parentPanel && (
        <ParentPanel
          config={config} gameStates={gameStates} parentMode={parentMode}
          actionLog={actionLog} undoStack={undoStack} players={config.players} th={th}
          allTasks={allTasks}
          onApprovePending={approvePending}
          onRefusePending={refusePending}
          onAddAssignment={handleAddAssignment}
          onAssignRoutine={handleAssignRoutine}
          onLaunchBoss={handleLaunchBoss}
          onCreateRepairQuest={handleCreateRepairQuest}
          onPlanMoment={handlePlanMoment}
          onMarkMomentDone={handleMarkMomentDone}
          bossActive={!!(config.boss && !config.boss.defeatedAt)}
          onRemoveAssignment={handleRemoveAssignment}
          onApproveRemoval={handleApproveRemoval}
          onRefuseRemoval={handleRefuseRemoval}
          onApproveProposal={handleApproveProposal}
          onRefuseProposal={handleRefuseProposal}
          onClearChildTasks={handleClearChildTasks}
          onAddCustomTask={handleAddCustomTask}
          onClose={onParentPanelClose}
          onExitParent={onParentPanelExit}
          onUndo={handleUndo}
          onReset={onParentPanelReset}
          onResetPlayer={handleResetPlayer}
          onAdjustXP={handleAdjustXP}
          onAdjustCoins={handleAdjustCoins}
          onChangePin={handleChangePin}
          onExport={handleExport}
          onImport={handleImport}
          onSetup={onParentPanelSetup}
          onUpdateChallenge={handleUpdateChallenge}
          onCreateAnnouncement={handleCreateAnnouncement}
          onResendAnnouncement={handleResendAnnouncement}
          onDeleteAnnouncement={handleDeleteAnnouncement}
        />
      )}

      {parentPinOpen&&(
        <PinPad pin={config.pin} label="Accès mode parent" onSuccess={()=>{ const turningOn=!parentMode; setParentMode(turningOn); setParentPinOpen(false); if(turningOn){ if(sessionPlayer!=null) setReturnToPlayer(sessionPlayer); setSessionPlayer(null); setView("family"); } showToast(turningOn?"🔓 Mode parent activé!":"🔒 Mode parent désactivé","#D99248"); }} onCancel={()=>setParentPinOpen(false)} th={th}/>
      )}
      {bossWin&&(
        <div onClick={()=>{setBossWin(null);SFX.click&&SFX.click();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:3200,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto",cursor:"pointer"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(160deg,#1a2e1a,#0c220c)",border:`5px solid ${bossWin.color||"#D9BC5C"}`,borderRadius:16,padding:"28px 26px",maxWidth:380,width:"100%",maxHeight:"90vh",overflowY:"auto",textAlign:"center",boxShadow:`0 0 50px ${bossWin.color||"#D9BC5C"}70`,animation:"bounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1)"}}>
            {/* Refonte visuelle Phase 6 — rayons derrière l'emoji du boss vaincu + glowPulse sur
                "VICTOIRE!" (pur CSS, tués par .calm-mode/prefers-reduced-motion). */}
            <div style={{position:"relative",width:90,height:90,margin:"0 auto 6px",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div className="rays-bg" style={{color:bossWin.color||"#D9BC5C"}}/>
              <div style={{fontSize:64,lineHeight:1,position:"relative",zIndex:1}}>{bossWin.emoji||"🐲"}</div>
            </div>
            <div className="glow-pulse" style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,18px)",color:"#D9BC5C",marginBottom:8}}>🏆 VICTOIRE!</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:19,color:"#fff",marginBottom:8,lineHeight:1.3}}>Vous avez vaincu<br/><b style={{color:bossWin.color||"#D9BC5C"}}>{bossWin.name}</b> en équipe! 💪</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#5CAD68",margin:"12px 0 8px",lineHeight:1.6}}>+40 <Coin size={12}/> · +50 <Xp size={12}/><br/>🐲 Badge « Tombeur de Boss »!</div>
            {bossWin.items && bossWin.items.length>0 && (
              <div style={{background:"rgba(255,91,174,0.12)",border:"2px solid #FF5BAE",borderRadius:10,padding:"10px 12px",margin:"4px 0 8px"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FF5BAE",marginBottom:6}}>🎁 ITEM ULTRA LÉGENDAIRE!</div>
                {bossWin.items.map((it,i)=>(<div key={i} style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#fff"}}><span style={{fontSize:22}}>{it.emoji}</span> {it.name}</div>))}
              </div>
            )}
            <button className="btn-press" onClick={()=>{setBossWin(null);SFX.click&&SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 24px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d",marginTop:4}}>🎉 Bravo!</button>
          </div>
        </div>
      )}
      {rewardPopup&&(
        <RewardPopup task={rewardPopup.task} player={rewardPopup.player} newBadges={rewardPopup.newBadges||[]} onClose={()=>{setRewardPopup(null);SFX.click();}} th={th}/>
      )}
      {miniGame&&(
        <MiniGame player={miniGame.player} playerThemeId={miniGame.playerThemeId} level={miniGame.level} forcedType={miniGame.forcedType} isGift={miniGame.isGift} onFinish={handleMiniGameEnd}/>
      )}
      {toast&&<Toast msg={toast.msg} color={toast.color}/>}

      {/* ── VERSION FOOTER ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"safe center",gap:10,padding:"5px 12px",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",zIndex:50,borderTop:"1px solid #222",paddingBottom:"calc(5px + env(safe-area-inset-bottom))"}}>
        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#444"}}>Livre de Quêtes v{APP_VERSION}</span>
        <button
          onClick={()=>{
            // Copie l'adresse au presse-papier + confirme (mailto ne mène nulle part sans app de courriel)
            try{ navigator.clipboard&&navigator.clipboard.writeText(BUG_EMAIL); }catch{}
            showToast(`🐛 Bug? Écris à ${BUG_EMAIL} (adresse copiée!)`,"#D99248",7000);
            const subject=encodeURIComponent(`[Bug v${APP_VERSION}] `);
            const body=encodeURIComponent(`Version: ${APP_VERSION}\nDate: ${new Date().toLocaleString("fr-CA")}\n\nDécris le bug ici:\n\n`);
            try{ window.open(`mailto:${BUG_EMAIL}?subject=${subject}&body=${body}`,"_blank"); }catch{}
          }}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"3px 8px",background:"transparent",color:"#444",border:"1px solid #333",borderRadius:3,cursor:"pointer"}}
          title="Rapporter un bug"
        >🐛 bug</button>
      </div>
    </div>
  );
}
