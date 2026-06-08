import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const APP_VERSION = "1.10.0";
const BUG_EMAIL = "sturnus.vulgaris.linnaeus@proton.me";

// ─── AUDIO ────────────────────────────────────────────────────
let _ac = null;
const ac = () => { try { if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)(); _ac.resume(); return _ac; } catch { return null; } };
const tone = (f, type, dur, vol, delay = 0) => {
  try { const ctx = ac(); if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type = type; o.frequency.setValueAtTime(f, ctx.currentTime + delay); g.gain.setValueAtTime(0, ctx.currentTime + delay); g.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.01); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur); o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + dur + 0.05); } catch {}
};
const SFX = {
  click:   () => tone(440, "square", 0.04, 0.1),
  task:    () => { [523,659,784,1047].forEach((f,i) => tone(f,"square",0.13,0.17,i*0.1)); },
  epic:    () => { [262,330,392,523,659,784].forEach((f,i) => tone(f,"square",0.16,0.2,i*0.09)); },
  buy:     () => { [880,1100,1320].forEach((f,i) => tone(f,"sine",0.07,0.25,i*0.08)); },
  pinOk:   () => { [523,659,784,1047].forEach((f,i) => tone(f,"sine",0.1,0.2,i*0.07)); },
  pinErr:  () => { [440,415,392].forEach((f,i) => tone(f,"sawtooth",0.13,0.17,i*0.09)); },
  pinKey:  () => tone(660, "sine", 0.04, 0.15),
  welcome: () => { [262,330,392,523].forEach((f,i) => tone(f,"square",0.16,0.17,i*0.12)); setTimeout(() => SFX.epic(), 600); },
  coin:    () => tone(1320, "sine", 0.07, 0.2),
  alert:   () => { [440,440,440].forEach((f,i) => tone(f,"square",0.1,0.2,i*0.2)); },
};

// ─── CONSTANTS ───────────────────────────────────────────────
const DAYS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const DAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const COLORS = ["#4A90D9","#C060D0","#2ECC40","#FF6B35","#FFD700","#FF4444","#00BCD4","#9C27B0","#FF69B4","#0a0a0a","#F0F0FF"];

const LEVELS = [
  { level:1, xpNeeded:0,   title:"Débutant",   titleF:"Débutante"   },
  { level:2, xpNeeded:60,  title:"Aventurier", titleF:"Aventurière" },
  { level:3, xpNeeded:150, title:"Héros",      titleF:"Héroïne"     },
  { level:4, xpNeeded:280, title:"Champion",   titleF:"Championne"  },
  { level:5, xpNeeded:450, title:"LÉGENDE",    titleF:"LÉGENDE"     },
];
const getLevel = xp => { let c = LEVELS[0]; for (const l of LEVELS) if (xp >= l.xpNeeded) c = l; return c; };
const getLevelTitle = (xp, themeId) => {
  const lv = getLevel(xp);
  const pt = getPlayerTheme(themeId);
  const idx = Math.min(lv.level - 1, 4);
  return { level: lv.level, title: pt.levels[idx] || pt.levels[0] };
};
const xpBar = xp => { for (let i=0;i<LEVELS.length-1;i++) if (xp<LEVELS[i+1].xpNeeded) return { cur: xp-LEVELS[i].xpNeeded, needed: LEVELS[i+1].xpNeeded-LEVELS[i].xpNeeded }; return {cur:1,needed:1}; };

// ─── TASK CATALOG ────────────────────────────────────────────
const TASK_CATALOG = [
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
  // Outdoor & Jardin
  { id:"to01", emoji:"⚽",  label:"Jouer dehors en harmonie",                xp:35, coins:18, diff:"hard",   cat:"outdoor" },
  { id:"to02", emoji:"🚴",  label:"Faire du vélo",                           xp:25, coins:12, diff:"medium", cat:"outdoor" },
  { id:"to03", emoji:"🌿",  label:"Arroser le jardin cour",                  xp:20, coins:10, diff:"easy",   cat:"outdoor" },
  { id:"to04", emoji:"🌸",  label:"Arroser le jardin devant",                xp:20, coins:10, diff:"easy",   cat:"outdoor" },
];

const CAT_LABELS = { cuisine:"🍳 Cuisine", menage:"🏠 Ménage", routine:"⏰ Routine", defi:"🎯 Défis", outdoor:"🌳 Dehors" };
const DIFF_COLOR = d => ({ easy:"#2ECC40", medium:"#FFD700", hard:"#FF6B35", boss:"#FF2222" }[d] || "#aaa");

// ─── REWARD CATALOG ──────────────────────────────────────────
const REWARD_CATALOG = [
  { id:"rw01", emoji:"📱", label:"15 min d'écrans",          coins:20 },
  { id:"rw02", emoji:"🍬", label:"Collation sucrée",          coins:15 },
  { id:"rw03", emoji:"💝", label:"15 min privées avec parent",coins:25 },
  { id:"rw04", emoji:"💵", label:"5$ au dépanneur",           coins:50 },
  { id:"rw05", emoji:"💆", label:"Massage au dodo (avant 20h)",coins:30 },
  { id:"rw06", emoji:"🎮", label:"Choix du jeu vidéo",        coins:30 },
  { id:"rw07", emoji:"🍪", label:"Fudgee-O ou pépites",       coins:18 },
  { id:"rw08", emoji:"🍬", label:"Sweet Tarts au choix",      coins:12 },
  { id:"rw09", emoji:"⭐", label:"Skin Minecraft au choix",   coins:50 },
  { id:"rw10", emoji:"🎬", label:"Choisir le film du vendredi",coins:35 },
];

// ─── BADGE CATALOG ───────────────────────────────────────────
// type: "general" | themeId
// condition fn receives: (pState, completedCount, config, player)
const BADGES = [
  // ── GÉNÉRAUX ──
  { id:"b_first",    emoji:"⭐", name:"Premier Sang",         desc:"Complète ta première quête",           type:"general", check:(ps)=>(ps.completed?.length||0)>=1 },
  { id:"b_5tasks",   emoji:"🔥", name:"En Feu",               desc:"Complète 5 quêtes",                    type:"general", check:(ps)=>(ps.completed?.length||0)>=5 },
  { id:"b_20tasks",  emoji:"💪", name:"Bras de Fer",          desc:"Complète 20 quêtes",                   type:"general", check:(ps)=>(ps.completed?.length||0)>=20 },
  { id:"b_50tasks",  emoji:"🏆", name:"Légende Vivante",      desc:"Complète 50 quêtes",                   type:"general", check:(ps)=>(ps.completed?.length||0)>=50 },
  { id:"b_xp100",    emoji:"⚡", name:"Chargé à Bloc",        desc:"Accumule 100 XP",                      type:"general", check:(ps)=>(ps.xp||0)>=100 },
  { id:"b_xp300",    emoji:"🌩️", name:"Orage Intérieur",      desc:"Accumule 300 XP",                      type:"general", check:(ps)=>(ps.xp||0)>=300 },
  { id:"b_xp500",    emoji:"🌟", name:"Supernova",            desc:"Accumule 500 XP",                      type:"general", check:(ps)=>(ps.xp||0)>=500 },
  { id:"b_coins50",  emoji:"💰", name:"Boursicoteur Nul",     desc:"Accumule 50 pièces d'un coup",         type:"general", check:(ps)=>(ps.coins||0)>=50 },
  { id:"b_coins150", emoji:"🤑", name:"Oncle Picsou",         desc:"Accumule 150 pièces",                  type:"general", check:(ps)=>(ps.coins||0)>=150 },
  { id:"b_buy1",     emoji:"🛒", name:"Consommateur Compulsif",desc:"Achète une récompense",               type:"general", check:(ps)=>(ps.boughtRewards?.length||0)>=1 },
  { id:"b_buy5",     emoji:"🛍️", name:"Problème de Shopping", desc:"Achète 5 récompenses",                 type:"general", check:(ps)=>(ps.boughtRewards?.length||0)>=5 },
  { id:"b_streak3",  emoji:"📅", name:"Machine à Habitudes",  desc:"3 quêtes en 1 journée",               type:"general", check:(ps,c)=>c>=3 },
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
];

// Returns array of newly earned badge IDs
const checkBadges = (pState, player, dailyCount) => {
  const themeId = player?.themeId || "none";
  const alreadyEarned = new Set(pState.badges || []);
  return BADGES
    .filter(b => !alreadyEarned.has(b.id))
    .filter(b => b.type === "general" || b.type === themeId)
    .filter(b => { try { return b.check(pState, dailyCount); } catch { return false; } })
    .map(b => b.id);
};

const THEMES = {
  minecraft: { name:"Minecraft", bg:"#1a1a2e", primary:"#5D9E34", accent:"#FFD700", card:"rgba(0,0,0,0.5)", text:"#fff" },
  galaxy:    { name:"Galaxie",   bg:"#0a0a1a", primary:"#7B2FBE", accent:"#00D4FF", card:"rgba(10,0,30,0.7)", text:"#fff" },
  ocean:     { name:"Océan",     bg:"#001a2e", primary:"#0066CC", accent:"#00FFB2", card:"rgba(0,10,30,0.7)", text:"#fff" },
  volcano:   { name:"Volcan",    bg:"#1a0a00", primary:"#CC3300", accent:"#FF8C00", card:"rgba(30,10,0,0.7)", text:"#fff" },
  forest:    { name:"Forêt",     bg:"#0a1a0a", primary:"#2E7D32", accent:"#A5D6A7", card:"rgba(0,20,0,0.7)",  text:"#fff" },
};


