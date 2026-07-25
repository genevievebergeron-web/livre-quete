import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { SFX, setSfxMuted } from "./sfx.js";
import { CALM, setCalm } from "./calm.js";
import { PLAYER_THEMES, THEME_XP_UNLOCK, PT_LIST, getPlayerTheme, BASE_SHOP_ITEMS, ALL_SHOP_ITEMS, shopItemById, ULTRA_ITEMS, pickUltraLegendary } from "./themes.js";
import { PET_LEVELS, PET_STAGES, PET_DAILY_CAP, petLevel, petStage, petBar, mergePetXp, PET_SPRITES, PET_SPRITE_KEY, petSpriteKey, renderPetToCtx, ITEM_SPRITES, renderItemToCtx, PET_ELEMENTS, PET_ELEMENT_KEYS, petTierForLevel, petActiveElement, petIsLegendary, petFormLabel, petPalOverride, petPendingTier, petEvoOptions } from "./pets.js";
import { LEVELS, getLevel, getLevelTitle, xpBar } from "./leveling.js";
import { TASK_CATALOG, CAT_LABELS, DIFF_COLOR, REWARD_CATALOG, REWARD_CAT_BADGE, RARITIES, rarityOf, PRICE_MULT, baseCost, priceOf, DIFF_PRESETS, CHILD_DIFF_PRESETS, CAT_META, catMeta, normLabel, CAL_TYPES, calEventIcon, REFUS_MSGS, refusMsg, BADGES, completionCatCounts, checkBadges } from "./catalog.js";
import { Countdown, HeaderClock, TimeTimerDisc } from "./timers.jsx";
import { PetSprite, ItemSprite, HELD_WEAPON_IDS, AVATAR_EQUIP_ANCHORS, equipAnchorStyle, EquippedGear, badgeSymbol, renderBadgeToCtx, BadgeIcon, CHESTS, pickFromChest, renderChestToCtx, ChestSprite } from "./sprites.jsx";
import { Toast, PinDots, PinKeypad } from "./ui.jsx";
import { DAYS_SHORT, displayName, THEMES, uid, todayStamp, weekKey, getWeeklyFreeTheme, isThemeUnlocked, GLOBAL_CSS, COLOR_DESATURATE_MAP } from "./shared.js";
import { WeekView } from "./weekview.jsx";
import { TaskChooser, CustomTaskModal } from "./taskpickers.jsx";
import { EvolutionModal, PinPad, RewardPopup } from "./popups.jsx";
import { SetupWizard } from "./setupwizard.jsx";
import { AVATAR_PARTS, DEFAULT_AVATAR, renderAvatarToCtx, AvatarCanvas } from "./avatar.jsx";
import { PlayerProfile } from "./playerprofile.jsx";
import { AvatarPopup } from "./avatarpopup.jsx";
import { spawnParticles } from "./particles.js";
import { InlineRitualTimer } from "./ritualtimer.jsx";
import { isCustodyWeek, custodyWeekKey, generateCustodyWeekAssignments, isCustodyThursday, hasPerfectChallengeWeek, CHALLENGE_PERFECTION_FRAME_ID } from "./recurring.js";