// ─── PLAYER THEME CATALOG ────────────────────────────────────
const PLAYER_THEMES = {
  none: {
    id:"none", name:"Aucun", icon:"⬜",
    bg:"#1a1a2e", primary:"#5D9E34", accent:"#FFD700", glow:"#FFD700",
    levels:["Débutant","Aventurier","Héros","Champion","LÉGENDE"],
    levelsF:["Débutante","Aventurière","Héroïne","Championne","LÉGENDE"],
    taskVerb:"complétée", winMsg:"Mission accomplie!", coinName:"Pièce",
    platformBg:"#1a1a2e", platformColor:"#5D9E34", platformItem:"⭐",
    platformItems:["⭐","💫","✨","🌟","💎"],
    platformHazard:null, platformObstacle:"🪨",
    charBodyColor:null, // null = use player.color
    shopCategory:{ id:"themed", label:"🎯 Items", items:[] },
  },
  lego: {
    id:"lego", name:"LEGO", icon:"🧱",
    bg:"#1a1a0a", primary:"#E3000B", accent:"#FFD700", glow:"#FFD700",
    levels:["Apprenti","Constructeur","Architecte","Maître","LEGO MASTER"],
    levelsF:["Apprentie","Constructrice","Architecte","Maître","LEGO MASTER"],
    taskVerb:"construite", winMsg:"Tu as construit cette quête!", coinName:"Brique",
    platformBg:"#2a2a00", platformColor:"#E3000B", platformItem:"🧱",
    platformItems:["🧱","⚙️","🪄","🔵","🟡"],
    platformHazard:"💥", platformObstacle:"🟥",
    charBodyColor:"#FFD700",
    shopCategory:{ id:"lego", label:"🧱 LEGO", items:[
      {id:"lg1",emoji:"🧱",name:"Brique légendaire",  cost:20,slot:"themed"},
      {id:"lg2",emoji:"🪄",name:"Minifig spéciale",   cost:35,slot:"themed"},
      {id:"lg3",emoji:"🏗️",name:"Set exclusif",       cost:50,slot:"themed"},
      {id:"lg4",emoji:"⚙️",name:"Pièce technique",    cost:15,slot:"themed"},
      {id:"lg5",emoji:"🎭",name:"Tête d'expression",  cost:25,slot:"face"},
      {id:"lg6",emoji:"🟡",name:"Tête jaune classique",cost:12,slot:"face"},
    ]},
  },
  medieval: {
    id:"medieval", name:"Médiéval", icon:"⚔️",
    bg:"#1a1400", primary:"#8B6914", accent:"#DAA520", glow:"#FFD700",
    levels:["Paysan","Écuyer","Chevalier","Seigneur","ROI"],
    levelsF:["Paysanne","Écuyère","Chevalière","Dame","REINE"],
    taskVerb:"accomplie", winMsg:"Quête accomplie, noble guerrier!", coinName:"Pièce d'or",
    platformBg:"#0a0800", platformColor:"#8B6914", platformItem:"📜",
    platformItems:["📜","🗡️","🛡️","👑","💎"],
    platformHazard:"🔥", platformObstacle:"🪨",
    charBodyColor:"#8B6914",
    shopCategory:{ id:"medieval", label:"⚔️ Médiéval", items:[
      {id:"md1",emoji:"🗡️",name:"Épée légendaire",    cost:35,slot:"themed"},
      {id:"md2",emoji:"🛡️",name:"Bouclier héraldique",cost:25,slot:"themed"},
      {id:"md3",emoji:"👑",name:"Couronne royale",     cost:50,slot:"hat"},
      {id:"md4",emoji:"🏰",name:"Château miniature",   cost:60,slot:"themed"},
      {id:"md5",emoji:"📜",name:"Parchemin rare",      cost:15,slot:"themed"},
      {id:"md6",emoji:"🪖",name:"Heaume de chevalier", cost:30,slot:"hat"},
    ]},
  },
  kpop: {
    id:"kpop", name:"K-Pop", icon:"🎤",
    bg:"#0a0010", primary:"#CC00AA", accent:"#FF69B4", glow:"#FF69B4",
    levels:["Trainee","Idol","Center","Soliste","SUPERSTAR"],
    levelsF:["Trainee","Idol","Center","Soliste","SUPERSTAR"],
    taskVerb:"performée", winMsg:"Le fandom t'adore!", coinName:"Lightstick",
    platformBg:"#050005", platformColor:"#CC00AA", platformItem:"🎵",
    platformItems:["🎵","🎤","💿","🌟","💜"],
    platformHazard:"📸", platformObstacle:"🎸",
    charBodyColor:"#CC00AA",
    shopCategory:{ id:"kpop", label:"🎤 K-Pop", items:[
      {id:"kp1",emoji:"🎤",name:"Micro légendaire",  cost:35,slot:"themed"},
      {id:"kp2",emoji:"💿",name:"Album signé",       cost:40,slot:"themed"},
      {id:"kp3",emoji:"🌟",name:"Lightstick ultime", cost:25,slot:"themed"},
      {id:"kp4",emoji:"👟",name:"Souliers de scène", cost:20,slot:"themed"},
      {id:"kp5",emoji:"🎧",name:"Casque studio",     cost:30,slot:"hat"},
      {id:"kp6",emoji:"💜",name:"Ruban ARMY",        cost:15,slot:"themed"},
    ]},
  },
  unicorn: {
    id:"unicorn", name:"Licornes", icon:"🦄",
    bg:"#0a0015", primary:"#DD44FF", accent:"#FFB3FF", glow:"#FFB3FF",
    levels:["Poulain","Licorne","Licorne Ailée","Licorne Arc-en-ciel","LICORNE LÉGENDAIRE"],
    levelsF:["Pouliche","Licorne","Licorne Ailée","Licorne Arc-en-ciel","LICORNE LÉGENDAIRE"],
    taskVerb:"enchantée", winMsg:"Ta corne brille! Le royaume t'acclame!", coinName:"Poussière de fée",
    platformBg:"#050008", platformColor:"#DD44FF", platformItem:"🌈",
    platformItems:["🌈","✨","🌸","💎","🧁"],
    platformHazard:"🌩️", platformObstacle:"☁️",
    charBodyColor:"#DD44FF",
    shopCategory:{ id:"unicorn", label:"🦄 Licorne", items:[
      {id:"un1",emoji:"🌈",name:"Arc-en-ciel en bouteille",cost:30,slot:"themed"},
      {id:"un2",emoji:"✨",name:"Poussière de fée",         cost:15,slot:"themed"},
      {id:"un3",emoji:"🌸",name:"Fleur magique",            cost:20,slot:"themed"},
      {id:"un4",emoji:"💎",name:"Cristal de corne",         cost:50,slot:"themed"},
      {id:"un5",emoji:"🧁",name:"Cupcake enchanté",         cost:25,slot:"themed"},
      {id:"un6",emoji:"🎀",name:"Ruban arc-en-ciel",        cost:12,slot:"hat"},
    ]},
  },
  demon: {
    id:"demon", name:"Démons", icon:"😈",
    bg:"#0a0000", primary:"#CC1100", accent:"#FF3300", glow:"#FF0066",
    levels:["Imp","Diablotin","Démon","Archidémon","SEIGNEUR DES OMBRES"],
    levelsF:["Imp","Diablotine","Démone","Archidémone","SEIGNEURE DES OMBRES"],
    taskVerb:"dominée", winMsg:"Le chaos s'incline! L'enfer t'acclame!", coinName:"Âme",
    platformBg:"#050000", platformColor:"#CC1100", platformItem:"🔥",
    platformItems:["🔥","💀","🧿","⛓️","🌋"],
    platformHazard:"💥", platformObstacle:"🪨",
    charBodyColor:"#1a0000",
    shopCategory:{ id:"demon", label:"😈 Démon", items:[
      {id:"dm1",emoji:"💀",name:"Crâne rare",            cost:30,slot:"themed"},
      {id:"dm2",emoji:"🔥",name:"Flamme éternelle",      cost:25,slot:"themed"},
      {id:"dm3",emoji:"🧿",name:"Œil démoniaque",        cost:35,slot:"themed"},
      {id:"dm4",emoji:"⛓️",name:"Chaîne légendaire",     cost:40,slot:"themed"},
      {id:"dm5",emoji:"🌋",name:"Fragment de volcan",     cost:20,slot:"themed"},
      {id:"dm6",emoji:"😈",name:"Cornes de boss",         cost:50,slot:"hat"},
    ]},
  },
  angel: {
    id:"angel", name:"Anges", icon:"😇",
    bg:"#00040a", primary:"#6699FF", accent:"#FFE566", glow:"#FFFFAA",
    levels:["Novice Céleste","Chérubin","Ange Gardien","Archange","SÉRAPHIN"],
    levelsF:["Novice Céleste","Chérubin","Ange Gardienne","Archange","SÉRAPHIN"],
    taskVerb:"bénie", winMsg:"Les cieux chantent! Les anges t'applaudissent!", coinName:"Étoile",
    platformBg:"#000508", platformColor:"#6699FF", platformItem:"⭐",
    platformItems:["⭐","🪶","🎺","💫","📿"],
    platformHazard:"⚡", platformObstacle:"☁️",
    charBodyColor:"#E8F4FF",
    shopCategory:{ id:"angel", label:"😇 Ange", items:[
      {id:"ag1",emoji:"🌟",name:"Étoile céleste",       cost:25,slot:"themed"},
      {id:"ag2",emoji:"🪶",name:"Plume sacrée",          cost:20,slot:"themed"},
      {id:"ag3",emoji:"🎺",name:"Trompette dorée",       cost:35,slot:"themed"},
      {id:"ag4",emoji:"💫",name:"Sphère lumineuse",      cost:30,slot:"themed"},
      {id:"ag5",emoji:"📿",name:"Chapelet enchanté",     cost:15,slot:"themed"},
      {id:"ag6",emoji:"😇",name:"Auréole divine",        cost:50,slot:"hat"},
    ]},
  },
  // ── SCIENTIFIQUE ──────────────────────────────────────────
  scientifique: {
    id:"scientifique", name:"Scientifique", icon:"🔬",
    bg:"#001a0a", primary:"#00CC66", accent:"#00FF99", glow:"#00FF99",
    levels:["Cobaye","Stagiaire","Chercheur","Professeur","PRIX NOBEL"],
    levelsF:["Cobaye","Stagiaire","Chercheuse","Professeure","PRIX NOBEL"],
    taskVerb:"prouvée", winMsg:"L'hypothèse est confirmée. Pour une fois.",
    coinName:"Molécule",
    platformBg:"#000d05", platformColor:"#00CC66", platformItem:"🧪",
    platformItems:["🧪","⚗️","🔭","💉","🧬"], platformHazard:"☢️", platformObstacle:"🧱",
    charBodyColor:"#004422",
    shopCategory:{ id:"scientifique", label:"🔬 Labo", items:[
      {id:"sc1",emoji:"🔬",name:"Microscope ultime",cost:35,slot:"themed"},
      {id:"sc2",emoji:"🥼",name:"Blouse trouée (rare)",cost:20,slot:"themed"},
      {id:"sc3",emoji:"🏆",name:"Trophée Nobel raté",cost:50,slot:"themed"},
      {id:"sc4",emoji:"⚗️",name:"Éprouvette légendaire",cost:25,slot:"themed"},
      {id:"sc5",emoji:"🧬",name:"ADN personnalisé",cost:40,slot:"themed"},
      {id:"sc6",emoji:"🎓",name:"Chapeau de docteur",cost:30,slot:"hat"},
    ]},
  },
  // ── INSECTES ──────────────────────────────────────────────
  insectes: {
    id:"insectes", name:"Insectes", icon:"🐛",
    bg:"#0a1400", primary:"#66AA00", accent:"#AAFF00", glow:"#AAFF00",
    levels:["Oeuf","Larve","Chrysalide","Insecte","REINE DES BUGS"],
    levelsF:["Oeuf","Larve","Chrysalide","Insecte","REINE DES BUGS"],
    taskVerb:"butinée", winMsg:"Même une fourmi travaille. Leçon de vie.",
    coinName:"Larve",
    platformBg:"#050a00", platformColor:"#66AA00", platformItem:"🌿",
    platformItems:["🌿","🌸","🍄","💧","🪲"], platformHazard:"🕷️", platformObstacle:"🪨",
    charBodyColor:"#335500",
    shopCategory:{ id:"insectes", label:"🐛 Insectes", items:[
      {id:"in1",emoji:"🦋",name:"Ailes de papillon",cost:30,slot:"themed"},
      {id:"in2",emoji:"🐞",name:"Carapace coccinelle",cost:25,slot:"themed"},
      {id:"in3",emoji:"🦗",name:"Antennes grillon",cost:20,slot:"hat"},
      {id:"in4",emoji:"🪲",name:"Cocon doré",cost:50,slot:"themed"},
      {id:"in5",emoji:"🐜",name:"Armure fourmi",cost:35,slot:"themed"},
      {id:"in6",emoji:"🌿",name:"Branche camouflage",cost:15,slot:"themed"},
    ]},
  },
  // ── MONSTRES ──────────────────────────────────────────────
  monstres: {
    id:"monstres", name:"Monstres", icon:"👹",
    bg:"#1a0020", primary:"#8800CC", accent:"#CC44FF", glow:"#CC44FF",
    levels:["Petit Monstre","Croqueur","Grognard","Terroriseur","MONSTRE SUPRÊME"],
    levelsF:["Petite Monstre","Croqueuse","Grognarde","Terroriseuse","MONSTRE SUPRÊME"],
    taskVerb:"dévorée", winMsg:"Frankenstein faisait ses tâches. Probablement.",
    coinName:"Rugissement",
    platformBg:"#0d0015", platformColor:"#8800CC", platformItem:"💜",
    platformItems:["💜","🦷","👁️","⛓️","💀"], platformHazard:"🔥", platformObstacle:"🪨",
    charBodyColor:"#440066",
    shopCategory:{ id:"monstres", label:"👹 Monstres", items:[
      {id:"mo1",emoji:"👹",name:"Masque de monstre",cost:35,slot:"hat"},
      {id:"mo2",emoji:"🦷",name:"Dents géantes",cost:25,slot:"themed"},
      {id:"mo3",emoji:"💜",name:"Cape de monstre",cost:30,slot:"themed"},
      {id:"mo4",emoji:"⛓️",name:"Chaînes de boss",cost:40,slot:"themed"},
      {id:"mo5",emoji:"👁️",name:"Œil central",cost:20,slot:"themed"},
      {id:"mo6",emoji:"🖤",name:"Coeur de ténèbres",cost:50,slot:"themed"},
    ]},
  },
  // ── PRÉHISTOIRE ───────────────────────────────────────────
  prehistoire: {
    id:"prehistoire", name:"Préhistoire", icon:"🦕",
    bg:"#1a1000", primary:"#AA6600", accent:"#FFAA00", glow:"#FFAA00",
    levels:["Homo Canapé","Chasseur","Troglodyte","Chef de Clan","DIEU DE LA CAVERNE"],
    levelsF:["Homo Canapé","Chasseuse","Troglodyte","Cheffe de Clan","DIEU DE LA CAVERNE"],
    taskVerb:"chassée", winMsg:"Les dinosaures ont arrêté de ranger. C'est pour ça qu'ils ont disparu.",
    coinName:"Os",
    platformBg:"#0d0800", platformColor:"#AA6600", platformItem:"🦴",
    platformItems:["🦴","🪨","🌋","🦕","🥚"], platformHazard:"🌋", platformObstacle:"🪨",
    charBodyColor:"#664400",
    shopCategory:{ id:"prehistoire", label:"🦕 Préhistoire", items:[
      {id:"pr1",emoji:"🪨",name:"Massue de roche",cost:20,slot:"themed"},
      {id:"pr2",emoji:"🦣",name:"Peau de mammouth",cost:35,slot:"themed"},
      {id:"pr3",emoji:"🖼️",name:"Peinture rupestre",cost:25,slot:"themed"},
      {id:"pr4",emoji:"🦕",name:"Œuf de dinosaure",cost:50,slot:"themed"},
      {id:"pr5",emoji:"🪶",name:"Parure de chef",cost:30,slot:"hat"},
      {id:"pr6",emoji:"🔥",name:"Feu sacré",cost:15,slot:"themed"},
    ]},
  },
  // ── MICROSCOPIQUE ─────────────────────────────────────────
  microscopique: {
    id:"microscopique", name:"Microscopique", icon:"🦠",
    bg:"#000a14", primary:"#0088CC", accent:"#00DDFF", glow:"#00DDFF",
    levels:["Virus","Microbe","Bactérie","Cellule","ORGANISME ENTIER"],
    levelsF:["Virus","Microbe","Bactérie","Cellule","ORGANISME ENTIER"],
    taskVerb:"divisée", winMsg:"Tu es officiellement plus organisé qu'une amibe. C'est un compliment.",
    coinName:"Bactérie",
    platformBg:"#00050a", platformColor:"#0088CC", platformItem:"💉",
    platformItems:["💉","🔵","⚪","🧬","🫧"], platformHazard:"⚡", platformObstacle:"🫧",
    charBodyColor:"#003344",
    shopCategory:{ id:"microscopique", label:"🦠 Micro", items:[
      {id:"mi1",emoji:"🦠",name:"Flagelle doré",cost:30,slot:"themed"},
      {id:"mi2",emoji:"🔵",name:"Noyau cellulaire",cost:25,slot:"themed"},
      {id:"mi3",emoji:"🧬",name:"Mitochondrie légendaire",cost:50,slot:"themed"},
      {id:"mi4",emoji:"💉",name:"Seringue de pouvoir",cost:20,slot:"themed"},
      {id:"mi5",emoji:"🫧",name:"Bulle protectrice",cost:35,slot:"themed"},
      {id:"mi6",emoji:"⚗️",name:"Pipette d'élite",cost:15,slot:"themed"},
    ]},
  },
  // ── ROBLOX ────────────────────────────────────────────────
  roblox: {
    id:"roblox", name:"Roblox", icon:"🎮",
    bg:"#0a0a0a", primary:"#CC0000", accent:"#FF4444", glow:"#FF6666",
    levels:["Noob","Builder","Pro","Admin","OWNER"],
    levelsF:["Noob","Builder","Pro","Admin","OWNER"],
    taskVerb:"obbyée", winMsg:"OOF. Quête complétée. Tu n'es plus un noob. Presque.",
    coinName:"Robux fictif",
    platformBg:"#050505", platformColor:"#CC0000", platformItem:"🧱",
    platformItems:["🧱","⭐","💎","🎯","🏆"], platformHazard:"💥", platformObstacle:"🟥",
    charBodyColor:"#880000",
    shopCategory:{ id:"roblox", label:"🎮 Roblox", items:[
      {id:"rb1",emoji:"🧢",name:"Chapeau aux oeufs",cost:25,slot:"hat"},
      {id:"rb2",emoji:"💎",name:"Gemme Admin",cost:50,slot:"themed"},
      {id:"rb3",emoji:"🏠",name:"Brique ultime",cost:20,slot:"themed"},
      {id:"rb4",emoji:"⚔️",name:"Épée légendaire obby",cost:35,slot:"themed"},
      {id:"rb5",emoji:"🛡️",name:"Bouclier noob+",cost:15,slot:"themed"},
      {id:"rb6",emoji:"🏆",name:"Trophée Owner",cost:60,slot:"themed"},
    ]},
  },
  // ── BISOUNOURS ────────────────────────────────────────────
  bisounours: {
    id:"bisounours", name:"Rose Bisounours 🆘", icon:"🌈",
    bg:"#1a0010", primary:"#FF69B4", accent:"#FFB3FF", glow:"#FFB3FF",
    levels:["Bébé Bisounours","Super Doux","Trop Mignon","Câlinosaure","GRAND MAÎTRE DU ROSE"],
    levelsF:["Bébé Bisounours","Super Douce","Trop Mignonne","Câlinosaure","GRAND MAÎTRE DU ROSE"],
    taskVerb:"câlinée", winMsg:"Félicitations! Tu as gagné un arc-en-ciel supplémentaire. ENCORE UN.",
    coinName:"Câlin forcé",
    platformBg:"#0f000a", platformColor:"#FF69B4", platformItem:"🌈",
    platformItems:["🌈","💝","✨","🦄","☁️"], platformHazard:"💖", platformObstacle:"☁️",
    charBodyColor:"#CC0066",
    shopCategory:{ id:"bisounours", label:"🌈 Bisounours", items:[
      {id:"bs1",emoji:"☁️",name:"Nuage rose",cost:15,slot:"themed"},
      {id:"bs2",emoji:"💝",name:"Coeur géant",cost:20,slot:"themed"},
      {id:"bs3",emoji:"🌈",name:"Arc-en-ciel en plastique",cost:25,slot:"themed"},
      {id:"bs4",emoji:"✨",name:"Paillettes obligatoires",cost:30,slot:"themed"},
      {id:"bs5",emoji:"🦄",name:"Licorne bonus",cost:50,slot:"pet"},
      {id:"bs6",emoji:"🎀",name:"Noeud rose fluo",cost:10,slot:"hat"},
    ]},
  },
  // ── CUISINE ───────────────────────────────────────────────
  cuisine: {
    id:"cuisine", name:"Cuisine", icon:"🍳",
    bg:"#14080a", primary:"#CC4400", accent:"#FF8844", glow:"#FF8844",
    levels:["Lave-Vaisselle","Apprenti","Sous-Chef","Chef","GORDON RAMSAY"],
    levelsF:["Lave-Vaisselle","Apprentie","Sous-Cheffe","Cheffe","GORDON RAMSAY"],
    taskVerb:"cuisinée", winMsg:"C'est pas encore brûlé. Progrès.",
    coinName:"Étoile Michelin",
    platformBg:"#0a0405", platformColor:"#CC4400", platformItem:"🍳",
    platformItems:["🍳","🥄","🔪","🧂","🏆"], platformHazard:"🔥", platformObstacle:"🫕",
    charBodyColor:"#881100",
    shopCategory:{ id:"cuisine", label:"🍳 Cuisine", items:[
      {id:"cu1",emoji:"👨‍🍳",name:"Toque de chef",cost:25,slot:"hat"},
      {id:"cu2",emoji:"👔",name:"Tablier légendaire",cost:20,slot:"themed"},
      {id:"cu3",emoji:"🔪",name:"Couteau pro",cost:35,slot:"themed"},
      {id:"cu4",emoji:"🥄",name:"Spatule d'or",cost:30,slot:"themed"},
      {id:"cu5",emoji:"⭐",name:"3 étoiles Michelin",cost:60,slot:"themed"},
      {id:"cu6",emoji:"🍕",name:"Pizza magique",cost:15,slot:"themed"},
    ]},
  },
  // ── HORREUR ───────────────────────────────────────────────
  horreur: {
    id:"horreur", name:"Horreur", icon:"😱",
    bg:"#050005", primary:"#880000", accent:"#FF2222", glow:"#FF4444",
    levels:["Trouillard","Nerveux","Courageux","Survivant","DERNIER SURVIVANT"],
    levelsF:["Trouillarde","Nerveuse","Courageuse","Survivante","DERNIER SURVIVANT"],
    taskVerb:"survécue", winMsg:"Tu as accompli ça. Dans le noir. Sans mourir. Impressive.",
    coinName:"Frisson",
    platformBg:"#020002", platformColor:"#880000", platformItem:"🔦",
    platformItems:["🔦","🗝️","📿","🩸","💀"], platformHazard:"👻", platformObstacle:"⛓️",
    charBodyColor:"#330000",
    shopCategory:{ id:"horreur", label:"😱 Horreur", items:[
      {id:"ho1",emoji:"🔦",name:"Lampe de poche",cost:15,slot:"themed"},
      {id:"ho2",emoji:"🎭",name:"Masque de hockey",cost:30,slot:"hat"},
      {id:"ho3",emoji:"🗝️",name:"Clé de la cave",cost:25,slot:"themed"},
      {id:"ho4",emoji:"📿",name:"Amulette protectrice",cost:35,slot:"themed"},
      {id:"ho5",emoji:"🩸",name:"Stigmate du survivant",cost:50,slot:"themed"},
      {id:"ho6",emoji:"💀",name:"Crâne du boss final",cost:40,slot:"themed"},
    ]},
  },
  // ── TOTALEMENT MÉLANGÉ ────────────────────────────────────
  melange: {
    id:"melange", name:"Totalement Mélangé", icon:"🌪️",
    bg:"#0a0a14", primary:"#8844CC", accent:"#FFCC00", glow:"#FFCC00",
    levels:["Chaos","Confusion","Désordre Organisé","Anarchie","C'EST QUI LE BOSS ICI?"],
    levelsF:["Chaos","Confusion","Désordre Organisé","Anarchie","C'EST QUI LE BOSS ICI?"],
    taskVerb:"chaotisée", winMsg:"Un dinosaure Bisounours scientifique vient de valider ça. Normal.",
    coinName:"Truc",
    platformBg:"#050510", platformColor:"#8844CC", platformItem:"🌀",
    platformItems:["🌀","🦕","🌈","🔬","🎮"], platformHazard:"❓", platformObstacle:"🌪️",
    charBodyColor:null, // random each render
    mixedMode:true, // signals UI to slowly cycle accent color
    shopCategory:{ id:"melange", label:"🌪️ Chaos", items:[
      {id:"mx1",emoji:"🌪️",name:"Tourbillon de trucs",cost:20,slot:"themed"},
      {id:"mx2",emoji:"❓",name:"Item mystère",cost:25,slot:"themed"},
      {id:"mx3",emoji:"🦕",name:"Dino-Bisounours",cost:35,slot:"pet"},
      {id:"mx4",emoji:"🌈",name:"Arc-en-ciel scientifique",cost:30,slot:"themed"},
      {id:"mx5",emoji:"🎲",name:"Dé du destin",cost:15,slot:"themed"},
      {id:"mx6",emoji:"🌀",name:"Chapeau de chaos",cost:40,slot:"hat"},
    ]},
  },
  // ── HARRY POTTER ──────────────────────────────────────────
  harrypotter: {
    id:"harrypotter", name:"Harry Potter", icon:"🪄",
    bg:"#07060d", primary:"#7B2FBE", accent:"#F0C040", glow:"#F0C040",
    levels:["Moldu","Élève","Préfet","Auror","SORCIER SUPRÊME"],
    levelsF:["Moldue","Élève","Préfète","Auror","SORCIÈRE SUPRÊME"],
    taskVerb:"ensorcelée", winMsg:"Hermione aurait déjà fini. Juste dit.",
    coinName:"Gallion",
    platformBg:"#040309", platformColor:"#7B2FBE", platformItem:"✨",
    platformItems:["✨","🪄","📚","🦉","⚡"], platformHazard:"🧙",  platformObstacle:"🪨",
    charBodyColor:"#3d1a6e",
    shopCategory:{ id:"harrypotter", label:"🪄 Poudlard", items:[
      {id:"hp1",emoji:"🪄",name:"Baguette en bois de houx",cost:30,slot:"themed"},
      {id:"hp2",emoji:"🧣",name:"Écharpe de maison",cost:20,slot:"themed"},
      {id:"hp3",emoji:"🎓",name:"Chapeau du Choixpeau",cost:40,slot:"hat"},
      {id:"hp4",emoji:"🦉",name:"Hibou messager",cost:35,slot:"pet"},
      {id:"hp5",emoji:"🏆",name:"Coupe des Quatre Maisons",cost:60,slot:"themed"},
      {id:"hp6",emoji:"🔮",name:"Boule de cristal",cost:25,slot:"themed"},
    ]},
  },
  // ── GÉANT DE FER ──────────────────────────────────────────
  geantdefer: {
    id:"geantdefer", name:"Géant de Fer", icon:"🤖",
    bg:"#050a10", primary:"#4477CC", accent:"#88CCFF", glow:"#88CCFF",
    levels:["Ferraille","Robot","Androïde","Géant","SUPERMAN (le vrai)"],
    levelsF:["Ferraille","Robot","Androïde","Géante","SUPERMAN (le vrai)"],
    taskVerb:"boulonnée", winMsg:"Tu n'es pas une arme. Tu es un héros. Maintenant range ta chambre.",
    coinName:"Boulon",
    platformBg:"#020508", platformColor:"#4477CC", platformItem:"⚙️",
    platformItems:["⚙️","🔩","🦾","💥","⭐"], platformHazard:"🚀", platformObstacle:"🪨",
    charBodyColor:"#2244AA",
    shopCategory:{ id:"geantdefer", label:"🤖 Géant", items:[
      {id:"gi1",emoji:"🦾",name:"Poing de métal",cost:30,slot:"themed"},
      {id:"gi2",emoji:"👁️",name:"Laser oculaire",cost:35,slot:"themed"},
      {id:"gi3",emoji:"🛡️",name:"Plaque de blindage",cost:40,slot:"themed"},
      {id:"gi4",emoji:"⭐",name:"Étoile de Superman",cost:50,slot:"themed"},
      {id:"gi5",emoji:"🔩",name:"Boulon légendaire",cost:20,slot:"themed"},
      {id:"gi6",emoji:"🪖",name:"Casque de titane",cost:25,slot:"hat"},
    ]},
  },
  // ── LES TROLLS ────────────────────────────────────────────
  trolls: {
    id:"trolls", name:"Les Trolls", icon:"🧌",
    bg:"#0a0014", primary:"#CC44AA", accent:"#FF88FF", glow:"#FF88FF",
    levels:["Muet","Chantonneur","Harmonieux","DJ","ROI DE LA FÊTE"],
    levelsF:["Muette","Chantonnante","Harmonieuse","DJ","REINE DE LA FÊTE"],
    taskVerb:"chantée", winMsg:"Branch approuve. Poppy aussi. Tout le monde chante. Tu ne peux pas fuir.",
    coinName:"Étincelle",
    platformBg:"#070009", platformColor:"#CC44AA", platformItem:"🎵",
    platformItems:["🎵","🎉","💃","🌺","🌟"], platformHazard:"🎹", platformObstacle:"☁️",
    charBodyColor:"#881177",
    shopCategory:{ id:"trolls", label:"🧌 Trolls", items:[
      {id:"tr1",emoji:"🌺",name:"Fleur dans les cheveux",cost:15,slot:"hat"},
      {id:"tr2",emoji:"✨",name:"Glitter tube",cost:20,slot:"themed"},
      {id:"tr3",emoji:"🤗",name:"Hug Time badge",cost:25,slot:"themed"},
      {id:"tr4",emoji:"🎤",name:"Micro de scène",cost:30,slot:"themed"},
      {id:"tr5",emoji:"🎶",name:"Notes musicales",cost:35,slot:"themed"},
      {id:"tr6",emoji:"💃",name:"Pas de danse légendaire",cost:50,slot:"themed"},
    ]},
  },
  // ── GHIBLI ────────────────────────────────────────────────
  ghibli: {
    id:"ghibli", name:"Univers Ghibli", icon:"🍃",
    bg:"#050d0a", primary:"#3A8A4A", accent:"#A8E6B0", glow:"#A8E6B0",
    levels:["Esprit de la Forêt","Voyageur","Héros Calme","Sage","TOTORO"],
    levelsF:["Esprit de la Forêt","Voyageuse","Héroïne Calme","Sage","TOTORO"],
    taskVerb:"contemplée", winMsg:"Chihiro a nettoyé des bains publics. Toi tu fais juste ta chambre.",
    coinName:"Esprit",
    platformBg:"#020806", platformColor:"#3A8A4A", platformItem:"🍃",
    platformItems:["🍃","🌸","🏮","🌳","✨"], platformHazard:"💨", platformObstacle:"🌳",
    charBodyColor:"#224433",
    shopCategory:{ id:"ghibli", label:"🍃 Ghibli", items:[
      {id:"gh1",emoji:"🚌",name:"Ticket Chat-Bus",cost:30,slot:"themed"},
      {id:"gh2",emoji:"🍃",name:"Feuille magique",cost:20,slot:"themed"},
      {id:"gh3",emoji:"🍱",name:"Bento du Studio",cost:25,slot:"themed"},
      {id:"gh4",emoji:"🦔",name:"Totoro de poche",cost:50,slot:"pet"},
      {id:"gh5",emoji:"🏮",name:"Lanterne du voyage",cost:35,slot:"themed"},
      {id:"gh6",emoji:"🎋",name:"Chapeau de paille",cost:15,slot:"hat"},
    ]},
  },
  // ── PLANÈTE DES SINGES ────────────────────────────────────
  singes: {
    id:"singes", name:"Planète des Singes", icon:"🐒",
    bg:"#0d0a00", primary:"#886600", accent:"#FFCC44", glow:"#FFCC44",
    levels:["Singe Paresseux","Grimpeur","Guerrier","Général","CÉSAR"],
    levelsF:["Singe Paresseuse","Grimpeuse","Guerrière","Générale","CÉSAR"],
    taskVerb:"conquise", winMsg:"César n'a jamais laissé traîner ses affaires. C'est pour ça qu'il a pris le pouvoir.",
    coinName:"Banane",
    platformBg:"#080600", platformColor:"#886600", platformItem:"🍌",
    platformItems:["🍌","🌴","⚔️","🏔️","👑"], platformHazard:"💥", platformObstacle:"🌴",
    charBodyColor:"#553300",
    shopCategory:{ id:"singes", label:"🐒 Singes", items:[
      {id:"si1",emoji:"⚔️",name:"Lance tribale",cost:25,slot:"themed"},
      {id:"si2",emoji:"🎖️",name:"Épaulettes de général",cost:35,slot:"themed"},
      {id:"si3",emoji:"🏅",name:"Médaille de la révolution",cost:40,slot:"themed"},
      {id:"si4",emoji:"🌴",name:"Couronne de palmes",cost:20,slot:"hat"},
      {id:"si5",emoji:"🍌",name:"Banane légendaire",cost:15,slot:"themed"},
      {id:"si6",emoji:"🦍",name:"Familier gorille",cost:60,slot:"pet"},
    ]},
  },
  // ── JAMES BOND ────────────────────────────────────────────
  jamesbond: {
    id:"jamesbond", name:"James Bond", icon:"🕵️",
    bg:"#050508", primary:"#223355", accent:"#C0A060", glow:"#C0A060",
    levels:["Stagiaire MI6","Agent","00X","007","M (le vrai boss)"],
    levelsF:["Stagiaire MI6","Agente","00X","007","M (la vraie boss)"],
    taskVerb:"infiltrée", winMsg:"Mission accomplie. Q est... modérément impressionné.",
    coinName:"Gadget",
    platformBg:"#020204", platformColor:"#223355", platformItem:"🔫",
    platformItems:["🔫","🎰","🍸","💼","🚗"], platformHazard:"💣", platformObstacle:"🏢",
    charBodyColor:"#111133",
    shopCategory:{ id:"jamesbond", label:"🕵️ MI6", items:[
      {id:"jb1",emoji:"🚗",name:"Aston Martin miniature",cost:50,slot:"themed"},
      {id:"jb2",emoji:"⌚",name:"Montre gadget",cost:40,slot:"themed"},
      {id:"jb3",emoji:"🤵",name:"Smoking légendaire",cost:35,slot:"themed"},
      {id:"jb4",emoji:"🍸",name:"Martini (au jus)",cost:15,slot:"themed"},
      {id:"jb5",emoji:"💼",name:"Mallette secrète",cost:30,slot:"themed"},
      {id:"jb6",emoji:"🕶️",name:"Lunettes espion",cost:20,slot:"hat"},
    ]},
  },
  // ── BOOMERANG FU ──────────────────────────────────────────
  boomerangfu: {
    id:"boomerangfu", name:"Boomerang Fu", icon:"💥",
    bg:"#0a0800", primary:"#CC6600", accent:"#FF9900", glow:"#FF9900",
    levels:["Pain Grillé","Croissant","Taco Ninja","Burger Boss","SEIGNEUR DU BOOMERANG"],
    levelsF:["Pain Grillé","Croissant","Taco Ninja","Burger Boss","SEIGNEUR DU BOOMERANG"],
    taskVerb:"lancée-revenue", winMsg:"Tu as lancé ton boomerang de tâche et il est revenu complété. Physique quantique.",
    coinName:"Boomerang",
    platformBg:"#070500", platformColor:"#CC6600", platformItem:"💥",
    platformItems:["💥","🥐","🌮","🍔","🏆"], platformHazard:"💥", platformObstacle:"🧱",
    charBodyColor:"#884400",
    shopCategory:{ id:"boomerangfu", label:"💥 Boomerang", items:[
      {id:"bf1",emoji:"🪃",name:"Boomerang doré",cost:35,slot:"themed"},
      {id:"bf2",emoji:"🥖",name:"Armure de baguette",cost:25,slot:"themed"},
      {id:"bf3",emoji:"🍕",name:"Chapeau chef ninja",cost:20,slot:"hat"},
      {id:"bf4",emoji:"💥",name:"Explosion de puissance",cost:40,slot:"themed"},
      {id:"bf5",emoji:"🌮",name:"Taco de victoire",cost:15,slot:"themed"},
      {id:"bf6",emoji:"🏆",name:"Trophée du pain",cost:50,slot:"themed"},
    ]},
  },
  // ── MINECRAFT ++ ──────────────────────────────────────────
  minecraftpp: {
    id:"minecraftpp", name:"Minecraft ++", icon:"⛏️",
    bg:"#0d1a0d", primary:"#4A9E34", accent:"#5DECF5", glow:"#5DECF5",
    levels:["Bois","Pierre","Fer","Or","DIAMANT LÉGENDAIRE"],
    levelsF:["Bois","Pierre","Fer","Or","DIAMANT LÉGENDAIRE"],
    taskVerb:"craftée", winMsg:"Steve a construit une maison entière en une nuit. Toi t'as rangé une brassée. Respect quand même.",
    coinName:"Diamant",
    platformBg:"#060e06", platformColor:"#4A9E34", platformItem:"💎",
    platformItems:["💎","⛏️","🪵","🔥","🏹"], platformHazard:"💀", platformObstacle:"🪨",
    charBodyColor:"#2A6E24",
    shopCategory:{ id:"minecraftpp", label:"⛏️ Minecraft", items:[
      {id:"mc1",emoji:"⛏️",name:"Pickaxe diamant",cost:35,slot:"themed"},
      {id:"mc2",emoji:"🗡️",name:"Épée enchantée",cost:40,slot:"themed"},
      {id:"mc3",emoji:"🛡️",name:"Totem d'immortalité",cost:60,slot:"themed"},
      {id:"mc4",emoji:"🪶",name:"Elytra",cost:50,slot:"themed"},
      {id:"mc5",emoji:"💎",name:"Bloc de diamant",cost:25,slot:"themed"},
      {id:"mc6",emoji:"🪖",name:"Casque Netherite",cost:30,slot:"hat"},
    ]},
  },
  // ── COURSE FUTURISTE ──────────────────────────────────────
  coursefutur: {
    id:"coursefutur", name:"Course Futuriste", icon:"🏎️",
    bg:"#000a14", primary:"#0055AA", accent:"#00AAFF", glow:"#00DDFF",
    levels:["Mécanicien","Pilote","Ace","Champion","PILOTE FANTÔME"],
    levelsF:["Mécanicien","Pilote","Ace","Champion","PILOTE FANTÔME"],
    taskVerb:"pilotée", winMsg:"Tu as complété ça à 300km/h. Mentalement, du moins.",
    coinName:"Boost",
    platformBg:"#000508", platformColor:"#0055AA", platformItem:"🏎️",
    platformItems:["🏎️","⚡","🏁","💨","🏆"], platformHazard:"💥", platformObstacle:"🚧",
    charBodyColor:"#002255",
    shopCategory:{ id:"coursefutur", label:"🏎️ Course", items:[
      {id:"cf1",emoji:"🪖",name:"Casque holographique",cost:30,slot:"hat"},
      {id:"cf2",emoji:"🚗",name:"Voiture miniature",cost:40,slot:"themed"},
      {id:"cf3",emoji:"⚡",name:"Turbo légendaire",cost:35,slot:"themed"},
      {id:"cf4",emoji:"🏁",name:"Drapeau du champion",cost:25,slot:"themed"},
      {id:"cf5",emoji:"🛞",name:"Aileron aérodynamique",cost:20,slot:"themed"},
      {id:"cf6",emoji:"💫",name:"Moteur fantôme",cost:50,slot:"themed"},
    ]},
  },
  // ── SECRET THEMES (random pool only) ─────────────────────
  canards: {
    id:"canards", name:"🦆 Canards Jaunes", icon:"🦆",
    bg:"#0a0d00", primary:"#DDAA00", accent:"#FFEE44", glow:"#FFEE44",
    levels:["Poussin","Caneton","Canard","Canard Pro","SUPER CANARD"],
    levelsF:["Poussin","Caneton","Canard","Canard Pro","SUPER CANARD"],
    taskVerb:"canardée", winMsg:"Coin coin! Tâche accomplie. Tu mérites un biscuit en forme de canard.",
    coinName:"Plume",
    platformBg:"#060800", platformColor:"#DDAA00", platformItem:"🦆",
    platformItems:["🦆","🪶","💛","🌊","⭐"], platformHazard:"🐊", platformObstacle:"🌾",
    charBodyColor:"#DDAA00", secret:true,
    shopCategory:{ id:"canards", label:"🦆 Canards", items:[
      {id:"dk1",emoji:"🦆",name:"Canard légendaire",cost:30,slot:"pet"},
      {id:"dk2",emoji:"🪶",name:"Plume d'or",cost:20,slot:"themed"},
      {id:"dk3",emoji:"💛",name:"Couronne jaune",cost:35,slot:"hat"},
      {id:"dk4",emoji:"🌊",name:"Mare privée",cost:40,slot:"themed"},
      {id:"dk5",emoji:"🐥",name:"Poussin familier",cost:15,slot:"pet"},
      {id:"dk6",emoji:"🛁",name:"Bain de canards",cost:25,slot:"themed"},
    ]},
  },
  aliens: {
    id:"aliens", name:"👽 Invasion Alien", icon:"👽",
    bg:"#000d00", primary:"#00AA44", accent:"#44FF88", glow:"#44FF88",
    levels:["Terrien","Contact","Abducté","Hybride","MAÎTRE GALACTIQUE"],
    levelsF:["Terrienne","Contact","Abductée","Hybride","MAÎTRE GALACTIQUE"],
    taskVerb:"abductée", winMsg:"Les Hommes en Noir approuvent. Probablement.",
    coinName:"Cristal",
    platformBg:"#000800", platformColor:"#00AA44", platformItem:"🛸",
    platformItems:["🛸","💚","🔭","⭐","👾"], platformHazard:"🔦", platformObstacle:"🪨",
    charBodyColor:"#003322", secret:true,
    shopCategory:{ id:"aliens", label:"👽 Alien", items:[
      {id:"al1",emoji:"🛸",name:"Soucoupe volante",cost:40,slot:"pet"},
      {id:"al2",emoji:"👽",name:"Masque alien",cost:30,slot:"hat"},
      {id:"al3",emoji:"💚",name:"Cristal vert",cost:20,slot:"themed"},
      {id:"al4",emoji:"🌌",name:"Carte galactique",cost:35,slot:"themed"},
      {id:"al5",emoji:"👾",name:"Familier pixel",cost:15,slot:"pet"},
      {id:"al6",emoji:"🔬",name:"Rayon analyseur",cost:25,slot:"themed"},
    ]},
  },
  pirates: {
    id:"pirates", name:"🏴 Pirates", icon:"🏴",
    bg:"#080500", primary:"#885500", accent:"#FFAA22", glow:"#FFAA22",
    levels:["Mousse","Matelot","Pirate","Capitaine","PIRATE LÉGENDAIRE"],
    levelsF:["Mousse","Matelote","Pirate","Capitaine","PIRATE LÉGENDAIRE"],
    taskVerb:"pillée", winMsg:"Yo ho ho! Le trésor est à toi. Range quand même ta chambre.",
    coinName:"Doubloon",
    platformBg:"#040300", platformColor:"#885500", platformItem:"🪝",
    platformItems:["🪝","💰","🗺️","🦜","💎"], platformHazard:"🦈", platformObstacle:"🌊",
    charBodyColor:"#442200", secret:true,
    shopCategory:{ id:"pirates", label:"🏴 Pirates", items:[
      {id:"pi1",emoji:"🦜",name:"Perroquet pirate",cost:25,slot:"pet"},
      {id:"pi2",emoji:"🎩",name:"Chapeau de capitaine",cost:30,slot:"hat"},
      {id:"pi3",emoji:"⚔️",name:"Sabre du corsaire",cost:35,slot:"themed"},
      {id:"pi4",emoji:"💰",name:"Coffre au trésor",cost:50,slot:"themed"},
      {id:"pi5",emoji:"🗺️",name:"Carte au trésor",cost:20,slot:"themed"},
      {id:"pi6",emoji:"🔭",name:"Longue-vue",cost:15,slot:"themed"},
    ]},
  },
  sushi: {
    id:"sushi", name:"🍣 Sushi World", icon:"🍣",
    bg:"#0a0005", primary:"#CC0033", accent:"#FF6688", glow:"#FF6688",
    levels:["Riz nature","Maki","California","Nigiri","CHEF SUSHI ULTIME"],
    levelsF:["Riz nature","Maki","California","Nigiri","CHEF SUSHI ULTIME"],
    taskVerb:"roulée", winMsg:"Itadakimasu! Tâche accomplie avec grâce et wasabi.",
    coinName:"Maki",
    platformBg:"#050003", platformColor:"#CC0033", platformItem:"🍣",
    platformItems:["🍣","🥢","🍱","🐟","⭐"], platformHazard:"🦑", platformObstacle:"🌊",
    charBodyColor:"#660011", secret:true,
    shopCategory:{ id:"sushi", label:"🍣 Sushi", items:[
      {id:"su1",emoji:"🍣",name:"Sushi légendaire",cost:25,slot:"themed"},
      {id:"su2",emoji:"🥢",name:"Baguettes en or",cost:20,slot:"themed"},
      {id:"su3",emoji:"🍱",name:"Bento de champion",cost:30,slot:"themed"},
      {id:"su4",emoji:"🎌",name:"Bandeau chef",cost:35,slot:"hat"},
      {id:"su5",emoji:"🌊",name:"Vague de wasabi",cost:15,slot:"themed"},
      {id:"su6",emoji:"🐡",name:"Fugu familier",cost:40,slot:"pet"},
    ]},
  },
  robots: {
    id:"robots", name:"🤖 Robots", icon:"🤖",
    bg:"#000510", primary:"#0044AA", accent:"#00AAFF", glow:"#00CCFF",
    levels:["Grille-pain","Aspirateur","Robot","Cyborg","INTELLIGENCE ARTIFICIELLE"],
    levelsF:["Grille-pain","Aspirateur","Robot","Cyborg","INTELLIGENCE ARTIFICIELLE"],
    taskVerb:"calculée", winMsg:"TÂCHE_COMPLÉTÉE = TRUE. FÉLICITATIONS.EXE",
    coinName:"Pixel",
    platformBg:"#000308", platformColor:"#0044AA", platformItem:"🤖",
    platformItems:["🤖","⚙️","💾","🔩","⭐"], platformHazard:"🔌", platformObstacle:"🖥️",
    charBodyColor:"#002255", secret:true,
    shopCategory:{ id:"robots", label:"🤖 Robots", items:[
      {id:"ro1",emoji:"🤖",name:"Tête de robot",cost:30,slot:"hat"},
      {id:"ro2",emoji:"🦾",name:"Bras robotique",cost:35,slot:"themed"},
      {id:"ro3",emoji:"💾",name:"Disque dur rare",cost:25,slot:"themed"},
      {id:"ro4",emoji:"⚡",name:"Batterie infinie",cost:40,slot:"themed"},
      {id:"ro5",emoji:"📡",name:"Antenne satellite",cost:20,slot:"hat"},
      {id:"ro6",emoji:"🖥️",name:"Écran intégré",cost:50,slot:"themed"},
    ]},
  },
  // ── JAPON ────────────────────────────────────────────────────
  japon: {
    id:"japon", name:"Japon", icon:"⛩️",
    bg:"#08000a", primary:"#CC0044", accent:"#FF4488", glow:"#FF4488",
    levels:["Shōshin","Genin","Chūnin","Jōnin","SHOGUN"],
    levelsF:["Shōshin","Genin","Chūnin","Jōnin","SHOGUN"],
    taskVerb:"maîtrisée", winMsg:"Ichi-go ichi-e. Ce moment ne reviendra pas. T'as bien fait.",
    coinName:"Mon",
    platformBg:"#040005", platformColor:"#CC0044", platformItem:"⛩️",
    platformItems:["⛩️","🌸","🎋","🏯","⚔️"], platformHazard:"🔥", platformObstacle:"🪨",
    charBodyColor:"#440022",
    xpUnlock:200,
    shopCategory:{ id:"japon", label:"⛩️ Japon", items:[
      {id:"jp1",emoji:"⛩️",name:"Torii personnel",cost:40,slot:"themed"},
      {id:"jp2",emoji:"🌸",name:"Fleur de cerisier",cost:20,slot:"themed"},
      {id:"jp3",emoji:"⚔️",name:"Katana légendaire",cost:50,slot:"themed"},
      {id:"jp4",emoji:"🥷",name:"Armure de ninja",cost:35,slot:"themed"},
      {id:"jp5",emoji:"🎋",name:"Brin de bambou",cost:15,slot:"themed"},
      {id:"jp6",emoji:"🗡️",name:"Casque samurai",cost:30,slot:"hat"},
    ]},
  },
  // ── LICORNES ET PAILLETTES ────────────────────────────────────
  licornes: {
    id:"licornes", name:"Licornes ✨", icon:"🦄",
    bg:"#0f000f", primary:"#DD44FF", accent:"#FFAAFF", glow:"#FFAAFF",
    levels:["Poussiéreux","Scintillant","Brillant","Étincelant","DÉESSE DU GLITTER"],
    levelsF:["Poussiéreuse","Scintillante","Brillante","Étincelante","DÉESSE DU GLITTER"],
    taskVerb:"pailletée", winMsg:"Félicitations! Tu peux maintenant lancer des paillettes partout. Bonne chance pour le nettoyage.",
    coinName:"Paillette",
    platformBg:"#09000f", platformColor:"#DD44FF", platformItem:"🦄",
    platformItems:["🦄","🌈","✨","💎","🌸"], platformHazard:"💥", platformObstacle:"☁️",
    charBodyColor:"#8800AA",
    xpUnlock:100,
    shopCategory:{ id:"licornes", label:"🦄 Licornes", items:[
      {id:"lc1",emoji:"🦄",name:"Corne de licorne",cost:50,slot:"hat"},
      {id:"lc2",emoji:"🌈",name:"Queue arc-en-ciel",cost:35,slot:"themed"},
      {id:"lc3",emoji:"✨",name:"Manteau de paillettes",cost:40,slot:"themed"},
      {id:"lc4",emoji:"💎",name:"Diamant magique",cost:45,slot:"themed"},
      {id:"lc5",emoji:"🧁",name:"Cupcake licorne",cost:20,slot:"themed"},
      {id:"lc6",emoji:"🌸",name:"Couronne fleurie",cost:25,slot:"hat"},
    ]},
  },
  // ── MARVEL ───────────────────────────────────────────────────
  marvel: {
    id:"marvel", name:"Marvel", icon:"⚡",
    bg:"#05000f", primary:"#CC1111", accent:"#FF4444", glow:"#FF8888",
    levels:["Civil","Agent S.H.I.E.L.D","Avenger","Super-héros","VENGEUR LÉGENDAIRE"],
    levelsF:["Civile","Agente S.H.I.E.L.D","Avenger","Super-héroïne","VENGERESSE LÉGENDAIRE"],
    taskVerb:"sauvée", winMsg:"L'univers est en sécurité. Pour l'instant. Va ranger ta chambre, Spider-Man.",
    coinName:"Vibranium",
    platformBg:"#030008", platformColor:"#CC1111", platformItem:"⚡",
    platformItems:["⚡","🛡️","🕷️","⭐","💎"], platformHazard:"💥", platformObstacle:"🏢",
    charBodyColor:"#660000",
    xpUnlock:300,
    shopCategory:{ id:"marvel", label:"⚡ Marvel", items:[
      {id:"mv1",emoji:"🛡️",name:"Bouclier de Captain America",cost:60,slot:"themed"},
      {id:"mv2",emoji:"🕷️",name:"Toile de Spider-Man",cost:35,slot:"themed"},
      {id:"mv3",emoji:"⚡",name:"Marteau de Thor",cost:50,slot:"themed"},
      {id:"mv4",emoji:"🪖",name:"Casque d'Iron Man",cost:40,slot:"hat"},
      {id:"mv5",emoji:"💎",name:"Pierre de l'Infini",cost:55,slot:"themed"},
      {id:"mv6",emoji:"🦾",name:"Bras Vibranium",cost:45,slot:"themed"},
    ]},
  },
  // ── DISNEY ───────────────────────────────────────────────────
  disney: {
    id:"disney", name:"Disney", icon:"🏰",
    bg:"#000810", primary:"#0044CC", accent:"#66AAFF", glow:"#88CCFF",
    levels:["Spectateur","Apprenti Magicien","Héros","Prince/Princesse","MAÎTRE MAGICIEN"],
    levelsF:["Spectatrice","Apprentie Magicienne","Héroïne","Princesse","MAÎTRE MAGICIENNE"],
    taskVerb:"enchantée", winMsg:"Bibbidi-Bobbidi-Boo! La tâche est faite. Cendrillon rangeait sans plaindre, juste dit.",
    coinName:"Étoile de souhait",
    platformBg:"#000508", platformColor:"#0044CC", platformItem:"🏰",
    platformItems:["🏰","⭐","🧚","🎠","🌟"], platformHazard:"🧙", platformObstacle:"☁️",
    charBodyColor:"#002266",
    xpUnlock:250,
    shopCategory:{ id:"disney", label:"🏰 Disney", items:[
      {id:"di1",emoji:"🏰",name:"Château miniature",cost:45,slot:"themed"},
      {id:"di2",emoji:"🧚",name:"Fée Clochette",cost:35,slot:"pet"},
      {id:"di3",emoji:"⭐",name:"Étoile de souhait",cost:30,slot:"themed"},
      {id:"di4",emoji:"🎪",name:"Chapeau de Mickey",cost:25,slot:"hat"},
      {id:"di5",emoji:"🎠",name:"Carrousel enchanté",cost:50,slot:"themed"},
      {id:"di6",emoji:"🌹",name:"Rose de la Bête",cost:40,slot:"themed"},
    ]},
  },
  // ── PIXAR ────────────────────────────────────────────────────
  pixar: {
    id:"pixar", name:"Pixar", icon:"💡",
    bg:"#00060f", primary:"#0066CC", accent:"#44AAFF", glow:"#66CCFF",
    levels:["Idée","Étincelle","Aventurier","Héros Animé","PIXAR STAR"],
    levelsF:["Idée","Étincelle","Aventurière","Héroïne Animée","PIXAR STAR"],
    taskVerb:"animée", winMsg:"WALL-E nettoyait la Terre entière. Toi t'as fait ta chambre. On est loin, mais c'est un début.",
    coinName:"Étoile Pixar",
    platformBg:"#000408", platformColor:"#0066CC", platformItem:"💡",
    platformItems:["💡","🤖","🐟","🚀","⭐"], platformHazard:"💥", platformObstacle:"🌊",
    charBodyColor:"#003366",
    xpUnlock:350,
    shopCategory:{ id:"pixar", label:"💡 Pixar", items:[
      {id:"px1",emoji:"🤖",name:"WALL-E miniature",cost:50,slot:"pet"},
      {id:"px2",emoji:"🐟",name:"Nemo en bocal",cost:35,slot:"pet"},
      {id:"px3",emoji:"🚀",name:"Vaisseau Buzz",cost:45,slot:"themed"},
      {id:"px4",emoji:"💡",name:"Lampe Luxo",cost:30,slot:"themed"},
      {id:"px5",emoji:"🎈",name:"Bouquet de ballons",cost:25,slot:"themed"},
      {id:"px6",emoji:"🪖",name:"Casque de pompier",cost:20,slot:"hat"},
    ]},
  },

};
// XP thresholds for theme unlock (applied at load time to avoid editing every entry)
const THEME_XP_UNLOCK = {
  none:0, lego:0, medieval:50, kpop:50,
  unicorn:100, demon:100, licornes:100,
  angel:150, scientifique:150, roblox:150,
  harrypotter:200, ghibli:200, insectes:200, japon:200,
  monstres:250, prehistoire:250, horreur:250, disney:250,
  boomerangfu:300, microscopique:300, bisounours:300, marvel:300,
  singes:350, geantdefer:350, trolls:350, jamesbond:350, cuisine:350,
  minecraftpp:400, coursefutur:400, melange:400, pixar:350,
  // secret — unlocked only via random (secret flag bypasses XP)
  canards:999, aliens:999, pirates:999, sushi:999, robots:999,
};
Object.keys(PLAYER_THEMES).forEach(k => {
  if (PLAYER_THEMES[k].xpUnlock === undefined)
    PLAYER_THEMES[k].xpUnlock = THEME_XP_UNLOCK[k] ?? 0;
});

const PT_LIST = Object.values(PLAYER_THEMES);
const getPlayerTheme = (id) => PLAYER_THEMES[id] || PLAYER_THEMES.none;
// Display name: pseudo if set, else real name
const displayName = (player) => (player?.pseudo?.trim()) || player?.name || "";
// Returns 2 random non-secret theme IDs for a brand-new player
const pickStarterThemes = () => {
  const pool = Object.keys(PLAYER_THEMES).filter(k => k !== "none" && !PLAYER_THEMES[k].secret);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
};

const isThemeUnlocked = (themeId, playerXp, starterThemes = []) => {
  if (themeId === "none") return true; // always free
  const t = PLAYER_THEMES[themeId];
  if (!t) return false;
  if (t.secret) return false; // secret only via random
  if (starterThemes.includes(themeId)) return true; // starter pick
  return (playerXp || 0) >= (t.xpUnlock ?? 0);
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

const save = async (data) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { console.warn("Storage save failed:", e); }
  // FUTURE SUPABASE: await supabase.from('family_sessions').upsert({ id: familyId, data })
};

const load = async () => {
  try { const r = localStorage.getItem(STORE_KEY); if (r) return JSON.parse(r); } catch {}
  // FUTURE SUPABASE: const { data } = await supabase.from('family_sessions').select().eq('id', familyId).single()
  return null;
};