const APP_VERSION = "2.5.2";
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
const bossDamageTotal = (gameStates, bossId) => (gameStates || []).reduce((s, g) => s + ((_bb(g, bossId)?.dmg) || 0), 0);
const bossJetons = (gs, bossId) => { const b = _bb(gs, bossId); return b ? Math.max(0, (b.earned || 0) - (b.spent || 0)) : 0; };
// v1.76.0 — l'Hydre ne peut être ACHEVÉE que si toutes les corvées du jour (cust_hydre_) sont complétées par les enfants assignés
const bossQuestsAllDone = (config, states) => {
  try {
    const todayIdx=(new Date().getDay()+6)%7, stamp=todayStamp();
    const corv=(config?.assignments||[]).filter(a=>typeof a.taskId==="string" && a.taskId.startsWith("cust_hydre_") && Array.isArray(a.days) && a.days.includes(todayIdx));
    if(!corv.length) return true; // aucune corvée d'Hydre aujourd'hui → pas de verrou
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
  { version:"2.5.2", date:"2026-07-25", features:[
    "🐾 Tu peux maintenant donner un surnom à ton familier! Touche le petit ✏️ à côté de son nom pour le renommer comme tu veux.",
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
        try { localStorage.setItem(STORE_KEY, JSON.stringify(toWrite)); LAST_SAVED_AT = toWrite.savedAt || LAST_SAVED_AT; } catch {}
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
        try { localStorage.setItem(STORE_KEY, JSON.stringify(toWrite)); LAST_SAVED_AT = toWrite.savedAt || LAST_SAVED_AT; } catch {}
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
const _mergeCalendar = (a, b) => {
  const out = []; const seen = new Set();
  for (const e of [...(a || []), ...(b || [])]) {
    const k = e && e.id != null ? "id:" + e.id : JSON.stringify(e);
    if (!seen.has(k)) { seen.add(k); out.push(e); }
  }
  return out;
};
// Fusion d'un état de joueur — non régressive (max XP/pièces, union des listes)
const mergeGS = (a, b, preferIncoming) => {
  a = a || {}; b = b || {};
  const completed = _uniq([...(a.completed || []), ...(b.completed || [])]);
  const refusedKeys = _uniq([...(a.refusedKeys || []), ...(b.refusedKeys || [])]).slice(-400); // v1.64.0 — tombstone des demandes refusées
  const _refusedSet = new Set(refusedKeys);
  const avatarConfigured = b.avatar?.configured ? b.avatar : (a.avatar?.configured ? a.avatar : { ...(a.avatar || {}), ...(b.avatar || {}) });
  return {
    ...a, ...b,
    xp: Math.max(a.xp || 0, b.xp || 0),
    // ⚠️ Les pièces se DÉPENSENT : un max() ramènerait l'argent dépensé (achats infinis).
    // → dernière écriture gagne (l'appareil qui a changé le solde le plus récemment gagne).
    coins: preferIncoming ? (b.coins ?? a.coins ?? 0) : (a.coins ?? b.coins ?? 0),
    coinsLifetime: Math.max(a.coinsLifetime || 0, b.coinsLifetime || 0), // v2.5.0 — jamais décrémenté, donc fusion sûre par max (comme xp)
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
    calendar: _mergeCalendar(a.calendar, b.calendar),
    avatar: avatarConfigured,
    // PIN : dernière écriture gagne (permet de changer le code d'un enfant depuis un autre appareil)
    pin: preferIncoming ? (b.pin ?? a.pin ?? null) : (a.pin ?? b.pin ?? null),
    mode: b.mode ?? a.mode ?? null,
    routines: (() => { const m = new Map(); for (const r of [...(a.routines || []), ...(b.routines || [])]) { if (r && r.id != null && !m.has(r.id)) m.set(r.id, r); } return [...m.values()]; })(),
    activeRoutineId: b.activeRoutineId ?? a.activeRoutineId ?? null,
    hiddenRewards: _uniq([...(a.hiddenRewards||[]),...(b.hiddenRewards||[])]),
    hiddenWeek: b.hiddenWeek ?? a.hiddenWeek ?? null,
    dailyClaimed: (()=>{ const A=a.dailyClaimed||{}, B=b.dailyClaimed||{}; if(A.day&&A.day===B.day) return {day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])])}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(),
    ritualCelebrated: (()=>{ const A=a.ritualCelebrated||{}, B=b.ritualCelebrated||{}; if(A.day&&A.day===B.day) return {day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])])}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(), // v1.68.0 (B5) — garde « rituel déjà fêté aujourd'hui »
    // File « consommable » : dernière écriture gagne (l'union empêcherait l'enfant de la vider après l'avoir jouée)
    pendingCelebrations: preferIncoming ? (b.pendingCelebrations || []) : (a.pendingCelebrations || []),
    petXp: mergePetXp(a.petXp, b.petXp), // XP des familiers : max par familier (ne fait que monter)
    petDay: (()=>{ const A=a.petDay||{}, B=b.petDay||{}; if(A.day&&A.day===B.day) return {day:A.day, xp:Math.max(A.xp||0,B.xp||0)}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(), // v1.52.0 — plafond quotidien familier (merge-safe)
    petEvo: (()=>{ const out={...(a.petEvo||{})}; const B=b.petEvo||{}; for(const k in B){ out[k]={...(B[k]||{}), ...(out[k]||{})}; } return out; })(), // v1.57.0 — voies d'évolution choisies (collant : 1er choix gagne)
    petNickname: {...(a.petNickname||{}), ...(b.petNickname||{})}, // v2.4.2 — surnom par familier (union ; dernier nom donné gagne par petId)
    // Énergie : consommable → dernière écriture gagne (la paire valeur+horodatage voyage ensemble)
    energy: (preferIncoming ? b.energy : a.energy) ?? (a.energy ?? b.energy ?? 100),
    energyTs: (preferIncoming ? b.energyTs : a.energyTs) ?? (a.energyTs ?? b.energyTs ?? null),
    lastFedDay: [a.lastFedDay, b.lastFedDay].filter(Boolean).sort().pop() || null, // jour le plus récent
    activeDays: _uniq([...(a.activeDays||[]), ...(b.activeDays||[])]), // union (série merge-safe)
    bossBattle: mergeBossBattle(a.bossBattle, b.bossBattle), // jetons/dégâts monotones par boss → max

    settings: { ...(a.settings || {}), ...(b.settings || {}) },
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
    try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch {}
    LAST_SAVED_AT = remote.savedAt || null;
    return remote;
  }
  // Cloud JOINT mais VIDE (remote===null) → on peut semer le local sans risque d'écraser quoi que ce soit
  if (remote === null && local) remotePush(local);
  // remote===PULL_FAILED → échec réseau : on NE touche PAS au cloud, on garde le local et la boucle réessaiera
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
  const coinsWeekReset = gs.coinsWeek && gs.coinsWeek.week !== cwk;
  return {
    xp: 0, completed: [], pending: [], owned: [], equipped: {}, boughtRewards: [], badges: [],
    ...gs,
    badges: gs.badges || [],
    boughtRewards: gs.boughtRewards || [],
    refundedRewards: gs.refundedRewards || [], // v1.69.0 — tombstone anti-remboursement-infini
    pending: gs.rotativeCleanupV1 ? (gs.pending || []) : [], // v1.108.0 — ménage unique (Gen) : vide les tâches en suspens pour la bascule vers les quêtes rotatives
    rotativeCleanupV1: true, // v1.108.0 — drapeau : ménage de transition Lot 7 appliqué (xp/coins/badges/completed/routines intacts)
    coinsLifetime: gs.coinsLifetime ?? (gs.coins || 0), // v2.5.0 — jamais réinitialisé ni décrémenté (badges Petit Trésor/Oncle Picsou), seedé depuis le solde actuel au premier déploiement
    coins: coinsWeekReset ? 0 : (gs.coins || 0), // v2.5.0 — remis à 0 au changement de semaine de garde (vendredi minuit)
    coinsWeek: { week: cwk }, // v2.5.0 — stamp de la semaine de garde déjà appliquée à `coins`
    pin: gs.pin ?? null,
    mode: gs.mode ?? null,        // v1.13.0 — mode choisi par l'enfant ("routine"|"week"); null = défaut famille
    routines: gs.routines || [],  // v1.13.0 — routines créées par l'enfant: [{id,name,emoji,taskIds:[instanceId]}]
    activeRoutineId: gs.activeRoutineId ?? null, // routine en cours (null = aucune / toutes)
    settings: { sound:true, calm:false, calmCountdown:false, humor:true, focus:false, fontScale:1, readableFont:false, ...(gs.settings||{}) }, // v1.16.0 — réglages d'accessibilité par enfant (fontScale/readableFont: v1.87.0, Lot 3 #12)
    hiddenRewards: gs.hiddenRewards || [], // v1.23.0 — récompenses cachées cette semaine
    hiddenWeek: gs.hiddenWeek ?? null,
    dailyClaimed: gs.dailyClaimed || { day:null, ids:[] }, // v1.28.0 — objectifs du jour réclamés
    pendingCelebrations: gs.pendingCelebrations || [], // v1.31.0 — fêtes (popup/jeu) différées vers l'appareil de l'enfant
    petXp: gs.petMigV2 ? (gs.petXp || {}) : migratePetXpV2(gs.petXp), // v1.52.0 — migration anti-rétrogradation (une seule fois)
    petMigV2: true, // v1.52.0 — drapeau : migration de courbe des familiers appliquée
    petDay: gs.petDay || { day:null, xp:0 }, // v1.52.0 — plafond quotidien d'XP du familier
    petEvo: gs.petEvo || {}, // v1.57.0 — voies d'évolution par familier {petId:{1,2,3}}
    petNickname: gs.petNickname || {}, // v2.4.2 — surnom personnalisé par familier {petId:string}
    completedAt: gs.completedAt || {}, // v1.60.0 — horodatage de complétion {doneKey:ISO}
    refusedKeys: gs.refusedKeys || [], // v1.64.0 — tombstone des demandes refusées
    refusals: gs.refusals || [], // v1.64.0 — file du message drôle de refus à montrer à l'enfant
    energy: gs.energy == null ? 100 : gs.energy, // v1.41.0 — énergie (sieste/frein sain)
    energyTs: gs.energyTs || null,
    lastFedDay: gs.lastFedDay || null,           // v1.41.0 — Tamagotchi : nourri le jour…
    activeDays: gs.activeDays || [],             // v1.41.0 — jours avec ≥1 quête (pour la série 🔥)
    bossBattle: gs.bossBattle || {bossId:null,earned:0,spent:0,dmg:0}, // v1.42.0 — combat de boss (jetons/dégâts)
    calendar: gs.calendar || [],  // v1.6.0 — examens/devoirs
    avatar: {
      skin:"sk1", eyes:"ey1", mouth:"mo1", hair:"ha1",
      ...oldAvatar,
      configured: oldAvatar.configured ?? hasPin, // v1.6.0 — true = onboarding complété
    },
  };
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
  if (!Array.isArray(mergedConfig.feed)) mergedConfig.feed = []; // v1.19.0 — fil de famille
  return {
    ...data,
    config: mergedConfig,
    gameStates: (data.gameStates || []).map(migrateGameState),
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
    try{ const hc=document.createElement("canvas"); hc.width=hc.height=96;
      renderAvatarToCtx(hc.getContext("2d"), pState.avatar||DEFAULT_AVATAR, getPlayerTheme(player.themeId).charBodyColor||player.color, 96,96,false);
      hero=hc.toDataURL("image/png"); }catch(e){}
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
// v1.101.0 (Lot 5 #23) — memo() : App() passe maintenant des callbacks stabilisés (voir plus bas),
// donc un re-render de App() ne force plus systématiquement un re-render de tout le dashboard.
const PlayerDashboard = memo(function PlayerDashboard({ player, playerIdx, pState, config, assignments, allTasks, allRewards, onRequestComplete, onBuy, onEquip, onChildAddTask, onChildPickTask, onChildAddRoutineTask, onRequestRemoval, onUpdatePseudo, onRespondOffer, showToast, onFeedPet, onPlayPet, onRenamePet, onChoosePetEvo, onDismissRefusal, onBossAttack, onBossPetAttack, allStates, onLogout, onOpenParentPin, onReportBug, hamOpen, onCloseHam, onUnclaimReward, onHideReward, onClaimDaily, onOpenChest, onUpdateAvatar, parentMode, playerMode, todayDayIdx, onPatchState, onChangeTheme, onDeComplete, onForceComplete, onUpdateCalendar, onCalendarAdd, onGoFamily, onGoCalendars, onGoTimer, th, weeklyChallenge, onChallengeCheckin }) {
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
  // v1.84.0 (Lot 1 #B3) — ouvrir le personnalisateur coûte de l'énergie (frein "plaisir")
  const openAvatar = ()=>{
    if(currentEnergy(pState)<AVATAR_ENERGY){ const m=minsToEnergy(pState,AVATAR_ENERGY); showToast&&showToast(`😴 Ton héros se repose… reviens dans ~${m} min pour changer de look!`,"#85CDD1",3500); return; }
    onPatchState&&onPatchState({energy:Math.max(0,currentEnergy(pState)-AVATAR_ENERGY),energyTs:new Date().toISOString()});
    setAvatarOpen(true);
  };
  const [themeRevealed, setThemeRevealed] = useState(false);
  const [badgeInfo, setBadgeInfo] = useState(null); // badge tapé → bulle d'info (tablette-friendly)
  const [finalBattle, setFinalBattle] = useState(false); // v1.77.0 — mini-jeu Combat final de l'Hydre
  const [calOpen, setCalOpen] = useState(false);
  const [calForm, setCalForm] = useState({type:"devoir", label:"", date:""});
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
  const lvTitle = getLevelTitle(pState.xp, player.themeId);
  const xbr = xpBar(pState.xp);
  const xpPct = Math.min(100, (xbr.cur/xbr.needed)*100);
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
  const myAssignments = pMode==="week"
    ? todayWeek
    : (activeRoutine ? routineMine.filter(a=>activeRoutine.taskIds?.includes(a.instanceId)) : routineMine);
  const themedCat = pt.shopCategory;
  const SHOP_TABS = { rewards:"🎁 Récompenses", hats:"🎩 Chapeaux", armors:"🛡️ Armures", pets:"🐾 Familiers", ...(themedCat.items.length>0?{[themedCat.id]:themedCat.label}:{}) };
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
      {/* Player header card */}
      <div style={{background:"rgba(0,0,0,0.5)",border:`2px solid #2a2a2a`,borderTop:`3px solid ${player.color}`,borderRadius:8,padding:14,display:"flex",gap:12,alignItems:"center"}}>
        {/* Avatar — clickable → opens creator/inventory */}
        <div style={{position:"relative",flexShrink:0,cursor:"pointer"}} onClick={openAvatar} title="Personnaliser mon perso">
          <AvatarCanvas avatarDef={pState.avatar||DEFAULT_AVATAR} bodyColor={pt.charBodyColor||player.color} size={72}
            style={{border:`4px solid ${pt.accent||player.color}`,boxShadow:`0 0 14px ${pt.glow||player.color}50`,display:"block"}}/>
          {/* v1.81.0 — ancré sur la vraie géométrie du corps (EquippedGear), voir plus haut */}
          <EquippedGear eq={eq} items={allShopItemsFlat} size={72}/>
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
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,12px)",color:"#D9BC5C"}}>🪙 {pState.coins} {pt.coinName||"pièces"}</div>
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
        const eqPet=allShopItemsFlat.find(i=>i.id===eq.pet);
        const cur=currentEnergy(pState);
        const fedToday=pState.lastFedDay===todayStamp();
        const eColor=cur>=60?"#5CAD68":cur>=30?"#D9BC5C":"#D98C8C";
        const napping=cur<PLAY_ENERGY;
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
                  <button onClick={(e)=>{e.stopPropagation();onPlayPet&&onPlayPet();}}
                    style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"10px",background:napping?"#1a1a1a":acc,color:napping?"#777":"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:5,cursor:"pointer"}}>{napping?"💤 Sieste":"🎾 Jouer"}</button>
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

      {homeTab==="sem" && (<>
      {/* Calendar reminders */}
      {(()=>{
        const today = new Date().toISOString().split("T")[0];
        const reminders = computeCalendarReminders(pState.calendar||[], today);
        if (!reminders.length) return null;
        return reminders.map(rem=>{
          const doneKey = rem.instanceId+"_"+player.id;
          const done = pState.completed?.includes(doneKey);
          return (
            <div key={rem.id} style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${done?"#5CAD68":"#85CDD1"}`,borderRadius:5,padding:"9px 11px",position:"relative"}}>
              {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"safe center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#5CAD68",borderRadius:5}}>✅ VALIDÉ!</div>}
              <div style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#85CDD1",marginBottom:5,lineHeight:1.3}}>{rem.title}</div>
              <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",background:"rgba(93,236,245,0.1)",border:"1px solid rgba(93,236,245,0.3)",padding:"1px 4px"}}>⚡{rem.xp} XP</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"1px 4px"}}>🪙{rem.coins}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",padding:"1px 4px"}}>{rem._daysLeft===0?"📅 AUJOURD'HUI":`📅 dans ${rem._daysLeft}j`}</span>
              </div>
              {!done&&<button className="btn-press" onClick={e=>{SFX.click();onRequestComplete(rem,player.id,e);}}
                style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:"#85CDD1",border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
                ✔ J'AI ÉTUDIÉ!
              </button>}
            </div>
          );
        });
      })()}

      </>)}
      {homeTab==="jour" && (<>
      {/* Lot 7C — bannière défi personnel hebdomadaire */}
      {weeklyChallenge && (()=>{
        const myChallenge = weeklyChallenge.challenges?.find(c=>c.playerId===player.id);
        if(!myChallenge) return null;
        const today = new Date().toISOString().slice(0,10);
        const done = myChallenge.checkins?.[today];
        return (
          <div style={{background:"rgba(0,0,0,0.6)",border:`3px solid ${done?"#5CAD68":"#D9BC5C"}`,borderRadius:6,padding:"11px 13px",marginBottom:4}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,8px)",color:"#D9BC5C",marginBottom:6}}>⭐ DÉFI DE LA SEMAINE</div>
            <div style={{fontSize:"clamp(13px,1.6vw,16px)",color:"#FFF",lineHeight:1.4,marginBottom:8}}>{myChallenge.emoji||"⭐"} {myChallenge.text||"Défi à venir…"}</div>
            {done
              ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",color:"#5CAD68"}}>✅ Défi relevé aujourd'hui!</div>
              : onChallengeCheckin && <button className="btn-press" onClick={()=>{SFX.click();onChallengeCheckin(today,true);}}
                  style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:"#D9BC5C",border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
                  ✅ J'ai réussi aujourd'hui!
                </button>}
          </div>
        );
      })()}
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
      {/* v1.85.0 (Lot 2 #5/#10) — rappels calendrier (devoirs/examens) du jour AUSSI ici,
          pas seulement dans l'onglet "📅 Semaine" séparé : "Aujourd'hui" doit vraiment
          montrer tout ce qu'il y a à faire aujourd'hui en un seul endroit. */}
      {(()=>{
        const today = new Date().toISOString().split("T")[0];
        const reminders = computeCalendarReminders(pState.calendar||[], today).filter(r=>r._daysLeft===0);
        if (!reminders.length) return null;
        return reminders.map(rem=>{
          const doneKey = rem.instanceId+"_"+player.id;
          const done = pState.completed?.includes(doneKey);
          return (
            <div key={"jour_"+rem.id} style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${done?"#5CAD68":"#85CDD1"}`,borderRadius:5,padding:"9px 11px",position:"relative"}}>
              {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"safe center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#5CAD68",borderRadius:5}}>✅ VALIDÉ!</div>}
              <div style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#85CDD1",marginBottom:5,lineHeight:1.3}}>{rem.title}</div>
              <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",background:"rgba(93,236,245,0.1)",border:"1px solid rgba(93,236,245,0.3)",padding:"1px 4px"}}>⚡{rem.xp} XP</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"1px 4px"}}>🪙{rem.coins}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",padding:"1px 4px"}}>📅 AUJOURD'HUI</span>
              </div>
              {!done&&<button className="btn-press" onClick={e=>{SFX.click();onRequestComplete(rem,player.id,e);}}
                style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:"#85CDD1",border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
                ✔ J'AI ÉTUDIÉ!
              </button>}
            </div>
          );
        });
      })()}
      {/* 🎯 Objectifs du jour — bonus à réclamer */}
      {(()=>{
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
        return (
          <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${(th.accent||player.color)}44`,borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:th.accent||player.color,marginBottom:6}}>🎯 OBJECTIFS DU JOUR</div>
            {OBJ.map(o=>{ const done=o.prog>=o.goal; const isClaimed=claimed.includes(o.id);
              return (
                <div key={o.id} style={{marginBottom:7}}>
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
        );
      })()}

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
                  <span style={{fontSize:18}}>{sel?"✅":t.emoji}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",flex:1}}>{t.label}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1"}}>⚡{t.xp}</span>
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
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:2}}>Quand c'est fait, appuie sur le bouton — tes parents valideront et tu recevras ton XP!</div>
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
          <div key={ass.instanceId} style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${done?"#5CAD68":pending?"#D9BC5C":"#333"}`,borderRadius:5,padding:"9px 11px",position:"relative",transition:"border 0.2s"}}>
            {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"safe center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#5CAD68",borderRadius:5}}>✅ VALIDÉ!</div>}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",marginBottom:3}}>{ass.time?`⏰ ${ass.time}`:""}{isWeekAss(ass)?`📅 ${ass.days.map(d=>DAYS_SHORT[d]).join(" ")}`:""}</div>
            <div style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#fff",marginBottom:5,lineHeight:1.3}}><span style={{fontSize:18}}>{task.emoji}</span> {task.label}</div>
            <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",background:"rgba(93,236,245,0.1)",border:"1px solid rgba(93,236,245,0.3)",padding:"1px 4px"}}>⚡{task.xp} XP</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"1px 4px"}}>🪙{task.coins}</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:DIFF_COLOR(task.diff),border:`1px solid ${DIFF_COLOR(task.diff)}40`,padding:"1px 4px"}}>{task.diff.toUpperCase()}</span>
              {task.cat && (()=>{ const m=catMeta(task.cat); return <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:m.color,background:`${m.color}1A`,border:`1px solid ${m.color}55`,padding:"1px 4px"}}>{m.label}</span>; })()}
            </div>
            {!done&&!pending&&<button className="btn-press" onClick={e=>{SFX.click();onRequestComplete(ass,player.id,e);}}
              style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",
                color:"#0d0d0d",background:player.color,border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",
                boxShadow:"2px 2px 0 #0d0d0d",transition:"all 0.08s"}}>
              ✔ J'AI FAIT ÇA!
            </button>}
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
            {pending&&<div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",textAlign:"center",marginTop:4}}>⏳ En attente de parent…</div>}
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
          if(groups.length===0) return null;
          const acc=th.accent||player.color;
          return groups.map(g=>{
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
          });
        }
        const _done=a=>pState.completed?.includes(a.instanceId+"_"+player.id+"#"+todayStamp());
        const undoneAll = myAssignments.filter(a=>!_done(a)); // v1.88.0 — nommé pour réutilisation (D'abord→Ensuite)
        const list = settings.focus ? undoneAll.slice(0,1) : undoneAll; // v1.60.0 — les quêtes validées quittent la liste → Archives
        if(list.length===0 && myAssignments.length>0) return <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:"#5CAD68",textAlign:"center",padding:16,lineHeight:1.6}}>🎉 Tout est fait pour aujourd'hui!<br/><span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa"}}>Tes quêtes finies sont rangées dans 🗄️ Archives (menu ☰).</span></div>;
        const cards = list.map(renderCard);
        // v1.88.0 (Lot 3 #14) — "D'abord → Ensuite" : en mode focus (une tâche à la fois), montre
        // ce qui vient après — prévisibilité utile pour TSA/TDAH (savoir à quoi s'attendre).
        if(settings.focus && undoneAll.length>1){
          const next=allTasks.find(t=>t.id===undoneAll[1].taskId);
          cards.push(
            <div key="first-then" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"rgba(0,0,0,0.3)",border:"1px dashed #444",borderRadius:6,fontFamily:"'VT323',monospace",fontSize:14,color:"#777",flexWrap:"wrap"}}>
              <span>👉 Ensuite:</span>
              {next && <span style={{fontSize:16}}>{next.emoji}</span>}
              <span style={{color:"#aaa"}}>{next?next.label:"?"}</span>
            </div>
          );
        }
        return cards;
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
      {addTaskOpen && <CustomTaskModal title="➕ Ma nouvelle quête" confirmLabel="Ajouter à ma journée" th={th}
        onClose={()=>setAddTaskOpen(false)}
        onCreate={(data)=>{ onChildAddTask&&onChildAddTask(data); setAddTaskOpen(false); }}/>}

      </>)}
      {homeTab==="sem" && (<>
      {/* Tâches planifiées (pas aujourd'hui) — accordéon replié par défaut (vue Semaine) */}
      {pMode==="week" && laterWeek.length>0 && (
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
                  <span style={{fontSize:15}}>{t.emoji}</span>
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
          <button onClick={()=>{ if(window.confirm(`Supprimer le rituel «${activeRoutine.name}» ? (tes tâches et ton XP restent)`)){ onPatchState({routines:myRoutines.filter(r=>r.id!==activeRoutine.id),activeRoutineId:null,mode:"week"}); } }}
            style={{flex:1,padding:"8px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D98C8C",background:"transparent",border:"1px solid #D98C8C40",borderRadius:3,cursor:"pointer"}}>
            🗑️ Supprimer
          </button>
        </div>
      )}

      </>)}
      {homeTab==="sem" && (<>
      {/* Calendar CRUD */}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",color:"#85CDD1",marginTop:10,paddingBottom:3,borderBottom:"2px solid #85CDD140"}}>📅 MON CALENDRIER</div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#777",marginBottom:4}}>Note tes devoirs et examens — un rappel avec du XP bonus apparaîtra avant la date!</div>
      <button onClick={()=>{setCalOpen(o=>!o);SFX.click();}}
        style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"12px",
          background:calOpen?"#1a1a1a":"#85CDD1",color:calOpen?"#85CDD1":"#0d0d0d",
          border:`3px solid ${calOpen?"#85CDD1":"#0d0d0d"}`,borderRadius:5,cursor:"pointer",
          boxShadow:calOpen?"none":"4px 4px 0 #0d0d0d",transition:"all 0.12s"}}>
        {calOpen?"✕ Fermer":"➕ Ajouter un devoir ou un examen"}
      </button>
      {calOpen && (
        <div style={{background:"rgba(0,0,0,0.5)",border:"2px solid #85CDD1",borderRadius:5,padding:10,display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",gap:6}}>
            {[["devoir","📚 Devoir"],["examen","📝 Examen"]].map(([v,l])=>(
              <button key={v} onClick={()=>{setCalForm(f=>({...f,type:v}));SFX.click();}}
                style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px",background:calForm.type===v?"#85CDD1":"#1a1a1a",color:calForm.type===v?"#0d0d0d":"#888",border:`2px solid ${calForm.type===v?"#85CDD1":"#333"}`,borderRadius:3,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
          <input value={calForm.label} onChange={e=>setCalForm(f=>({...f,label:e.target.value}))} placeholder={calForm.type==="examen"?"Maths, Français...":"Devoir de sciences..."} maxLength={40}
            style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none",width:"100%",boxSizing:"border-box"}}/>
          <input type="date" value={calForm.date} onChange={e=>setCalForm(f=>({...f,date:e.target.value}))}
            style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none",width:"100%",boxSizing:"border-box"}}/>
          <button onClick={()=>{
            if(!calForm.label.trim()||!calForm.date) return;
            const newEntry={id:`cal_${Date.now()}`,type:calForm.type,label:calForm.label.trim(),date:calForm.date};
            const newCal=[...(pState.calendar||[]),newEntry];
            onUpdateCalendar&&onUpdateCalendar(newCal);
            onCalendarAdd&&onCalendarAdd(calForm.type);
            setCalForm({type:"devoir",label:"",date:""});
            SFX.click();
          }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px",background:"#85CDD1",color:"#0d0d0d",border:"none",borderRadius:3,cursor:"pointer"}}>
            ✓ Enregistrer
          </button>
        </div>
      )}
      {(pState.calendar||[]).length>0 && (
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {[...(pState.calendar||[])].sort((a,b)=>a.date.localeCompare(b.date)).map(entry=>(
            <div key={entry.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"rgba(0,0,0,0.4)",border:"1px solid #222",borderRadius:3}}>
              <span style={{fontSize:14}}>{calEventIcon(entry)}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}>{entry.label}</div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#666"}}>{entry.date}</div>
              </div>
              {(parentMode||true)&&<button onClick={()=>{
                const newCal=(pState.calendar||[]).filter(e=>e.id!==entry.id);
                onUpdateCalendar&&onUpdateCalendar(newCal); SFX.click();
              }} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:14,lineHeight:1}}>✕</button>}
            </div>
          ))}
        </div>
      )}

      </>)}
      {homeTab==="shop" && (<>
      {/* Shop */}
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginTop:6,marginBottom:2}}>Dépense tes pièces pour des accessoires et de vraies récompenses — les quêtes difficiles en rapportent plus!</div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"#888",borderBottom:"2px solid #333",paddingBottom:3,marginTop:0}}>🛒 BOUTIQUE — {pState.coins} 🪙</div>
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
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C"}}>{ch.cost} 🪙</span>
          </button>
        ); })}
      </div>

      {chestReveal && (()=>{ const it=chestReveal.item, rar=rarityOf(it.cost);
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:2700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:20,textAlign:"center",overflowY:"auto",boxSizing:"border-box"}}>
            <ChestSprite open={true} size={110}/>
            <div style={{fontSize:48}}>{it.emoji}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:rar.color}}>{rar.name.toUpperCase()}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#fff"}}>{it.name}</div>
            {chestReveal.dup
              ? <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#D9BC5C"}}>Tu l'avais déjà! Doublon → +{chestReveal.refund} 🪙</div>
              : <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#5CAD68"}}>Nouvel item débloqué! 🎉</div>}
            <button className="btn-press" onClick={()=>{SFX.click();setChestReveal(null);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"14px 28px",background:rar.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>Super!</button>
          </div>
        );
      })()}

      <div style={{background:"rgba(0,0,0,0.45)",border:"3px solid #D9BC5C",borderRadius:5,padding:10}}>
        <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
          {Object.entries(SHOP_TABS).map(([k,l])=>(
            <button key={k} onClick={()=>{setShopTab(k);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 7px",background:shopTab===k?"#D9BC5C":"#222",color:shopTab===k?"#0d0d0d":"#888",border:`2px solid ${shopTab===k?"#D9BC5C":"#555"}`,borderRadius:2,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        {shopTab==="rewards" && (
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888",marginBottom:2}}>🎲 Les récompenses changent chaque semaine — profites-en!</div>
            {myRewards.length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",textAlign:"center",padding:"10px 6px"}}>Pas de récompenses cette semaine.</div>}
            {myRewards.map(r=>{
              const rPrice=priceOf(r);
              const canBuy=pState.coins>=rPrice;
              const bought=pState.boughtRewards?.includes(r.id);
              return (
                <div key={r.id} onClick={()=>canBuy&&!bought&&onBuy(r,player.id)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"rgba(0,0,0,0.4)",border:`2px solid ${bought?"#5CAD68":canBuy?"#D9BC5C":"#333"}`,borderRadius:4,cursor:canBuy&&!bought?"pointer":"default",opacity:!canBuy&&!bought?0.4:1}}>
                  <span style={{fontSize:22}}>{r.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:bought?"#5CAD68":"#ddd",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      {r.label}
                      {REWARD_CAT_BADGE[r.cat] && <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#0d0d0d",background:REWARD_CAT_BADGE[r.cat].color,borderRadius:3,padding:"2px 5px"}}>{REWARD_CAT_BADGE[r.cat].label}</span>}
                    </div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:bought?"#5CAD68":"#D9BC5C"}}>{bought?"RÉCLAMÉ!":rPrice+" 🪙"}</div>
                  </div>
                  {!bought&&canBuy&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}>Acheter</span>}
                  {!bought&&!canBuy&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#444"}}>🔒</span>}
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
        )}
        {shopTab!=="rewards" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
            {(SHOP_ITEMS[shopTab] || (shopTab===themedCat.id ? themedCat.items : []) || []).map(item=>{
              const owned=pState.owned?.includes(item.id);
              const equipped=eq[item.slot]===item.id;
              const iPrice=priceOf(item);
              const canAfford=pState.coins>=iPrice;
              const rar=rarityOf(item.cost);
              return (
                <div key={item.id} onClick={()=>{ if(equipped)return; if(owned&&item.slot)onEquip(item,player.id); else if(!owned&&canAfford)onBuy(item,player.id); }}
                  style={{background:`linear-gradient(180deg,${rar.color}14,rgba(0,0,0,0.45))`,border:`2px solid ${equipped?"#5CAD68":rar.color}`,borderRadius:6,padding:"7px 5px 5px",textAlign:"center",cursor:equipped?"default":owned||canAfford?"pointer":"not-allowed",opacity:!owned&&!canAfford?0.45:1,boxShadow:rar.min>=45?`0 0 10px ${rar.color}55`:"none",position:"relative"}}>
                  <span style={{position:"absolute",top:2,left:0,right:0,fontFamily:"'Press Start 2P',monospace",fontSize:4,color:rar.color}}>{rar.name.toUpperCase()}</span>
                  {petSpriteKey(item.id)
                    ? <PetSprite itemId={item.id} size={30} style={{margin:"6px auto 2px"}}/>
                    : <ItemSprite itemId={item.id} emoji={item.emoji} size={30} style={{margin:"6px auto 2px",fontSize:20}}/>}
                  <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc",display:"block",marginBottom:2,lineHeight:1.1}}>{item.name}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:equipped?"#5CAD68":owned?"#888":"#D9BC5C"}}>{equipped?"✅ ON":owned?"Équiper":iPrice+" 🪙"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}
      {homeTab==="accueil" && (<>
      {/* ── MENU : accès aux autres écrans (remplace les onglets du haut) ── */}
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
        const total=bossDamageTotal(allStates||[], bid); const hpLeft=Math.max(0,hpMax-total); const hpPct=Math.round(hpLeft/hpMax*100);
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
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}>{mod.emoji} {mod.label} (aujourd'hui)</span>
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
          const tabs=[["accueil","🏠","Accueil"],["jour","✅","Aujourd'hui"],...(bossActive?[["boss","⚔️","BOSS"]]:[]),["sem","📅","Semaine"],["shop","🛒","Boutique"]];
          return tabs.map(([k,ic,lb])=>{ const on=homeTab===k; const isBoss=k==="boss"; const col=isBoss?"#FF5555":acc;
            return (
              <button key={k} onClick={()=>{setHomeTab(k);SFX.click();}}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"9px 2px 11px",background:on?`${col}22`:(isBoss?"#FF55550F":"transparent"),border:"none",borderTop:on?`3px solid ${col}`:"3px solid transparent",cursor:"pointer"}}>
                <span style={{fontSize:20,filter:on?"none":"grayscale(0.3) opacity(0.8)",animation:isBoss?"pulse 1.4s infinite":"none"}}>{ic}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,1vw,7px)",color:on?col:(isBoss?"#FF8888":"#888")}}>{lb}</span>
              </button>
            );
          });
        })()}
        </div>
      </div>

    {/* Avatar popup */}
    {avatarOpen && <AvatarPopup player={player} pState={pState} onClose={()=>setAvatarOpen(false)}
      onUpdateAvatar={(av)=>onUpdateAvatar(av,player.id)} onEquip={(item)=>{onEquip(item,player.id);}}
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
        return (
          <div key={p.id}
            onClick={(e)=>{ e.stopPropagation(); SFX.click(); onOpenProfile(i); }}
            className="float-y"
            style={{position:"absolute",bottom:12,left:`${x}%`,transform:"translateX(-50%)",transition:"left 3.5s ease-in-out",cursor:"pointer",textAlign:"center",zIndex:isMe?2:1}}>
            <AvatarCanvas avatarDef={gs.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(p.themeId).charBodyColor||p.color} size={44}
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
        const total=bossDamageTotal(gameStates, b.startedAt); const hpLeft=Math.max(0,hpMax-total);
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
      <div className="fo-grid" style={{display:"grid",gridTemplateColumns:`repeat(${Math.min((config.players||[]).length,2)},1fr)`,gap:10}}>
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
                  <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa"}}>Niv.{getLevelTitle(ps.xp,player.themeId).level} — {getLevelTitle(ps.xp,player.themeId).title}</div>
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
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}>🪙 {ps.coins}</span>
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
        const monday = new Date(); monday.setHours(0,0,0,0); monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
        const weekDates = [...Array(7)].map((_,i)=>{ const d=new Date(monday); d.setDate(monday.getDate()+i); return ds(d); });
        const todayDs = ds(new Date());
        const assXp = {}; (config.assignments||[]).forEach(a=>{ const t=(allTasks||[]).find(x=>x.id===a.taskId); assXp[a.instanceId]= t?(t.xp||0):0; });
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
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:weekDates[di]===todayDs?th.accent:"#666",marginTop:2}}>{DAYS_SHORT[di]}</span>
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
            const TYPE_ACCENT={task:"#5CAD68",level:"#85CDD1",badge:"#D9BC5C",boss:"#D98C8C",ritual:"#D99248"};
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
  allTasks, onApprovePending, onRefusePending, onAddAssignment, onAssignRoutine, onLaunchBoss, bossActive, onAddCalendarEvent, onRemoveAssignment, onApproveRemoval, onRefuseRemoval, onClearChildTasks, onAddCustomTask,
  onClose, onExitParent, onUndo, onReset, onResetPlayer, onAdjustXP, onAdjustCoins, onChangePin,
  onExport, onImport, onSetup, players, th, onUpdateChallenge }) {
  const nbPending = gameStates.reduce((s,gs)=>s+(gs.pending||[]).length,0);
  const removalReqs = config.removalRequests||[]; // v1.83.0 (Lot 1 #B6)
  const nbValid = nbPending + removalReqs.length;
  const [tab, setTab] = useState(nbValid>0?"valid":"actions"); // valid | tasks | actions | cal | log | pin | export
  const [xpPlayer, setXpPlayer] = useState(0);
  const [xpDelta, setXpDelta] = useState(10);
  const [pinVal, setPinVal] = useState("");
  const [addTaskId, setAddTaskId] = useState("");
  const [addPlayerIds, setAddPlayerIds] = useState(players.map(p=>p.id));
  const [addType, setAddType] = useState("routine"); // "routine" | "week"
  const [addDays, setAddDays] = useState([0,1,2,3,4]); // v1.71.0 — jours choisis pour la récurrence (mode planifié)
  const [customOpen, setCustomOpen] = useState(false); // modale création tâche perso
  const [chooserOpen, setChooserOpen] = useState(false); // v1.82.0 (Lot 1 #3/B7) — grille TaskChooser au lieu du <select> plat
  const [errLogsOpen, setErrLogsOpen] = useState(false); // v1.90.0 — section logs techniques repliée par défaut
  const [defiDraft, setDefiDraft] = useState({}); // Lot 7C — {[playerId]: {text, emoji}} pour l'édition des défis
  // Ajout d'événement au calendrier (parent)
  const [ceLabel,setCeLabel]=useState(""); const [ceType,setCeType]=useState("evenement");
  const [ceRecur,setCeRecur]=useState("none"); const [ceDate,setCeDate]=useState(""); const [ceDay,setCeDay]=useState(0);
  const [cePlayers,setCePlayers]=useState((players||[]).map(p=>p.id));
  const [rChildIdx, setRChildIdx] = useState(0); // assignation de routine: enfant ciblé
  const [rName, setRName] = useState("");
  const [rTaskIds, setRTaskIds] = useState([]);
  const T = th;

  const TabBtn = ({k,l}) => (
    <button onClick={()=>setTab(k)} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",
      padding:"8px 4px",background:tab===k?"#D99248":"#222",color:tab===k?"#0d0d0d":"#888",
      border:`2px solid ${tab===k?"#D99248":"#444"}`,borderRadius:3,cursor:"pointer"}}>
      {l}
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
        <TabBtn k="valid"    l={`✅ À valider${nbValid>0?` (${nbValid})`:""}`}/>
        <TabBtn k="tasks"    l="📋 Tâches"/>
        <TabBtn k="defis"    l="🌟 Défis"/>
        <TabBtn k="actions"  l="⚡ Actions"/>
        <TabBtn k="cal"      l="📅 Calendrier"/>
        <TabBtn k="log"      l="🕐 Journal"/>
        <TabBtn k="pin"      l="🔐 Code"/>
        <TabBtn k="export"   l="💾 Sauvegarde"/>
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
              let emoji="📋", label="Tâche", xp=null, coins=null;
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
                if(task){emoji=task.emoji;label=task.label;xp=task.xp;coins=task.coins;}
              }
              items.push({playerIdx:i,doneKey:k,pl,emoji,label,xp,coins});
            });
          });
          // Regrouper les demandes PAR ENFANT
          const byChild=[]; players.forEach((pl,i)=>{ const its=items.filter(x=>x.playerIdx===i); if(its.length) byChild.push({pl,i,its}); });
          return (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>DEMANDES DES ENFANTS{items.length>0?` (${items.length})`:""}</div>
              {items.length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:20}}>Rien à valider — tout est à jour! 🎉</div>}
              {byChild.map(({pl,i,its})=>(
                <div key={pl.id} style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,paddingBottom:4,borderBottom:`2px solid ${pl.color}55`}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:pl.color}}>{displayName(pl)}</span>
                    <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#888"}}>{its.length} à valider</span>
                    <button onClick={()=>its.forEach(it=>onApprovePending(it.playerIdx,it.doneKey))}
                      style={{marginLeft:"auto",fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 8px",background:"#1a3a1a",color:"#5CAD68",border:"1px solid #5CAD6855",borderRadius:3,cursor:"pointer"}}>✅ Tout valider</button>
                  </div>
                  {its.map(it=>(
                <div key={it.doneKey} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${it.pl?.color||"#444"}50`,borderRadius:5,padding:"10px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:18}}>{it.emoji}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",lineHeight:1.2}}>{it.label}</div>
                      <div style={{display:"flex",gap:8,marginTop:2}}>
                        {it.xp!=null&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1"}}>⚡{it.xp}</span>}
                        {it.coins!=null&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C"}}>🪙{it.coins}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <PBtn onClick={()=>onApprovePending(it.playerIdx,it.doneKey)} color="#1a3a1a" textColor="#5CAD68" style={{flex:1}}>✅ Valider</PBtn>
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
                          <span style={{fontSize:18}}>{task.emoji}</span>
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
            <PBtn onClick={()=>{ if(addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)){ onAddAssignment(addTaskId,addPlayerIds,addType,addDays); setAddTaskId(""); } }}
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

            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",margin:"6px 0 10px"}}>TÂCHES ACTUELLES ({(config.assignments||[]).length})</div>
            {(config.assignments||[]).map(ass=>{
              const task=allTasks.find(t=>t.id===ass.taskId);
              const assignees=players.filter(p=>ass.playerIds.includes(p.id));
              if(!task)return null;
              return (
                <div key={ass.instanceId} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:"rgba(0,0,0,0.4)",border:"1px solid #333",borderRadius:4,marginBottom:5}}>
                  <span style={{fontSize:16}}>{task.emoji}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.label}</div>
                    <div style={{display:"flex",gap:6}}>
                      {assignees.map(p=><span key={p.id} style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:p.color}}>{displayName(p)}</span>)}
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:(Array.isArray(ass.days)&&ass.days.length>0)?"#85CDD1":"#FFA94D"}}>{(Array.isArray(ass.days)&&ass.days.length>0)?"📅 semaine":"⏰ routine"}</span>
                      {ass.time&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888"}}>⏰{ass.time}</span>}
                    </div>
                  </div>
                  <button onClick={()=>onRemoveAssignment(ass.instanceId)} style={{background:"none",border:"none",color:"#D97070",cursor:"pointer",fontSize:16,padding:4}}>×</button>
                </div>
              );
            })}
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
                          <span style={{fontSize:15}}>{sel?"✅":t.emoji}</span>
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
        {/* CALENDAR TAB */}
        {tab==="cal" && (()=>{
          const allEntries = (gameStates||[]).flatMap((gs,i)=>{
            const pl = config.players[i];
            return (gs.calendar||[]).map(e=>({...e, playerName: pl?.name||"?", playerColor: pl?.color||"#888"}));
          }).sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999"));
          const today = new Date().toISOString().split("T")[0];
          const recurLbl=(e)=> e.recur?.freq==="daily"?"Chaque jour":e.recur?.freq==="weekly"?("Chaque "+(DAYS[e.recur.day]||"")):(e.date||"");
          return (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:8}}>➕ AJOUTER UN ÉVÉNEMENT</div>
              <input value={ceLabel} onChange={e=>setCeLabel(e.target.value.slice(0,50))} placeholder="Ex: Cours de natation, Rendez-vous dentiste…"
                style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #85CDD1",borderRadius:4,marginBottom:8,outline:"none"}}/>
              <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
                {[["evenement","📅 Événement"],["devoir","📚 Devoir"],["examen","📝 Examen"],
                  ["sante",CAL_TYPES.sante.label],["sport",CAL_TYPES.sport.label],["intervenant",CAL_TYPES.intervenant.label],["camp",CAL_TYPES.camp.label]].map(([v,l])=>(
                  <button key={v} onClick={()=>{setCeType(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 8px",background:ceType===v?"#85CDD1":"#1a1a1a",color:ceType===v?"#0d0d0d":"#888",border:`2px solid ${ceType===v?"#85CDD1":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
                {[["none","Une date"],["weekly","Chaque semaine"],["daily","Chaque jour"]].map(([v,l])=>(
                  <button key={v} onClick={()=>{setCeRecur(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 8px",background:ceRecur===v?"#D99248":"#1a1a1a",color:ceRecur===v?"#0d0d0d":"#888",border:`2px solid ${ceRecur===v?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
              {ceRecur==="none" && <input type="date" value={ceDate} onChange={e=>setCeDate(e.target.value)} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,marginBottom:8,outline:"none",display:"block"}}/>}
              {ceRecur==="weekly" && <select value={ceDay} onChange={e=>setCeDay(+e.target.value)} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,marginBottom:8}}>{DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}</select>}
              <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888",marginBottom:4}}>Pour quel enfant?</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                {players.map(pl=>{ const sel=cePlayers.includes(pl.id); return (
                  <div key={pl.id} onClick={()=>setCePlayers(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#0d0d0d":"#555",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>
                ); })}
              </div>
              <PBtn onClick={()=>{ if(ceLabel.trim()&&cePlayers.length&&(ceRecur!=="none"||ceDate)){ onAddCalendarEvent&&onAddCalendarEvent(cePlayers,{type:ceType,label:ceLabel.trim(),date:ceRecur==="none"?ceDate:null,recur:ceRecur==="none"?null:(ceRecur==="weekly"?{freq:"weekly",day:ceDay}:{freq:"daily"})}); setCeLabel("");setCeDate(""); } }}
                color={ceLabel.trim()&&cePlayers.length&&(ceRecur!=="none"||ceDate)?"#85CDD1":"#333"} textColor="#0d0d0d" style={{width:"100%",marginBottom:14,opacity:ceLabel.trim()&&cePlayers.length&&(ceRecur!=="none"||ceDate)?1:0.5}}>➕ Ajouter au calendrier</PBtn>

              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>CALENDRIER COMMUN</div>
              {allEntries.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:16}}>Aucun événement.</div>}
              {allEntries.map(e=>(
                <div key={e.id+"_"+e.playerName} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:`2px solid ${(e.date&&e.date<today)?"#333":e.date===today?"#D9BC5C":"#444"}`,borderRadius:4,marginBottom:6,opacity:(e.date&&e.date<today)?0.4:1}}>
                  <span style={{fontSize:16}}>{calEventIcon(e)}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}>{e.label}</div>
                    <div style={{display:"flex",gap:6,marginTop:2}}>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:e.playerColor}}>{e.playerName}</span>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:e.date===today?"#D9BC5C":"#666"}}>{recurLbl(e)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {tab==="log" && <>
          {/* 🐛 Bugs signalés par les enfants */}
          {(config.bugs||[]).length>0 && (
            <div style={{background:"rgba(255,140,0,0.08)",border:"2px solid #D9924855",borderRadius:6,padding:"10px 12px",marginBottom:12}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D99248",marginBottom:8}}>🐛 BUGS SIGNALÉS ({(config.bugs||[]).length})</div>
              {(config.bugs||[]).map(b=>(
                <div key={b.id} style={{marginBottom:8,paddingBottom:6,borderBottom:"1px solid #D9924822"}}>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",lineHeight:1.3}}>{b.text}</div>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888",marginTop:3}}>— {b.who} · {new Date(b.ts).toLocaleString("fr-CA",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
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
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#777",marginTop:3}}>— {e.who} · v{e.appVersion} · {new Date(e.ts).toLocaleString("fr-CA",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
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
// Compter N jours ouvrables (lun-ven) en remontant depuis une date
const subWeekdays = (dateISO, n) => {
  const d = new Date(dateISO); d.setHours(0,0,0,0);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return d;
};

// Retourne les rappels actifs pour aujourd'hui
// Libellé lisible d'une récurrence
const recurLabel = (e) => {
  if (e?.recur?.freq==="daily") return "Chaque jour";
  if (e?.recur?.freq==="weekly") return "Chaque "+(DAYS[e.recur.day]||"?");
  return e?.date||"";
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

const computeCalendarReminders = (calendar, today) => {
  const t = new Date(today); t.setHours(0,0,0,0);
  return (calendar || []).flatMap(entry => {
    if (!entry.date || entry.recur) return []; // les événements récurrents/sans date ne génèrent pas de rappel d'étude
    // v1.85.0 (Lot 2 #9) — seuls devoir/examen génèrent un rappel "à étudier" avec bonus XP; les
    // nouvelles catégories (santé/sport/intervenant/camp) et "événement" restent de simples entrées
    // de calendrier (visibles dans la liste), pas des tâches à XP — un rendez-vous chez le dentiste
    // n'est pas un devoir à "étudier".
    if (entry.type!=="examen" && entry.type!=="devoir") return [];
    const examDate = new Date(entry.date); examDate.setHours(0,0,0,0);
    if (t > examDate) return []; // dépassé
    const triggerDate = subWeekdays(entry.date, 3);
    if (t < triggerDate) return []; // trop tôt
    const daysLeft = Math.round((examDate - t) / (1000*60*60*24));
    return [{
      id: `cal_${entry.id}`,
      instanceId: `cal_${entry.id}`,
      title: entry.type==="examen" ? `📅 Étudier: ${entry.label}` : `📅 Devoir: ${entry.label}`,
      xp: entry.type==="examen" ? 20 : 10,
      coins: entry.type==="examen" ? 5 : 3,
      assignedTo: [],
      _isCalendar: true,
      _daysLeft: daysLeft,
      _entryId: entry.id,
    }];
  });
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
          <span style={{fontSize:18}}>{t.emoji}</span>
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
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 16px",background:"rgba(0,0,0,0.7)",color:pl.color,border:`3px solid ${pl.color}`,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 16px ${pl.color}55`;e.currentTarget.style.transform="translateX(4px)";}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
                  <AvatarCanvas avatarDef={psi.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(pl.themeId).charBodyColor||pl.color} size={36}/>
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
  const [editingBook, setEditingBook] = useState(false); // true = "Modifier le livre" (édite la config existante)
  const [parentPanel, setParentPanel] = useState(false); // slide-out panel
  const [hamOpen, setHamOpen] = useState(false); // menu ☰ enfant (piloté depuis le header)
  const [timerRitual, setTimerRitual] = useState(null); // rituel pré-sélectionné en ouvrant la minuterie
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
        {
          const usedTaskIds=new Set((data.config.assignments||[]).map(a=>a.taskId));
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
          setConfig(cfg=>({...cfg, updateFeedEntries:[...(cfg.updateFeedEntries||[]),...newEntries]}));
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
    const totalDmg = bossDamageTotal(gameStates, boss.startedAt);
    if(totalDmg < HPMAX) return;
    if(!bossQuestsAllDone(cfgRef.current, gameStates)) return;
    const now = new Date().toISOString();
    const n = gameStates.map(g=>{
      const _it = pickUltraLegendary();
      return {...g, coins:(g.coins||0)+40, coinsLifetime:(g.coinsLifetime||0)+40, xp:(g.xp||0)+50,
        owned:[...new Set([...(g.owned||[]), _it.id])],
        badges:[...new Set([...(g.badges||[]),"b_boss"])],
        pendingCelebrations:[...(g.pendingCelebrations||[]), {bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]};
    });
    const nb = {...boss, defeatedAt:now};
    const fe = {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`};
    const ncfg = {...cfgRef.current, boss:nb, feed:[fe,...(cfgRef.current.feed||[])].slice(0,60)};
    setConfig(ncfg); setGameStates(n); persist(ncfg, n);
  },[gameStates, config?.boss]);

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

  // Lot 7C — vérification du défi parfait (jeudi de la semaine de garde → récompense immédiate)
  useEffect(()=>{
    if(!isCustodyThursday()) return;
    if(!config?.weeklyChallenge?.challenges?.length) return;
    const cwk = custodyWeekKey();
    setGameStates(gs=>{
      let changed=false;
      const next=gs.map((s,i)=>{
        const player=config.players[i];
        if(!player) return s;
        const ch=config.weeklyChallenge.challenges.find(c=>c.playerId===player.id);
        if(!ch) return s;
        if(hasPerfectChallengeWeek(ch.checkins, cwk)){
          if(!(s.owned||[]).includes(CHALLENGE_PERFECTION_FRAME_ID)){
            changed=true;
            return {...s, owned:[...(s.owned||[]),CHALLENGE_PERFECTION_FRAME_ID], pendingCelebration:{type:"frame",id:CHALLENGE_PERFECTION_FRAME_ID}};
          }
        }
        return s;
      });
      if(!changed) return gs;
      persist(config,next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[config?.weeklyChallenge]);

  const showToast = useCallback((msg,color="",dur=3000)=>{ setToast({msg,color}); setTimeout(()=>setToast(null),dur); },[]);
  const logAction = useCallback((msg,color="#D99248")=>{
    const entry={time:new Date().toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit"}),msg,color};
    setActionLog(l=>[entry,...l.slice(0,19)]);
  },[]);

  const todayDayIdx = (now.getDay()+6)%7; // Mon=0

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
    showToast("📨 Envoyée à tes parents pour validation!","#85CDD1",3500);
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
      setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],pending:(n[playerIdx].pending||[]).filter(k=>k!==doneKey)}; persist(config,n); return n; });
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
    // On vide la file tout de suite (persist avec savedAt récent → reste vide après fusion cloud)
    setGameStates(gs=>{ const n=[...gs]; if(n[idx]) n[idx]={...n[idx],pendingCelebrations:[]}; persist(config,n); return n; });
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
    setGameStates(gs=>{
      const p=gs[idx];
      const isReward=!item.slot;
      const price=priceOf(item); // items (.cost) ET récompenses (.coins), ×PRICE_MULT
      if((p.coins||0)<price)return gs;
      SFX.buy();
      const n=[...gs]; n[idx]={...p,coins:(p.coins||0)-price,owned:[...new Set([...(p.owned||[]),item.id])],boughtRewards:isReward?[...new Set([...(p.boughtRewards||[]),item.id])]:p.boughtRewards,equipped:item.slot?{...(p.equipped||{}),[item.slot]:item.id}:(p.equipped||{}),energy:Math.max(0,currentEnergy(p)-SHOP_ENERGY),energyTs:new Date().toISOString()};
      persist(config,n);
      showToast(`🎉 ${item.emoji} ${item.name||item.label} acheté!`,"#D9BC5C");
      spawnParticles(item.emoji||"🎉");
      return n;
    });
  },[config,gameStates,persist,showToast]);

  const handleUpdateAvatar = useCallback((avatarDef, playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{ const n=[...gs]; n[idx]={...n[idx],avatar:avatarDef}; persist(config,n); return n; });
  },[config,persist]);

  const handleEquip = useCallback((item,playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{ const n=[...gs]; n[idx]={...n[idx],equipped:{...(n[idx].equipped||{}),[item.slot]:item.id}}; persist(config,n); return n; });
    showToast(`✅ ${item.emoji} équipé!`,"#5CAD68");
  },[config,persist,showToast]);

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
  const handleAddAssignment = useCallback((taskId, playerIds, assType, customDays)=>{
    if(!taskId||!playerIds?.length)return;
    // assType: "week" → tâche planifiée (jours choisis = récurrence hebდo par jour); sinon → routine (sans jour)
    const days = assType==="week" ? ((Array.isArray(customDays)&&customDays.length)?[...customDays].sort((a,b)=>a-b):[0,1,2,3,4]) : [];
    const newAss = playerIds.map(pid=>({instanceId:uid(),taskId,playerIds:[pid],days,time:"",createdAt:Date.now()}));
    const newCfg={...config,assignments:[...(config.assignments||[]),...newAss]};
    setConfig(newCfg); persist(newCfg,gameStates);
    const task=[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===taskId);
    logAction(`➕ Tâche ajoutée: ${task?.label||taskId} (${playerIds.length} joueur${playerIds.length>1?"s":""})`,"#5CAD68");
    showToast("➕ Tâche ajoutée!","#5CAD68");
  },[config,gameStates,persist,logAction,showToast]);

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
      let totalDmg = n.reduce((s,g)=> s + ((g.bossBattle&&g.bossBattle.bossId===bid)?(g.bossBattle.dmg||0):0), 0);
      let nb = {...boss, lastHitTs:new Date().toISOString()};
      const HPMAX=(boss.hpMax||80), questsDone=bossQuestsAllDone(cfgRef.current, n);
      if(!questsDone && totalDmg > HPMAX-1){ const over=totalDmg-(HPMAX-1); newBB.dmg=Math.max(bb.dmg||0, newBB.dmg-over); n[playerIdx]={...p, bossBattle:newBB}; totalDmg=HPMAX-1; }
      const locked = !questsDone && totalDmg >= HPMAX-1;
      const defeated = questsDone && totalDmg >= HPMAX;
      if(defeated){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, coinsLifetime:(n[i].coinsLifetime||0)+40, xp:(n[i].xp||0)+50, owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], pendingCelebrations:[...(n[i].pendingCelebrations||[]), {bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } } // v1.74.0 — +40🪙 +50XP + badge + item ULTRA LÉGENDAIRE + notif différée à chaque enfant
      const fe = defeated ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#D9BC5C",5000); },150); }
      else { setTimeout(()=>{ try{ if(!CALM) spawnParticles(locked?"🐉":atk.emoji); SFX.task&&SFX.task(); }catch{} showToast(locked?`🐉 L'Hydre RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`:(dmg>0?`${atk.emoji} −${dmg} PV au boss!`:`🛡️ La carapace bloque — vise plus gros!`),"#D98C8C",locked?3600:2200); },60); }
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
      let totalDmg = n.reduce((s,g)=> s + ((g.bossBattle&&g.bossBattle.bossId===bid)?(g.bossBattle.dmg||0):0), 0);
      let nb = {...boss, lastHitTs:new Date().toISOString()};
      const HPMAX=(boss.hpMax||80), questsDone=bossQuestsAllDone(cfgRef.current, n);
      if(!questsDone && totalDmg > HPMAX-1){ const over=totalDmg-(HPMAX-1); newBB.dmg=Math.max(bb.dmg||0, newBB.dmg-over); n[playerIdx]={...p, bossBattle:newBB}; totalDmg=HPMAX-1; }
      const locked = !questsDone && totalDmg >= HPMAX-1;
      const defeated = questsDone && totalDmg >= HPMAX;
      if(defeated){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, coinsLifetime:(n[i].coinsLifetime||0)+40, xp:(n[i].xp||0)+50, owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], pendingCelebrations:[...(n[i].pendingCelebrations||[]), {bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } } // v1.74.0 — +40🪙 +50XP + badge + item ULTRA LÉGENDAIRE + notif différée à chaque enfant
      const fe = defeated ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#D9BC5C",5000); },150); }
      else { setTimeout(()=>{ try{ if(!CALM) spawnParticles(locked?"🐉":"🐾"); SFX.epic&&SFX.epic(); }catch{} showToast(locked?`🐉 L'Hydre RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`:`🐾 Ton familier frappe! −${dmg} PV${legend?" — Légendaire! 👑":""}`,"#D9BC5C",locked?3600:2800); },60); }
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
    // v1.53.0 anti-doublon : si une tâche au MÊME libellé existe déjà, on la réutilise au lieu d'en recréer une
    const existing=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(label));
    const _dp=CHILD_DIFF_PRESETS[data.diff]||CHILD_DIFF_PRESETS.medium; // plafond anti-farm
    const taskId=existing?existing.id:("cust_"+uid());
    const newTask={id:taskId,emoji:data.emoji||"⭐",label,xp:_dp.xp,coins:_dp.coins,diff:data.diff||"medium",cat:"custom",child:true};
    // La quête doit apparaître dans la vue ACTUELLE de l'enfant : si mode Semaine → aujourd'hui; si Routine → tâche de routine
    const pmode=gameStates[playerIdx]?.mode||config.mode||"routine";
    const todayIdx=(new Date().getDay()+6)%7;
    const days=pmode==="week" ? [todayIdx] : [];
    const ass={instanceId:uid(),taskId,playerIds:[pid],days,time:"",oneDay:todayStamp(),createdAt:Date.now()}; // à usage unique (nettoyée après aujourd'hui)
    const customTasks=existing?(config.customTasks||[]):[...(config.customTasks||[]),newTask];
    const newCfg={...config, customTasks, assignments:[...(config.assignments||[]),ass]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("➕ Quête ajoutée à ta journée!","#5CAD68");
  },[config,gameStates,persist,showToast]);

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
        n[idx]={...p, boughtRewards:(p.boughtRewards||[]).filter(r=>r!==reward.id)}; persist(config,n); return n;
      }
      did=true;
      n[idx]={...p,
        boughtRewards:(p.boughtRewards||[]).filter(r=>r!==reward.id),
        coins:(p.coins||0)+priceOf(reward),                         // rembourse ce qui a été payé (×PRICE_MULT)
        refundedRewards:[...new Set([...(p.refundedRewards||[]), key])].slice(-200) };
      persist(config,n); return n; });
    if(did) showToast("↩️ J'ai changé d'idée — pièces remises!","#D99248");
  },[config,persist,showToast]);

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
        const e={ id:Date.now()+"_"+Math.random().toString(36).slice(2,6), type:entry.type||"evenement", label:entry.label.trim(), date:entry.date||null, recur:entry.recur||null };
        n[i]={...n[i], calendar:[...(n[i].calendar||[]), e]};
      });
      persist(config,n); return n; });
    showToast("📅 Événement ajouté au calendrier!","#85CDD1");
  },[config,persist,showToast]);

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
  const handlePlayPet = useCallback((playerIdx)=>{
    const p=gameStates[playerIdx]; if(!p) return;
    const eqPet=p.equipped?.pet;
    if(!eqPet){ showToast("Équipe d'abord un familier 🐾","#D99248",2500); return; }
    if(currentEnergy(p)<PLAY_ENERGY){ const m=minsToEnergy(p,PLAY_ENERGY); showToast(`💤 Ton familier fait une sieste… reviens dans ~${m} min!`,"#85CDD1",3500); return; }
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]; const _g=gainPet(q,eqPet,10);
      n[playerIdx]={...q, energy:Math.max(0, currentEnergy(q)-PLAY_ENERGY), energyTs:new Date().toISOString(),
        petXp:_g.petXp, petDay:_g.petDay };
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🎾"); SFX.click&&SFX.click(); }catch{} },80);
    showToast("🎾 Vous vous êtes bien amusés! Ton familier gagne de l'XP 🌟","#D9BC5C",2800);
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
  const onParentPanelExit = useCallback(()=>{ setParentMode(false); setParentPanel(false); showToast("🔒 Mode parent quitté","#D99248"); }, [showToast]);
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
  const onDashUpdateCalendar = useCallback((newCal)=>{
    const gs=[...gameStates];
    gs[view]={...gs[view],calendar:newCal};
    setGameStates(gs);
    save({config,gameStates:gs,savedAt:new Date().toISOString()});
  }, [gameStates, view, config]);
  const onDashCalendarAdd = useCallback((type)=>{
    const label=type==="examen"?"📝 Examen noté au calendrier!":"📚 Devoir noté au calendrier!";
    showToast(`${label} Un rappel apparaîtra avant la date.`,"#85CDD1",3000);
  }, [showToast]);

  if(screen==="loading") return <div style={{minHeight:"100vh",background:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"safe center"}}><style>{GLOBAL_CSS}</style><div style={{fontFamily:"'Press Start 2P',monospace",fontSize:12,color:"#D9BC5C",animation:"pulse 1s infinite"}}>⚔️ Chargement…</div></div>;
  if(screen==="setup") return <SetupWizard existing={editingBook?config:null} onDone={(d)=>{setEditingBook(false);handleSetupDone(d);}}/>;
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
    <div className={"game-root"+(CALM?" calm-mode":"")} style={{minHeight:"100vh",background:th.bg,position:"relative",overflowX:"hidden"}}>
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
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,12px)",color:th.accent}}>{currentPlayer ? `⚔️ Les quêtes de ${displayName(currentPlayer)}` : "⚔️ LIVRE DE QUÊTES"}</div>
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
            <button onClick={()=>{SFX.click();setParentMode(false);setParentPanel(false);showToast("🔒 Mode parent quitté","#D99248");}}
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
        {/* Un enfant connecté ne voit QUE son onglet. Le parent voit tout le monde. */}
        {(config.players||[]).map((pl,i)=>({pl,i})).filter(({i})=> parentMode || sessionPlayer===null || sessionPlayer===i).map(({pl,i})=>(
          <button key={pl.id} onClick={()=>{setView(i);SFX.click();}} className="nav-btn"
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view===i?pl.color:"transparent",color:view===i?"#0d0d0d":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,borderBottom:view===i?`3px solid ${pl.color}`:"none"}}>
            {displayName(pl)}
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
          const order=(config.players||[]).map((p,i)=>i).sort((a,b)=> (a===sessionPlayer?-1:b===sessionPlayer?1:0));
          const fmt=(iso)=>{ const d=new Date(iso+"T00:00:00"); return DAYS_SHORT[(d.getDay()+6)%7]+" "+d.getDate(); };
          return (
            <div style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:th.accent}}>📅 CALENDRIERS</div>
              {order.map(i=>{ const p=config.players[i]; const cal=(gameStates[i]?.calendar)||[];
                const items=cal.flatMap(e=>upcomingOccurrences(e,14).map(d=>({d,e}))).sort((a,b)=>a.d.localeCompare(b.d)).slice(0,12);
                return (
                  <div key={p.id} style={{background:"rgba(0,0,0,0.5)",border:`2px solid ${p.color}99`,borderRadius:8,padding:12}}>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:p.color,marginBottom:6}}>{displayName(p)}{i===sessionPlayer?" (toi)":""}</div>
                    {items.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#777"}}>Rien de prévu dans les 2 prochaines semaines.</div>}
                    {items.map(({d,e},k)=>(
                      <div key={k} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid #222"}}>
                        <span style={{fontSize:14}}>{calEventIcon(e)}</span>
                        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",minWidth:46}}>{fmt(d)}</span>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",flex:1}}>{e.label}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })()}
        {view==="timer"&&(
          <TimerView config={config} gameStates={gameStates} sessionPlayer={sessionPlayer} parentMode={parentMode} th={th} onComplete={handleRitualTimerDone} initialRitualId={timerRitual} onCompleteTask={requestComplete}/>
        )}
        {view==="family"&&(()=>{
          // v1.60.0 — stats familiales : quêtes accomplies par étiquette, agrégées sur tous les enfants
          const catByInst={}; (config.assignments||[]).forEach(a=>{ const t=allTasks.find(x=>x.id===a.taskId); if(t) catByInst[a.instanceId]=t.cat; });
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
            onUpdateCalendar={onDashUpdateCalendar}
            onCalendarAdd={onDashCalendarAdd}
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
          bossActive={!!(config.boss && !config.boss.defeatedAt)}
          onAddCalendarEvent={handleAddCalendarEvent}
          onRemoveAssignment={handleRemoveAssignment}
          onApproveRemoval={handleApproveRemoval}
          onRefuseRemoval={handleRefuseRemoval}
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
        />
      )}

      {parentPinOpen&&(
        <PinPad pin={config.pin} label="Accès mode parent" onSuccess={()=>{ const turningOn=!parentMode; setParentMode(turningOn); setParentPinOpen(false); if(turningOn){ setSessionPlayer(null); setView("family"); } showToast(turningOn?"🔓 Mode parent activé!":"🔒 Mode parent désactivé","#D99248"); }} onCancel={()=>setParentPinOpen(false)} th={th}/>
      )}
      {bossWin&&(
        <div onClick={()=>{setBossWin(null);SFX.click&&SFX.click();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:3200,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto",cursor:"pointer"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(160deg,#1a2e1a,#0c220c)",border:`5px solid ${bossWin.color||"#D9BC5C"}`,borderRadius:16,padding:"28px 26px",maxWidth:380,width:"100%",maxHeight:"90vh",overflowY:"auto",textAlign:"center",boxShadow:`0 0 50px ${bossWin.color||"#D9BC5C"}70`,animation:"bounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1)"}}>
            <div style={{fontSize:64,lineHeight:1,marginBottom:6}}>{bossWin.emoji||"🐲"}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,18px)",color:"#D9BC5C",marginBottom:8}}>🏆 VICTOIRE!</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:19,color:"#fff",marginBottom:8,lineHeight:1.3}}>Vous avez vaincu<br/><b style={{color:bossWin.color||"#D9BC5C"}}>{bossWin.name}</b> en équipe! 💪</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#5CAD68",margin:"12px 0 8px",lineHeight:1.6}}>+40 🪙 · +50 ⚡<br/>🐲 Badge « Tombeur de Boss »!</div>
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