// ─── DATA MIGRATION ── préserve les données des enfants entre les pushes ────
// Ajoute les nouveaux champs sans jamais écraser les données existantes
const migrateGameState = (gs) => {
  const hasPin = gs.pin != null;
  const oldAvatar = gs.avatar || {};
  return {
    xp: 0, coins: 0, completed: [], pending: [], owned: [], equipped: {}, boughtRewards: [], badges: [],
    ...gs,
    badges: gs.badges || [],
    boughtRewards: gs.boughtRewards || [],
    pin: gs.pin ?? null,
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
  return {
    ...data,
    gameStates: (data.gameStates || []).map(migrateGameState),
    seenVersions: [...seenVersions, ...newVersions],
    newChangelogVersions: newVersions, // affichés dans le feed, puis effacés
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
const FUNNY_PIN_MSGS = [
  "...ou peut-être que le code, c'est pas ça non plus? 🤔",
  "Y'a quelqu'un ici qui connaît le code? Non? OK.",
  "À ce rythme-là, t'as jusqu'en 2087 pour le trouver.",
  "PSST: ton parent va finir par changer le code pour 0000.",
];

// ─── UTILS ───────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,9);
const todayStr = () => new Date().toISOString().slice(0,10);
const weekKey = () => { const d=new Date(); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()-((day+6)%7)); return mon.toISOString().slice(0,10); };

// ─── CSS ─────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323:wght@400&family=Nunito:wght@700;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Nunito',sans-serif;-webkit-tap-highlight-color:transparent;}
  ::-webkit-scrollbar{width:4px;height:4px;} ::-webkit-scrollbar-track{background:#111;} ::-webkit-scrollbar-thumb{background:#444;border-radius:2px;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
  @keyframes clkPulse{from{opacity:1}to{opacity:0.65}}
  @keyframes bounceIn{from{transform:scale(0.2);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes floatUp{from{transform:translateY(0) scale(1);opacity:1}to{transform:translateY(-180px) scale(0.4);opacity:0}}
  @keyframes confettiFall{from{transform:translateY(0) rotate(0deg);opacity:1}to{transform:translateY(100vh) rotate(720deg);opacity:0}}
  @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
  @keyframes shimmer{from{left:-50%}to{left:150%}}
  @keyframes mixedBg{0%{background:#0a0a14}20%{background:#140a0a}40%{background:#0a140a}60%{background:#0a0a14}80%{background:#14140a}100%{background:#0a0a14}}
  @keyframes redPulse{from{box-shadow:0 0 8px #FF444440}to{box-shadow:0 0 20px #FF4444AA}}
  @keyframes slideIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
  @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
  @keyframes glowPulse{0%,100%{text-shadow:3px 3px 0 #000,0 0 12px currentColor}60%{text-shadow:3px 3px 0 #000,0 0 32px currentColor,0 0 54px currentColor}}
  @keyframes blink{0%,100%{opacity:1}49%{opacity:1}50%,99%{opacity:0}}
  @keyframes xpFill{from{width:0}to{width:var(--xp-target)}}
  :root{--hp:#ff4444;--mp:#4488ff;--gold:#FFD700;--xp-clr:#4ade80;--xp-bg:#0d2010;}
  .float-y{animation:floatY 2.4s ease-in-out infinite}
  .float-y-slow{animation:floatY 3.2s ease-in-out infinite}
  .glow-pulse{animation:glowPulse 2.8s ease-in-out infinite}
  .blink{animation:blink 1.1s step-end infinite}
  .pixel-border-gold{border:4px solid var(--gold)!important;box-shadow:0 0 0 2px #000,0 0 28px #FFD70045,4px 4px 0 #000!important;border-radius:4px!important}
  .btn-pixel-primary{font-family:'Press Start 2P',monospace;background:var(--gold);color:#000;border:3px solid #000;box-shadow:4px 4px 0 #000;cursor:pointer;transition:box-shadow 0.08s,transform 0.08s}
  .btn-pixel-primary:hover{box-shadow:2px 2px 0 #000;transform:translate(2px,2px)}
  .hp-bar-fill{background:var(--hp);height:100%;border-radius:2px;transition:width 0.4s}
  .mp-bar-fill{background:var(--mp);height:100%;border-radius:2px;transition:width 0.4s}
  .xp-step-fill{background:var(--xp-clr);height:100%;border-radius:2px;transition:width 0.5s ease}
  input:focus{outline:none;}
  button:focus{outline:none;}
  @media(min-width:768px){
    .game-root{font-size:108%;}
    .fo-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))!important;}
  }
  @media(min-width:1024px){
    .game-root{font-size:114%;}
    .fo-grid{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))!important;}
  }
`;

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
        ctx.strokeStyle="#000"; ctx.lineWidth=2; ctx.strokeRect(p.x,p.y,p.w,p.h);
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.5vw,14px)",color:pt.accent,textShadow:`0 0 16px ${pt.glow}`}}>
        {pt.icon} LEVEL UP — Mini-Niveau! {pt.icon}
      </div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#aaa"}}>Flèches / Espace — Ramasse les {pt.coinName}s!</div>
      <canvas ref={canvasRef} style={{border:`4px solid ${pt.accent}`,borderRadius:4,maxWidth:"100%",boxShadow:`0 0 30px ${pt.glow}`}}/>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:pt.accent}}>
        {pt.platformItems[0]} ×{collected} ramassés!
      </div>
      {done && <button onClick={()=>onClose(collected)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 24px",background:pt.accent,color:"#000",border:"4px solid #000",borderRadius:4,cursor:"pointer",boxShadow:"4px 4px 0 #000"}}>🏆 CONTINUER →</button>}
      {!done && <button onClick={()=>onClose(collected)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"#666",border:"2px solid #444",cursor:"pointer"}}>Passer</button>}
    </div>
  );
};
const darken = (hex) => { try{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgb(${Math.floor(r*0.6)},${Math.floor(g*0.6)},${Math.floor(b*0.6)})`;}catch{return "#333";} };

// ─── PIN PAD ─────────────────────────────────────────────────
function PinPad({ pin, label, onSuccess, onCancel, th }) {
  const [buf, setBuf] = useState("");
  const [err, setErr] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const bufRef = useRef("");
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const setErrRef = useRef(setErr);
  const setFailRef = useRef(setFailCount);

  const press = useCallback(v => {
    SFX.pinKey();
    if (v === "del") {
      bufRef.current = bufRef.current.slice(0, -1);
      setBuf(bufRef.current);
      return;
    }
    if (bufRef.current.length >= 4) return;
    bufRef.current = bufRef.current + v;
    setBuf(bufRef.current);
    if (bufRef.current.length === 4) {
      const entered = bufRef.current;
      setTimeout(() => {
        if (entered === pinRef.current) { SFX.pinOk(); onSuccessRef.current(); }
        else {
          SFX.pinErr();
          setErrRef.current(true);
          setFailRef.current(f=>f+1);
          bufRef.current = "";
          setBuf("");
          setTimeout(() => setErrRef.current(false), 1500);
        }
      }, 150);
    }
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace" || e.key === "Delete") press("del");
      else if (e.key === "Escape") onCancelRef.current();
      else if (e.key === "Enter" && bufRef.current.length === 4) {
        const entered = bufRef.current;
        if (entered === pinRef.current) { SFX.pinOk(); onSuccessRef.current(); }
        else { SFX.pinErr(); setErrRef.current(true); setFailRef.current(f=>f+1); bufRef.current=""; setBuf(""); setTimeout(()=>setErrRef.current(false),1500); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);
  const T = th || THEMES.minecraft;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:`linear-gradient(135deg,${T.bg},#1a1a2e)`,border:`6px solid ${T.accent}`,borderRadius:10,padding:"28px 34px",textAlign:"center",maxWidth:360,width:"90%",boxShadow:`0 0 50px ${T.accent}60`,animation:"bounceIn 0.35s ease"}}>
        <div style={{fontSize:44,marginBottom:8}}>👩‍💻</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:6}}>VALIDATION PARENT</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#ccc",marginBottom:14,lineHeight:1.3}}>{label}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:14}}>
          {[0,1,2,3].map(i=><div key={i} style={{width:20,height:20,borderRadius:"50%",border:`3px solid ${T.accent}`,background:i<buf.length?T.accent:"transparent",boxShadow:i<buf.length?`0 0 10px ${T.accent}`:"none",transition:"all 0.15s"}}/>)}
        </div>
        {err && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FF4444",marginBottom:4,animation:"shake 0.4s ease"}}>❌ Code incorrect!</div>}
        {failCount>=2&&<div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#888",marginBottom:6,textAlign:"center"}}>{FUNNY_PIN_MSGS[Math.min(failCount-2,FUNNY_PIN_MSGS.length-1)]}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,maxWidth:200,margin:"0 auto 14px"}}>
          {["1","2","3","4","5","6","7","8","9","⌫","0","✕"].map(k=>(
            <button key={k} onClick={()=>press(k==="⌫"||k==="✕"?"del":k)}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:k==="⌫"||k==="✕"?9:14,padding:11,background:"#222",border:"3px solid #555",color:k==="⌫"||k==="✕"?"#888":"#fff",cursor:"pointer",borderRadius:4,boxShadow:"3px 3px 0 #000"}}>
              {k}
            </button>
          ))}
        </div>
        <button
          onClick={()=>{
            if(bufRef.current.length!==4)return;
            const entered=bufRef.current;
            if(entered===pinRef.current){SFX.pinOk();onSuccessRef.current();}
            else{SFX.pinErr();setErr(true);setFailCount(f=>f+1);bufRef.current="";setBuf("");setTimeout(()=>setErr(false),1500);}
          }}
          disabled={buf.length!==4}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px 0",width:"100%",maxWidth:200,display:"block",margin:"0 auto 10px",background:buf.length===4?T.accent:"#222",color:buf.length===4?"#000":"#444",border:`3px solid ${buf.length===4?T.accent:"#333"}`,cursor:buf.length===4?"pointer":"not-allowed",borderRadius:4,boxShadow:buf.length===4?`0 0 12px ${T.accent}80`:"none",transition:"all 0.15s"}}>
          ✅ VALIDER
        </button>
        <button onClick={onCancel} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"#888",border:"2px solid #555",cursor:"pointer",borderRadius:2}}>Annuler</button>
      </div>
    </div>
  );
}

// ─── TOAST ───────────────────────────────────────────────────
function Toast({ msg, color }) {
  return <div style={{position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.93)",border:`3px solid ${color||"#2ECC40"}`,borderRadius:4,padding:"9px 18px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:color||"#2ECC40",zIndex:990,whiteSpace:"nowrap",animation:"toastIn 0.3s ease",maxWidth:"90vw",textAlign:"center"}}>{msg}</div>;
}

// ─── PARTICLES FX ────────────────────────────────────────────
function spawnParticles(emoji) {
  const emojis = [emoji,"⭐","✨","💫"];
  for(let i=0;i<7;i++) setTimeout(()=>{
    const p=document.createElement("div");
    p.style.cssText=`position:fixed;left:${Math.random()*70+15}vw;top:${Math.random()*50+25}vh;font-size:22px;pointer-events:none;z-index:2999;animation:floatUp 1.4s ease-out forwards;`;
    p.textContent=emojis[Math.floor(Math.random()*emojis.length)]; document.body.appendChild(p); setTimeout(()=>p.remove(),1500);
  },i*90);
  const cols=["#FFD700","#4A90D9","#C060D0","#2ECC40","#FF6464"];
  for(let i=0;i<18;i++) setTimeout(()=>{
    const c=document.createElement("div");
    c.style.cssText=`position:fixed;left:${Math.random()*100}vw;top:-10px;width:${Math.random()*8+4}px;height:${Math.random()*8+4}px;background:${cols[Math.floor(Math.random()*5)]};z-index:2998;border-radius:2px;animation:confettiFall ${Math.random()*1+1.5}s ease-in ${Math.random()*0.4}s forwards;`;
    document.body.appendChild(c); setTimeout(()=>c.remove(),2200);
  },i*35);
}

// ─── REWARD POPUP ────────────────────────────────────────────
function RewardPopup({ task, player, newBadges, onClose, th }) {
  const T = th || THEMES.minecraft;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:T.bg,border:`6px solid ${T.accent}`,borderRadius:10,padding:"30px 40px",textAlign:"center",maxWidth:440,width:"90%",boxShadow:`0 0 50px ${T.accent}80`,animation:"bounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1)"}}>
        <div style={{fontSize:60,marginBottom:10}}>{task.emoji}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.5vw,14px)",color:T.accent,marginBottom:8}}>⚡ QUÊTE {(getPlayerTheme(player?.themeId)?.taskVerb||"validée").toUpperCase()}!</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(16px,2.5vw,20px)",color:"#fff",marginBottom:16,lineHeight:1.4}}>{task.label}</div>
        <div style={{display:"flex",gap:20,justifyContent:"center",marginBottom:18}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,20px)",color:"#5DECF5"}}>+{task.xp} ⚡</div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,20px)",color:"#FFD700"}}>+{task.coins} 🪙</div>
        </div>
        {player && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:player.color,marginBottom:14}}>Bravo {displayName(player)}! 🎉</div>}
        {newBadges&&newBadges.length>0&&(
          <div style={{background:"rgba(0,0,0,0.4)",borderRadius:6,padding:"10px 14px",marginBottom:14}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#FFD700",marginBottom:8}}>🏅 BADGE{newBadges.length>1?"S":""} DÉBLOQUÉ{newBadges.length>1?"S":""}!</div>
            {newBadges.map(b=>(
              <div key={b.id} style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#fff",display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
                <span style={{fontSize:22}}>{b.emoji}</span> <strong>{b.name}</strong>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"11px 22px",background:"#2ECC40",color:"#000",border:"4px solid #000",borderRadius:3,cursor:"pointer",boxShadow:"4px 4px 0 #000"}}>→ CONTINUER ←</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETUP WIZARD
// ═══════════════════════════════════════════════════════════════
function SetupWizard({ existing, onDone }) {
  const [step, setStep] = useState(0); // 0=mode 1=players 2=theme 3=tasks 4=rewards 5=pin
  const STEPS = ["Mode","Joueurs","Ambiance","Tâches","Récompenses","PIN"];

  // Config state
  const [mode, setMode] = useState("routine"); // "week" | "routine"
  const [weekPersist, setWeekPersist] = useState(false);
  const [routineEnd, setRoutineEnd] = useState("08:30");
  const [players, setPlayers] = useState([
    { id:uid(), name:"", pseudo:"", color:COLORS[0]||"#C060D0", themeId:"none", starterThemes: pickStarterThemes() },
  ]);
  const [theme, setTheme] = useState("minecraft");
  const [pin, setPin] = useState("1146");

  // Task assignments: array of { instanceId, taskId, playerIds:[], days:[], time:"" }
  const [assignments, setAssignments] = useState([]);
  // Reward selection
  const [selectedRewards, setSelectedRewards] = useState(new Set(["rw01","rw02","rw03","rw04","rw05"]));
  // Custom tasks / rewards
  const [customTasks, setCustomTasks] = useState([]);
  const [customRewards, setCustomRewards] = useState([]);

  // Task catalog filter
  const [catFilter, setCatFilter] = useState("all");
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);

  // Pre-fill if editing
  useEffect(() => {
    if (existing) {
      setMode(existing.mode || "routine");
      setWeekPersist(true); // always persist — badges depend on it
      setRoutineEnd(existing.routineEnd || "08:30");
      const pl = existing.players || [];
      setPlayers(pl.length ? pl.map(p=>({themeId:"none",pseudo:"",starterThemes:p.starterThemes||pickStarterThemes(),...p})) : players);
      setTheme(existing.theme || "minecraft");
      setPin(existing.pin || "1146");
      setAssignments(existing.assignments || []);
      setSelectedRewards(new Set(existing.selectedRewards || ["rw01","rw02","rw03"]));
      setCustomTasks(existing.customTasks || []);
      setCustomRewards(existing.customRewards || []);
    }
  }, []);

  const T = THEMES[theme];
  const activePlayers = players;
  const allTasks = [...TASK_CATALOG, ...customTasks];
  const allRewards = [...REWARD_CATALOG, ...customRewards];

  const addAssignment = (taskId) => {
    SFX.click();
    setAssignments(a => [...a, {
      instanceId: uid(), taskId,
      playerIds: activePlayers.map(p=>p.id),
      days: mode === "week" ? [0] : [],
      time: "",
    }]);
  };
  const removeAssignment = (iid) => { SFX.click(); setAssignments(a => a.filter(x=>x.instanceId!==iid)); };
  const duplicateAssignment = (iid) => { SFX.click(); setAssignments(a => { const src=a.find(x=>x.instanceId===iid); if(!src)return a; return [...a,{...src,instanceId:uid()}]; }); };
  const updateAssignment = (iid, field, val) => setAssignments(a => a.map(x=>x.instanceId===iid?{...x,[field]:val}:x));
  const toggleAssignmentPlayer = (iid, pid) => setAssignments(a => a.map(x => {
    if (x.instanceId!==iid) return x;
    const has = x.playerIds.includes(pid);
    return {...x, playerIds: has ? x.playerIds.filter(id=>id!==pid) : [...x.playerIds,pid]};
  }));
  const toggleAssignmentDay = (iid, dayIdx) => setAssignments(a => a.map(x => {
    if (x.instanceId!==iid) return x;
    const has = x.days.includes(dayIdx);
    return {...x, days: has ? x.days.filter(d=>d!==dayIdx) : [...x.days,dayIdx]};
  }));

  // Drag & drop for assignment ordering
  const onDragStart = (e, iid) => { setDragging(iid); e.dataTransfer.effectAllowed="move"; };
  const onDragOver = (e, iid) => { e.preventDefault(); setDragOver(iid); };
  const onDrop = (e, targetIid) => {
    e.preventDefault(); setDragOver(null);
    if (!dragging || dragging===targetIid) return;
    setAssignments(a => {
      const from=a.findIndex(x=>x.instanceId===dragging), to=a.findIndex(x=>x.instanceId===targetIid);
      if(from<0||to<0)return a; const n=[...a]; const [item]=n.splice(from,1); n.splice(to,0,item); return n;
    });
    setDragging(null);
  };

  const addCustomTask = () => {
    const label = prompt("Nom de la tâche:");
    if (!label?.trim()) return;
    const emoji = prompt("Emoji (ex: 🌟):") || "⭐";
    setCustomTasks(c => [...c, { id:"cust_"+uid(), emoji, label:label.trim(), xp:20, coins:10, diff:"medium", cat:"custom" }]);
  };
  const addCustomReward = () => {
    const label = prompt("Nom de la récompense:");
    if (!label?.trim()) return;
    const emoji = prompt("Emoji (ex: 🎁):") || "🎁";
    const coins = parseInt(prompt("Coût en pièces:") || "20") || 20;
    setCustomRewards(c => [...c, { id:"cr_"+uid(), emoji, label:label.trim(), coins }]);
  };

  const finish = () => {
    // Expand multi-player assignments into per-player instances
    const expandedAssignments = [];
    for (const ass of assignments) {
      if (ass.playerIds.length <= 1) {
        expandedAssignments.push(ass);
      } else {
        // One independent copy per player
        for (const pid of ass.playerIds) {
          expandedAssignments.push({ ...ass, instanceId: uid(), playerIds: [pid] });
        }
      }
    }
    const config = {
      mode, weekPersist, routineEnd,
      players: activePlayers,
      theme,
      pin,
      assignments: expandedAssignments,
      selectedRewards: [...selectedRewards],
      customTasks,
      customRewards,
      createdAt: new Date().toISOString(),
    };
    onDone(config);
  };

  // Styles
  const card = { background:T.card, border:`2px solid ${T.accent}40`, borderRadius:8, padding:"16px 18px" };
  const Btn = ({active,children,onClick,style={},...p}) => (
    <button onClick={()=>{SFX.click();onClick?.();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",padding:"8px 14px",background:active?T.accent:"#222",color:active?"#000":"#888",border:`2px solid ${active?T.accent:"#444"}`,borderRadius:3,cursor:"pointer",boxShadow:active?`3px 3px 0 #000,0 0 10px ${T.accent}50`:"2px 2px 0 #000",transition:"all 0.1s",...style}} {...p}>{children}</button>
  );

  const canProceed = () => {
    if (step===1) return activePlayers.every(p=>p.name.trim());
    if (step===3) return assignments.length>0;
    if (step===5) return pin.length===4;
    return true;
  };

  const xpPct = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",padding:"16px 12px",gap:12,overflowX:"hidden"}}>
      <style>{GLOBAL_CSS}</style>

      {/* ── HEADER ── */}
      <div style={{textAlign:"center",marginTop:8,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
        {/* Floating emoji flankers + title */}
        <div style={{display:"flex",alignItems:"center",gap:"clamp(8px,2vw,20px)"}}>
          <span className="float-y" style={{fontSize:"clamp(18px,3.5vw,32px)",animationDelay:"0s"}}>⚔️</span>
          <span className="glow-pulse" style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(11px,2.2vw,20px)",color:T.accent}}>LIVRE DE QUÊTES</span>
          <span className="float-y" style={{fontSize:"clamp(18px,3.5vw,32px)",animationDelay:"1.2s"}}>🛡️</span>
        </div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(13px,1.8vw,18px)",color:"#666",letterSpacing:2}}>— CONFIGURATION —</div>
      </div>

      {/* ── STEP INDICATORS + XP BAR ── */}
      <div style={{width:"100%",maxWidth:680,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"center"}}>
          {STEPS.map((s,i)=>(
            <div key={i} onClick={()=>i<step&&setStep(i)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,0.75vw,7px)",padding:"4px 8px",background:i===step?T.accent:i<step?T.primary:"#222",color:i<=step?"#000":"#444",borderRadius:2,border:`2px solid ${i===step?"#000":i<step?"#000":"#333"}`,cursor:i<step?"pointer":"default",boxShadow:i===step?"3px 3px 0 #000":i<step?"2px 2px 0 #000":"none",transition:"all 0.15s"}}>
              {i<step?"✓ ":""}{s}
            </div>
          ))}
        </div>
        {/* XP progress bar */}
        <div style={{background:"var(--xp-bg)",border:"2px solid #1a3a1a",borderRadius:3,height:10,overflow:"hidden",position:"relative"}}>
          <div className="xp-step-fill" style={{width:`${xpPct}%`,height:"100%"}}/>
          <div style={{position:"absolute",right:6,top:0,fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#4ade8099",lineHeight:"10px"}}>{xpPct}% XP</div>
        </div>
      </div>

      <div className="pixel-border-gold" style={{...card,maxWidth:680,width:"100%",animation:"slideIn 0.25s ease"}}>

        {/* ── STEP 0: Mode ── */}
        {step===0 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.4vw,13px)",color:T.accent,marginBottom:16}}>🎮 Quel mode?</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
            {[
              {k:"routine",icon:"⏰",title:"Mode Routine",desc:"Matin, soir ou après-école. Compte à rebours proéminent jusqu'à l'heure cible."},
              {k:"week",   icon:"📅",title:"Mode Semaine", desc:"Organisation sur 7 jours. Progression hebdomadaire avec bilan."},
            ].map(({k,icon,title,desc})=>(
              <div key={k} onClick={()=>{setMode(k);SFX.click();}} style={{border:`3px solid ${mode===k?T.accent:"#444"}`,borderRadius:6,padding:16,cursor:"pointer",background:mode===k?`${T.accent}15`:"rgba(0,0,0,0.4)",boxShadow:mode===k?`0 0 16px ${T.accent}50`:"none",transition:"all 0.15s"}}>
                <div style={{fontSize:34,marginBottom:8}}>{icon}</div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:mode===k?T.accent:"#ccc",marginBottom:8}}>{title}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa",lineHeight:1.4}}>{desc}</div>
              </div>
            ))}
          </div>
          {mode==="routine" && (
            <div style={{...card,marginBottom:12}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:T.accent,marginBottom:10}}>⏱ Heure de fin de routine</div>
              <input type="time" value={routineEnd} onChange={e=>setRoutineEnd(e.target.value)}
                style={{background:"#111",border:`2px solid ${T.accent}`,color:T.accent,padding:"10px 14px",fontFamily:"'Press Start 2P',monospace",fontSize:16,borderRadius:4,outline:"none",width:"100%"}}/>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#666",marginTop:8}}>Le compte à rebours sera bien visible pour motiver!</div>
            </div>
          )}
          {mode==="week" && (
            <div style={{display:"flex",gap:10,alignItems:"center",background:"rgba(0,0,0,0.15)",border:`2px solid ${T.accent}44`,borderRadius:6,padding:12}}>
              <div style={{fontSize:20}}>💾</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa"}}>Progression sauvegardée automatiquement — les badges ne sont jamais perdus!</div>
            </div>
          )}
        </>}

        {/* ── STEP 1: Players ── */}
        {step===1 && <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.4vw,13px)",color:T.accent}}>👥 Joueurs</div>
            {players.length < 6 && <Btn active={false} onClick={()=>{ setPlayers(p=>[...p,{id:uid(),name:"",pseudo:"",color:COLORS[p.length]||"#888",themeId:"none",starterThemes:pickStarterThemes()}]); }}>➕ Ajouter</Btn>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {players.map((pl,i)=>{
              return (
                <div key={i} style={{...card,border:`2px solid ${pl.color}`}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",minWidth:50}}>JOUEUR {i+1}</span>
                    <input value={pl.name} onChange={e=>{ const arr=[...players]; arr[i]={...arr[i],name:e.target.value}; setPlayers(arr); }} placeholder={`Nom joueur ${i+1}`}
                      style={{flex:1,background:"#111",border:`2px solid ${pl.color}`,color:"#fff",padding:"8px 10px",fontFamily:"'VT323',monospace",fontSize:18,borderRadius:3}}/>
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",minWidth:50}}>PSEUDO</span>
                    <input value={pl.pseudo||""} onChange={e=>{ const arr=[...players]; arr[i]={...arr[i],pseudo:e.target.value}; setPlayers(arr); }} placeholder={`Surnom visible (optionnel)`}
                      style={{flex:1,background:"#111",border:`2px dashed ${pl.color}55`,color:"#ccc",padding:"6px 10px",fontFamily:"'VT323',monospace",fontSize:17,borderRadius:3}}/>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {COLORS.map(c=>{ const isNoir=c==="#0a0a0a"; const isBlanc=c==="#F0F0FF"; const glowColor=isNoir?"#FF0066":isBlanc?"#AACCFF":c; return (<div key={c} onClick={()=>{ const arr=[...players]; arr[i]={...arr[i],color:c}; setPlayers(arr); }} style={{width:26,height:26,borderRadius:4,background:c,border:`3px solid ${pl.color===c?"#fff":"#333"}`,cursor:"pointer",boxShadow:pl.color===c?`0 0 10px ${glowColor}`:"none",outline:isNoir?"1px solid #333":isBlanc?"1px solid #888":"none"}}/>); })}
                  </div>
                  {/* Per-player theme */}
                  <div style={{marginTop:10}}>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",marginBottom:7}}>🎭 THÈME PERSONNEL</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {PT_LIST.map(pt=>{
                        const sel=(pl.themeId||"none")===pt.id;
                        const unlocked = isThemeUnlocked(pt.id, 0, pl.starterThemes||[]);
                        return <div key={pt.id}
                          onClick={()=>{ if(!unlocked)return; const arr=[...players]; arr[i]={...arr[i],themeId:pt.id}; setPlayers(arr); SFX.click(); }}
                          title={!unlocked?`🔒 Déblocable à ${pt.xpUnlock} XP`:""}
                          style={{display:"flex",alignItems:"center",gap:5,padding:"5px 9px",background:sel?`${pt.accent}22`:unlocked?"rgba(0,0,0,0.4)":"rgba(0,0,0,0.2)",border:`2px solid ${sel?pt.accent:unlocked?"#333":"#222"}`,borderRadius:4,cursor:unlocked?"pointer":"not-allowed",boxShadow:sel?`0 0 10px ${pt.glow}50`:"none",opacity:unlocked?1:0.4,transition:"all 0.15s"}}>
                          <span style={{fontSize:16}}>{unlocked?pt.icon:"🔒"}</span>
                          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:sel?pt.accent:unlocked?"#666":"#444"}}>{pt.name}{!unlocked?` (${pt.xpUnlock}xp)`:""}</span>
                        </div>;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* ── STEP 2: Theme ── */}
        {step===2 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.4vw,13px)",color:T.accent,marginBottom:6}}>🎨 Ambiance globale</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",marginBottom:12}}>Fond et header seulement — chaque joueur garde son thème perso dans son panel.</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {[...Object.entries(THEMES), ["random_week", RANDOM_THEME_WEEK]].map(([k,th])=>(
              <div key={k} onClick={()=>{setTheme(k);SFX.click();}} style={{border:`3px solid ${theme===k?th.accent:"#444"}`,borderRadius:6,padding:"14px 10px",cursor:"pointer",background:theme===k?`${th.accent}18`:"rgba(0,0,0,0.4)",boxShadow:theme===k?`0 0 14px ${th.accent}50`:"none",textAlign:"center",transition:"all 0.15s"}}>
                <div style={{fontSize:30,marginBottom:6}}>{k==="random_week"?"🎲":k==="minecraft"?"⛏️":k==="galaxy"?"🌌":k==="ocean"?"🌊":k==="volcano"?"🌋":"🌲"}</div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",color:theme===k?th.accent:"#aaa"}}>{th.name}</div>
              </div>
            ))}
          </div>
        </>}

        {/* ── STEP 3: Tasks ── */}
        {step===3 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:12}}>📋 Tâches & Quêtes ({assignments.length})</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,maxHeight:"65vh",overflow:"hidden"}}>
            {/* Catalog left */}
            <div style={{display:"flex",flexDirection:"column",gap:8,overflowY:"auto",paddingRight:4}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:4}}>CATALOGUE — cliquer pour ajouter</div>
              {/* Category filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                <Btn active={catFilter==="all"} onClick={()=>setCatFilter("all")} style={{padding:"3px 7px",fontSize:7}}>Tout</Btn>
                {Object.entries(CAT_LABELS).map(([k,l])=><Btn key={k} active={catFilter===k} onClick={()=>setCatFilter(k)} style={{padding:"3px 7px",fontSize:7}}>{l}</Btn>)}
              </div>
              {allTasks.filter(t=>catFilter==="all"||t.cat===catFilter).map(task=>(
                <div key={task.id} onClick={()=>addAssignment(task.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:4,cursor:"pointer",transition:"border 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor="#333"}>
                  <span style={{fontSize:20}}>{task.emoji}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{task.label}</div>
                    <div style={{display:"flex",gap:6}}>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5"}}>⚡{task.xp}</span>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700"}}>🪙{task.coins}</span>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:DIFF_COLOR(task.diff)}}>{task.diff}</span>
                    </div>
                  </div>
                  <span style={{color:T.accent,fontSize:16,fontWeight:"bold"}}>+</span>
                </div>
              ))}
              <button onClick={addCustomTask} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${T.accent}60`,color:T.accent,borderRadius:4,cursor:"pointer",marginTop:4}}>+ Tâche personnalisée</button>
            </div>

            {/* Assigned right */}
            <div style={{display:"flex",flexDirection:"column",gap:6,overflowY:"auto",paddingRight:2}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:4}}>TÂCHES ASSIGNÉES — glisser pour réordonner</div>
              {assignments.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#555",textAlign:"center",marginTop:20}}>Clique sur une tâche à gauche pour l'ajouter →</div>}
              {assignments.map(ass=>{
                const task=allTasks.find(t=>t.id===ass.taskId);
                if(!task)return null;
                return (
                  <div key={ass.instanceId} draggable onDragStart={e=>onDragStart(e,ass.instanceId)} onDragOver={e=>onDragOver(e,ass.instanceId)} onDrop={e=>onDrop(e,ass.instanceId)} onDragLeave={()=>setDragOver(null)}
                    style={{background:dragOver===ass.instanceId?`${T.accent}20`:"rgba(0,0,0,0.55)",border:`2px solid ${dragOver===ass.instanceId?T.accent:"#444"}`,borderRadius:5,padding:"8px 10px",cursor:"grab",transition:"all 0.15s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                      <span style={{color:"#555",fontSize:12,cursor:"grab"}}>⠿</span>
                      <span style={{fontSize:17}}>{task.emoji}</span>
                      <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.label}</span>
                      <button onClick={()=>duplicateAssignment(ass.instanceId)} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:14,padding:2}} title="Dupliquer">⧉</button>
                      <button onClick={()=>removeAssignment(ass.instanceId)} style={{background:"none",border:"none",color:"#FF4444",cursor:"pointer",fontSize:16,padding:2}}>×</button>
                    </div>
                    {/* Player assignment — each toggled player gets their own independent copy */}
                    <div style={{marginBottom:mode==="week"?6:4}}>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#555"}}>QUI:</span>
                        {activePlayers.map(pl=>{
                          const sel=ass.playerIds.includes(pl.id);
                          return <div key={pl.id} onClick={()=>toggleAssignmentPlayer(ass.instanceId,pl.id)}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 8px",
                              background:sel?pl.color:"#1a1a1a",color:sel?"#000":"#555",
                              border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer",
                              boxShadow:sel?`0 0 8px ${pl.color}60`:"none",transition:"all 0.12s",
                              display:"flex",alignItems:"center",gap:4}}>
                            <span style={{width:7,height:7,borderRadius:"50%",background:sel?"#000":pl.color,display:"inline-block"}}/>
                            {displayName(pl)}
                          </div>;
                        })}
                        <div onClick={()=>{ const allIds=activePlayers.map(p=>p.id); const allSel=allIds.every(id=>ass.playerIds.includes(id)); setAssignments(a=>a.map(x=>x.instanceId===ass.instanceId?{...x,playerIds:allSel?[]:allIds}:x)); SFX.click(); }}
                          style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"4px 7px",background:"#222",color:"#888",border:"1px solid #444",borderRadius:3,cursor:"pointer"}}>
                          {activePlayers.every(p=>ass.playerIds.includes(p.id))?"Aucun":"Tous"}
                        </div>
                      </div>
                      {ass.playerIds.length>1&&<div style={{fontFamily:"'VT323',monospace",fontSize:11,color:"#555",marginTop:3}}>→ {ass.playerIds.length} copies indépendantes</div>}
                    </div>
                    {/* Day assignment (week mode) */}
                    {mode==="week" && (
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:4}}>
                        {DAYS_SHORT.map((d,i)=>(
                          <div key={i} onClick={()=>toggleAssignmentDay(ass.instanceId,i)}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"2px 5px",background:ass.days.includes(i)?T.accent:"#222",color:ass.days.includes(i)?"#000":"#555",border:`1px solid ${ass.days.includes(i)?T.accent:"#444"}`,borderRadius:2,cursor:"pointer"}}>
                            {d}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Time (routine mode) */}
                    {mode==="routine" && (
                      <input type="time" value={ass.time||""} onChange={e=>updateAssignment(ass.instanceId,"time",e.target.value)} placeholder="Heure"
                        style={{background:"#111",border:`1px solid ${T.accent}60`,color:T.accent,padding:"3px 8px",fontFamily:"'Press Start 2P',monospace",fontSize:8,borderRadius:2,width:"100%",marginTop:4}}/>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>}

        {/* ── STEP 4: Rewards ── */}
        {step===4 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:12}}>🎁 Récompenses disponibles</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:"55vh",overflowY:"auto"}}>
            {allRewards.map(r=>{
              const sel=selectedRewards.has(r.id);
              return (
                <div key={r.id} onClick={()=>{ SFX.click(); setSelectedRewards(s=>{ const n=new Set(s); if(n.has(r.id))n.delete(r.id); else n.add(r.id); return n; }); }}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:sel?"rgba(0,0,0,0.6)":"rgba(0,0,0,0.3)",border:`2px solid ${sel?T.accent:"#444"}`,borderRadius:5,cursor:"pointer",boxShadow:sel?`0 0 8px ${T.accent}40`:"none",transition:"all 0.15s"}}>
                  <span style={{fontSize:26}}>{r.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:sel?"#fff":"#aaa"}}>{r.label}</div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700"}}>🪙 {r.coins} pièces</div>
                  </div>
                  <div style={{width:22,height:22,borderRadius:3,border:`3px solid ${sel?T.accent:"#555"}`,background:sel?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#000",fontSize:14,fontWeight:"bold"}}>{sel?"✓":""}</div>
                </div>
              );
            })}
          </div>
          <button onClick={addCustomReward} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${T.accent}60`,color:T.accent,borderRadius:4,cursor:"pointer",marginTop:10,width:"100%"}}>+ Récompense personnalisée</button>
        </>}

        {/* ── STEP 5: PIN ── */}
        {step===5 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:14}}>🔐 Code secret parent</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#aaa",marginBottom:14}}>Demandé à chaque validation. Les enfants ne le voient pas!</div>
          <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="4 chiffres"
            style={{width:"100%",background:"#111",border:`3px solid ${T.accent}`,color:"#fff",padding:"14px",fontFamily:"'Press Start 2P',monospace",fontSize:20,borderRadius:4,textAlign:"center",letterSpacing:10}}/>
          <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginTop:8}}>Code actuel: {pin} — défaut: 1234</div>
        </>}

        {/* NAV */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:18}}>
          {step>0?<Btn onClick={()=>setStep(s=>s-1)}>← Retour</Btn>:<span/>}
          {step<STEPS.length-1
            ? <Btn active={canProceed()} onClick={()=>canProceed()&&setStep(s=>s+1)}>Suivant →</Btn>
            : <Btn active={canProceed()} onClick={()=>canProceed()&&finish()}>🚀 C'est parti!</Btn>}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,0.7vw,7px)",color:"#444",letterSpacing:2,paddingBottom:8}}>
        ▼ PRESS START TO CONTINUE <span className="blink">_</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GAME ENGINE
// ═══════════════════════════════════════════════════════════════

// ─── COUNTDOWN (Routine mode) ────────────────────────────────
function Countdown({ endTime, th }) {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i); },[]);
  const [eh,em]=endTime.split(":").map(Number);
  const target=new Date(); target.setHours(eh,em,0,0);
  const diff=target-now;
  const isLate=diff<0;
  const abs=Math.abs(diff);
  const h=Math.floor(abs/3600000), m=Math.floor((abs%3600000)/60000), s=Math.floor((abs%60000)/1000);
  const pct=isLate?100:Math.max(0,100-(diff/(3600000*2))*100); // 2h window
  const urgent=diff>0&&diff<900000; // <15min
  return (
    <div style={{padding:"10px 14px",background:isLate?"rgba(255,50,50,0.2)":urgent?"rgba(255,180,0,0.15)":"rgba(0,0,0,0.4)",border:`3px solid ${isLate?"#FF4444":urgent?"#FFD700":th.accent}60`,borderRadius:6,animation:urgent||isLate?"redPulse 1s ease-in-out infinite":"none"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:isLate?"#FF4444":urgent?"#FFD700":th.accent,marginBottom:6,textAlign:"center"}}>
        {isLate?"⚠️ EN RETARD!":urgent?"🏃 DÉPÊCHE-TOI!":"⏱ ROUTINE TERMINE À "+endTime}
      </div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(22px,4vw,44px)",color:isLate?"#FF4444":urgent?"#FFD700":"#fff",textAlign:"center",textShadow:`0 0 20px ${isLate?"#FF4444":urgent?"#FFD700":th.accent}`,letterSpacing:2,marginBottom:8}}>
        {isLate?"+":""}{h>0?h+"h ":""}{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}
      </div>
      <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,${th.primary},${isLate?"#FF4444":th.accent})`,transition:"width 1s ease"}}/>
      </div>
    </div>
  );
}

// ─── WEEK VIEW ───────────────────────────────────────────────
function WeekView({ config, gameState, onCompleteTask, th, todayDayIdx }) {
  const allTasks = [...TASK_CATALOG, ...(config.customTasks||[])];
  return (
    <div style={{overflowX:"auto",paddingBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:`120px repeat(7,1fr)`,gap:2,minWidth:700}}>
        {/* Header */}
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>TÂCHE</div>
        {DAYS_SHORT.map((d,i)=>(
          <div key={i} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",color:i===todayDayIdx?th.accent:"#888",padding:"6px 4px",textAlign:"center",background:i===todayDayIdx?`${th.accent}20`:"transparent",borderRadius:3,border:i===todayDayIdx?`2px solid ${th.accent}60`:"none"}}>
            {d}{i===todayDayIdx&&<div style={{fontSize:5,color:th.accent,marginTop:2}}>▲</div>}
          </div>
        ))}
        {/* Rows per assignment */}
        {config.assignments.map(ass=>{
          const task=allTasks.find(t=>t.id===ass.taskId);
          if(!task)return null;
          const assignedPlayers=config.players.filter(p=>ass.playerIds.includes(p.id));
          return [
            <div key={ass.instanceId+"_label"} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 6px",background:"rgba(0,0,0,0.4)",borderRadius:3}}>
              <span style={{fontSize:16}}>{task.emoji}</span>
              <div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ddd",lineHeight:1.2}}>{task.label}</div>
                <div style={{display:"flex",gap:3}}>
                  {assignedPlayers.map(pl=><div key={pl.id} style={{width:8,height:8,borderRadius:"50%",background:pl.color}}/>)}
                </div>
              </div>
            </div>,
            ...DAYS_SHORT.map((_,dayIdx)=>{
              const inDay=ass.days.includes(dayIdx)||(ass.days.length===0);
              if(!inDay)return <div key={ass.instanceId+"_d"+dayIdx} style={{background:"rgba(0,0,0,0.2)",borderRadius:3}}/>;
              return (
                <div key={ass.instanceId+"_d"+dayIdx} style={{padding:3}}>
                  {ass.playerIds.map(pid=>{
                    const pl=config.players.find(p=>p.id===pid);
                    if(!pl)return null;
                    const doneKey=`${ass.instanceId}_${pid}_${dayIdx}`;
                    const done=gameState.completed?.includes(doneKey);
                    return (
                      <div key={pid} onClick={()=>!done&&onCompleteTask(ass,pid,dayIdx)}
                        style={{background:done?`${pl.color}30`:"rgba(0,0,0,0.5)",border:`2px solid ${done?pl.color:"#333"}`,borderRadius:3,padding:"3px 4px",cursor:done?"default":"pointer",marginBottom:2,textAlign:"center",transition:"all 0.15s"}} title={displayName(pl)}>
                        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:done?pl.color:"#555"}}>{done?"✓":displayName(pl).slice(0,3)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          ];
        })}
      </div>
    </div>
  );
}

// ─── PLAYER DASHBOARD ────────────────────────────────────────

// ─── AVATAR PARTS CATALOG ────────────────────────────────────
const AVATAR_PARTS = {
  skin: [
    {id:"sk1",label:"Clair",  color:"#FFCC99"}, {id:"sk2",label:"Doré",   color:"#E8A060"},
    {id:"sk3",label:"Brun",   color:"#C07840"}, {id:"sk4",label:"Foncé",  color:"#7B4A20"},
    {id:"sk5",label:"Azur",   color:"#99CCFF"}, {id:"sk6",label:"Vert",   color:"#88CC88"},
    {id:"sk7",label:"Rose",   color:"#FFAACC"}, {id:"sk8",label:"Violet", color:"#CC88FF"},
  ],
  eyes: [
    {id:"ey1",emoji:"👀",label:"Normal",    eyeColor:"#333",  eyeShape:"round"},
    {id:"ey2",emoji:"😊",label:"Joyeux",    eyeColor:"#2244AA",eyeShape:"happy"},
    {id:"ey3",emoji:"😎",label:"Cool",      eyeColor:"#000",  eyeShape:"cool"},
    {id:"ey4",emoji:"⭐",label:"Étoile",    eyeColor:"#FFD700",eyeShape:"star"},
    {id:"ey5",emoji:"😺",label:"Chat",      eyeColor:"#00AA66",eyeShape:"cat"},
    {id:"ey6",emoji:"👾",label:"Alien",     eyeColor:"#FF4444",eyeShape:"alien"},
  ],
  mouth: [
    {id:"mo1",emoji:"😐",label:"Neutre",   color:"#CC6644"},
    {id:"mo2",emoji:"😁",label:"Sourire",  color:"#CC4422"},
    {id:"mo3",emoji:"😤",label:"Sérieux",  color:"#884422"},
    {id:"mo4",emoji:"😛",label:"Langue",   color:"#FF4488"},
    {id:"mo5",emoji:"😬",label:"Crispé",   color:"#AA5533"},
    {id:"mo6",emoji:"🤐",label:"Secret",   color:"#556677"},
  ],
  hair: [
    {id:"ha1",emoji:"🟤",label:"Brun court",  color:"#5C3317",style:"short"},
    {id:"ha2",emoji:"⬛",label:"Noir",         color:"#111",   style:"short"},
    {id:"ha3",emoji:"🟡",label:"Blond",        color:"#FFD700",style:"short"},
    {id:"ha4",emoji:"🔴",label:"Roux",         color:"#CC4400",style:"short"},
    {id:"ha5",emoji:"⚪",label:"Blanc",        color:"#EEE",   style:"short"},
    {id:"ha6",emoji:"🟣",label:"Violet",       color:"#9933CC",style:"short"},
    {id:"ha7",emoji:"🔵",label:"Bleu",         color:"#2244AA",style:"short"},
    {id:"ha8",emoji:"🩷",label:"Rose",         color:"#FF69B4",style:"short"},
  ],
};

const DEFAULT_AVATAR = { skin:"sk1", eyes:"ey1", mouth:"mo1", hair:"ha1" };

// Render avatar to canvas (used both in-panel and in popup)
function renderAvatarToCtx(ctx, avatarDef, bodyColor, W=72, H=72) {
  const av = {...DEFAULT_AVATAR, ...avatarDef};
  const skinPart = AVATAR_PARTS.skin.find(s=>s.id===av.skin) || AVATAR_PARTS.skin[0];
  const eyePart  = AVATAR_PARTS.eyes.find(e=>e.id===av.eyes) || AVATAR_PARTS.eyes[0];
  const mouthPart= AVATAR_PARTS.mouth.find(m=>m.id===av.mouth) || AVATAR_PARTS.mouth[0];
  const hairPart = AVATAR_PARTS.hair.find(h=>h.id===av.hair) || AVATAR_PARTS.hair[0];
  const sc = W/72; // scale factor
  const s = (v) => Math.round(v*sc);

  ctx.clearRect(0,0,W,H);
  // Hair (back)
  ctx.fillStyle = hairPart.color;
  ctx.fillRect(s(3),s(0),s(30),s(8));
  ctx.fillRect(s(0),s(4),s(4),s(18));
  ctx.fillRect(s(29),s(4),s(4),s(18));
  // Head
  ctx.fillStyle = skinPart.color;
  ctx.fillRect(s(3),s(2),s(30),s(22));
  // Hair top
  ctx.fillStyle = hairPart.color;
  ctx.fillRect(s(3),s(2),s(30),s(5));
  // Eyes
  ctx.fillStyle = eyePart.eyeColor;
  if(eyePart.eyeShape==="happy"){ctx.fillRect(s(9),s(11),s(5),s(3));ctx.fillRect(s(21),s(11),s(5),s(3));}
  else if(eyePart.eyeShape==="cat"){ctx.fillRect(s(9),s(10),s(6),s(2));ctx.fillRect(s(21),s(10),s(6),s(2));ctx.fillStyle="#000";ctx.fillRect(s(11),s(10),s(2),s(4));ctx.fillRect(s(23),s(10),s(2),s(4));}
  else if(eyePart.eyeShape==="star"){ctx.font=`${s(10)}px serif`;ctx.textAlign="center";ctx.fillText("★",s(12),s(15));ctx.fillText("★",s(24),s(15));}
  else if(eyePart.eyeShape==="cool"){ctx.fillStyle="#111";ctx.fillRect(s(8),s(10),s(8),s(4));ctx.fillRect(s(20),s(10),s(8),s(4));}
  else if(eyePart.eyeShape==="alien"){ctx.fillStyle=eyePart.eyeColor;ctx.fillRect(s(8),s(9),s(8),s(6));ctx.fillRect(s(20),s(9),s(8),s(6));ctx.fillStyle="#000";ctx.fillRect(s(10),s(11),s(4),s(3));ctx.fillRect(s(22),s(11),s(4),s(3));}
  else{ctx.fillRect(s(9),s(9),s(5),s(5));ctx.fillRect(s(21),s(9),s(5),s(5));}
  // Mouth
  ctx.fillStyle = mouthPart.color;
  if(av.mouth==="mo2"){ctx.fillRect(s(11),s(18),s(14),s(3));ctx.fillRect(s(10),s(16),s(2),s(3));ctx.fillRect(s(24),s(16),s(2),s(3));}
  else if(av.mouth==="mo4"){ctx.fillRect(s(11),s(18),s(14),s(3));ctx.fillStyle="#FF88AA";ctx.fillRect(s(14),s(21),s(8),s(4));}
  else if(av.mouth==="mo6"){ctx.fillRect(s(10),s(18),s(16),s(2));ctx.fillRect(s(10),s(18),s(2),s(5));ctx.fillRect(s(24),s(18),s(2),s(5));}
  else{ctx.fillRect(s(11),s(18),s(14),s(3));}
  // Body
  ctx.fillStyle = bodyColor || "#4A90D9";
  ctx.fillRect(s(2),s(26),s(32),s(24));
  // Outline
  ctx.strokeStyle="#000"; ctx.lineWidth=1;
  ctx.strokeRect(s(2),s(26),s(32),s(24));
  // Arms
  ctx.fillStyle = skinPart.color;
  ctx.fillRect(s(-2),s(28),s(6),s(14));
  ctx.fillRect(s(32),s(28),s(6),s(14));
  ctx.strokeRect(s(-2),s(28),s(6),s(14));
  ctx.strokeRect(s(32),s(28),s(6),s(14));
  // Legs
  ctx.fillStyle="#1A3A8A";
  ctx.fillRect(s(6),s(50),s(12),s(14));
  ctx.fillRect(s(20),s(50),s(12),s(14));
  ctx.strokeRect(s(6),s(50),s(12),s(14));
  ctx.strokeRect(s(20),s(50),s(12),s(14));
}

// Inline avatar component (renders canvas)
function AvatarCanvas({ avatarDef, bodyColor, size=72, style={} }) {
  const canvasRef = useRef(null);
  useEffect(()=>{
    const c=canvasRef.current; if(!c)return;
    const ctx=c.getContext("2d");
    renderAvatarToCtx(ctx, avatarDef||DEFAULT_AVATAR, bodyColor, size, size);
  },[avatarDef, bodyColor, size]);
  return <canvas ref={canvasRef} width={size} height={size}
    style={{imageRendering:"pixelated",borderRadius:4,...style}}/>;
}

// ─── AVATAR POPUP (creator + inventory) ──────────────────────
function AvatarPopup({ player, pState, onClose, onUpdateAvatar, onEquip, allShopItems, th }) {
  const [tab, setTab] = useState("creator"); // creator | inventory
  const [partTab, setPartTab] = useState("skin");
  const avatarDef = pState.avatar || DEFAULT_AVATAR;
  const pt = getPlayerTheme(player.themeId);

  const allOwned = allShopItems.filter(i => pState.owned?.includes(i.id));
  const eq = pState.equipped || {};

  const PART_TABS = {skin:"🎨 Peau", eyes:"👀 Yeux", mouth:"👄 Bouche", hair:"💇 Cheveux"};

  const update = (part, id) => { SFX.click(); onUpdateAvatar({...avatarDef,[part]:id}); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:2500,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
      <div style={{background:pt.bg||"#1a1a2e",border:`5px solid ${pt.accent||"#FFD700"}`,borderRadius:10,padding:20,width:"min(520px,95vw)",maxHeight:"85vh",display:"flex",flexDirection:"column",gap:14,boxShadow:`0 0 40px ${pt.glow||"#FFD700"}60`,overflowY:"auto"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:pt.accent||"#FFD700"}}>{displayName(player)} — Mon Perso</div>
          <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"5px 10px",background:"#333",color:"#888",border:"2px solid #555",borderRadius:3,cursor:"pointer"}}>✕</button>
        </div>

        {/* Preview */}
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:20,padding:"10px 0"}}>
          <div style={{position:"relative"}}>
            <AvatarCanvas avatarDef={avatarDef} bodyColor={pt.charBodyColor||player.color} size={120}
              style={{border:`4px solid ${pt.accent||"#FFD700"}`,boxShadow:`0 0 20px ${pt.glow||"#FFD700"}50`}}/>
            {eq.hat   && <span style={{position:"absolute",top:-22,left:"50%",transform:"translateX(-50%)",fontSize:32,filter:"drop-shadow(0 2px 0 #000)"}}>{allShopItems.find(i=>i.id===eq.hat)?.emoji}</span>}
            {eq.armor  && <span style={{position:"absolute",bottom:-14,right:-14,fontSize:26}}>{allShopItems.find(i=>i.id===eq.armor)?.emoji}</span>}
            {eq.pet    && <span style={{position:"absolute",bottom:-14,left:-14,fontSize:26}}>{allShopItems.find(i=>i.id===eq.pet)?.emoji}</span>}
          </div>
          <div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:player.color,marginBottom:6}}>{displayName(player)}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:pt.accent||"#FFD700",marginBottom:4}}>{getLevelTitle(pState.xp,player.themeId).title}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#5DECF5"}}>⚡ {pState.xp} XP</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700",marginTop:3}}>🪙 {pState.coins} {pt.coinName||"pièces"}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#555",marginTop:4}}>Items équipés: {Object.values(eq).filter(Boolean).length}</div>
          </div>
        </div>

        {/* Main tabs */}
        <div style={{display:"flex",gap:6}}>
          {[["creator","✏️ Créer"],["inventory","🎒 Inventaire"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setTab(k);SFX.click();}}
              style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px",background:tab===k?(pt.accent||"#FFD700"):"#222",color:tab===k?"#000":"#888",border:`2px solid ${tab===k?(pt.accent||"#FFD700"):"#444"}`,borderRadius:4,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>

        {/* CREATOR TAB */}
        {tab==="creator" && <>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {Object.entries(PART_TABS).map(([k,l])=>(
              <button key={k} onClick={()=>{setPartTab(k);SFX.click();}}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"5px 9px",background:partTab===k?(pt.accent||"#FFD700"):"#222",color:partTab===k?"#000":"#888",border:`2px solid ${partTab===k?(pt.accent||"#FFD700"):"#444"}`,borderRadius:3,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
          {partTab==="skin" && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {AVATAR_PARTS.skin.map(s=>(
                <div key={s.id} onClick={()=>update("skin",s.id)}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"8px 4px",background:avatarDef.skin===s.id?`${s.color}30`:"rgba(0,0,0,0.4)",border:`3px solid ${avatarDef.skin===s.id?s.color:"#333"}`,borderRadius:5,cursor:"pointer",boxShadow:avatarDef.skin===s.id?`0 0 10px ${s.color}80`:"none"}}>
                  <div style={{width:28,height:28,background:s.color,borderRadius:4,border:"2px solid #000"}}/>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc"}}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
          {partTab==="eyes" && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {AVATAR_PARTS.eyes.map(e=>(
                <div key={e.id} onClick={()=>update("eyes",e.id)}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 6px",background:avatarDef.eyes===e.id?`${e.eyeColor}20`:"rgba(0,0,0,0.4)",border:`3px solid ${avatarDef.eyes===e.id?e.eyeColor:"#333"}`,borderRadius:5,cursor:"pointer"}}>
                  <span style={{fontSize:26}}>{e.emoji}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc"}}>{e.label}</span>
                </div>
              ))}
            </div>
          )}
          {partTab==="mouth" && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {AVATAR_PARTS.mouth.map(m=>(
                <div key={m.id} onClick={()=>update("mouth",m.id)}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 6px",background:avatarDef.mouth===m.id?`${m.color}20`:"rgba(0,0,0,0.4)",border:`3px solid ${avatarDef.mouth===m.id?m.color:"#333"}`,borderRadius:5,cursor:"pointer"}}>
                  <span style={{fontSize:26}}>{m.emoji}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc"}}>{m.label}</span>
                </div>
              ))}
            </div>
          )}
          {partTab==="hair" && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {AVATAR_PARTS.hair.map(h=>(
                <div key={h.id} onClick={()=>update("hair",h.id)}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"8px 4px",background:avatarDef.hair===h.id?`${h.color}30`:"rgba(0,0,0,0.4)",border:`3px solid ${avatarDef.hair===h.id?h.color:"#333"}`,borderRadius:5,cursor:"pointer",boxShadow:avatarDef.hair===h.id?`0 0 10px ${h.color}60`:"none"}}>
                  <div style={{width:28,height:14,background:h.color,borderRadius:"4px 4px 0 0",border:"2px solid #000"}}/>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:11,color:"#ccc"}}>{h.label}</span>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* INVENTORY TAB */}
        {tab==="inventory" && <>
          {allOwned.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:20}}>Ton inventaire est vide — achète des items dans la boutique!</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {allOwned.map(item=>{
              const isEq = item.slot && eq[item.slot]===item.id;
              return (
                <div key={item.id} onClick={()=>{ if(item.slot){onEquip(item);SFX.click();} }}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"8px 4px",
                    background:isEq?`${pt.accent}20`:"rgba(0,0,0,0.45)",
                    border:`3px solid ${isEq?(pt.accent||"#2ECC40"):"#444"}`,borderRadius:5,cursor:item.slot?"pointer":"default",
                    boxShadow:isEq?`0 0 10px ${pt.glow||"#FFD700"}60`:"none"}}>
                  <span style={{fontSize:24}}>{item.emoji}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:11,color:"#ccc",textAlign:"center",lineHeight:1.2}}>{item.name||item.label}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:isEq?"#2ECC40":"#888"}}>
                    {isEq?"✅ ÉQUIPÉ":item.slot?"Équiper":"-"}
                  </span>
                </div>
              );
            })}
          </div>
        </>}
      </div>
    </div>
  );
}

function PlayerDashboard({ player, playerIdx, pState, config, assignments, allTasks, allRewards, onRequestComplete, onBuy, onEquip, onUpdateAvatar, parentMode, onDeComplete, onForceComplete, onUpdateCalendar, onCalendarAdd, th }) {
  const [shopTab, setShopTab] = useState("rewards");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [themeRevealed, setThemeRevealed] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [calForm, setCalForm] = useState({type:"devoir", label:"", date:""});
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
  const myAssignments = assignments.filter(a=>a.playerIds.includes(player.id));
  const themedCat = pt.shopCategory;
  const SHOP_TABS = { rewards:"🎁 Récompenses", hats:"🎩 Chapeaux", armors:"🛡️ Armures", pets:"🐾 Familiers", ...(themedCat.items.length>0?{[themedCat.id]:themedCat.label}:{}) };
  const SHOP_ITEMS = {
    hats:[{id:"h1",emoji:"🎩",name:"Chapeau magique",cost:20,slot:"hat"},{id:"h2",emoji:"👑",name:"Couronne",cost:40,slot:"hat"},{id:"h3",emoji:"⛑",name:"Casque héros",cost:25,slot:"hat"},{id:"h4",emoji:"🪖",name:"Casque diamant",cost:35,slot:"hat"},{id:"h5",emoji:"🎓",name:"Chapeau savant",cost:30,slot:"hat"},{id:"h6",emoji:"🧢",name:"Cap champion",cost:15,slot:"hat"}],
    armors:[{id:"a1",emoji:"🛡️",name:"Bouclier",cost:15,slot:"armor"},{id:"a2",emoji:"⚔️",name:"Épée",cost:20,slot:"armor"},{id:"a3",emoji:"🏹",name:"Arc en or",cost:35,slot:"armor"},{id:"a4",emoji:"💎",name:"Armure diamant",cost:50,slot:"armor"},{id:"a5",emoji:"🪄",name:"Bâton magique",cost:30,slot:"armor"}],
    pets:[{id:"p1",emoji:"🐱",name:"Chat",cost:20,slot:"pet"},{id:"p2",emoji:"🐶",name:"Chien",cost:20,slot:"pet"},{id:"p3",emoji:"🐺",name:"Loup",cost:35,slot:"pet"},{id:"p4",emoji:"🦊",name:"Renard",cost:30,slot:"pet"},{id:"p5",emoji:"🐉",name:"Dragon",cost:60,slot:"pet"},{id:"p6",emoji:"🦜",name:"Perroquet",cost:25,slot:"pet"}],
  };
  const eq = pState.equipped || {};
  // hat/armor/pet resolved via allShopItemsFlat after it's declared below

  const myRewards = allRewards.filter(r=>config.selectedRewards?.includes(r.id));
  const allShopItemsFlat = [
    ...SHOP_ITEMS.hats, ...SHOP_ITEMS.armors, ...SHOP_ITEMS.pets,
    ...(pt.shopCategory?.items||[]),
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10,padding:"10px 8px"}}>
      {/* Player header card */}
      <div style={{background:"rgba(0,0,0,0.55)",border:`4px solid #000`,borderTop:`4px solid ${player.color}`,borderRadius:6,padding:12,display:"flex",gap:12,alignItems:"center",boxShadow:`0 0 24px ${player.color}40`}}>
        {/* Avatar — clickable → opens creator/inventory */}
        <div style={{position:"relative",flexShrink:0,cursor:"pointer"}} onClick={()=>{setAvatarOpen(true);SFX.click();}} title="Personnaliser mon perso">
          <AvatarCanvas avatarDef={pState.avatar||DEFAULT_AVATAR} bodyColor={pt.charBodyColor||player.color} size={72}
            style={{border:`4px solid ${pt.accent||player.color}`,boxShadow:`0 0 14px ${pt.glow||player.color}50`,display:"block"}}/>
          {eq.hat   && <span style={{position:"absolute",top:-16,left:"50%",transform:"translateX(-50%)",fontSize:22,filter:"drop-shadow(0 2px 0 #000)",pointerEvents:"none"}}>{allShopItemsFlat.find(i=>i.id===eq.hat)?.emoji}</span>}
          {eq.armor && <span style={{position:"absolute",bottom:-10,right:-8,fontSize:18,pointerEvents:"none"}}>{allShopItemsFlat.find(i=>i.id===eq.armor)?.emoji}</span>}
          {eq.pet   && <span style={{position:"absolute",bottom:-10,left:-8,fontSize:18,pointerEvents:"none"}}>{allShopItemsFlat.find(i=>i.id===eq.pet)?.emoji}</span>}
          <div style={{position:"absolute",bottom:-18,left:"50%",transform:"translateX(-50%)",fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#555",whiteSpace:"nowrap"}}>✏️ Modifier</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.4vw,14px)",color:player.color,marginBottom:3}}>{displayName(player)}</div>
          {isRandomUnrevealed
            ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#FFD700",marginBottom:5}}>❓ THÈME MYSTÈRE</div>
            : <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:pt.accent||"#aaa",marginBottom:5,textShadow:`0 0 8px ${pt.glow}60`}}>Niv.{lvTitle.level} — {lvTitle.title}</div>
          }
          {isRandomUnrevealed && <button onClick={()=>{setThemeRevealed(true);SFX.epic();spawnParticles("🎲");}}
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px 12px",background:"linear-gradient(90deg,#FF4444,#FFD700,#44FF44)",color:"#000",border:"3px solid #000",borderRadius:3,cursor:"pointer",boxShadow:"3px 3px 0 #000",marginBottom:4}}>
            🎲 RÉVÉLER MON THÈME!
          </button>}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",marginBottom:2}}>⚡ XP {pState.xp}</div>
          <div style={{height:9,background:"#111",border:"2px solid #333",borderRadius:1,overflow:"hidden",marginBottom:6}}>
            <div style={{height:"100%",width:xpPct+"%",background:`linear-gradient(90deg,${player.color},#5DECF5)`,transition:"width 0.8s ease"}}/>
          </div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,12px)",color:"#FFD700"}}>🪙 {pState.coins} {pt.coinName||"pièces"}</div>
        </div>
      </div>

      {/* Calendar reminders */}
      {(()=>{
        const today = new Date().toISOString().split("T")[0];
        const reminders = computeCalendarReminders(pState.calendar||[], today);
        if (!reminders.length) return null;
        return reminders.map(rem=>{
          const doneKey = rem.instanceId+"_"+player.id;
          const done = pState.completed?.includes(doneKey);
          return (
            <div key={rem.id} style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${done?"#2ECC40":"#5DECF5"}`,borderRadius:5,padding:"9px 11px",position:"relative"}}>
              {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#2ECC40",borderRadius:5}}>✅ VALIDÉ!</div>}
              <div style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#5DECF5",marginBottom:5,lineHeight:1.3}}>{rem.title}</div>
              <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",background:"rgba(93,236,245,0.1)",border:"1px solid rgba(93,236,245,0.3)",padding:"1px 4px"}}>⚡{rem.xp} XP</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"1px 4px"}}>🪙{rem.coins}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",padding:"1px 4px"}}>{rem._daysLeft===0?"📅 AUJOURD'HUI":`📅 dans ${rem._daysLeft}j`}</span>
              </div>
              {!done&&<button onClick={e=>{SFX.click();onRequestComplete(rem,player.id,e);}}
                style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#000",background:"#5DECF5",border:"3px solid #000",borderRadius:3,cursor:"pointer",boxShadow:"4px 4px 0 #000"}}>
                ✔ J'AI ÉTUDIÉ!
              </button>}
            </div>
          );
        });
      })()}

      {/* Tasks */}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"#888",borderBottom:"2px solid #333",paddingBottom:3}}>📋 MES QUÊTES</div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:2}}>C'est ici que tu coches tes tâches du jour — clique et attends la validation!</div>
      {myAssignments.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:16}}>Aucune quête assignée pour ce joueur.</div>}
      {myAssignments.map(ass=>{
        const task=allTasks.find(t=>t.id===ass.taskId);
        if(!task)return null;
        const doneKey=ass.instanceId+"_"+player.id;
        const done=pState.completed?.includes(doneKey);
        const pending=pState.pending?.includes(doneKey);
        return (
          <div key={ass.instanceId} style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${done?"#2ECC40":pending?"#FFD700":"#333"}`,borderRadius:5,padding:"9px 11px",position:"relative",transition:"border 0.2s"}}>
            {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#2ECC40",borderRadius:5}}>✅ VALIDÉ!</div>}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",marginBottom:3}}>{ass.time?`⏰ ${ass.time}`:""}</div>
            <div style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#fff",marginBottom:5,lineHeight:1.3}}><span style={{fontSize:18}}>{task.emoji}</span> {task.label}</div>
            <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",background:"rgba(93,236,245,0.1)",border:"1px solid rgba(93,236,245,0.3)",padding:"1px 4px"}}>⚡{task.xp} XP</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"1px 4px"}}>🪙{task.coins}</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:DIFF_COLOR(task.diff),border:`1px solid ${DIFF_COLOR(task.diff)}40`,padding:"1px 4px"}}>{task.diff.toUpperCase()}</span>
            </div>
            {!done&&!pending&&<button onClick={e=>{SFX.click();onRequestComplete(ass,player.id,e);}}
              style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",
                color:"#000",background:player.color,border:"3px solid #000",borderRadius:3,cursor:"pointer",
                boxShadow:"4px 4px 0 #000",transition:"all 0.08s"}}>
              ✔ J'AI FAIT ÇA!
            </button>}
            {!done&&!pending&&parentMode&&<button onClick={()=>onForceComplete(ass,player.id)}
              style={{width:"100%",padding:"6px",fontFamily:"'Press Start 2P',monospace",fontSize:"7px",
                color:"#000",background:"#FF8C00",border:"2px solid #CC6600",borderRadius:2,cursor:"pointer",marginTop:4}}>
              ⚡ OVERRIDE (parent)
            </button>}
            {done&&parentMode&&<button onClick={()=>onDeComplete(ass.instanceId+"_"+player.id, playerIdx)}
              style={{position:"absolute",top:4,right:4,padding:"3px 7px",fontFamily:"'Press Start 2P',monospace",fontSize:"6px",
                color:"#FF4444",background:"rgba(0,0,0,0.7)",border:"1px solid #FF4444",borderRadius:2,cursor:"pointer",zIndex:10}}>
              ↩️ Annuler
            </button>}
            {pending&&<div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700",textAlign:"center",marginTop:4}}>⏳ En attente de parent…</div>}
          </div>
        );
      })}

      {/* Calendar CRUD */}
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginTop:6,marginBottom:2}}>Note tes devoirs et examens ici — un rappel apparaîtra avant la date avec du XP bonus!</div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"#888",borderBottom:"2px solid #333",paddingBottom:3,marginTop:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>📅 MON CALENDRIER</span>
        <button onClick={()=>{setCalOpen(o=>!o);SFX.click();}}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"3px 7px",background:calOpen?"#333":"transparent",color:calOpen?"#FFD700":"#555",border:"1px solid #333",borderRadius:2,cursor:"pointer"}}>
          {calOpen?"✕ Fermer":"+ Ajouter"}
        </button>
      </div>
      {calOpen && (
        <div style={{background:"rgba(0,0,0,0.5)",border:"2px solid #5DECF5",borderRadius:5,padding:10,display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",gap:6}}>
            {[["devoir","📚 Devoir"],["examen","📝 Examen"]].map(([v,l])=>(
              <button key={v} onClick={()=>{setCalForm(f=>({...f,type:v}));SFX.click();}}
                style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px",background:calForm.type===v?"#5DECF5":"#1a1a1a",color:calForm.type===v?"#000":"#888",border:`2px solid ${calForm.type===v?"#5DECF5":"#333"}`,borderRadius:3,cursor:"pointer"}}>
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
          }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px",background:"#5DECF5",color:"#000",border:"none",borderRadius:3,cursor:"pointer"}}>
            ✓ Enregistrer
          </button>
        </div>
      )}
      {(pState.calendar||[]).length>0 && (
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {[...(pState.calendar||[])].sort((a,b)=>a.date.localeCompare(b.date)).map(entry=>(
            <div key={entry.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"rgba(0,0,0,0.4)",border:"1px solid #222",borderRadius:3}}>
              <span style={{fontSize:14}}>{entry.type==="examen"?"📝":"📚"}</span>
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

      {/* Shop */}
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginTop:6,marginBottom:2}}>Dépense tes pièces pour des accessoires et de vraies récompenses — les quêtes difficiles en rapportent plus!</div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"#888",borderBottom:"2px solid #333",paddingBottom:3,marginTop:0}}>🛒 BOUTIQUE — {pState.coins} 🪙</div>
      <div style={{background:"rgba(0,0,0,0.45)",border:"3px solid #FFD700",borderRadius:5,padding:10}}>
        <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
          {Object.entries(SHOP_TABS).map(([k,l])=>(
            <button key={k} onClick={()=>{setShopTab(k);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 7px",background:shopTab===k?"#FFD700":"#222",color:shopTab===k?"#000":"#888",border:`2px solid ${shopTab===k?"#FFD700":"#555"}`,borderRadius:2,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        {shopTab==="rewards" && (
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {myRewards.map(r=>{
              const canBuy=pState.coins>=r.coins;
              const bought=pState.boughtRewards?.includes(r.id);
              return (
                <div key={r.id} onClick={()=>canBuy&&!bought&&onBuy(r,player.id)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"rgba(0,0,0,0.4)",border:`2px solid ${bought?"#2ECC40":canBuy?"#FFD700":"#333"}`,borderRadius:4,cursor:canBuy&&!bought?"pointer":"default",opacity:!canBuy&&!bought?0.4:1}}>
                  <span style={{fontSize:22}}>{r.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:bought?"#2ECC40":"#ddd"}}>{r.label}</div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:bought?"#2ECC40":"#FFD700"}}>{bought?"RÉCLAMÉ!":r.coins+" 🪙"}</div>
                  </div>
                  {!bought&&canBuy&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700"}}>Acheter</span>}
                  {!bought&&!canBuy&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#444"}}>🔒</span>}
                </div>
              );
            })}
          </div>
        )}
        {shopTab!=="rewards" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
            {(SHOP_ITEMS[shopTab]||[]).map(item=>{
              const owned=pState.owned?.includes(item.id);
              const equipped=eq[item.slot]===item.id;
              const canAfford=pState.coins>=item.cost;
              return (
                <div key={item.id} onClick={()=>{ if(equipped)return; if(owned&&item.slot)onEquip(item,player.id); else if(!owned&&canAfford)onBuy(item,player.id); }}
                  style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${equipped?"#2ECC40":owned?"#888":canAfford?"#555":"#333"}`,borderRadius:4,padding:"7px 5px",textAlign:"center",cursor:equipped?"default":owned||canAfford?"pointer":"not-allowed",opacity:!owned&&!canAfford?0.4:1}}>
                  <span style={{fontSize:20,display:"block",marginBottom:2}}>{item.emoji}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc",display:"block",marginBottom:2,lineHeight:1.1}}>{item.name}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:equipped?"#2ECC40":owned?"#888":"#FFD700"}}>{equipped?"✅ ON":owned?"Équiper":item.cost+" 🪙"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* ── BADGE SHELF ─────────────────────────────────────── */}
      <div style={{marginTop:8,background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"12px 14px",border:`2px solid ${pt.accent||"#444"}33`}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:pt.accent||"#FFD700",marginBottom:4}}>🏅 BADGES</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:8}}>Survole un badge pour voir comment le débloquer — certains sont secrets! 🕵️</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {BADGES.filter(b=>b.type==="general"||b.type===resolvedThemeId).map(b=>{
            const earned=(pState.badges||[]).includes(b.id);
            return (
              <div key={b.id} title={earned?`${b.name}: ${b.desc}`:`🔒 ${b.desc}`}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,width:60,opacity:earned?1:0.3,transition:"opacity 0.3s",cursor:"default"}}>
                <div style={{fontSize:26,filter:earned?"none":"grayscale(1)"}}>{b.emoji}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:11,color:earned?(pt.accent||"#FFD700"):"#666",textAlign:"center",lineHeight:1.2,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
              </div>
            );
          })}
        </div>
        {(pState.badges||[]).length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#555",marginTop:6}}>Complète des quêtes pour débloquer des badges!</div>}
      </div>
    {/* Avatar popup */}
    {avatarOpen && <AvatarPopup player={player} pState={pState} onClose={()=>setAvatarOpen(false)}
      onUpdateAvatar={(av)=>onUpdateAvatar(av,player.id)} onEquip={(item)=>{onEquip(item,player.id);}}
      allShopItems={allShopItemsFlat} th={th}/>}
    </div>
  );
}

// ─── FAMILY OVERVIEW ─────────────────────────────────────────
// ─── PLAYER PROFILE MODAL (#8) ───────────────────────────────
function PlayerProfile({ player, pState, config, gameStates, th, onClose }) {
  const gs = pState;
  const lt = getLevelTitle(gs.xp||0, player.themeId);
  const bar = xpBar(gs.xp||0);
  const pct = Math.min(100, Math.round((bar.cur/bar.needed)*100));
  const myBadges = (gs.badges||[]).map(id=>BADGES.find(b=>b.id===id)).filter(Boolean).slice(-6);
  const myDone = config.assignments.filter(a=>a.playerIds.includes(player.id)&&(gs.completed||[]).some(k=>k.startsWith(a.instanceId+"_"+player.id))).length;
  const siblings = config.players.map((pl,i)=>({name:displayName(pl),xp:gameStates[i]?.xp||0,color:pl.color,isMe:pl.id===player.id})).sort((a,b)=>b.xp-a.xp);
  const maxXp = Math.max(...siblings.map(s=>s.xp),1);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#111",border:`4px solid ${player.color}`,borderRadius:12,padding:20,maxWidth:380,width:"100%",boxShadow:`0 0 40px ${player.color}60`,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
          <AvatarCanvas avatarDef={gs.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(player.themeId).charBodyColor||player.color} size={64} style={{border:`4px solid ${player.color}`,borderRadius:8}}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:13,color:player.color,marginBottom:4}}>{displayName(player)}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:th.accent}}>Niv.{lt.level} — {lt.title}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#666"}}>{gs.xp||0} XP</div>
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>Prochain niveau</span>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:th.accent}}>{pct}%</span>
          </div>
          <div style={{height:14,background:"#0d2010",border:"2px solid #1a3820",borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:pct+"%",background:"linear-gradient(90deg,#4ade80,#22c55e)",transition:"width 1s ease",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)",animation:"shimmer 2s infinite"}}/>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[["⚡",gs.xp||0,"XP"],["🪙",gs.coins||0,"Pièces"],["✅",myDone,"Quêtes"]].map(([icon,val,lbl])=>(
            <div key={lbl} style={{background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:6,padding:"8px 4px",textAlign:"center"}}>
              <div style={{fontSize:18,marginBottom:2}}>{icon}</div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#fff"}}>{val}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888"}}>{lbl}</div>
            </div>
          ))}
        </div>
        {myBadges.length>0&&(
          <div style={{marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:6}}>🏅 BADGES</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{myBadges.map(b=><span key={b.id} title={b.name} style={{fontSize:24}}>{b.emoji}</span>)}</div>
          </div>
        )}
        {siblings.length>1&&(
          <div style={{marginBottom:14}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:6}}>🏆 CLASSEMENT FAMILLE</div>
            {siblings.map((s,rank)=>(
              <div key={s.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:rank===0?"#FFD700":"#666",width:14}}>#{rank+1}</span>
                <span style={{fontFamily:"'VT323',monospace",fontSize:16,color:s.isMe?s.color:"#aaa",flex:1,minWidth:50}}>{s.name}</span>
                <div style={{flex:2,height:8,background:"#111",border:"1px solid #333",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(s.xp/maxXp*100)}%`,background:s.isMe?s.color:"#444",transition:"width 0.8s ease"}}/>
                </div>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",width:34,textAlign:"right"}}>{s.xp}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:10,background:player.color,color:"#000",border:"2px solid #000",borderRadius:4,cursor:"pointer",boxShadow:"3px 3px 0 #000"}}>✕ FERMER</button>
      </div>
    </div>
  );
}

function FamilyOverview({ config, gameStates, allTasks, onSelectPlayer, th }) {
  const [profileIdx, setProfileIdx] = useState(null);
  return (
    <div style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:10}}>
      {profileIdx!==null&&(
        <PlayerProfile player={config.players[profileIdx]} pState={gameStates[profileIdx]||{xp:0,coins:0,completed:[],badges:[]}} config={config} gameStates={gameStates} th={th} onClose={()=>setProfileIdx(null)}/>
      )}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:th.accent,marginBottom:4}}>👨‍👩‍👧‍👦 VUE FAMILLE</div>
      {/* Player cards grid */}
      <div className="fo-grid" style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(config.players.length,2)},1fr)`,gap:10}}>
        {config.players.map((player,i)=>{
          const ps=gameStates[i]||{xp:0,coins:0,completed:[]};
          const myDone=config.assignments.filter(a=>a.playerIds.includes(player.id)&&ps.completed?.some(k=>k.startsWith(a.instanceId+"_"+player.id))).length;
          const myTotal=config.assignments.filter(a=>a.playerIds.includes(player.id)).length;
          const pct=myTotal>0?Math.round((myDone/myTotal)*100):0;
          const lv=getLevel(ps.xp);
          return (
            <div key={player.id} onClick={()=>{SFX.click();onSelectPlayer(i);}}
              style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${player.color}`,borderRadius:8,padding:14,cursor:"pointer",transition:"all 0.15s",boxShadow:`0 0 0 0 ${player.color}`}} onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 0 16px ${player.color}60`} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
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
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#5DECF5"}}>⚡ {ps.xp}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700"}}>🪙 {ps.coins}</span>
              </div>
              <div style={{display:"flex",gap:6,marginTop:8}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:player.color,flex:1,alignSelf:"center"}}>Voir tableau →</div>
                <button onClick={e=>{e.stopPropagation();SFX.click();setProfileIdx(i);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:th.accent,border:`1px solid ${th.accent}`,borderRadius:3,cursor:"pointer",flexShrink:0}}>📊 Profil</button>
              </div>
            </div>
          );
        })}
      </div>
      {/* Week view if mode=week */}
      {config.mode==="week"&&<div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginTop:4}}>📅 Plan de la semaine — défiler →</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

// ─── PARENT PANEL ────────────────────────────────────────────
function ParentPanel({ config, gameStates, parentMode, actionLog, undoStack,
  onClose, onUndo, onReset, onResetPlayer, onAdjustXP, onChangePin,
  onExport, onImport, onSetup, players, th }) {
  const [tab, setTab] = useState("actions"); // actions | log | pin | export
  const [xpPlayer, setXpPlayer] = useState(0);
  const [xpDelta, setXpDelta] = useState(10);
  const [pinVal, setPinVal] = useState("");
  const T = th;

  const TabBtn = ({k,l}) => (
    <button onClick={()=>setTab(k)} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",
      padding:"8px 4px",background:tab===k?"#FF8C00":"#222",color:tab===k?"#000":"#888",
      border:`2px solid ${tab===k?"#FF8C00":"#444"}`,borderRadius:3,cursor:"pointer"}}>
      {l}
    </button>
  );
  const Row = ({children,style={}}) => <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,...style}}>{children}</div>;
  const PBtn = ({onClick,color="#333",textColor="#fff",children,style={}}) => (
    <button onClick={onClick} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",
      padding:"8px 12px",background:color,color:textColor,border:"2px solid #000",borderRadius:3,
      cursor:"pointer",boxShadow:"2px 2px 0 #000",flexShrink:0,...style}}>
      {children}
    </button>
  );

  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:"min(340px,90vw)",
      background:"#0d0d0d",borderLeft:"4px solid #FF8C00",zIndex:500,
      display:"flex",flexDirection:"column",boxShadow:"-4px 0 30px rgba(255,140,0,0.3)",
      animation:"slideInRight 0.25s ease"}}>
      <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      {/* Header */}
      <div style={{background:"#FF8C00",padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,11px)",color:"#000"}}>🔓 MODE PARENT</div>
        <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,
          padding:"5px 10px",background:"#000",color:"#FF8C00",border:"none",cursor:"pointer",borderRadius:2}}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,padding:"8px 10px",flexShrink:0,background:"#111"}}>
        <TabBtn k="actions"  l="⚡ Actions"/>
        <TabBtn k="cal"      l="📅 Calendrier"/>
        <TabBtn k="log"      l="📋 Log"/>
        <TabBtn k="pin"      l="🔐 PIN"/>
        <TabBtn k="export"   l="💾 Data"/>
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px"}}>

        {/* ACTIONS TAB */}
        {tab==="actions" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>ACTIONS GLOBALES</div>
          <Row>
            {undoStack.length>0
              ? <PBtn onClick={onUndo} color="#FF6464" textColor="#000" style={{flex:1}}>↩️ Annuler dernière</PBtn>
              : <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#444"}}>Rien à annuler</div>}
          </Row>
          <Row>
            <PBtn onClick={()=>onSetup()} color="#333" textColor="#888" style={{flex:1}}>⚙️ Reconfigurer</PBtn>
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
                <PBtn onClick={()=>onAdjustXP(i,10)} color="#1a3a1a" textColor="#2ECC40" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+10 XP</PBtn>
                <PBtn onClick={()=>onAdjustXP(i,25)} color="#1a3a1a" textColor="#2ECC40" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+25 XP</PBtn>
                <PBtn onClick={()=>onAdjustXP(i,-10)} color="#3a1a1a" textColor="#FF6464" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>-10 XP</PBtn>
                <PBtn onClick={()=>onResetPlayer(i)} color="#2a0a0a" textColor="#FF4444" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>🔄 Reset</PBtn>
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
          }).sort((a,b)=>a.date.localeCompare(b.date));
          const today = new Date().toISOString().split("T")[0];
          return (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>CALENDRIER COMMUN</div>
              {allEntries.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:16}}>Aucun devoir ou examen.</div>}
              {allEntries.map(e=>(
                <div key={e.id+"_"+e.playerName} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:`2px solid ${e.date<today?"#333":e.date===today?"#FFD700":"#444"}`,borderRadius:4,marginBottom:6,opacity:e.date<today?0.4:1}}>
                  <span style={{fontSize:16}}>{e.type==="examen"?"📝":"📚"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}>{e.label}</div>
                    <div style={{display:"flex",gap:6,marginTop:2}}>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:e.playerColor}}>{e.playerName}</span>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:e.date===today?"#FFD700":"#666"}}>{e.date}</span>
                      <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:e.type==="examen"?"#FF6B35":"#5DECF5"}}>{e.type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {tab==="log" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>HISTORIQUE ({actionLog.length})</div>
          {/* Changelog de mise à jour */}
          {(config.updateFeedEntries||[]).map((entry,i)=>(
            <div key={`update-${i}`} style={{background:"rgba(94,222,245,0.07)",border:"2px solid #5DECF555",borderRadius:6,padding:"10px 12px",marginBottom:8}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#5DECF5",marginBottom:6}}>📖 LIVRE DE QUÊTES v{entry.version} — NOUVELLES PAGES!</div>
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
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:14}}>CHANGER LE PIN</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",marginBottom:10}}>PIN actuel: {config.pin}</div>
          <input type="password" inputMode="numeric" maxLength={4} value={pinVal}
            onChange={e=>setPinVal(e.target.value.replace(/\D/g,"").slice(0,4))}
            placeholder="Nouveau PIN (4 chiffres)"
            style={{width:"100%",background:"#111",border:"2px solid #FF8C00",color:"#fff",
              padding:"12px",fontFamily:"'Press Start 2P',monospace",fontSize:18,
              borderRadius:3,textAlign:"center",letterSpacing:8,marginBottom:10}}/>
          <PBtn onClick={()=>{if(pinVal.length===4){onChangePin(pinVal);setPinVal("");}}}
            color={pinVal.length===4?"#FF8C00":"#333"} textColor="#000" style={{width:"100%",opacity:pinVal.length===4?1:0.5}}>
            ✓ Confirmer
          </PBtn>
        </>}

        {/* EXPORT TAB */}
        {tab==="export" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:14}}>DONNÉES</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",marginBottom:12,lineHeight:1.4}}>
            Exporte la config pour la partager avec un autre appareil ou faire une sauvegarde.
          </div>
          <PBtn onClick={onExport} color="#1a3a1a" textColor="#2ECC40" style={{width:"100%",marginBottom:10}}>
            📤 Exporter config JSON
          </PBtn>
          <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:8}}>Importer une config sauvegardée:</div>
          <label style={{display:"block",padding:"10px",background:"#111",border:"2px dashed #444",
            borderRadius:3,cursor:"pointer",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",textAlign:"center"}}>
            📥 Choisir un fichier .json
            <input type="file" accept=".json" onChange={e=>e.target.files[0]&&onImport(e.target.files[0])} style={{display:"none"}}/>
          </label>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#444",marginTop:10,lineHeight:1.4}}>
            Futur: synchronisation Supabase temps réel entre tous les appareils.
          </div>
        </>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGIN SCREEN — "Qui joue?"
// ═══════════════════════════════════════════════════════════════
// ── Mini keypad réutilisable ──────────────────────────────────
function PinDots({ value, error, color="#FFD700" }) {
  return (
    <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:14}}>
      {[0,1,2,3].map(n=>(
        <div key={n} style={{width:30,height:38,background:error?"#FF4444":(value.length>n?color:"#1a1a1a"),borderRadius:4,border:`2px solid ${error?"#FF4444":(value.length>n?color:"#444")}`,transition:"all 0.12s",transform:error?"scale(1.1)":"scale(1)"}}/>
      ))}
    </div>
  );
}
function PinKeypad({ onDigit, onBack, onClose, closeLabel="✕" }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
      {["1","2","3","4","5","6","7","8","9","⌫","0",closeLabel].map(d=>(
        <button key={d} onClick={()=>{ SFX.click(); if(d==="⌫") onBack(); else if(d===closeLabel) onClose(); else onDigit(d); }}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,padding:"11px 0",background:d===closeLabel?"#330000":"#1a1a1a",color:d===closeLabel?"#FF4444":"#ccc",border:"2px solid #2a2a2a",borderRadius:4,cursor:"pointer"}}>
          {d}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME RUNNER — dino-style endless runner
// ═══════════════════════════════════════════════════════════════
function MiniGameRunner({ pt, level, onFinish }) {
  const canvasRef = useRef(null);
  const stRef = useRef(null);
  const [phase, setPhase] = useState("intro");
  const phaseRef = useRef("intro");

  const BONUS_XP    = [0, 5, 12, 22, 35];
  const BONUS_COINS = [0, 2,  6, 12, 20];
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

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const st = stRef.current;

    const jump = () => { if (st.onGround) { st.vy = JUMP_VY; st.onGround = false; SFX.click(); } };
    const onKey = e => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); } };
    const onTap = () => jump();
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onTap);

    const loop = (now) => {
      if (phaseRef.current !== "play") return;
      const elapsed = now - st.startTime;

      // Physics
      st.vy += GRAVITY;
      st.py += st.vy;
      if (st.py >= GROUND) { st.py = GROUND; st.vy = 0; st.onGround = true; }

      // Speed ramps up over time
      const speed = 3 + elapsed / 4000;

      // Spawn obstacles
      if (now - st.lastObs > 1200 - elapsed / 50) {
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
      ctx.fillStyle = "#000";
      ctx.fillRect(st.px + 4, st.py - 19, 3, 3);

      // Obstacles (themed cacti/blocks)
      ctx.fillStyle = pt.accent;
      st.obstacles.forEach(o => {
        ctx.fillRect(o.x - 6, GROUND + 28 - o.h, 12, o.h);
        ctx.fillRect(o.x - 10, GROUND + 28 - o.h * 0.6, 20, o.h * 0.3);
      });

      // Coins
      ctx.fillStyle = "#FFD700";
      st.coins.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff9";
        ctx.beginPath();
        ctx.arc(c.x - 2, c.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFD700";
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
      canvas.removeEventListener("pointerdown", onTap);
    };
  }, [phase]);

  const score = stRef.current?.score ?? 0;
  const tier = Math.min(4, score);
  const bonusXp = BONUS_XP[tier];
  const bonusCoins = BONUS_COINS[tier];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:16}}>
      {phase === "intro" && (<>
        <div style={{fontSize:36}}>🏃</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent,textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#aaa",textAlign:"center",lineHeight:2.2}}>RUNNER!{"\n"}Saute les obstacles, ramasse les pièces!{"\n"}ESPACE ou TAP pour sauter</div>
        <button onClick={startGame} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#000",border:"none",borderRadius:6,cursor:"pointer",boxShadow:`0 0 16px ${pt.primary}80`}}>COURIR! 🏃</button>
      </>)}

      {phase === "play" && (
        <canvas ref={canvasRef} width={W} height={H}
          style={{border:`3px solid ${pt.accent}`,borderRadius:8,imageRendering:"pixelated",boxShadow:`0 0 20px ${pt.glow||pt.accent}60`,cursor:"pointer"}}/>
      )}

      {phase === "done" && (<>
        <div style={{fontSize:36}}>{tier>=4?"🏆":tier>=3?"🥇":tier>=2?"🥈":tier>=1?"🥉":"😅"}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#fff",marginTop:4}}>PIÈCES: {score} 🪙</div>
        {bonusXp>0&&<div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#FFD700"}}>+{bonusXp} XP  +{bonusCoins} 🪙</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#000",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
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

  const BONUS_XP    = [0, 5, 12, 24, 40];
  const BONUS_COINS = [0, 2,  7, 14, 22];
  const CS = 22; // cell size
  const MOVE_INTERVAL = 180;
  const GHOST_INTERVAL = 260;
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
            ctx.fillStyle = "#FFD700";
            ctx.beginPath();
            ctx.arc(x+CS/2, y+CS/2, 3, 0, Math.PI*2);
            ctx.fill();
          }
        }
      }

      // Pac-man (mouth opens/closes)
      const mouthAngle = (Math.floor(now/80) % 2 === 0) ? 0.3 : 0.05;
      const angle = st.pdir.dx===1 ? 0 : st.pdir.dx===-1 ? Math.PI : st.pdir.dy===1 ? Math.PI/2 : -Math.PI/2;
      ctx.fillStyle = pt.charBodyColor || "#FFD700";
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:12}}>
      {phase === "intro" && (<>
        <div style={{fontSize:36}}>👻</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent,textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#aaa",textAlign:"center",lineHeight:2.2}}>PAC-QUEST!{"\n"}Mange les pellets, évite le fantôme!{"\n"}Flèches ou WASD</div>
        <button onClick={startGame} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#000",border:"none",borderRadius:6,cursor:"pointer",boxShadow:`0 0 16px ${pt.primary}80`}}>JOUER! 👾</button>
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
        {bonusXp>0&&<div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#FFD700"}}>+{bonusXp} XP  +{bonusCoins} 🪙</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#000",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME WHACK — mini-jeu whack-a-mole thématique au level-up
// ═══════════════════════════════════════════════════════════════
function MiniGameWhack({ pt, level, onFinish }) {
  const ROUNDS = 3;
  const ROUND_MS = 1400;
  const BONUS_XP = [0, 8, 18, 30];
  const BONUS_COINS = [0, 4, 10, 18];
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
      else { setTimeout(showNext, 350); }
    }, ROUND_MS);
  }, []);

  const handleHit = (i) => {
    if (phase !== "play" || active !== i) return;
    clearTimeout(timerRef.current);
    scoreRef.current++; setScore(scoreRef.current);
    setActive(-1); SFX.coin();
    roundRef.current++; setRound(roundRef.current);
    if (roundRef.current >= ROUNDS) { setTimeout(() => setPhase("done"), 350); }
    else { setTimeout(showNext, 280); }
  };

  const start = () => {
    roundRef.current = 0; scoreRef.current = 0;
    setRound(0); setScore(0); setPhase("play");
    setTimeout(showNext, 500);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const bonusXp = BONUS_XP[score] ?? 0;
  const bonusCoins = BONUS_COINS[score] ?? 0;
  const stars = Array.from({length:3}, (_,i) => i < score ? "⭐" : "⬛").join(" ");
  const medal = score === 3 ? "🏆" : score >= 2 ? "🥈" : score === 1 ? "🥉" : "😅";
  const msg = score === 3 ? "PARFAIT! 🔥" : score >= 2 ? "Bien joué!" : score === 1 ? "Pas mal!" : "La prochaine fois!";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:20}}>
      {phase === "intro" && (<>
        <div style={{fontSize:40}}>{TARGET}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:pt.accent,textAlign:"center",textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#aaa",textAlign:"center",lineHeight:2.2}}>Mini-jeu!{"\n"}Tape les {TARGET} le plus vite possible!</div>
        <button onClick={start} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#000",border:"none",borderRadius:6,cursor:"pointer",marginTop:8,boxShadow:`0 0 16px ${pt.primary}80`}}>JOUER! 🎮</button>
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
        {bonusXp > 0 && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#FFD700",textShadow:"0 0 8px #FFD700"}}>+{bonusXp} XP · +{bonusCoins} 🪙</div>}
        {bonusXp === 0 && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#555"}}>Pas de bonus cette fois...</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 24px",background:pt.primary,color:"#000",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME ROUTER — choisi aléatoirement au level-up
// ═══════════════════════════════════════════════════════════════
function MiniGame({ player, playerThemeId, level, onFinish }) {
  const pt = getPlayerTheme(playerThemeId || "none");
  const [type] = useState(() => {
    const games = ["whack", "runner", "pacman"];
    return games[Math.floor(Math.random() * games.length)];
  });
  if (type === "runner") return <MiniGameRunner pt={pt} level={level} onFinish={onFinish}/>;
  if (type === "pacman") return <MiniGamePacman pt={pt} level={level} onFinish={onFinish}/>;
  return <MiniGameWhack pt={pt} level={level} onFinish={onFinish}/>;
}

// ═══════════════════════════════════════════════════════════════
// CARRY-OVER MODAL — tâches pending d'hier
// ═══════════════════════════════════════════════════════════════
function CarryOverModal({ config, gameStates, onValidate, onClear, onClose }) {
  const playersWithPending = (config.players||[]).map((p,idx)=>({
    player:p, idx, pending:(gameStates[idx]?.pending||[])
  })).filter(x=>x.pending.length>0);

  if (playersWithPending.length === 0) { onClose(); return null; }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:195,display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 16px",overflowY:"auto"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:"#FFD700",textAlign:"center",marginBottom:6}}>📋 Tâches d'hier</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",textAlign:"center",marginBottom:18,lineHeight:2}}>Ces tâches attendaient encore validation. Que faire?</div>
        {playersWithPending.map(({player,idx,pending})=>(
          <div key={idx} style={{background:"#111",borderRadius:8,padding:14,marginBottom:12,border:`1px solid ${player.color||"#444"}40`}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:player.color||"#FFD700",marginBottom:10}}>
              {player.pseudo||player.name}
              <span style={{color:"#666",fontSize:6}}> · {pending.length} tâche{pending.length>1?"s":""}</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>onValidate(idx)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"8px 0",background:"#1a2e1a",color:"#5D9E34",border:"1px solid #5D9E34",borderRadius:4,cursor:"pointer",flex:1}}>✅ Valider (+XP)</button>
              <button onClick={()=>onClear(idx)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"8px 0",background:"#1a1a1a",color:"#666",border:"1px solid #333",borderRadius:4,cursor:"pointer",flex:1}}>🗑️ Effacer</button>
            </div>
          </div>
        ))}
        <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"10px 24px",background:"#1a1a1a",color:"#888",border:"1px solid #333",borderRadius:6,cursor:"pointer",width:"100%",marginTop:4}}>Fermer</button>
      </div>
    </div>
  );
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
const computeCalendarReminders = (calendar, today) => {
  const t = new Date(today); t.setHours(0,0,0,0);
  return (calendar || []).flatMap(entry => {
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

  // Parent PIN
  const [ppPin, setPpPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const reset = () => {
    setMode("who"); setSelIdx(null);
    setObStep("theme"); setDraftTheme(null); setDraftAvatar({skin:"sk1",eyes:"ey1",mouth:"mo1",hair:"ha1"});
    setDraftPseudo(""); setObFirstPin(""); setObPin("");
    setPPin(""); setConfirmStep(false); setFirstPin("");
    setPpPin(""); setPinError(false);
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
      setPPin(""); setConfirmStep(false); setFirstPin(""); setPinError(false);
      setMode("pin");
    }
  };

  // Returning player PIN
  const handlePlayerDigit = (d) => {
    const ps = gameStates[selIdx] || {};
    const next = (pPin + d).slice(0, 4);
    setPPin(next); setPinError(false);
    if (next.length < 4) return;
    if (!ps.pin) {
      if (!confirmStep) { setFirstPin(next); setPPin(""); setConfirmStep(true); }
      else if (next === firstPin) { onSetPlayerPin(selIdx, next); onSelectPlayer(selIdx); }
      else triggerError(()=>{ setPPin(""); setConfirmStep(false); setFirstPin(""); });
    } else {
      if (next === ps.pin) onSelectPlayer(selIdx);
      else triggerError(()=>setPPin(""));
    }
  };

  // Parent PIN
  const handleParentDigit = (d) => {
    const next = (ppPin + d).slice(0, 4);
    setPpPin(next); setPinError(false);
    if (next.length === 4) {
      if (next === config.pin) { reset(); onParentLogin(); }
      else triggerError(()=>setPpPin(""));
    }
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
  const accentColor = player?.color || "#FFD700";

  const BtnBack = ({onClick, label="← Retour"}) => (
    <button onClick={()=>{SFX.click();onClick();}} style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#444",background:"none",border:"none",cursor:"pointer",marginTop:8}}>{label}</button>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0d0d0d",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 16px",position:"relative",overflow:"hidden"}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 0%,#5DECF520 0%,transparent 60%)",pointerEvents:"none"}}/>

      {/* ── Écran 1 : Tu es...? ── */}
      {mode === "who" && (
        <div style={{textAlign:"center",width:"100%",maxWidth:380}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,2.5vw,15px)",color:"#FFD700",textShadow:"3px 3px 0 #000,0 0 20px #FFD70080",marginBottom:10}}>⚔️ MON LIVRE DE QUÊTES</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:24,color:"#666",marginBottom:36}}>Tu es...?</div>
          <div style={{display:"flex",gap:16,justifyContent:"center"}}>
            {[["🧒","Enfant","#5DECF5",()=>{SFX.click();setMode("child-select");}],
              ["👨‍👩","Parent","#FF8C00",()=>{SFX.click();setMode("parent");setPpPin("");setPinError(false);}]
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
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,2.2vw,13px)",color:"#FFD700",textShadow:"3px 3px 0 #000,0 0 20px #FFD70080",marginBottom:6}}>⚔️ MON LIVRE DE QUÊTES</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#888"}}>Ton guide d'aventurier·ère</div>
          </div>

          <div style={{background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:12,padding:"16px 18px",marginBottom:12}}>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#5DECF5",marginBottom:8}}>💡 C'est quoi cette appli?</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#ccc",lineHeight:1.5}}>
              Tu fais des tâches dans la vraie vie, et ici tu gagnes des XP et des pièces! Monte de niveau, choisis ton thème, débloque des badges et échange tes pièces contre de vraies récompenses. C'est comme un jeu vidéo, mais les points sont vrais. 🎮
            </div>
          </div>

          {[
            ["📋","Tes Quêtes","C'est ici que tu vois ce que tu dois faire (ranger ta chambre, la vaisselle…). Une fois que tu l'as fait, clique «J'AI FAIT ÇA!» et attends que ton parent valide!"],
            ["⚡","XP & Niveaux","Chaque quête validée te donne de l'XP. Plus tu en accumules, plus tu montes de niveau et débloques un titre cool selon ton thème. Il y a 5 niveaux!"],
            ["🪙","Pièces & Boutique","Les quêtes donnent aussi des pièces. Dans la boutique, tu peux acheter des accessoires pour ton perso ET les récompenses créées par tes parents."],
            ["🎨","13 Thèmes","Minecraft, Harry Potter, Marvel, Ghibli, Roblox… Chaque thème change les couleurs et les titres. Tu choisis le tien lors de ton inscription!"],
            ["🏅","Badges","Des badges secrets à débloquer en faisant des tâches. Streaks, premières fois, défis épiques… survole un badge pour voir comment le gagner!"],
            ["📅","Calendrier","Note tes devoirs et examens ici! Un rappel va apparaître automatiquement quand la date approche, avec de l'XP bonus pour compléter."],
            ["🎮","Mini-jeux","Quand tu montes de niveau, un mini-jeu surprise s'active — choisi au hasard! 🎲 Trois jeux possibles: Whack-a-Mole (tape les monstres!), Runner (saute les obstacles!) ou Pac-Quest (mange les pellets, évite le fantôme!). Fais un score parfait pour gagner du XP et des pièces bonus. 🏆"],
            ["🔒","Portail parent","La section Parent est réservée aux adultes (protégée par un code secret). C'est là qu'ils valident tes quêtes et créent des récompenses. Tu peux aussi avoir ton propre code PIN pour protéger ton profil!"],
          ].map(([icon,title,desc])=>(
            <div key={title} style={{display:"flex",gap:12,background:"rgba(0,0,0,0.35)",border:"1px solid #222",borderRadius:8,padding:"10px 14px",marginBottom:8}}>
              <span style={{fontSize:22,flexShrink:0,marginTop:2}}>{icon}</span>
              <div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700",marginBottom:4}}>{title}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#aaa",lineHeight:1.45}}>{desc}</div>
              </div>
            </div>
          ))}

          <div style={{background:"rgba(93,236,245,0.07)",border:"2px solid #5DECF544",borderRadius:10,padding:"12px 16px",marginTop:4,marginBottom:4}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#5DECF5",marginBottom:8}}>⚡ COMMENT GAGNER PLUS D'XP?</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ccc",lineHeight:1.7}}>
              📋 Faire tes quêtes du jour (surtout les épiques!)<br/>
              🔥 Garder un <span style={{color:"#FFD700"}}>streak</span> — plusieurs jours de suite<br/>
              📅 Valider tes devoirs et examens dans le calendrier<br/>
              🎮 Faire un score parfait au mini-jeu de niveau<br/>
              🏅 Débloquer de nouveaux badges
            </div>
          </div>

          <div style={{textAlign:"center",marginTop:4,marginBottom:8}}>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#333",marginBottom:12}}>v{APP_VERSION}</div>
            <button onClick={()=>{SFX.click();setMode("who");}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px 24px",background:"rgba(0,0,0,0.7)",color:"#FFD700",border:"3px solid #FFD700",borderRadius:8,cursor:"pointer",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 0 16px #FFD70055";}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";}}>
              ← RETOUR
            </button>
          </div>
        </div>
      )}

      {/* ── Écran 2 : Qui es-tu? ── */}
      {mode === "child-select" && (
        <div style={{textAlign:"center",width:"100%",maxWidth:380}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,2.5vw,15px)",color:"#FFD700",textShadow:"3px 3px 0 #000,0 0 20px #FFD70080",marginBottom:10}}>⚔️ MON LIVRE DE QUÊTES</div>
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
                  {isNew && <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#2ECC40",fontWeight:"bold"}}>NOUVEAU ✨</span>}
                  {!isNew && psi.pin && <span style={{color:"#444",fontSize:12}}>🔑</span>}
                </button>
              );
            })}
            <button onClick={()=>{SFX.click();onNewSetup?.();}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"14px 16px",background:"rgba(0,0,0,0.5)",color:"#4ade80",border:"3px dashed #4ade8066",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all 0.15s"}}
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
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>🎨 TON THÈME</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#888",marginBottom:4}}>Choisis ton univers</div>
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
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#000",border:"none",borderRadius:6,cursor:"pointer"}}>
                  Continuer →
                </button>
              )}
              <div><BtnBack onClick={()=>{setMode("child-select");setSelIdx(null);}}/></div>
            </div>
          )}

          {/* Étape 2 : Avatar */}
          {obStep === "avatar" && (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>👾 TON AVATAR</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#888",marginBottom:12}}>Crée ton personnage 8-bit</div>
              <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
                <AvatarCanvas avatarDef={draftAvatar} bodyColor={getPlayerTheme(draftTheme||"none").charBodyColor||accentColor} size={80}
                  style={{border:`3px solid ${accentColor}`,borderRadius:8}}/>
              </div>
              <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:10,flexWrap:"wrap"}}>
                {[["hair","Cheveux"],["skin","Peau"],["eyes","Yeux"],["mouth","Bouche"]].map(([k,l])=>(
                  <button key={k} onClick={()=>{setAvatarTab(k);SFX.click();}}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 8px",background:avatarTab===k?accentColor:"#1a1a1a",color:avatarTab===k?"#000":"#666",border:`2px solid ${avatarTab===k?accentColor:"#333"}`,borderRadius:3,cursor:"pointer"}}>
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
                        <div style={{width:24,height:12,background:h.color,borderRadius:"3px 3px 0 0",border:"1px solid #000"}}/>
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
                        <div style={{width:24,height:24,background:s.color,borderRadius:3,border:"1px solid #000"}}/>
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
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#000",border:"none",borderRadius:6,cursor:"pointer"}}>
                Continuer →
              </button>
              <div><BtnBack onClick={()=>setObStep("theme")}/></div>
            </div>
          )}

          {/* Étape 3 : Surnom */}
          {obStep === "pseudo" && (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>✏️ TON SURNOM</div>
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
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#000",border:"none",borderRadius:6,cursor:"pointer"}}>
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
                {obStep==="pin-create" ? "CRÉE TON CODE SECRET" : "CONFIRME TON CODE"}
              </div>
              {obStep==="pin-create"&&<div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:12}}>4 chiffres que tu n'oublieras jamais... promis</div>}
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
            onBack={()=>setPPin(p=>p.slice(0,-1))}
            onClose={()=>{ confirmStep?(setConfirmStep(false),setFirstPin(""),setPPin("")):(setMode("child-select"),setSelIdx(null)); }}
          />
        </div>
      )}

      {/* ── PIN parent ── */}
      {mode === "parent" && (
        <div style={{background:"rgba(0,0,0,0.85)",border:"3px solid #FF8C00",borderRadius:12,padding:"24px 28px",textAlign:"center",maxWidth:300,width:"100%"}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#FF8C00",marginBottom:16}}>🔐 PIN PARENT</div>
          <PinDots value={ppPin} error={pinError} color="#FF8C00"/>
          <PinKeypad
            onDigit={handleParentDigit}
            onBack={()=>setPpPin(p=>p.slice(0,-1))}
            onClose={()=>{setMode("who");setPpPin("");setPinError(false);}}
          />
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
  const [pendingValidation, setPendingValidation] = useState(null); // {ass,playerId,playerIdx,clickX,clickY}
  const [parentPinOpen, setParentPinOpen] = useState(false);
  const [parentMode, setParentMode] = useState(false);
  const [parentPanel, setParentPanel] = useState(false); // slide-out panel
  const [actionLog, setActionLog] = useState([]); // [{time,msg,color}]
  const [undoStack, setUndoStack] = useState([]);
  const [pinChangeMode, setPinChangeMode] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [toast, setToast] = useState(null);
  const [rewardPopup, setRewardPopup] = useState(null);
  const [miniGame, setMiniGame] = useState(null); // {player,playerIdx,level,playerThemeId,pendingReward}
  const [carryoverModal, setCarryoverModal] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i); },[]);

  // Load + migration automatique des données
  useEffect(()=>{
    load().then(raw=>{
      const data = migrateSavedData(raw);
      if(data?.config&&data?.gameStates){
        setConfig(data.config);
        setGameStates(data.gameStates);
        // Injecter les nouvelles versions dans le feed famille
        if(data.newChangelogVersions?.length){
          const newEntries = data.newChangelogVersions
            .map(v=>CHANGELOG.find(c=>c.version===v))
            .filter(Boolean)
            .map(c=>({ type:"update", version:c.version, features:c.features, ts:new Date().toISOString() }));
          setConfig(cfg=>({...cfg, updateFeedEntries:[...(cfg.updateFeedEntries||[]),...newEntries]}));
          // Sauvegarder les seenVersions pour ne pas réafficher
          save({...data, config:data.config, newChangelogVersions:[]});
        }
        // Carry-over: si date changée et des tâches pending → proposer report
        const savedDate = data.savedAt ? new Date(data.savedAt).toDateString() : null;
        if (savedDate && savedDate !== new Date().toDateString()) {
          const hasPending = data.gameStates.some(gs=>(gs.pending||[]).length>0);
          if (hasPending) setCarryoverModal(true);
        }
        setScreen("login");
      } else setScreen("login");
    });
  },[]);

  const persist = useCallback((cfg,gs) => save({config:cfg,gameStates:gs,savedAt:new Date().toISOString()}), []);

  const showToast = useCallback((msg,color="",dur=3000)=>{ setToast({msg,color}); setTimeout(()=>setToast(null),dur); },[]);
  const logAction = useCallback((msg,color="#FF8C00")=>{
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
  const requestComplete = useCallback((ass,playerId,evt) => {
    const playerIdx = config.players.findIndex(p=>p.id===playerId);
    if(playerIdx<0)return;
    const gs=gameStates[playerIdx];
    const doneKey=ass.instanceId+"_"+playerId;
    if(gs.completed?.includes(doneKey)||gs.pending?.includes(doneKey))return;
    const rect=evt?.target?.getBoundingClientRect?.()||{left:window.innerWidth/2,top:window.innerHeight/2,width:0,height:0};
    setPendingValidation({ass,playerId,playerIdx,clickX:rect.left+rect.width/2,clickY:rect.top+rect.height/2,doneKey});
    // mark pending
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],pending:[...new Set([...(n[playerIdx].pending||[]),doneKey])]}; persist(config,n); return n; });
  },[config,gameStates,persist]);

  // PIN success
  const handlePinSuccess = useCallback(()=>{
    if(!pendingValidation)return;
    const {ass,playerId,playerIdx,clickX,clickY,doneKey}=pendingValidation;
    setPendingValidation(null);
    const task=(config.customTasks||[]).concat(TASK_CATALOG).find(t=>t.id===ass.taskId);
    if(!task)return;
    const player=config.players[playerIdx];
    setGameStates(gs=>{
      const p=gs[playerIdx];
      const prevLv=getLevel(p.xp).level;
      const newXp=p.xp+task.xp, newCoins=p.coins+task.coins;
      const newLv=getLevel(newXp).level;
      // Count tasks done today for streak badge
      const today=new Date().toDateString();
      const todayCount=(p.completed||[]).filter(k=>k.startsWith(today)).length+1;
      const updatedPs={...p,xp:newXp,coins:newCoins,completed:[...new Set([...(p.completed||[]),doneKey])],pending:(p.pending||[]).filter(k=>k!==doneKey)};
      const newBadgeIds=checkBadges(updatedPs,player,todayCount);
      if(newBadgeIds.length) updatedPs.badges=[...(p.badges||[]),...newBadgeIds];
      const n=[...gs]; n[playerIdx]=updatedPs;
      persist(config,n);
      setUndoStack(u=>[...u.slice(-9),{doneKey,playerIdx,xp:task.xp,coins:task.coins}]);
      const pendingRwd={task,player,newBadges:newBadgeIds.map(id=>BADGES.find(b=>b.id===id)).filter(Boolean)};
      setTimeout(()=>{
        spawnParticles(task.emoji);
        if(task.xp>=35){SFX.epic();}else{SFX.task();}
        setTimeout(()=>showToast(FUNNY_MSGS[Math.floor(Math.random()*FUNNY_MSGS.length)],"#555",2800),1400);
        if(prevLv<newLv){
          setMiniGame({player,playerIdx,level:newLv,playerThemeId:player.themeId||"none",pendingReward:pendingRwd});
        } else {
          setRewardPopup(pendingRwd);
        }
      },100);
      return n;
    });
  },[pendingValidation,config,persist]);

  const handlePinCancel = useCallback(()=>{
    if(!pendingValidation)return;
    const {playerIdx,doneKey}=pendingValidation;
    setPendingValidation(null);
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],pending:(n[playerIdx].pending||[]).filter(k=>k!==doneKey)}; persist(config,n); return n; });
  },[pendingValidation,config,persist]);

  // Mini-game ended — apply bonus then show reward popup
  const handleMiniGameEnd = useCallback((bonusXp,bonusCoins)=>{
    if(!miniGame)return;
    const {playerIdx,pendingReward}=miniGame;
    setMiniGame(null);
    if(bonusXp>0||bonusCoins>0){
      setGameStates(gs=>{
        const n=[...gs];
        n[playerIdx]={...n[playerIdx],xp:n[playerIdx].xp+bonusXp,coins:n[playerIdx].coins+bonusCoins};
        persist(config,n);
        return n;
      });
      showToast(`🎮 Bonus mini-jeu! +${bonusXp} XP · +${bonusCoins} 🪙`,"#FFD700",4000);
    }
    setRewardPopup(pendingReward);
  },[miniGame,config,persist,showToast]);

  // Carry-over: valider toutes les tâches pending d'un joueur (leur donner XP)
  const handleCarryoverValidate = useCallback((playerIdx)=>{
    setGameStates(gs=>{
      const p=gs[playerIdx];
      const pending=p.pending||[];
      let bonusXp=0,bonusCoins=0;
      const newCompleted=[...(p.completed||[])];
      pending.forEach(key=>{
        const instanceId=key.slice(0,key.lastIndexOf("_"));
        const ass=(config.assignments||[]).find(a=>a.instanceId===instanceId);
        if(ass){
          const task=[...(config.customTasks||[]),...TASK_CATALOG].find(t=>t.id===ass.taskId);
          if(task){bonusXp+=task.xp;bonusCoins+=task.coins;}
          if(!newCompleted.includes(key))newCompleted.push(key);
        }
      });
      const n=[...gs];
      n[playerIdx]={...p,xp:p.xp+bonusXp,coins:p.coins+bonusCoins,completed:newCompleted,pending:[]};
      persist(config,n);
      return n;
    });
    showToast("✅ Tâches validées!","#5D9E34");
  },[config,persist,showToast]);

  // Carry-over: effacer les pending sans XP
  const handleCarryoverClear = useCallback((playerIdx)=>{
    setGameStates(gs=>{
      const n=[...gs];
      n[playerIdx]={...n[playerIdx],pending:[]};
      persist(config,n);
      return n;
    });
  },[config,persist]);

  // Buy / equip
  const handleBuy = useCallback((item,playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{
      const p=gs[idx];
      const isReward=!item.slot;
      if(p.coins<item.cost)return gs;
      SFX.buy();
      const n=[...gs]; n[idx]={...p,coins:p.coins-item.cost,owned:[...new Set([...(p.owned||[]),item.id])],boughtRewards:isReward?[...new Set([...(p.boughtRewards||[]),item.id])]:p.boughtRewards,equipped:item.slot?{...(p.equipped||{}),[item.slot]:item.id}:(p.equipped||{})};
      persist(config,n);
      showToast(`🎉 ${item.emoji} ${item.name||item.label} acheté!`,"#FFD700");
      spawnParticles(item.emoji||"🎉");
      return n;
    });
  },[config,persist,showToast]);

  const handleUpdateAvatar = useCallback((avatarDef, playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{ const n=[...gs]; n[idx]={...n[idx],avatar:avatarDef}; persist(config,n); return n; });
  },[config,persist]);

  const handleEquip = useCallback((item,playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{ const n=[...gs]; n[idx]={...n[idx],equipped:{...(n[idx].equipped||{}),[item.slot]:item.id}}; persist(config,n); return n; });
    showToast(`✅ ${item.emoji} équipé!`,"#2ECC40");
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
    logAction(`↩️ ${player?.name}: tâche annulée (${task?.label||doneKey})`,"#FF8C00");
    showToast(`↩️ Tâche annulée pour ${player?.name}`,"#FF8C00");
  },[config,persist,logAction,showToast]);

  const handleAdjustXP = useCallback((playerIdx, delta) => {
    const player = config.players[playerIdx];
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],xp:Math.max(0,n[playerIdx].xp+delta),coins:Math.max(0,n[playerIdx].coins+(delta>0?Math.abs(Math.floor(delta/2)):0))}; persist(config,n); return n; });
    logAction(`${delta>0?"+":""}${delta} XP → ${player?.name}`,"#5DECF5");
    showToast(`${delta>0?"+":""}}${delta} XP pour ${player?.name}`,"#5DECF5");
  },[config,persist,logAction,showToast]);

  const handleForceComplete = useCallback((ass, playerId) => {
    const playerIdx=config.players.findIndex(p=>p.id===playerId); if(playerIdx<0)return;
    const player=config.players[playerIdx];
    const doneKey=ass.instanceId+"_"+playerId;
    const task=[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId);
    if(!task)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      if(p.completed?.includes(doneKey))return gs;
      n[playerIdx]={...p,xp:p.xp+task.xp,coins:p.coins+task.coins,
        completed:[...new Set([...(p.completed||[]),doneKey])],
        pending:(p.pending||[]).filter(k=>k!==doneKey)};
      persist(config,n); return n; });
    logAction(`✅ Override: ${player?.name} — ${task.label}`,"#2ECC40");
    showToast(`✅ Tâche forcée pour ${player?.name}`,"#2ECC40");
    spawnParticles(task.emoji);
  },[config,persist,logAction,showToast]);

  const handleResetPlayer = useCallback((playerIdx) => {
    const player=config.players[playerIdx];
    if(!window.confirm(`Reset ${player?.name}? XP, pièces et tâches seront à 0.`))return;
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={xp:0,coins:0,completed:[],pending:[],owned:[],equipped:{},boughtRewards:[],badges:[],avatar:n[playerIdx].avatar}; persist(config,n); return n; });
    logAction(`🔄 Reset complet: ${player?.name}`,"#FF4444");
    showToast(`🔄 ${player?.name} réinitialisé`,"#FF4444");
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
      showToast("📥 Config importée!","#2ECC40");
      logAction("📥 Config importée","#2ECC40");
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
    showToast("↩️ Action annulée!","#FF8C00");
  },[undoStack,config,persist,showToast]);

  const allTasks = [...TASK_CATALOG,...(config?.customTasks||[])];
  const allRewards = [...REWARD_CATALOG,...(config?.customRewards||[])];
  // Resolve week theme (random_week → pick based on current week number)
  const weekNum = Math.ceil(new Date().getDate()/7) + new Date().getMonth()*4;
  const resolvedWeekTheme = config?.theme==="random_week"
    ? THEMES[resolveWeekRandomTheme(weekNum)] || THEMES.minecraft
    : THEMES[config?.theme||"minecraft"];
  const th = resolvedWeekTheme;

  // Clock display
  const H=String(now.getHours()).padStart(2,"0"), M=String(now.getMinutes()).padStart(2,"0"), S=String(now.getSeconds()).padStart(2,"0");
  const daysArr=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],mthArr=["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];
  const dateStr=`${daysArr[now.getDay()]} ${now.getDate()} ${mthArr[now.getMonth()]}`;

  // Day progress (routine: 6h–routineEnd, week: Mon–Sun)
  const dayPct = useMemo(()=>{
    if(!config)return 0;
    if(config.mode==="routine"){ const [eh,em]=(config.routineEnd||"08:30").split(":").map(Number); const s=new Date();s.setHours(6,0,0,0); const e=new Date();e.setHours(eh,em,0,0); return Math.max(0,Math.min(100,((now-s)/(e-s))*100)); }
    if(config.mode==="week"){ return Math.round((todayDayIdx/6)*100); }
    return 0;
  },[config,now,todayDayIdx]);

  if(screen==="loading") return <div style={{minHeight:"100vh",background:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{GLOBAL_CSS}</style><div style={{fontFamily:"'Press Start 2P',monospace",fontSize:12,color:"#FFD700",animation:"pulse 1s infinite"}}>⚔️ Chargement…</div></div>;
  if(screen==="setup") return <SetupWizard existing={null} onDone={handleSetupDone}/>;
  if(screen==="login") return <LoginScreen config={config} gameStates={gameStates}
    onSelectPlayer={(idx)=>{ setView(idx); setScreen("game"); SFX.click(); }}
    onParentLogin={()=>{ setParentMode(true); setView("family"); setScreen("game"); SFX.click(); }}
    onNewSetup={()=>setScreen("setup")}
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
    <div className="game-root" style={{minHeight:"100vh",background:th.bg,position:"relative",overflowX:"hidden"}}>
      <style>{GLOBAL_CSS+`
        .nav-btn:hover{opacity:0.85;}
        .task-card:hover{transform:translateY(-1px);}
      `}</style>
      <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at 30% 0%,${th.primary}18 0%,transparent 60%)`,zIndex:0,pointerEvents:"none"}}/>

      {/* ── HEADER ── */}
      <div style={{position:"sticky",top:0,zIndex:100,background:`linear-gradient(135deg,${th.bg}EE,#1a1a1aEE)`,borderBottom:`5px solid ${th.accent}`,padding:"8px 12px",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        {/* Title + mode badge */}
        <div style={{flex:1,minWidth:120}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,12px)",color:th.accent,textShadow:"2px 2px 0 #000"}}>{currentPlayer ? `⚔️ Les quêtes de ${displayName(currentPlayer)}` : "⚔️ LIVRE DE QUÊTES"}</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888"}}>{config.mode==="routine"?"Mode Routine ⏰":"Mode Semaine 📅"} — {th.name}</div>
        </div>
        {/* Clock */}
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(14px,2.5vw,22px)",color:"#5DECF5",textShadow:`0 0 12px #5DECF5`,animation:"clkPulse 1s infinite alternate"}}>{H}:{M}:{S}</div>
        {/* Date */}
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"#666"}}>{dateStr}</div>
        {/* Parent controls */}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>{SFX.click();if(parentMode){setParentPanel(p=>!p);}else{setParentPinOpen(true);}}}
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 12px",
              background:parentMode?"#FF8C00":"#222",color:parentMode?"#000":"#888",
              border:`2px solid ${parentMode?"#FF8C00":"#444"}`,borderRadius:3,cursor:"pointer",
              boxShadow:parentMode?"0 0 10px #FF8C0060":"none"}}>
            {parentMode?"🔓 PARENT ▸":"🔐"}
          </button>
        </div>
      </div>

      {/* ── ROUTINE COUNTDOWN (sticky below header) ── */}
      {config.mode==="routine"&&<div style={{position:"sticky",top:72,zIndex:90,padding:"6px 12px",background:`${th.bg}EE`,backdropFilter:"blur(6px)"}}><Countdown endTime={config.routineEnd||"08:30"} th={th}/></div>}

      {/* ── DAY PROGRESS ── */}
      <div style={{padding:"6px 12px",background:"rgba(0,0,0,0.55)",borderBottom:"2px solid #333"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>{config.mode==="routine"?"6h00":"Lun"}</span>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:th.accent}}>
            {config.mode==="routine"?"⏱ Progression":"📅 Semaine — "+DAYS_SHORT[todayDayIdx]}
          </span>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>{config.mode==="routine"?config.routineEnd:"Dim"}</span>
        </div>
        <div style={{height:12,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden",position:"relative"}}>
          <div style={{height:"100%",width:dayPct+"%",background:`linear-gradient(90deg,${th.primary},${th.accent})`,transition:"width 1s ease",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)",animation:"shimmer 2s infinite"}}/>
          </div>
          {config.mode==="week"&&DAYS_SHORT.map((d,i)=><div key={i} style={{position:"absolute",top:0,left:`${(i/6)*100}%`,width:1,height:"100%",background:"rgba(255,255,255,0.1)"}}/>)}
        </div>
      </div>

      {/* ── PLAYER NAV ── */}
      <div style={{display:"flex",gap:0,background:"rgba(0,0,0,0.6)",borderBottom:"2px solid #333",overflowX:"auto"}}>
        <button onClick={()=>{setView("family");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="family"?th.accent:"transparent",color:view==="family"?"#000":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          👨‍👩‍👧‍👦 Famille
        </button>
        {config.players.map((pl,i)=>(
          <button key={pl.id} onClick={()=>{setView(i);SFX.click();}} className="nav-btn"
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view===i?pl.color:"transparent",color:view===i?"#000":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,borderBottom:view===i?`3px solid ${pl.color}`:"none",textShadow:view===i?"none":`0 0 8px ${getPlayerTheme(pl.themeId).glow}40`}}>
            {displayName(pl)}
          </button>
        ))}
        {config.mode==="week"&&<button onClick={()=>{setView("week");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="week"?th.accent:"transparent",color:view==="week"?"#000":"#888",border:"none",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,marginLeft:"auto"}}>
          📅 Semaine
        </button>}
      </div>

      {/* ── CONTENT ── */}
      <div style={{position:"relative",zIndex:10,maxWidth:view==="week"?"100%":900,margin:"0 auto"}}>
        {view==="family"&&(
          <FamilyOverview config={config} gameStates={gameStates} allTasks={allTasks} onSelectPlayer={i=>{setView(i);SFX.click();}} th={th}/>
        )}
        {typeof view==="number"&&(
          <PlayerDashboard
            player={config.players[view]}
            playerIdx={view}
            pState={gameStates[view]||{xp:0,coins:0,completed:[],pending:[],owned:[],equipped:{},boughtRewards:[],calendar:[]}}
            config={config}
            assignments={config.assignments}
            allTasks={allTasks}
            allRewards={allRewards}
            onRequestComplete={requestComplete}
            onBuy={handleBuy}
            onEquip={handleEquip}
            parentMode={parentMode}
            onDeComplete={handleDeComplete}
            onForceComplete={handleForceComplete}
            onUpdateCalendar={(newCal)=>{
              const gs=[...gameStates];
              gs[view]={...gs[view],calendar:newCal};
              setGameStates(gs);
              save({config,gameStates:gs,savedAt:new Date().toISOString()});
            }}
            onCalendarAdd={(type)=>{
              const XP_CAL=5, COINS_CAL=2;
              setGameStates(gs=>{
                const n=[...gs];
                n[view]={...n[view],xp:(n[view].xp||0)+XP_CAL,coins:(n[view].coins||0)+COINS_CAL};
                persist(config,n); return n;
              });
              const label=type==="examen"?"📝 Examen noté!":"📚 Devoir noté!";
              showToast(`${label} +${XP_CAL} XP · +${COINS_CAL} 🪙`,"#5DECF5",3000);
            }}
            th={th}
          />
        )}
        {view==="week"&&config.mode==="week"&&(
          <div style={{padding:12}}>
            <WeekView config={config} gameState={gameStates[0]||{completed:[]}} onCompleteTask={(ass,pid,dayIdx)=>{}} th={th} todayDayIdx={todayDayIdx}/>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {pendingValidation&&(
        <PinPad pin={config.pin} label={`${(allTasks.find(t=>t.id===pendingValidation.ass.taskId))||{emoji:"",label:"Tâche"}}`.length>0?`${allTasks.find(t=>t.id===pendingValidation.ass.taskId)?.emoji||""} ${allTasks.find(t=>t.id===pendingValidation.ass.taskId)?.label||"Tâche"}`:"Tâche"} onSuccess={handlePinSuccess} onCancel={handlePinCancel} th={th}/>
      )}
      {/* Parent Panel slide-out */}
      {parentMode && parentPanel && (
        <ParentPanel
          config={config} gameStates={gameStates} parentMode={parentMode}
          actionLog={actionLog} undoStack={undoStack} players={config.players} th={th}
          onClose={()=>setParentPanel(false)}
          onUndo={handleUndo}
          onReset={()=>{ if(window.confirm("Reset tous les joueurs?")){ config.players.forEach((_,i)=>handleResetPlayer(i)); } }}
          onResetPlayer={handleResetPlayer}
          onAdjustXP={handleAdjustXP}
          onChangePin={handleChangePin}
          onExport={handleExport}
          onImport={handleImport}
          onSetup={()=>{ setScreen("setup"); setParentPanel(false); }}
        />
      )}

      {parentPinOpen&&(
        <PinPad pin={config.pin} label="Accès mode parent" onSuccess={()=>{setParentMode(p=>!p);setParentPinOpen(false);showToast(parentMode?"🔒 Mode parent désactivé":"🔓 Mode parent activé!","#FF8C00");}} onCancel={()=>setParentPinOpen(false)} th={th}/>
      )}
      {rewardPopup&&(
        <RewardPopup task={rewardPopup.task} player={rewardPopup.player} newBadges={rewardPopup.newBadges||[]} onClose={()=>{setRewardPopup(null);SFX.click();}} th={th}/>
      )}
      {miniGame&&(
        <MiniGame player={miniGame.player} playerThemeId={miniGame.playerThemeId} level={miniGame.level} onFinish={handleMiniGameEnd}/>
      )}
      {carryoverModal&&(
        <CarryOverModal
          config={config} gameStates={gameStates}
          onValidate={(idx)=>{ handleCarryoverValidate(idx); const rem=gameStates.filter((gs,i)=>i!==idx&&(gs.pending||[]).length>0); if(!rem.length) setCarryoverModal(false); }}
          onClear={(idx)=>{ handleCarryoverClear(idx); const rem=gameStates.filter((gs,i)=>i!==idx&&(gs.pending||[]).length>0); if(!rem.length) setCarryoverModal(false); }}
          onClose={()=>setCarryoverModal(false)}
        />
      )}
      {toast&&<Toast msg={toast.msg} color={toast.color}/>}

      {/* ── VERSION FOOTER ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"5px 12px",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",zIndex:50,borderTop:"1px solid #222"}}>
        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#444"}}>Livre de Quêtes v{APP_VERSION}</span>
        <button
          onClick={()=>{
            const subject=encodeURIComponent(`[Bug v${APP_VERSION}] `);
            const body=encodeURIComponent(`Version: ${APP_VERSION}\nDate: ${new Date().toLocaleString("fr-CA")}\n\nDécris le bug ici:\n\n`);
            window.location.href=`mailto:${BUG_EMAIL}?subject=${subject}&body=${body}`;
          }}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"3px 8px",background:"transparent",color:"#444",border:"1px solid #333",borderRadius:3,cursor:"pointer"}}
          title="Rapporter un bug"
        >🐛 bug</button>
      </div>
    </div>
  );
}
