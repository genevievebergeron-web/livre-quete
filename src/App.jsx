import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";

const APP_VERSION = "1.95.0";
// Tampon de date locale (YYYY-MM-DD) — sert à réinitialiser les tâches chaque jour
// tout en restant compatible avec la fusion multi-appareils (chaque jour = clé distincte).
const todayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const BUG_EMAIL = "sturnus.vulgaris.linnaeus@proton.me";

// ─── RÉGLAGES D'ACCESSIBILITÉ (neurodivergence) ───────────────
// Drapeaux globaux pilotés par App selon les réglages de l'enfant affiché.
let SFX_MUTED = false; // couper le son
let CALM = false;      // mode calme : pas de confettis/particules, animations réduites (+ classe CSS)

// ─── AUDIO ────────────────────────────────────────────────────
let _ac = null;
const ac = () => { try { if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)(); _ac.resume(); return _ac; } catch { return null; } };
const tone = (f, type, dur, vol, delay = 0) => {
  if (SFX_MUTED) return; // son coupé (réglage enfant)
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

// Courbe plus exigeante + 10 niveaux (les enfants trouvaient ça trop facile).
// Les paliers 1→4 restent proches pour ne RÉTROGRADER personne; ça devient dur après.
const LEVELS = [
  { level:1,  xpNeeded:0,    title:"Débutant",   titleF:"Débutante"   },
  { level:2,  xpNeeded:70,   title:"Aventurier", titleF:"Aventurière" },
  { level:3,  xpNeeded:150,  title:"Héros",      titleF:"Héroïne"     },
  { level:4,  xpNeeded:300,  title:"Champion",   titleF:"Championne"  },
  { level:5,  xpNeeded:500,  title:"LÉGENDE",    titleF:"LÉGENDE"     },
  { level:6,  xpNeeded:760,  title:"MYTHIQUE",   titleF:"MYTHIQUE"    },
  { level:7,  xpNeeded:1080, title:"MYTHIQUE",   titleF:"MYTHIQUE"    },
  { level:8,  xpNeeded:1480, title:"DIVIN",      titleF:"DIVIN"       },
  { level:9,  xpNeeded:1980, title:"DIVIN",      titleF:"DIVIN"       },
  { level:10, xpNeeded:2600, title:"SUPRÊME",    titleF:"SUPRÊME"     },
];
const getLevel = xp => { let c = LEVELS[0]; for (const l of LEVELS) if (xp >= l.xpNeeded) c = l; return c; };
const getLevelTitle = (xp, themeId) => {
  const lv = getLevel(xp);
  const pt = getPlayerTheme(themeId);
  // Niv. 1–5 : titre du thème. Niv. 6+ (prestige) : titre générique MYTHIQUE/DIVIN/SUPRÊME.
  const title = lv.level <= 5 ? (pt.levels[Math.min(lv.level - 1, 4)] || pt.levels[0]) : lv.title;
  return { level: lv.level, title };
};
const xpBar = xp => { for (let i=0;i<LEVELS.length-1;i++) if (xp<LEVELS[i+1].xpNeeded) return { cur: xp-LEVELS[i].xpNeeded, needed: LEVELS[i+1].xpNeeded-LEVELS[i].xpNeeded }; return {cur:1,needed:1}; };

// ─── FAMILIERS qui ÉVOLUENT ───────────────────────────────────
// Chaque familier a sa propre XP (gameState.petXp[petId]), conservée même déséquipé.
// Le familier équipé gagne de l'XP quand l'enfant accomplit une quête.
const PET_LEVELS = [0, 50, 130, 250, 410, 610, 860, 1160, 1520, 1940, 2240, 2600]; // v1.57.0 — 12 niveaux; évolutions aux niveaux 4 / 8 / 12 (Légendaire)
const PET_STAGES = ["Bébé","Bébé","Petit","Jeune","Jeune","Ado","Ado","Adulte","Adulte","Vétéran","Champion","Légendaire"];
const PET_DAILY_CAP = 50;                                             // v1.52.0 — XP max gagné PAR JOUR par le familier (anti-grind : il grandit en prenant soin de lui chaque jour, pas en farmant d'un coup)
const petLevel = (xp) => { let lv=1; for (let i=0;i<PET_LEVELS.length;i++) if ((xp||0) >= PET_LEVELS[i]) lv=i+1; return lv; };
const petStage = (xp) => PET_STAGES[Math.min(petLevel(xp)-1, PET_STAGES.length-1)];
const petBar   = (xp) => { const lv=petLevel(xp); if (lv >= PET_LEVELS.length) return {cur:1,needed:1,max:true}; const base=PET_LEVELS[lv-1], next=PET_LEVELS[lv]; return { cur:(xp||0)-base, needed:next-base, max:false }; };
const mergePetXp = (a, b) => { const out={...(a||{})}; for (const k in (b||{})) out[k]=Math.max(out[k]||0, b[k]||0); return out; };

// ─── SPRITES PIXEL-ART DES FAMILIERS (v1.56.0) ───────────────
// Chaque familier = grille 16×16 (chaîne par ligne) + palette de base. Le caractère mappe une couleur.
// '.' = transparent. Recoloré par élément à l'évolution (voir PET_ELEMENTS).
const PET_SPRITES = {
  cat:{rows:["....o....o......","...oao..oao.....","...obo..obo.....","...obboooobo....","...obbbbbbbo....","...obeobbeobo...","...obbbwwbbbo...","...obbbbbbbbo...","....obbbbbbo....","....obbbbbbo..o.","....obbbbbbo.oao",".....obbbbbooao.",".....obbbbbbbao.",".....oobaabaooo.","......oooooo...."],
    pal:{o:"#5A3A1E",b:"#C9A06A",a:"#F0DCC0",e:"#2B2B2B",w:"#FF8FA3"}},
  dog:{rows:["...obboooobbo...","..oabbbbbbbbao..",".oaabbbbbbbbaao.",".oaabeobboebaao.",".oabbbbwwbbbbao.",".oabbbbbbbbbbao.","..obbbbbbbbbbo..","..obbbbbbbbbbo..","...obbbbbbbbo...","...obbbbbbbbo.o.","...obbbbbbbboao.","...oobaabaaooo..","....oooooooo...."],
    pal:{o:"#4A3220",b:"#D9A066",a:"#A6692F",e:"#2B2B2B",w:"#3A2A1A"}},
  wolf:{rows:["..............o.","..d..........oao",".dao........obbo",".daaoooooooobbbn",".daaaaaaaaabbben",".daaaaaaaaabbbbn",".obaaaaaaaabbbbo","..obbbbbbbbbbbo.","..o..oo..oo..o..","..o..oo..oo..o..","..ooo.oo..oo.oo."],
    pal:{o:"#2E3440",b:"#8A93A0",a:"#9AA3B0",d:"#D8DEE9",e:"#FFD24D",n:"#1A1A1A"}},
  fox:{rows:["..o........o....",".oao......oao...",".obbo....obbo...",".obbboooobbbo...",".obbbbbbbbbbbo..",".obeobbbbbbeobo.",".obbcccccccbbo..","..occcnnnccco...","..obcccccccbo...","..obbbbbbbbbo...","...obbbbbo..ddd.","...obbbbbo.dcccd","...obbbbbo.ddddo","...oobaabaooo...","....ooooooo....."],
    pal:{o:"#7A2E00",b:"#E8742E",a:"#FFF6EC",c:"#FFFFFF",e:"#2B2B2B",n:"#1A1A1A",d:"#FFFFFF"}},
  dragon:{rows:["...d......d.....","..dod....dod....","...obboooobbo...","w..obbbbbbbbo..w","ww.obeobbeobo.ww","wwwobbbnnbbbowww","wwwobbbbbbbbowww",".w.obbbbbbbbo.w.","...obbbbbbbbo..d","...obbbbbbbbo.dd","...oobaabbaoboo.","....oooooooooo.."],
    pal:{o:"#1E5E2A",b:"#4FB05A",a:"#BFF0A0",e:"#FFD24D",n:"#2B2B2B",d:"#FFD24D",w:"#2E8B40"}},
  parrot:{rows:["....obbo........","...obbbbo.......","...obbbbo.......","...obeobboooo...","...obbbobkk.....","...obbbobkk.....","..owbbbbbo......",".owwbbbbbbo.....",".owwbbbbbbo.....",".owwbbbbbbo.....","..owbbbbbbo.....","...obbbbbbo.....","...obtttbbo.....","...otttttto.....","....ot..to......"],
    pal:{o:"#145A24",b:"#2ECC55",w:"#1E8B3A",e:"#2B2B2B",k:"#FFB02E",t:"#FF3B3B"}},
  owl:{rows:["....o......o....","...obo....obo...","..oobboooobboo..",".obbbbbbbbbbbbo.",".obbbbbbbbbbbbo.",".obeeebbbbeeebo.",".obepebbbbepebo.",".obeeebkkbeeebo.",".obbbbbkkbbbbbo.",".obwbbbbbbbbwbo.",".obwbbbbbbbbwbo.","..obbbbbbbbbbo..","..obbbbbbbbbbo..","...obbttttbbo...","....oobbbboo....",".....obbbbo....."],
    pal:{o:"#4A2E12",b:"#A9763E",w:"#7E5424",e:"#FFFFFF",p:"#2B2B2B",k:"#FFB02E",t:"#FFB02E"}},
  duck:{rows:["................","....oooo........","...obbbbo.......","...obeobo.......","...obbboKK......","..obbbbboK......",".obbbbbbbo......",".obbbbbbbbo.....",".obbbbbbbbo.....",".obbbbbbbbo.....","..obbbbbbo......","...oooooo.......","....t..t........"],
    pal:{o:"#B8860B",b:"#FFD21E",e:"#2B2B2B",K:"#FF8C1A",t:"#FF8C1A"}},
  worm:{rows:["................",".....ooooo......","....obbbbbo.....","....obeobeo.....","....ossssso.....",".....obbbo......","....obbbbbo.....","...obbsssbbo....","..obbbbbbbbbo...","..obsssbsssbo...",".obbbbbbbbbbbo..","..obsssbsssbo...","...obbbbbbbo....","....ooooooo....."],
    pal:{o:"#A85A6A",b:"#F2A8B2",s:"#C97888",e:"#2B2B2B"}},
  capybara:{rows:["................","...oo.......oo..","..obboooooobbo..",".obbbbbbbbbbbbo.",".obbbbbbbbbbbbo.",".obebbbbbbbbebo.",".obbbbbbbbbbbbo.",".obbbbbbbbbbbbo.",".obbbbnnnnbbbbo.",".obbbbbbbbbbbbo.",".obbbbbbbbbbbbo.","..ooo.oo.oo.ooo.","..o.....o....o.."],
    pal:{o:"#5A3A1E",b:"#9A6B3A",e:"#2B2B2B",n:"#6A4A28"}},
  bee:{rows:["...d......d.....","....o....o......","...ooooooooo....","..obeobbbeobo...",".woooooooooooow.","wwoyyyyyyyyyyoww",".woobbbbbbbboow.","wwoyyyyyyyyyyoww",".wooobbbbbbooww.","...oyyyyyyyyo...","....obbbbbbo....",".....oyyyyo.....","......osso......",".......oo......."],
    pal:{o:"#3A2A00",y:"#FFD21E",b:"#2B2B2B",w:"#CFE8FF",d:"#2B2B2B",s:"#2B2B2B",e:"#FFFFFF"}},
  spider:{rows:["l.l........l.l..",".ll........ll...","..ll......ll....","...loooooool....","..llobbbbboll...",".l.obeoobeobo.l.","..lobbbbbbbol...","...obbbbbbbo....","..llobbbbboll...",".l..looooool..l.","..ll......ll....",".ll........ll...","l.l........l.l.."],
    pal:{o:"#0F0F18",b:"#4A4A5A",l:"#2A2A3A",e:"#FF3B3B"}},
  // ── Familiers de thème (v1.13.0) ──
  unicorn:{rows:[".......gg",".......gg","...oo..gg..oo","..obboooooobbo",".obbbbbbbbbbbbo",".obebbbbbbbbebo",".obbbbbbbbbbbbo",".obbbbnnnnbbbbo",".obbbbbbbbbbbbo",".obbbbbbbbbbbbo","..ooo.oo.oo.ooo","..o.....o....o"],
    pal:{o:"#9A6BB0",b:"#FFFFFF",e:"#2B2B2B",n:"#FF8FD0",g:"#FFD24D"}},
  dino:{rows:["....s..s..s","..obboooooobbo",".obbbbbbbbbbbbo",".obebbbbbbbbebo",".obbbbbbbbbbbbo",".obbbbhbhbbbbbo",".obbbbhhhbbbbbo",".obbbbbhbbbbbbo",".obbbbbbbbbbbbo","..ooo.oo.oo.ooo","..o.....o....o"],
    pal:{o:"#B0559A",b:"#FFB3E6",e:"#2B2B2B",h:"#FF2E6B",s:"#C77DFF"}},
  totoro:{rows:["...o.......o","..oboooooooobo",".obbbbbbbbbbbbo",".obbebbnnbbebbo",".obbwwwwwwwwbbo",".obbwwwwwwwwbbo",".obbwwwwwwwwbbo",".obbbwwwwwwbbbo",".obbbbbbbbbbbbo","..ooo......ooo","..o..........o"],
    pal:{o:"#3A3F47",b:"#8A929C",w:"#EDF1F5",e:"#2B2B2B",n:"#2B2B2B"}},
  gorilla:{rows:["..obboooooobbo",".obbbbbbbbbbbbo",".obbffffffffbbo",".obbfeffffefbbo",".obbffffffffbbo",".obbbffnnffbbbo",".obbbbffffbbbbo",".obbbbbbbbbbbbo",".obbbbbbbbbbbbo","..obb......bbo","..ooo......ooo"],
    pal:{o:"#15151A",b:"#3A3A42",f:"#6E5E52",e:"#1A1A1A",n:"#1A1A1A"}},
  goldduck:{rows:["....c.c.c","....ccccc","...obbbbbo","...obeobbo","...obbboKK","..obbbbboK",".obbbbbbbo",".obbbbbbbbo",".obbbbbbbbo",".obbbbbbbbo","..obbbbbbo","...oooooo","....t..t"],
    pal:{o:"#9A6E00",b:"#FFD21E",e:"#2B2B2B",K:"#FF8C1A",t:"#FF8C1A",c:"#FFE680"}},
  chick:{rows:["",".....oooo","....obbbbo","...obbbbbbo","...obebbebo","...obbkkbbo","...obbbbbbo","...obbbbbbo","....obbbbo",".....oooo","....k..k"],
    pal:{o:"#C98A00",b:"#FFE24D",e:"#2B2B2B",k:"#FF8C1A"}},
  ufo:{rows:["",".....oooo","....oddddo","...oddddddo","..obbbbbbbbbbo",".obllllllllllbo",".oygbygbygbygbo","..oobbbbbbbboo","...oo....oo"],
    pal:{o:"#2A3340",b:"#7C8A99",l:"#AEC2D6",d:"#9CC0FF",g:"#3AE0C0",y:"#FFE24D"}},
  invader:{rows:["....b.....b",".....b...b","....bbbbbbb","...bbbbbbbbb","...bbebbbebb","...bbbbbbbbb","..bbb.bbb.bbb","..b.b.....b.b"],
    pal:{o:"#2A0F3A",b:"#9B4DFF",e:"#FFFFFF"}},
  pirateparrot:{rows:["...hhhhhh","....hhhh","...obbbo","...obbbbo","...oppobbkk","...obbbobkk","..owbbbbbo",".owwbbbbbbo",".owwbbbbbbo",".owwbbbbbbo","..owbbbbbbo","...obbbbbbo","...obtttbbo","...otttttto","....ot..to"],
    pal:{o:"#3A1A1A",b:"#E23B3B",w:"#2E6BE2",k:"#FFB02E",t:"#FFD24D",p:"#1A1A1A",h:"#1A1A1A"}},
  fugu:{rows:[".....s.s.s","...obbbbbbbo","..sobbbbbbbbos",".oobbbbbbbbbboo",".obbeobbbboebbo",".obbbbbbbbbbbbo",".obbbbmmmmbbbbo",".oobbbbbbbbbboo","..sobbbbbbbbos","...os.s.s.s.so"],
    pal:{o:"#7A5A2A",b:"#FFD98A",e:"#2B2B2B",m:"#C0392B",s:"#B5822E"}},
  fairy:{rows:[".......y","......yyy","......kkk","......kekek",".w....kkk....w",".ww...bbb...ww",".www.bbbbb.www",".ww.bbbbbbb.ww",".w..bbbbbbb..w","....bbbbbbb","....bb...bb",".........s"],
    pal:{o:"#2A5A2A",b:"#5FC24B",e:"#2B2B2B",k:"#FFCC88",y:"#FFE24D",w:"#CFF6E0",s:"#FFE680"}},
  walle:{rows:["..oooo.oooo","..oeeo.oeeo","..oooo.oooo","....oooooo","...obbbbbbo","..obbllllbbo","..obbllllbbo","..obbbbbbbbo","..obbbbbbbbo",".obbbbbbbbbbo",".otttttttttto",".ototototototo"],
    pal:{o:"#4A3A1A",b:"#C8922E",l:"#7CC0E0",e:"#2B2B2B",t:"#5A5A62"}},
  nemo:{rows:["","....o.....ooo","...obbbbbbbboo",".obewwbbwwbbbbo",".obbwwbbwwbbbbo",".obbbbbbbbbbbbo","..obbbbbbbbbbo","...o.....ooo"],
    pal:{o:"#A33A00",b:"#FF7A1E",w:"#FFFFFF",e:"#1A1A1A"}},
};
// Quel sprite pour un id d'item familier (sinon null → repli emoji)
const PET_SPRITE_KEY = { p1:"cat", p2:"dog", p3:"wolf", p4:"fox", p5:"dragon", p6:"parrot", hp4:"owl", pet_worm:"worm", pet_capy:"capybara", pet_bee:"bee", pet_spider:"spider", pet_duck:"duck",
  // familiers de thème (v1.13.0)
  bs5:"unicorn", mx3:"dino", gh4:"totoro", si6:"gorilla", dk1:"goldduck", dk5:"chick", al1:"ufo", al5:"invader", pi1:"pirateparrot", su6:"fugu", di2:"fairy", px1:"walle", px2:"nemo" };
const petSpriteKey = (itemId) => PET_SPRITE_KEY[itemId] || null;
// Dessine un familier pixel sur un canvas (key = clé PET_SPRITES, ou null)
const renderPetToCtx = (ctx, key, size=64, palOverride=null, halo=false) => {
  const sp = PET_SPRITES[key]; if (!ctx) return;
  ctx.clearRect(0,0,size,size);
  if (!sp) return;
  if (halo){ // halo doré du Légendaire
    ctx.strokeStyle="#FFD45A"; ctx.lineWidth=Math.max(2,size*0.035);
    ctx.beginPath(); ctx.ellipse(size*0.5, size*0.10, size*0.27, size*0.075, 0, 0, Math.PI*2); ctx.stroke();
  }
  const pal = palOverride ? { ...sp.pal, ...palOverride } : sp.pal;
  const S = size/16;
  for (let y=0; y<16; y++){ const row=(sp.rows[y]||"")+"................"; for (let x=0; x<16; x++){ const c=row[x]; const col=pal[c]; if(col){ ctx.fillStyle=col; ctx.fillRect(Math.round(x*S),Math.round(y*S),Math.ceil(S),Math.ceil(S)); } } }
};
// ─── SPRITES PIXEL-ART DES ITEMS (v1.13.0) ───────────────────
// Même format 16×16 que PET_SPRITES (clé = id de l'item boutique). Repli emoji si absent.
const ITEM_SPRITES = {
  // Armures (boutique de base)
  a1:{rows:["..gggggggggg","..gbbbbbbbbg","..gbllllllbg","..gblleellbg","..gbleeeelbg","..gblleellbg","..gbllllllbg","...gbllllbg","....gblllbg",".....gbllbg","......gbbg",".......gg"],
    pal:{g:"#FFD24D",b:"#5B7C99",l:"#9CC0D6",e:"#E0392B"}},
  a2:{rows:[".......l","......lbb","......lbb","......lbb","......lbb","......lbb","......lbb","......lbb","....gggggg","......hhh","......hhh","......hhh","......ggg"],
    pal:{b:"#8FA3B5",l:"#E8F0F6",g:"#FFD24D",h:"#7A4A20"}},
  a3:{rows:["","",".....gs","....g.s","...g..s","...g..s","..g...s......t","..g.ffsaaaaaatt","..g...s......t","...g..s","...g..s","....g.s",".....gs"],
    pal:{g:"#FFD24D",s:"#EDEDED",a:"#9A6A2E",t:"#D03B2B",f:"#E0E0E0"}},
  a4:{rows:["","....dddddd","...dbbbbbbd","..dblwbbwlbd","..dblwbbwlbd","...dbllllbd","....dbllbd",".....dbbd","......dd"],
    pal:{d:"#1E8FB0",b:"#3FC4E8",l:"#BFF0FF",w:"#FFFFFF"}},
  a5:{rows:[".......s","......sss",".....sswss.w","......sss",".......hd",".......hd","...w...hd",".......hd",".......hd",".......hd",".......hd",".......hd",".......hd"],
    pal:{h:"#9A6A3A",d:"#5A340F",s:"#FFD24D",w:"#FFF6C0"}},
  // Visage
  lg6:{rows:["","...oooooooo","..oyyyyyyyyo","..oyyyyyyyyo","..oyyoyyyoyo","..oyyoyyyoyo","..oyyyyyyyyo","..oyyoyyyoyo","..oyyyoooyyo","..oyyyyyyyyo","...oooooooo"],
    pal:{o:"#1A1A1A",y:"#FFD21E"}},
  // ── Chapeaux (v1.13.0) ──
  h1:{rows:["....oooooo","...yobbbbo","....obbbbo","....oaaaao",".oooooooooo",".obbbbbbbbo"],pal:{o:"#1A1A1A",b:"#3A3A55",a:"#8A3FD0",y:"#FFD24D"}},
  h2:{rows:["..b.b.b.b.b","..bgbgbgbgb","..bbbbbbbbb","..obbbbbbbo","...oooooooo"],pal:{o:"#9A6E00",b:"#FFD24D",g:"#FF3B6B"}},
  h3:{rows:["..oooooooo",".orrrwwrrro",".orwwwwwwro",".orrrwwrrro",".oooooooooo"],pal:{o:"#7A1500",r:"#E0392B",w:"#FFFFFF"}},
  h4:{rows:["..oooooo",".obbbbbbo",".oblwwlbo",".obbbbbbo",".oooooooo"],pal:{o:"#1A6B8A",b:"#3FC4E8",l:"#BFF0FF",w:"#FFFFFF"}},
  h5:{rows:["oooooooooooo","......y.....","..oooooooo.y","..oooooooo..","...oooooo..."],pal:{o:"#1A1A1A",y:"#3AC0E0"}},
  h6:{rows:["...oooooo","..obbbbbbo","..obyybbbo","..obbbbbbo","..ooooooooooo"],pal:{o:"#10325A",b:"#2E6BE2",y:"#FFD24D"}},
  pi2:{rows:["...oooooooo","..obbbbbbbbo","..obbggbbbbo","..oooooooooo",".oooooooooooo"],pal:{o:"#10172A",b:"#22386A",g:"#FFD24D"}},
  dk3:{rows:["..y.y.y.y.y","..yyyyyyyyy","..yyyyyyyyy","..oyyyyyyyo","...ooooooo"],pal:{o:"#C79A00",y:"#FFE24D"}},
  lc6:{rows:[".f.f.f.f.f.",".fpfpfpfpf.","..ggggggg.."],pal:{f:"#FF8FD0",p:"#FFE24D",g:"#4FB05A"}},
  si4:{rows:[".g.g.g.g.g.",".ggggggggg.","..ggggggg.."],pal:{g:"#3E9B4A",o:"#2A6E32"}},
  gi6:{rows:["..oooooo",".obbbbbbo",".oblwwlbo",".obbbbbbo",".oooooooo"],pal:{o:"#3A3F47",b:"#8A929C",l:"#C8D0D8",w:"#EDF1F5"}},
  mc6:{rows:["..oooooo",".obbbbbbo",".obppppbo",".obbbbbbo",".oo.oo.oo"],pal:{o:"#15151A",b:"#3A2F3A",p:"#5A4A6A"}},
  cf1:{rows:["..llllll",".lhhhhhhl",".lhccchl.",".lhhhhhhl",".llllllll"],pal:{l:"#7FE8FF",h:"#3AC0E0",c:"#FFFFFF"}},
  mv4:{rows:["..rrrrrr",".orrrrrro",".oggggggo",".oggwwggo",".oggggggo",".oooooooo"],pal:{o:"#7A1500",r:"#D11A1A",g:"#FFC83A",w:"#BFEFFF"}},
  px6:{rows:["....gg","..orrrrro",".orrrrrrro",".orrggrrro","oooooooooooo"],pal:{o:"#5A0E00",r:"#E0392B",g:"#FFD24D"}},
  jp6:{rows:["..g....g",".gg....gg",".ogg..ggo",".obbbbbbo",".obbbbbbo",".oooooooo"],pal:{o:"#15151A",b:"#2A2A3A",g:"#FFD24D"}},
  ro1:{rows:["....o","....c","..oooooo",".obbbbbbo",".obwbbwbo",".obbbbbbo",".oooooooo"],pal:{o:"#2A2A30",b:"#7C8A99",w:"#3AE0C0",c:"#FF5A5A"}},
  sc6:{rows:["oooooooooooo","......y.....","..oooooooo.y","..oooooooo..","...oooooo..."],pal:{o:"#1A1A1A",y:"#FFD24D"}},
  hp3:{rows:["......oo",".....obo","....obbo","...obbbo","..obbbbo",".obbbbbo",".obbbbbbo","obbbbbbbbo","oooooooooo"],pal:{o:"#3A2A12",b:"#8A6534"}},
  rb1:{rows:["...oooooo","..obbbbbbo","..obwwbbbo","..obbbbbbo","..ooooooooooo"],pal:{o:"#8A6A2E",b:"#E0C45A",w:"#FFFFFF"}},
  cu1:{rows:["..ww.ww.ww",".wwwwwwwwww",".wwwwwwwwww","..oooooooo","..obbbbbbo"],pal:{o:"#C8C8C8",w:"#FFFFFF",b:"#F0F0F0"}},
  su4:{rows:["","","oooooooooooo","owwwrrwwwwwo","oooooooooooo"],pal:{o:"#7A1500",w:"#FFFFFF",r:"#E0392B"}},
  bf3:{rows:["","","oooooooooooo","obbbbbbbbbbo","oooooooooooo","oo......oo"],pal:{o:"#1A1A1A",b:"#C0392B"}},
  mo1:{rows:["..r....r",".rrrrrrrr",".oeorroeo",".orrrrrro",".owrrrrwo",".oooooooo"],pal:{o:"#5A0E00",r:"#E0392B",e:"#1A1A1A",w:"#FFFFFF"}},
  ho2:{rows:["..oooooo",".owwwwwwo",".owowwowo",".owwwwwwo",".owowwowo",".oooooooo"],pal:{o:"#3A3A3A",w:"#F0F0F0"}},
  al2:{rows:["..oooooo",".obbbbbbo",".oeebbeeo",".obbbbbbo","..obbbbo.","...oooo.."],pal:{o:"#1E5C2A",b:"#5FC24B",e:"#1A1A1A"}},
  gh6:{rows:["...oooooo","..obbbbbbo","..oaaaaaao","oooooooooooo","obbbbbbbbbbo","oooooooooooo"],pal:{o:"#8A6A2E",b:"#E0C45A",a:"#B58A3E"}},
  in3:{rows:["y........y",".g......g.","..g....g..","...g..g...","...obbo..."],pal:{g:"#4FB05A",b:"#2A6E32",y:"#FFD24D",o:"#2A6E32"}},
  bs6:{rows:["oo......oo","opppkkpppo","oppkkkkppo","opppkkpppo","oo......oo"],pal:{o:"#B0357A",p:"#FF8FD0",k:"#FF2E6B"}},
  mx6:{rows:["..oooooo",".obwbwbo.",".owbwbwo.",".obwbwbo.","..oooooo."],pal:{o:"#2A2A3A",b:"#8A3FD0",w:"#3AE0C0"}},
  tr1:{rows:["..p.p.p","..ppppp.",".ppyypp.","..ppppp.","..p.p.p"],pal:{p:"#FF5A8A",y:"#FFD24D"}},
  jb6:{rows:["","","ooooooooooo","owbbooowbbo","obbbooobbbo","ooooooooooo"],pal:{o:"#1A1A1A",b:"#2A2A3A",w:"#7FE8FF"}},
  ro5:{rows:[".....ddd","...dddddd","..ddwdddd","...ddddd","....o","....o","...ooooo"],pal:{d:"#AEC2D6",o:"#5A5A62",w:"#FFFFFF"}},
  lc1:{rows:["....g","...gyg","...gyg","..gyyg","..gyyg",".mmmmm."],pal:{g:"#C79A00",y:"#FFE680",m:"#FF8FD0"}},
  pr5:{rows:["r.w.r.w.r","rrwwrrwwr",".rwrwrwr.","..oooooo.","..obbbbo."],pal:{o:"#5A3A1E",b:"#C77D3A",r:"#E0392B",w:"#FFFFFF"}},
  di4:{rows:["ooo....ooo","oooo..oooo","oooo..oooo",".oooooooo.","..oooooo.."],pal:{o:"#1A1A1A"}},
};
const renderItemToCtx = (ctx, id, size=64) => {
  const sp = ITEM_SPRITES[id]; if (!ctx) return;
  ctx.clearRect(0,0,size,size);
  if (!sp) return;
  const S = size/16;
  for (let y=0; y<16; y++){ const row=(sp.rows[y]||"")+"................"; for (let x=0; x<16; x++){ const c=row[x]; const col=sp.pal[c]; if(col){ ctx.fillStyle=col; ctx.fillRect(Math.round(x*S),Math.round(y*S),Math.ceil(S),Math.ceil(S)); } } }
};
// ─── ÉLÉMENTS D'ÉVOLUTION (v1.57.0) — recolorent le sprite ────
const PET_ELEMENTS = {
  feu:{label:"Feu", pal:{o:"#7A1E00",b:"#FF5A1E",a:"#FFD89A",w:"#B23400"}},
  glace:{label:"Glace", pal:{o:"#1E5C86",b:"#8FD8F0",a:"#E6FAFF",w:"#5FB6DC"}},
  nature:{label:"Nature", pal:{o:"#245E26",b:"#5FC24B",a:"#BFF09A",w:"#3E8B30"}},
  eau:{label:"Eau", pal:{o:"#134E8C",b:"#36A6F0",a:"#B6E6FF",w:"#1E6FB0"}},
  ouragan:{label:"Ouragan", pal:{o:"#4C6075",b:"#AEC2D6",a:"#E2EEF8",w:"#7E94A8"}},
  ombre:{label:"Ombre", pal:{o:"#140A24",b:"#5A4A7A",a:"#9B7AD0",w:"#3A2A5A"}},
  foudre:{label:"Foudre", pal:{o:"#7A5A00",b:"#FFD21E",a:"#FFF3A0",w:"#C79A00"}},
  lave:{label:"Lave", pal:{o:"#5A0E00",b:"#FF3B1E",a:"#FFB02E",w:"#9E2200"}},
};
const PET_ELEMENT_KEYS = Object.keys(PET_ELEMENTS);
const petTierForLevel = (lv) => (lv>=12?3:lv>=8?2:lv>=4?1:0);            // tier débloqué selon le niveau
const petActiveElement = (evo) => evo ? (evo[3]||evo[2]||evo[1]||null) : null;
const petIsLegendary = (evo, lv) => lv>=12 && !!(evo&&evo[3]);
const petFormLabel = (evo, lv) => { const el=petActiveElement(evo); if(petIsLegendary(evo,lv)) return `Légendaire${el?` · ${PET_ELEMENTS[el].label}`:""}`; return el?PET_ELEMENTS[el].label:"Bébé"; };
const petPalOverride = (evo) => { const el=petActiveElement(evo); return el?PET_ELEMENTS[el].pal:null; };
const petPendingTier = (evo, lv) => { const t=petTierForLevel(lv); for(let i=1;i<=t;i++){ if(!(evo&&evo[i])) return i; } return 0; };
// 2 options élémentaires tirées de façon DÉTERMINISTE (par petId+tier → mêmes options sur tous les appareils), hors déjà choisis
const petEvoOptions = (petId, tier, evo) => {
  const taken=new Set([evo&&evo[1],evo&&evo[2],evo&&evo[3]].filter(Boolean));
  const avail=PET_ELEMENT_KEYS.filter(k=>!taken.has(k));
  let seed=0; const s=(petId||"x")+"#"+tier; for(let i=0;i<s.length;i++) seed=(seed*31+s.charCodeAt(i))>>>0;
  return avail.map((k,i)=>({k,r:((seed+i*2654435761)>>>0)})).sort((a,b)=>a.r-b.r).slice(0,2).map(x=>x.k);
};
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

const CAT_LABELS = { cuisine:"🍳 Cuisine", menage:"🏠 Ménage", routine:"⏰ Rituel", defi:"🎯 Défis", outdoor:"🌳 Dehors" };
const DIFF_COLOR = d => ({ easy:"#2ECC40", medium:"#FFD700", hard:"#FF6B35", boss:"#FF2222" }[d] || "#aaa");

// ─── REWARD CATALOG ──────────────────────────────────────────
// (emoji = placeholder temporaire — remplacé par du pixel-art dans le milestone art)
// v1.92.0 (Lot 4 #19) — `cat` optionnel distingue les récompenses ÉCRAN des récompenses
// CALME (temps calme/apaisant), pour que la boutique ne pousse pas que vers l'écran —
// utile pour les enfants neuroatypiques qui bénéficient d'alternatives de régulation visibles.
const REWARD_CATALOG = [
  { id:"rw_ecran",   emoji:"📱", label:"15 minutes d'écran",                 coins:40, cat:"ecran" },
  { id:"rw_parent",  emoji:"💝", label:"10 minutes privées avec ton parent", coins:35, cat:"calme" },
  { id:"rw_dessert", emoji:"🍰", label:"Permission de 2e dessert",           coins:30 },
  { id:"rw_dejsoup", emoji:"🥞", label:"Permission de déjeuner au souper",   coins:35 },
  { id:"rw_epicerie",emoji:"🛒", label:"Choix d'un achat à l'épicerie",      coins:60 },
  { id:"rw_depanneur",emoji:"🏪",label:"Choix d'un achat au dépanneur",      coins:70 },
  { id:"rw_jeu",     emoji:"🎲", label:"Choix d'un jeu de société en famille",coins:35 },
  { id:"rw_souper",  emoji:"🍽️", label:"Choix d'un souper pendant la semaine",coins:55 },
  { id:"rw_bonbon",  emoji:"🍬", label:"Manger un bonbon",                   coins:20 },
  { id:"rw_ricochet",emoji:"↪️", label:"1 ricochet de tâche sur quelqu'un d'autre",coins:80 },
  { id:"rw_debarrasse",emoji:"🧽",label:"On débarrasse ton repas",           coins:25 },
  { id:"rw_servi",   emoji:"🍴", label:"Tu te fais servir au souper",        coins:30 },
  { id:"rw_pasdetache",emoji:"🛌",label:"Pas de tâches aujourd'hui",         coins:150 },
  { id:"rw_dejlit",  emoji:"🛏️", label:"Déjeuner au lit",                    coins:45, cat:"calme" },
  { id:"rw_musique", emoji:"🎵", label:"Tu fais jouer ta musique dans la maison",coins:25, cat:"calme" },
  { id:"rw_esclave", emoji:"🧞", label:"Ton parent est ton esclave 30 minutes",coins:90 },
  { id:"rw_bain",    emoji:"🛁", label:"Bain spécial mousse + chandelles",     coins:40, cat:"calme" },
];
const REWARD_CAT_BADGE = { ecran:{label:"📱 Écran",color:"#FF8C6B"}, calme:{label:"🌙 Calme",color:"#7FD6E0"} };
// v1.54.0 — Sélection ALÉATOIRE par JOUR (reset de la boutique chaque jour) — déterministe via la date
const weeklyRewards = (n=8) => {
  const wk = todayStamp();
  let seed = 0; for (let i=0;i<wk.length;i++) seed = (seed*31 + wk.charCodeAt(i)) >>> 0;
  const arr = REWARD_CATALOG.map((r,i)=>({r, k:((seed + i*2654435761) >>> 0)}));
  arr.sort((a,b)=>a.k-b.k);
  return arr.slice(0, Math.min(n, arr.length)).map(x=>x.r);
};

// ─── RARETÉS (incite à collectionner) ────────────────────────
const RARITIES = [
  { min:0,  name:"Commun",     color:"#9AA0A6" },
  { min:20, name:"Rare",       color:"#4FA3FF" },
  { min:30, name:"Ultra Rare", color:"#B06BFF" },
  { min:45, name:"Légendaire", color:"#FFB02E" },
  { min:60, name:"Unique",     color:"#FF5BAE" },
];
const rarityOf = (cost) => { let r=RARITIES[0]; for(const x of RARITIES) if((cost||0)>=x.min) r=x; return r; };

// ─── ÉCONOMIE (équilibrage « game master ») ───────────────────
// Prix de base montés d'un cran pour que les pièces aient de la valeur et qu'un
// item légendaire se MÉRITE. rarityOf reste sur le coût de BASE (la rareté ne bouge pas).
const PRICE_MULT = 3; // v1.66.0 — items/familiers plus chers (Gen : « que ça dure longtemps »). Était 2.
const baseCost = (it) => (it?.cost ?? it?.coins ?? 0); // items: .cost — récompenses: .coins
const priceOf  = (it) => Math.round(baseCost(it) * PRICE_MULT);
// Récompense d'une tâche selon la difficulté choisie
const DIFF_PRESETS = { easy:{xp:10,coins:5}, medium:{xp:20,coins:10}, hard:{xp:40,coins:20} };
// Plafond ANTI-FARM pour les tâches qu'un ENFANT se crée (valeurs réduites)
const CHILD_DIFF_PRESETS = { easy:{xp:5,coins:2}, medium:{xp:8,coins:4}, hard:{xp:12,coins:6} };
// v1.53.0 — étiquettes de catégorie (couleur + libellé) pour le sélecteur de tâches en grille
const CAT_META = {
  routine:{label:"Routine",color:"#9B5DE5"},
  cuisine:{label:"Cuisine",color:"#FF8C42"},
  menage:{label:"Ménage",color:"#4A90D9"},
  outdoor:{label:"Dehors",color:"#2ECC40"},
  defi:{label:"Défi",color:"#FF2D6F"},
  custom:{label:"Mes tâches",color:"#FFD24D"},
};
const catMeta = (c) => CAT_META[c] || { label:"Autre", color:"#9AA0A6" };
const normLabel = (s) => (s||"").toLowerCase().trim().replace(/\s+/g," ");

// v1.85.0 (Lot 2 #9) — catégories de calendrier au-delà de Événement/Devoir/Examen : tout ce qui
// n'est pas scolaire (camp de jour, match/entraînement, vaccin, intervenant à la maison…) avait
// jusqu'ici la même icône générique 📅. `type`/`recur`/`date` restent les mêmes champs — extension
// du tableau de types, pas une nouvelle mécanique.
const CAL_TYPES = {
  sante:       { label:"🏥 Santé/rendez-vous", icon:"🏥" },
  sport:       { label:"⚽ Sport/activité",     icon:"⚽" },
  intervenant: { label:"🧑‍⚕️ Intervenant à la maison", icon:"🧑‍⚕️" },
  camp:        { label:"🏕️ Camp/sortie",        icon:"🏕️" },
};
const calEventIcon = (e) => {
  if (e.type==="examen") return "📝";
  if (e.type==="devoir") return "📚";
  if (CAL_TYPES[e.type]) return CAL_TYPES[e.type].icon; // nouvelles catégories : icône dédiée même récurrent
  return e.recur ? "🔁" : "📅"; // "evenement" générique — comportement historique inchangé
};
// v1.64.0 — messages drôles de refus (déterministe par clé pour rester stable)
const REFUS_MSGS = [
  "😹 Bien tenté! Cette quête part au recyclage…",
  "🙃 Pas tout à fait — on réessaiera une autre fois!",
  "🐙 Ton parent a dit « pas celle-là pour l'instant »!",
  "🎈 Cette quête s'envole… reviens-y plus tard!",
  "🛟 Refusée pour cette fois — pas grave, t'es capable!",
];
const refusMsg = (key) => { let h=0; const s=String(key||""); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return REFUS_MSGS[h%REFUS_MSGS.length]; };

// ─── BADGE CATALOG ───────────────────────────────────────────
// type: "general" | themeId
// condition fn receives: (pState, completedCount, config, player)
const BADGES = [
  // ── GÉNÉRAUX ──
  { id:"b_first",    emoji:"⭐", name:"Premier Sang",         desc:"Complète ta première quête",           type:"general", check:(ps)=>(ps.completed?.length||0)>=1 },
  { id:"b_5tasks",   emoji:"🔥", name:"En Feu",               desc:"Complète 15 quêtes",                   type:"general", check:(ps)=>(ps.completed?.length||0)>=15 },
  { id:"b_20tasks",  emoji:"💪", name:"Bras de Fer",          desc:"Complète 50 quêtes",                   type:"general", check:(ps)=>(ps.completed?.length||0)>=50 },
  { id:"b_50tasks",  emoji:"🏆", name:"Légende Vivante",      desc:"Complète 150 quêtes",                  type:"general", check:(ps)=>(ps.completed?.length||0)>=150 },
  { id:"b_xp100",    emoji:"⚡", name:"Chargé à Bloc",        desc:"Accumule 250 XP",                      type:"general", check:(ps)=>(ps.xp||0)>=250 },
  { id:"b_xp300",    emoji:"🌩️", name:"Orage Intérieur",      desc:"Accumule 600 XP",                      type:"general", check:(ps)=>(ps.xp||0)>=600 },
  { id:"b_xp500",    emoji:"🌟", name:"Supernova",            desc:"Accumule 1200 XP",                     type:"general", check:(ps)=>(ps.xp||0)>=1200 },
  { id:"b_coins50",  emoji:"💰", name:"Petit Trésor",         desc:"Accumule 100 pièces d'un coup",        type:"general", check:(ps)=>(ps.coins||0)>=100 },
  { id:"b_coins150", emoji:"🤑", name:"Oncle Picsou",         desc:"Accumule 300 pièces",                  type:"general", check:(ps)=>(ps.coins||0)>=300 },
  { id:"b_buy1",     emoji:"🛒", name:"Première Récompense",  desc:"Achète une récompense",               type:"general", check:(ps)=>(ps.boughtRewards?.length||0)>=1 },
  { id:"b_buy5",     emoji:"🛍️", name:"Problème de Shopping", desc:"Achète 10 récompenses",                type:"general", check:(ps)=>(ps.boughtRewards?.length||0)>=10 },
  { id:"b_streak3",  emoji:"📅", name:"Machine à Habitudes",  desc:"6 quêtes dans la même journée",        type:"general", check:(ps,c)=>c>=6 },
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
];

// v1.59.0 — compte les complétions par étiquette (catégorie de tâche) pour les badges par catégorie
const completionCatCounts = (ps, config) => {
  const tasks=[...TASK_CATALOG, ...((config&&config.customTasks)||[])];
  const catByInst={}; ((config&&config.assignments)||[]).forEach(a=>{ const t=tasks.find(x=>x.id===a.taskId); if(t) catByInst[a.instanceId]=t.cat; });
  const counts={};
  (ps.completed||[]).forEach(k=>{ const base=k.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_")); const cat=catByInst[inst]; if(cat) counts[cat]=(counts[cat]||0)+1; });
  return counts;
};
// Returns array of newly earned badge IDs
const checkBadges = (pState, player, dailyCount, catCounts={}) => {
  const themeId = player?.themeId || "none";
  const alreadyEarned = new Set(pState.badges || []);
  return BADGES
    .filter(b => !alreadyEarned.has(b.id))
    .filter(b => b.type === "general" || b.type === themeId)
    .filter(b => { try { return b.check(pState, dailyCount, catCounts); } catch { return false; } })
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

// ─── CATALOGUE BOUTIQUE (niveau module pour que le PROFIL puisse résoudre les items) ──
const BASE_SHOP_ITEMS = {
  hats:[{id:"h1",emoji:"🎩",name:"Chapeau magique",cost:20,slot:"hat"},{id:"h2",emoji:"👑",name:"Couronne",cost:40,slot:"hat"},{id:"h3",emoji:"⛑",name:"Casque héros",cost:25,slot:"hat"},{id:"h4",emoji:"🪖",name:"Casque diamant",cost:35,slot:"hat"},{id:"h5",emoji:"🎓",name:"Chapeau savant",cost:30,slot:"hat"},{id:"h6",emoji:"🧢",name:"Cap champion",cost:15,slot:"hat"}],
  armors:[{id:"a1",emoji:"🛡️",name:"Bouclier",cost:15,slot:"armor"},{id:"a2",emoji:"⚔️",name:"Épée",cost:20,slot:"armor"},{id:"a3",emoji:"🏹",name:"Arc en or",cost:35,slot:"armor"},{id:"a4",emoji:"💎",name:"Armure diamant",cost:50,slot:"armor"},{id:"a5",emoji:"🪄",name:"Bâton magique",cost:30,slot:"armor"}],
  pets:[{id:"p1",emoji:"🐱",name:"Chat",cost:20,slot:"pet"},{id:"p2",emoji:"🐶",name:"Chien",cost:20,slot:"pet"},{id:"p3",emoji:"🐺",name:"Loup",cost:35,slot:"pet"},{id:"p4",emoji:"🦊",name:"Renard",cost:30,slot:"pet"},{id:"p5",emoji:"🐉",name:"Dragon",cost:60,slot:"pet"},{id:"p6",emoji:"🦜",name:"Perroquet",cost:25,slot:"pet"},{id:"pet_duck",emoji:"🦆",name:"Canard jaune",cost:20,slot:"pet"},{id:"pet_worm",emoji:"🪱",name:"Ver de terre",cost:15,slot:"pet"},{id:"pet_capy",emoji:"🦫",name:"Capybara",cost:40,slot:"pet"},{id:"pet_bee",emoji:"🐝",name:"Abeille",cost:25,slot:"pet"},{id:"pet_spider",emoji:"🕷️",name:"Araignée",cost:30,slot:"pet"}],
};
const ALL_SHOP_ITEMS = [
  ...BASE_SHOP_ITEMS.hats, ...BASE_SHOP_ITEMS.armors, ...BASE_SHOP_ITEMS.pets,
  ...PT_LIST.flatMap(t => t.shopCategory?.items || []),
];
const shopItemById = (id) => ALL_SHOP_ITEMS.find(i => i.id === id);
// v1.74.0 — pool d'items ULTRA LÉGENDAIRES (rareté Légendaire/Unique, coût ≥45) pour la récompense de victoire de boss
const ULTRA_ITEMS = ALL_SHOP_ITEMS.filter(i => (i.cost||0) >= 45);
const pickUltraLegendary = () => ULTRA_ITEMS[Math.floor(Math.random()*ULTRA_ITEMS.length)] || ALL_SHOP_ITEMS[0];
// Display name: pseudo if set, else real name
const displayName = (player) => (player?.pseudo?.trim()) || player?.name || "";
// Returns 2 random non-secret theme IDs for a brand-new player
const pickStarterThemes = () => {
  const pool = Object.keys(PLAYER_THEMES).filter(k => k !== "none" && !PLAYER_THEMES[k].secret);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
};

// v1.93.0 (Lot 4 #20) — thème hebdomadaire gratuit : chaque semaine (lundi→dimanche, via
// weekKey), un thème non-secret est débloqué pour TOUT LE MONDE sans XP, en plus des
// déblocages XP/starter existants (choix additif, pas un remplacement — voir PROJET-ETAT.md
// pour le raisonnement : ne pas faire perdre leur progression XP déjà gagnée aux enfants).
const getWeeklyFreeTheme = () => {
  const pool = Object.keys(PLAYER_THEMES).filter(k => k !== "none" && !PLAYER_THEMES[k].secret);
  const wk = weekKey();
  const seed = wk.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  return pool[seed % pool.length];
};

const isThemeUnlocked = (themeId, playerXp, starterThemes = []) => {
  if (themeId === "none") return true; // always free
  const t = PLAYER_THEMES[themeId];
  if (!t) return false;
  if (t.secret) return false; // secret only via random
  if (starterThemes.includes(themeId)) return true; // starter pick
  if (themeId === getWeeklyFreeTheme()) return true; // thème gratuit de la semaine
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
  // Tâches perso : union par id, MOINS les supprimées (tombstones durables, comme les assignations)
  const removedCustomTasks = _uniq([...(bC.removedCustomTasks || []), ...(iC.removedCustomTasks || [])]).slice(-1000);
  const _rmCT = new Set(removedCustomTasks);
  const taskMap = new Map();
  (bC.customTasks || []).forEach((t) => { if (!_rmCT.has(t.id)) taskMap.set(t.id, t); });
  (iC.customTasks || []).forEach((t) => { if (!_rmCT.has(t.id) && !taskMap.has(t.id)) taskMap.set(t.id, t); });
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
  return {
    xp: 0, coins: 0, completed: [], pending: [], owned: [], equipped: {}, boughtRewards: [], badges: [],
    ...gs,
    badges: gs.badges || [],
    boughtRewards: gs.boughtRewards || [],
    refundedRewards: gs.refundedRewards || [], // v1.69.0 — tombstone anti-remboursement-infini
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
const FUNNY_PIN_MSGS = [
  "...ou peut-être que le code, c'est pas ça non plus? 🤔",
  "Y'a quelqu'un ici qui connaît le code? Non? OK.",
  "À ce rythme-là, t'as jusqu'en 2087 pour le trouver.",
  "PSST: ton parent va finir par changer le code pour 0000.",
];

// ─── UTILS ───────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,9);
const todayStr = () => new Date().toISOString().slice(0,10);
const weekKey = (dd=new Date()) => { const d=new Date(dd); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()-((day+6)%7)); return mon.toISOString().slice(0,10); };

// ─── CSS ─────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323:wght@400&family=Nunito:wght@700;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Nunito',sans-serif;-webkit-tap-highlight-color:transparent;}
  /* v1.87.0 (Lot 3 #12) — "police plus lisible" : bascule les polices pixel-art (Press Start 2P /
     VT323) vers Nunito (déjà chargée, poids 700/900) — !important pour l'emporter sur les centaines
     de styles inline, seule façon réaliste de couvrir toute l'app sans réécrire chaque composant. */
  .readable-font, .readable-font *{font-family:'Nunito',sans-serif!important;letter-spacing:0.01em!important;}
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
  /* Accessibilité : respecte le réglage système "moins d'animations" */
  @media (prefers-reduced-motion: reduce){ *{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important} }
  /* Mode calme (réglage enfant) : coupe animations, clignotements et lueurs pulsées */
  .calm-mode *{animation:none!important;transition:none!important}
  .calm-mode .blink{opacity:1!important}
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:16,overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.5vw,14px)",color:pt.accent,textShadow:`0 0 16px ${pt.glow}`}}>
        {pt.icon} LEVEL UP — Mini-Niveau! {pt.icon}
      </div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#aaa"}}>Flèches / Espace — Ramasse les {pt.coinName}s!</div>
      <canvas ref={canvasRef} style={{border:`4px solid ${pt.accent}`,borderRadius:4,maxWidth:"100%",boxShadow:`0 0 30px ${pt.glow}`}}/>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:pt.accent}}>
        {pt.platformItems[0]} ×{collected} ramassés!
      </div>
      {done && <button onClick={()=>onClose(collected)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 24px",background:pt.accent,color:"#000",border:"4px solid #000",borderRadius:4,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>🏆 CONTINUER →</button>}
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{background:`linear-gradient(135deg,${T.bg},#1a1a2e)`,border:`5px solid ${T.accent}`,borderRadius:10,padding:"20px 24px",textAlign:"center",maxWidth:360,width:"100%",maxHeight:"calc(100vh - 32px)",overflowY:"auto",boxSizing:"border-box",boxShadow:`0 0 50px ${T.accent}60`,animation:"bounceIn 0.35s ease"}}>
        <div style={{fontSize:36,marginBottom:6}}>👩‍💻</div>
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
// v1.88.0 (Lot 3 #11) — `big` (défaut true, rétrocompatible) contrôle l'intensité : les VRAIS
// jalons (level-up, victoire de boss, coffre, etc.) gardent l'intensité complète (7 emoji + 18
// confettis), mais une tâche ordinaire validée (le déclencheur le plus fréquent — des dizaines
// de fois par jour) passe en version réduite (3 + 6) — moins de densité sur les actions courantes
// sans retirer la fête pour les vrais accomplissements.
function spawnParticles(emoji, big=true) {
  if (CALM) return; // mode calme : pas de particules/flash
  const emojis = [emoji,"⭐","✨","💫"];
  const nEmoji = big ? 7 : 3, nConfetti = big ? 18 : 6;
  for(let i=0;i<nEmoji;i++) setTimeout(()=>{
    const p=document.createElement("div");
    p.style.cssText=`position:fixed;left:${Math.random()*70+15}vw;top:${Math.random()*50+25}vh;font-size:22px;pointer-events:none;z-index:2999;animation:floatUp 1.4s ease-out forwards;`;
    p.textContent=emojis[Math.floor(Math.random()*emojis.length)]; document.body.appendChild(p); setTimeout(()=>p.remove(),1500);
  },i*90);
  const cols=["#FFD700","#4A90D9","#C060D0","#2ECC40","#FF6464"];
  for(let i=0;i<nConfetti;i++) setTimeout(()=>{
    const c=document.createElement("div");
    c.style.cssText=`position:fixed;left:${Math.random()*100}vw;top:-10px;width:${Math.random()*8+4}px;height:${Math.random()*8+4}px;background:${cols[Math.floor(Math.random()*5)]};z-index:2998;border-radius:2px;animation:confettiFall ${Math.random()*1+1.5}s ease-in ${Math.random()*0.4}s forwards;`;
    document.body.appendChild(c); setTimeout(()=>c.remove(),2200);
  },i*35);
}

// ─── REWARD POPUP ────────────────────────────────────────────
function RewardPopup({ task, player, newBadges, onClose, th }) {
  const T = th || THEMES.minecraft;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto"}}>
      <div style={{background:T.bg,border:`6px solid ${T.accent}`,borderRadius:10,padding:"clamp(18px,4vw,30px) clamp(20px,5vw,40px)",textAlign:"center",maxWidth:440,width:"90%",maxHeight:"90vh",overflowY:"auto",boxShadow:`0 0 50px ${T.accent}80`,animation:"bounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1)"}}>
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
        <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"11px 22px",background:"#2ECC40",color:"#000",border:"4px solid #000",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>→ CONTINUER ←</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETUP WIZARD
// ═══════════════════════════════════════════════════════════════
function SetupWizard({ existing, onDone }) {
  // En édition (« Modifier le livre »), on arrive direct sur Joueurs (le Mode global n'est plus le point d'entrée)
  const [step, setStep] = useState(existing ? 1 : 0);
  const STEPS = ["Mode","Joueurs","Tâches","Récompenses","PIN"];

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
    if (step===2) return assignments.length>0;
    if (step===4) return pin.length===4;
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
              {k:"routine",icon:"⏰",title:"Mode Rituel",desc:"Matin, soir ou après-école. Compte à rebours proéminent jusqu'à l'heure cible."},
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

        {/* ── STEP 2: Tasks ── */}
        {step===2 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:12}}>📋 Tâches & Quêtes ({assignments.length})</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {/* Catalog left */}
            <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:"62vh",overflowY:"auto",paddingRight:4,WebkitOverflowScrolling:"touch"}}>
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
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:"62vh",overflowY:"auto",paddingRight:2,WebkitOverflowScrolling:"touch"}}>
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

        {/* ── STEP 3: Rewards ── */}
        {step===3 && <>
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
                  <div style={{width:22,height:22,borderRadius:3,border:`3px solid ${sel?T.accent:"#555"}`,background:sel?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"safe center",color:"#000",fontSize:14,fontWeight:"bold"}}>{sel?"✓":""}</div>
                </div>
              );
            })}
          </div>
          <button onClick={addCustomReward} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${T.accent}60`,color:T.accent,borderRadius:4,cursor:"pointer",marginTop:10,width:"100%"}}>+ Récompense personnalisée</button>
        </>}

        {/* ── STEP 4: PIN ── */}
        {step===4 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:14}}>🔐 Code secret parent</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#aaa",marginBottom:14}}>Demandé à chaque validation. Les enfants ne le voient pas!</div>
          <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="4 chiffres"
            style={{width:"100%",background:"#111",border:`3px solid ${T.accent}`,color:"#fff",padding:"14px",fontFamily:"'Press Start 2P',monospace",fontSize:20,borderRadius:4,textAlign:"center",letterSpacing:10}}/>
          <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginTop:8}}>Code choisi : {pin||"—"}</div>
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
// v1.88.0 (Lot 3 #13) — minuterie visuelle style "Time Timer" : un disque dont la portion colorée
// rétrécit avec le temps qui passe, en complément du chrono numérique (pas un remplacement) —
// aide à "sentir" le temps sans lire de chiffres, utile pour la cécité temporelle (TDAH).
// `progress` = fraction de temps RESTANT (1 = plein, 0 = écoulé). Pas de rouge par défaut
// (cohérent avec le "décompte calme" déjà en place) — la couleur vient du thème/accent.
function TimeTimerDisc({ progress, size=110, color="#5DECF5", urgentColor="#FF6B6B", urgent=false }) {
  const r = size/2 - 8;
  const c = 2*Math.PI*r;
  const p = Math.max(0, Math.min(1, progress||0));
  const offset = c * (1-p);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display:"block",margin:"0 auto"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#222" strokeWidth="10"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={urgent?urgentColor:color} strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 0.9s linear, stroke 0.3s"}}/>
    </svg>
  );
}
function Countdown({ endTime, th, calm }) {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i); },[]);
  const [eh,em]=endTime.split(":").map(Number);
  const target=new Date(); target.setHours(eh,em,0,0);
  const diff=target-now;
  const isLate=diff<0;
  const abs=Math.abs(diff);
  const h=Math.floor(abs/3600000), m=Math.floor((abs%3600000)/60000), s=Math.floor((abs%60000)/1000);
  const pct=isLate?100:Math.max(0,100-(diff/(3600000*2))*100); // 2h window
  const urgent=!calm && diff>0&&diff<900000; // <15min (jamais en mode calme)
  // Mode calme : pas de rouge, pas d'urgence, pas de pulsation — juste l'heure et une barre neutre
  const danger = !calm && isLate;
  return (
    <div style={{padding:"10px 14px",background:danger?"rgba(255,50,50,0.2)":urgent?"rgba(255,180,0,0.15)":"rgba(0,0,0,0.4)",border:`3px solid ${danger?"#FF4444":urgent?"#FFD700":th.accent}60`,borderRadius:6,animation:(urgent||danger)?"redPulse 1s ease-in-out infinite":"none"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:danger?"#FF4444":urgent?"#FFD700":th.accent,marginBottom:6,textAlign:"center"}}>
        {calm ? "⏱ Rituel jusqu'à "+endTime : (isLate?"⚠️ EN RETARD!":urgent?"🏃 DÉPÊCHE-TOI!":"⏱ RITUEL TERMINE À "+endTime)}
      </div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(22px,4vw,44px)",color:danger?"#FF4444":urgent?"#FFD700":"#fff",textAlign:"center",textShadow:calm?"none":`0 0 20px ${danger?"#FF4444":urgent?"#FFD700":th.accent}`,letterSpacing:2,marginBottom:8}}>
        {isLate?(calm?"":"+"):""}{h>0?h+"h ":""}{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}
      </div>
      <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,${th.primary},${danger?"#FF4444":th.accent})`,transition:"width 1s ease"}}/>
      </div>
    </div>
  );
}

// v1.94.0 (Lot 5 #22) — horloge du header isolée dans son propre petit composant (comme
// Countdown/InlineRitualTimer) : son tick de 1s ne fait re-render QUE ce composant, plus
// jamais tout l'arbre App() en cascade. La logique métier qui a vraiment besoin de "now"
// (barre de progression, compte à rebours, indicateur de synchro) reste dans App(), mais
// son propre tick a été ralenti de 1s à 30s (aucune de ces valeurs n'a besoin d'une
// précision à la seconde près) — App() ne re-render donc plus que 2x/min au lieu de 60x/min.
function HeaderClock({ style }) {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i); },[]);
  const H=String(now.getHours()).padStart(2,"0"), M=String(now.getMinutes()).padStart(2,"0");
  return <div style={style}>{H}:{M}</div>;
}

// ─── WEEK VIEW ───────────────────────────────────────────────
function WeekView({ config, gameState, onCompleteTask, th, todayDayIdx }) {
  const allTasks = [...TASK_CATALOG, ...(config.customTasks||[])];
  return (
    <div style={{overflowX:"auto",paddingBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:`120px repeat(7,1fr)`,gap:2,minWidth:700}}>
        {/* Header */}
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#555",display:"flex",alignItems:"center",justifyContent:"safe center"}}>TÂCHE</div>
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
function renderAvatarToCtx(ctx, avatarDef, bodyColor, W=72, H=72, blink=false) {
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
  if(blink){ // yeux fermés (clignement) — petites lignes plates
    ctx.fillStyle="#000"; ctx.fillRect(s(9),s(12),s(6),s(2)); ctx.fillRect(s(21),s(12),s(6),s(2));
  }
  else if(eyePart.eyeShape==="happy"){ctx.fillRect(s(9),s(11),s(5),s(3));ctx.fillRect(s(21),s(11),s(5),s(3));}
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

// Inline avatar component (renders canvas) — clignement subtil des yeux (sauf mode calme)
function AvatarCanvas({ avatarDef, bodyColor, size=72, style={}, animate=true }) {
  const canvasRef = useRef(null);
  const [blink, setBlink] = useState(false);
  useEffect(()=>{
    const c=canvasRef.current; if(!c)return;
    renderAvatarToCtx(c.getContext("2d"), avatarDef||DEFAULT_AVATAR, bodyColor, size, size, blink);
  },[avatarDef, bodyColor, size, blink]);
  useEffect(()=>{
    if(!animate || CALM) return; // pas de clignement en mode calme
    let t, stop=false;
    const next=()=>{ t=setTimeout(()=>{ if(stop)return; setBlink(true); setTimeout(()=>{ if(!stop) setBlink(false); },130); next(); }, 2800+Math.random()*3600); };
    next();
    return ()=>{ stop=true; clearTimeout(t); };
  },[animate]);
  return <canvas ref={canvasRef} width={size} height={size}
    style={{imageRendering:"pixelated",borderRadius:4,...style}}/>;
}

// v1.56.0 — Familier en pixel-art (canvas). petKey direct OU itemId (mappé). palOverride = recolorage d'élément.
function PetSprite({ petKey, itemId, size=64, palOverride=null, legendary=false, style={} }) {
  const key = petKey || petSpriteKey(itemId);
  const [imgFail, setImgFail] = useState(false); // v1.75.0 — repli sur le canvas si pas de PNG
  const canvasRef = useRef(null);
  // PNG seulement pour la forme de base (pas évoluée) : `public/sprites/pets/<key>.png`. Évolué/Légendaire = canvas recoloré.
  const usePng = !imgFail && !palOverride && !legendary && !!key;
  useEffect(()=>{ if(usePng) return; const c=canvasRef.current; if(!c)return; renderPetToCtx(c.getContext("2d"), key, size, palOverride, legendary); },[usePng,key,size,palOverride,legendary]);
  if(!key) return null;
  if(usePng) return <img src={`/sprites/pets/${key}.png`} width={size} height={size} alt="" onError={()=>setImgFail(true)} style={{imageRendering:"pixelated",objectFit:"contain",...style}}/>;
  return <canvas ref={canvasRef} width={size} height={size} style={{imageRendering:"pixelated",...style}}/>;
}

// v1.13.0 — Item en pixel-art. PNG (public/sprites/items/<id>.png) → grille ITEM_SPRITES → repli emoji.
function ItemSprite({ itemId, emoji, size=48, style={} }) {
  const hasGrid = !!(itemId && ITEM_SPRITES[itemId]);
  const [imgFail, setImgFail] = useState(false);
  const canvasRef = useRef(null);
  // Ordre : PNG PixelLab (public/sprites/items/<id>.png) → grille dessinée → emoji. Peu d'items affichés à la fois (boutique par onglets + items équipés), donc tenter le PNG partout est OK.
  const usePng = !imgFail && !!itemId;
  useEffect(()=>{ if(usePng||!hasGrid) return; const c=canvasRef.current; if(!c)return; renderItemToCtx(c.getContext("2d"), itemId, size); },[usePng,hasGrid,itemId,size]);
  if(usePng) return <img src={`/sprites/items/${itemId}.png`} width={size} height={size} alt="" onError={()=>setImgFail(true)} style={{imageRendering:"pixelated",objectFit:"contain",display:"block",...style}}/>;
  if(hasGrid) return <canvas ref={canvasRef} width={size} height={size} style={{imageRendering:"pixelated",display:"block",...style}}/>;
  return <span style={{fontSize:Math.round(size*0.78),lineHeight:1,display:"block",...style}}>{emoji}</span>;
}

// v1.81.0 — Ancrage anatomique des items équipés. AVANT : hat/face/armor étaient centrés sur le CANVAS
// (72 unités, left:"50%") — mais le personnage dessiné par renderAvatarToCtx (bras compris, x:-2..38) est
// décalé à gauche dedans, son vrai centre est x=18, pas 36. Résultat : les items flottaient à côté du corps
// au lieu de sembler portés. Les ancres ci-dessous utilisent le même repère 72 unités que renderAvatarToCtx,
// donc l'alignement reste correct à N'IMPORTE QUELLE taille d'avatar (cx/cy en unités natives ÷72×size).
// a1/a2/a3/a5 (bouclier/épée/arc/bâton) sont en fait des ARMES tenues en main, pas de l'armure de torse —
// a4 (armure diamant) reste seule à utiliser l'ancre "armor" (centrée sur le torse).
const HELD_WEAPON_IDS = new Set(["a1","a2","a3","a5"]);
const AVATAR_EQUIP_ANCHORS = {
  hat:    { cx:18, cy:1,  wRatio:0.40, shadow:true },              // sommet de la tête (tête native x3-33 y2-24, centre x18)
  face:   { cx:18, cy:13, wRatio:0.235 },                          // niveau des yeux
  armor:  { cx:18, cy:39, wRatio:0.34, shadow:true },               // centré sur le torse (corps natif x2-34 y26-50, centre x18 y38)
  weapon: { cx:37, cy:32, wRatio:0.36, rotate:22, shadow:true },    // tenue dans la main droite (bras natif x32-38 y28-42), légère inclinaison
  themed: { cx:29, cy:53, wRatio:0.22 },                           // accessoire secondaire, à la ceinture/jambe
};
function equipAnchorStyle(key, size) {
  const A = AVATAR_EQUIP_ANCHORS[key];
  const w = Math.round(size*A.wRatio);
  return {
    position:"absolute", left:Math.round(A.cx/72*size), top:Math.round(A.cy/72*size),
    width:w, height:w,
    transform:`translate(-50%,-50%)${A.rotate?` rotate(${A.rotate}deg)`:""}`,
    filter:A.shadow?"drop-shadow(0 2px 0 #000)":undefined,
    pointerEvents:"none",
  };
}
// Rendu commun des items équipés "portés" sur l'avatar (chapeau/visage/arme-ou-armure au bon endroit anatomique).
// Le familier (eq.pet) reste géré séparément à chaque site d'appel (il est À CÔTÉ du perso, pas porté dessus).
function EquippedGear({ eq, items, size }) {
  if (!eq) return null;
  const find = id => items.find(i=>i.id===id);
  const armorAnchor = eq.armor && HELD_WEAPON_IDS.has(eq.armor) ? "weapon" : "armor";
  return (<>
    {eq.hat    && <ItemSprite itemId={eq.hat}    emoji={find(eq.hat)?.emoji}    size={equipAnchorStyle("hat",size).width}         style={equipAnchorStyle("hat",size)}/>}
    {eq.face   && <ItemSprite itemId={eq.face}   emoji={find(eq.face)?.emoji}   size={equipAnchorStyle("face",size).width}        style={equipAnchorStyle("face",size)}/>}
    {eq.armor  && <ItemSprite itemId={eq.armor}  emoji={find(eq.armor)?.emoji}  size={equipAnchorStyle(armorAnchor,size).width}   style={equipAnchorStyle(armorAnchor,size)}/>}
    {eq.themed && <ItemSprite itemId={eq.themed} emoji={find(eq.themed)?.emoji} size={equipAnchorStyle("themed",size).width}      style={equipAnchorStyle("themed",size)}/>}
  </>);
}

// v1.57.0 — Choix d'évolution : 2 éléments tirés au hasard, l'enfant choisit la voie de son familier
function EvolutionModal({ petId, tier, evo, onChoose, th }) {
  const opts = petEvoOptions(petId, tier, evo);
  const acc = th?.accent || "#FFD700";
  const spriteKey = petSpriteKey(petId);
  const legend = tier===3;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",padding:20,overflowY:"auto",textAlign:"center"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(11px,1.9vw,16px)",color:acc,marginBottom:6}}>✨ ÉVOLUTION! ✨</div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#fff",marginBottom:18,maxWidth:360,lineHeight:1.35}}>{legend?"Ton familier atteint sa forme finale! Choisis sa voie Légendaire :":"Ton familier veut évoluer. Choisis sa voie élémentaire :"}</div>
      <div style={{display:"flex",gap:18,flexWrap:"wrap",justifyContent:"center"}}>
        {opts.map(el=>{ const E=PET_ELEMENTS[el]; return (
          <button key={el} onClick={()=>{ if(SFX.click)SFX.click(); onChoose(el); }}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,background:"rgba(0,0,0,0.5)",border:`3px solid ${E.pal.b}`,borderRadius:14,padding:"16px 20px",cursor:"pointer"}}>
            <PetSprite petKey={spriteKey} size={100} palOverride={E.pal} legendary={legend}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:E.pal.b}}>{E.label}</span>
          </button>
        );})}
      </div>
    </div>
  );
}

// ─── BOSS DE FAMILLE — sprites pixel-art ORIGINAUX (dessinés sur canvas) ──────
const BOSSES = [
  { id:"dragon", name:"Dragon du Chaos",     color:"#7B3FF2", belly:"#C9B3F7", eye:"#FFE14D", emoji:"🐉" },
  { id:"slime",  name:"Slime Gluant Géant",  color:"#27AE60", belly:"#B6F0C9", eye:"#FFFFFF", emoji:"🟢" },
  { id:"golem",  name:"Golem de Pierre",     color:"#8A6A45", belly:"#CBB089", eye:"#9BE3FF", emoji:"🪨" },
  { id:"kraken", name:"Kraken des Corvées",  color:"#2E6FD6", belly:"#A9C9F4", eye:"#FFD93B", emoji:"🐙" },
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
  const col=boss?.color||"#7B3FF2", belly=boss?.belly||"#C9B3F7", eye=boss?.eye||"#FFE14D";
  if(boss?.sprite==="hydra" || /hydre|hydra/i.test(boss?.name||"")){ renderHydraToCtx(ctx, boss, W, H, s); ctx.strokeStyle="#000"; ctx.lineWidth=Math.max(1,s(0.4)); return; }
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
  ctx.strokeStyle="#000"; ctx.lineWidth=Math.max(1,s(0.4));
}
function BossSprite({ boss, size=120, style={} }){
  const ref=useRef(null);
  useEffect(()=>{ const c=ref.current; if(c) renderBossToCtx(c.getContext("2d"), boss, size, size); },[boss,size]);
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
    <div style={{position:"fixed",inset:0,zIndex:4000,background:"#000"}}>
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

// ─── BADGES PIXEL-ART (médaillon + symbole représentatif, sans emoji) ─────────
// Symbole déduit du badge (représentatif du défi)
const badgeSymbol = (b)=>{
  const id=b.id||"";
  if(id==="b_first") return "star";
  if(id==="b_5tasks") return "flame";
  if(id==="b_20tasks") return "dumbbell";
  if(id==="b_50tasks") return "trophy";
  if(id.startsWith("b_xp")) return "bolt";
  if(id.startsWith("b_coins")) return "coin";
  if(id.startsWith("b_buy")) return "bag";
  if(id==="b_streak3") return "calendar";
  if(id==="b_level5") return "crown";
  if(id.startsWith("b_level")) return "arrow";
  return "gem"; // badges de thème
};
function renderBadgeToCtx(ctx, b, earned, W=44){
  const sc=W/24, s=v=>Math.round(v*sc); ctx.clearRect(0,0,W,W);
  const gold=earned?"#FFCB2E":"#4a4a4a", goldD=earned?"#C7860A":"#333", sym=earned?"#3a2400":"#222";
  // Médaillon (disque)
  ctx.fillStyle=goldD; ctx.beginPath(); ctx.arc(W/2,W/2,s(11.5),0,7); ctx.fill();
  ctx.fillStyle=gold;  ctx.beginPath(); ctx.arc(W/2,W/2,s(10),0,7); ctx.fill();
  ctx.fillStyle=earned?"#FFE48A":"#5a5a5a"; ctx.beginPath(); ctx.arc(W/2,W/2,s(8.2),0,7); ctx.fill();
  ctx.fillStyle=gold; ctx.beginPath(); ctx.arc(W/2,W/2,s(7),0,7); ctx.fill();
  ctx.fillStyle=sym; const R=(x,y,w,h)=>ctx.fillRect(s(x),s(y),s(w),s(h));
  switch(badgeSymbol(b)){
    case "star": R(11,5,2,14);R(5,11,14,2);R(8,8,8,8);ctx.fillStyle=gold;R(9,9,6,6);break;
    case "flame": R(11,6,2,3);R(10,9,4,3);R(9,12,6,4);R(10,16,4,2);break;
    case "dumbbell": R(7,11,10,2);R(5,8,3,8);R(16,8,3,8);break;
    case "trophy": R(8,6,8,5);R(6,7,2,3);R(16,7,2,3);R(11,11,2,3);R(9,14,6,2);break;
    case "bolt": R(12,5,4,6);R(9,10,5,3);R(11,11,5,8);break;
    case "coin": ctx.fillStyle=sym;ctx.beginPath();ctx.arc(W/2,W/2,s(5.5),0,7);ctx.fill();ctx.fillStyle=gold;ctx.beginPath();ctx.arc(W/2,W/2,s(3.5),0,7);ctx.fill();ctx.fillStyle=sym;R(11,9,2,6);break;
    case "bag": R(8,9,8,8);R(9,6,2,3);R(13,6,2,3);R(10,5,4,2);break;
    case "calendar": R(6,7,12,11);ctx.fillStyle=gold;R(8,10,2,2);R(11,10,2,2);R(14,10,2,2);R(8,13,2,2);R(11,13,2,2);break;
    case "crown": R(7,13,10,3);R(7,8,2,6);R(11,7,2,7);R(15,8,2,6);break;
    case "arrow": R(11,9,2,9);R(9,9,6,2);R(8,11,2,2);R(14,11,2,2);R(10,7,4,2);R(11,5,2,2);break;
    default: R(9,7,6,2);R(7,9,10,2);R(8,11,8,3);R(10,14,4,2); // gem
  }
}
function BadgeIcon({ badge, earned, size=44, style={} }){
  const ref=useRef(null);
  useEffect(()=>{ const c=ref.current; if(c) renderBadgeToCtx(c.getContext("2d"), badge, earned, size); },[badge,earned,size]);
  return <canvas ref={ref} width={size} height={size} style={{imageRendering:"pixelated",...style}}/>;
}

// ─── COFFRES MYSTÈRES (loot boxes) ────────────────────────────
const CHESTS = [
  { id:"common", name:"Coffre Commun",     cost:80,  color:"#9AA0A6", bands:["Commun","Rare"],                    w:[70,30] },
  { id:"rare",   name:"Coffre Rare",        cost:170, color:"#4FA3FF", bands:["Rare","Ultra Rare","Légendaire"],  w:[55,35,10] },
  { id:"epic",   name:"Coffre Légendaire",  cost:320, color:"#FFB02E", bands:["Ultra Rare","Légendaire","Unique"],w:[55,33,12] },
];
const pickFromChest = (pool, chest) => {
  // tire une bande selon les poids, puis un item de cette bande (repli: tout le pool)
  let r=Math.random()*chest.w.reduce((a,b)=>a+b,0), band=chest.bands[0];
  for(let i=0;i<chest.bands.length;i++){ if(r<chest.w[i]){band=chest.bands[i];break;} r-=chest.w[i]; }
  let cand=pool.filter(it=>rarityOf(it.cost).name===band);
  if(!cand.length) cand=pool;
  return cand[Math.floor(Math.random()*cand.length)];
};
function renderChestToCtx(ctx, open, W=96){
  const sc=W/24, s=v=>Math.round(v*sc); ctx.clearRect(0,0,W,W);
  // base
  ctx.fillStyle="#7a4a1e"; ctx.fillRect(s(3),s(11),s(18),s(10));
  ctx.fillStyle="#5c3514"; ctx.fillRect(s(3),s(18),s(18),s(3));
  // lid
  ctx.fillStyle="#9a6428"; if(open){ ctx.fillRect(s(3),s(5),s(18),s(3)); } else { ctx.fillRect(s(3),s(7),s(18),s(5)); }
  // gold trim
  ctx.fillStyle="#FFD24D"; ctx.fillRect(s(3),open?s(8):s(11),s(18),s(2)); ctx.fillRect(s(11),s(11),s(2),s(8));
  // lock
  ctx.fillStyle="#FFD24D"; ctx.fillRect(s(10),s(13),s(4),s(4)); ctx.fillStyle="#5c3514"; ctx.fillRect(s(11),s(14),s(2),s(2));
  // glow if open
  if(open){ ctx.fillStyle="rgba(255,240,150,0.5)"; ctx.fillRect(s(5),s(6),s(14),s(4)); }
  ctx.strokeStyle="#3a2410"; ctx.lineWidth=Math.max(1,s(0.4));
}
function ChestSprite({ open, size=96, style={} }){
  const ref=useRef(null);
  useEffect(()=>{ const c=ref.current; if(c) renderChestToCtx(c.getContext("2d"), open, size); },[open,size]);
  return <canvas ref={ref} width={size} height={size} style={{imageRendering:"pixelated",...style}}/>;
}

// ─── CHOIX D'EMOJI + CRÉATION DE TÂCHE (picker au lieu de taper) ──────────────
const EMOJI_CHOICES = ["⭐","✅","🎯","🧹","🧺","🛏️","🍽️","🥣","🚿","🛁","🪥","🦷","👕","🎒","📚","✏️","📝","🧮","🐕","🐈","🌱","🗑️","♻️","🧴","🧽","🚽","🪣","👟","🧦","🍳","🥪","💊","💧","🪟","🛋️","🧸","🎮","⚽","🎨","🎵","🚲","🏃","💪","🌙","☀️","🍎"];
// v1.53.0 — Sélecteur de tâches en GRILLE groupée + code couleur par étiquette.
// L'enfant CHOISIT une tâche existante (réutilise son taskId → zéro doublon). Repli: créer la sienne.
function TaskChooser({ allTasks, onPick, onCreateOwn, onClose, th }){
  const acc=th?.accent||"#FFD700";
  const tasks=(allTasks||[]).filter(t=>t && t.label && !t.child); // tâches curées (catalogue + parent), pas le bric-à-brac
  const order=["routine","cuisine","menage","outdoor","defi","custom"];
  const groups={}; tasks.forEach(t=>{ const c=t.cat||"custom"; (groups[c]=groups[c]||[]).push(t); });
  const cats=Object.keys(groups).sort((a,b)=>{const ia=order.indexOf(a),ib=order.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",zIndex:2600,display:"flex",flexDirection:"column",padding:16,overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:acc}}>➕ Choisis une quête</div>
        <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
      </div>
      {cats.map(c=>{ const m=catMeta(c); return (
        <div key={c} style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
            <span style={{width:12,height:12,background:m.color,borderRadius:3,display:"inline-block"}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:m.color}}>{m.label}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
            {groups[c].map(t=>(
              <button key={t.id} onClick={()=>{SFX.click&&SFX.click();onPick(t.id);}}
                style={{display:"flex",alignItems:"center",gap:8,textAlign:"left",padding:"9px 10px",background:"rgba(0,0,0,0.45)",border:`2px solid ${m.color}55`,borderLeft:`5px solid ${m.color}`,borderRadius:8,cursor:"pointer"}}>
                <span style={{fontSize:20}}>{t.emoji||"⭐"}</span>
                <span style={{display:"flex",flexDirection:"column",minWidth:0}}>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#fff",lineHeight:1.1}}>{t.label}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:13,color:m.color}}>+{t.xp||0} XP · {t.coins||0} 🪙</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      );})}
      <button onClick={onCreateOwn} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"12px",marginTop:4,background:"rgba(0,0,0,0.4)",border:`2px dashed ${acc}`,color:acc,borderRadius:6,cursor:"pointer"}}>✏️ Je ne trouve pas — créer ma propre tâche</button>
    </div>
  );
}

function CustomTaskModal({ title="Nouvelle quête", confirmLabel="Créer", onCreate, onClose, th }){
  const [label,setLabel]=useState(""); const [emoji,setEmoji]=useState("⭐"); const [diff,setDiff]=useState("medium");
  const acc=th?.accent||"#FFD700";
  const DIFFS=[["easy","🟢 Facile","+10 XP · 5 🪙"],["medium","🟡 Moyen","+20 XP · 10 🪙"],["hard","🔴 Difficile","+40 XP · 20 🪙"]];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:2600,display:"flex",flexDirection:"column",padding:16,overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:acc}}>{title}</div>
        <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:4}}>Nom de la quête :</div>
      <input value={label} autoFocus onChange={e=>setLabel(e.target.value.slice(0,40))} placeholder="ex: Ranger ma chambre"
        style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"9px 11px",background:"#111",color:"#fff",border:`2px solid ${acc}`,borderRadius:5,outline:"none",marginBottom:10}}/>
      <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:4}}>Choisis une image : <span style={{fontSize:22}}>{emoji}</span></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4,marginBottom:14}}>
        {EMOJI_CHOICES.map(em=>(
          <button key={em} onClick={()=>{SFX.click();setEmoji(em);}}
            style={{fontSize:20,padding:"6px 0",background:emoji===em?`${acc}33`:"#1a1a1a",border:`2px solid ${emoji===em?acc:"#333"}`,borderRadius:5,cursor:"pointer"}}>{em}</button>
        ))}
      </div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:4}}>C'est difficile à quel point? (plus c'est dur, plus ça rapporte!)</div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {DIFFS.map(([k,l,sub])=>(
          <button key={k} onClick={()=>{SFX.click();setDiff(k);}}
            style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px 4px",lineHeight:1.5,background:diff===k?acc:"#1a1a1a",color:diff===k?"#000":"#999",border:`2px solid ${diff===k?acc:"#333"}`,borderRadius:5,cursor:"pointer"}}>
            {l}<br/><span style={{fontFamily:"'VT323',monospace",fontSize:11}}>{sub}</span>
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"14px",background:"#1a1a1a",color:"#888",border:"2px solid #333",borderRadius:6,cursor:"pointer"}}>← Retour</button>
        <button disabled={!label.trim()} onClick={()=>{ if(label.trim()){ onCreate({label:label.trim(),emoji,diff}); } }}
          style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"14px",background:label.trim()?acc:"#333",color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer",opacity:label.trim()?1:0.5,boxShadow:"2px 2px 0 #000"}}>
          ✅ {confirmLabel}
        </button>
      </div>
    </div>
  );
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:2500,display:"flex",alignItems:"center",justifyContent:"safe center",padding:12}}>
      <div style={{background:pt.bg||"#1a1a2e",border:`2px solid ${pt.accent||"#FFD700"}88`,borderRadius:10,padding:20,width:"min(520px,95vw)",maxHeight:"85vh",display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>
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
            {/* v1.81.0 — items équipés PORTÉS sur l'avatar, ancrés sur la vraie géométrie du corps (EquippedGear) */}
            <EquippedGear eq={eq} items={allShopItems} size={120}/>
            {eq.pet   && (petSpriteKey(eq.pet) ? <div style={{position:"absolute",bottom:-10,left:-14,pointerEvents:"none"}}><PetSprite itemId={eq.pet} size={48}/></div> : <span style={{position:"absolute",bottom:-12,left:-12,fontSize:28,pointerEvents:"none"}}>{allShopItems.find(i=>i.id===eq.pet)?.emoji}</span>)}
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
          {[["creator","✏️ Créer"],["pet","🐾 Familier"],["inventory","🎒 Inventaire"]].map(([k,l])=>(
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
              const rar = rarityOf(item.cost);
              return (
                <div key={item.id} onClick={()=>{ if(item.slot){onEquip(item);SFX.click();} }}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px 5px",
                    background:isEq?`${pt.accent}20`:`linear-gradient(180deg,${rar.color}14,rgba(0,0,0,0.45))`,
                    border:`2px solid ${isEq?(pt.accent||"#2ECC40"):rar.color}`,borderRadius:6,cursor:item.slot?"pointer":"default",
                    boxShadow:isEq?`0 0 10px ${pt.glow||"#FFD700"}60`:(rar.min>=45?`0 0 8px ${rar.color}55`:"none")}}>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:4,color:rar.color}}>{rar.name.toUpperCase()}</span>
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

        {/* FAMILIER TAB — chaque familier évolue avec sa propre XP */}
        {tab==="pet" && (()=>{
          const petXp = pState.petXp || {};
          const ownedPets = allShopItems.filter(i => i.slot==="pet" && pState.owned?.includes(i.id));
          const acc = pt.accent||"#FFD700";
          const eqPet = ownedPets.find(p=>p.id===eq.pet);
          return (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {ownedPets.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#888",textAlign:"center",padding:18,lineHeight:1.4}}>Tu n'as pas encore de familier! 🐾<br/>Achètes-en un dans la boutique 🛒, puis il grandira chaque fois que tu accomplis une quête.</div>}
              {/* Vedette : le familier équipé, en grand, avec sa progression */}
              {eqPet && (()=>{ const xp=petXp[eqPet.id]||0; const lv=petLevel(xp); const bar=petBar(xp); const pctp=bar.max?100:Math.round(bar.cur/bar.needed*100);
                const sz=64+lv*6; const _evo=(pState.petEvo||{})[eqPet.id]; const _leg=petIsLegendary(_evo,lv); // il grossit en évoluant
                return (
                  <div style={{background:`radial-gradient(circle at 50% 30%, ${acc}22, rgba(0,0,0,0.5))`,border:`3px solid ${_leg?"#FFD45A":acc}`,borderRadius:12,padding:16,textAlign:"center"}}>
                    <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:sz,filter:`drop-shadow(0 0 ${4+lv*2}px ${_leg?"#FFD45A":(pt.glow||acc)})`,transition:"all 0.4s"}}>
                      {petSpriteKey(eqPet.id) ? <PetSprite itemId={eqPet.id} size={sz} palOverride={petPalOverride(_evo)} legendary={_leg}/> : <span style={{fontSize:sz,lineHeight:1}}>{eqPet.emoji}</span>}
                    </div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:acc,marginTop:8}}>{eqPet.name} — Niv.{lv}</div>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:_leg?"#FFD45A":"#fff",marginTop:2}}>Stade : {petFormLabel(_evo,lv)} {lv>=PET_LEVELS.length?"✨ (max!)":""}</div>
                    <div style={{height:14,background:"#111",border:"2px solid #333",borderRadius:4,overflow:"hidden",margin:"8px 0 4px"}}>
                      <div style={{height:"100%",width:pctp+"%",background:`linear-gradient(90deg,${acc},#5DECF5)`,transition:"width 0.8s ease"}}/>
                    </div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>{bar.max?`${xp} XP — évolution complète!`:`${bar.cur}/${bar.needed} XP vers Niv.${lv+1}`}</div>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#7aa",marginTop:6}}>Ton familier gagne de l'XP à chaque quête validée 🌟</div>
                  </div>
                );
              })()}
              {/* Tous mes familiers — touche pour équiper (chacun garde son niveau) */}
              {ownedPets.length>0 && <>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888"}}>MES FAMILIERS</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {ownedPets.map(p=>{ const xp=petXp[p.id]||0; const lv=petLevel(xp); const isEq=eq.pet===p.id; const bar=petBar(xp); const pctp=bar.max?100:Math.round(bar.cur/bar.needed*100);
                    return (
                      <div key={p.id} onClick={()=>{onEquip(p);SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",background:isEq?`${acc}20`:"rgba(0,0,0,0.4)",border:`2px solid ${isEq?acc:"#333"}`,borderRadius:6,cursor:"pointer",boxShadow:isEq?`0 0 10px ${pt.glow||acc}60`:"none"}}>
                        <span style={{fontSize:26}}>{p.emoji}</span>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc"}}>{p.name}</span>
                        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:acc}}>Niv.{lv} · {petStage(xp)}</span>
                        <div style={{height:6,width:"90%",background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:pctp+"%",background:acc}}/>
                        </div>
                        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:isEq?"#2ECC40":"#777"}}>{isEq?"✅ ÉQUIPÉ":"Équiper"}</span>
                      </div>
                    );
                  })}
                </div>
              </>}
            </div>
          );
        })()}
        <button onClick={onClose} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"13px",marginTop:6,background:pt.accent||"#FFD700",color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>← Retour</button>
      </div>
    </div>
  );
}

// v1.73.0 — minuteur compact INLINE pour la vue rituel (3 modes : minuterie / heure butoir / chrono)
function InlineRitualTimer({ endTime, accent }){
  const [mode,setMode]=useState("down"); const [running,setRunning]=useState(false);
  const [secs,setSecs]=useState(0); const [mins,setMins]=useState(10); const [endT,setEndT]=useState(endTime||"08:00");
  const ref=useRef(null);
  useEffect(()=>{ if(!running){ if(ref.current)clearInterval(ref.current); return; }
    ref.current=setInterval(()=>{ setSecs(s=>{ if(mode==="up") return s+1; if(s<=1){ try{ if(!CALM)spawnParticles("⏰"); SFX.epic&&SFX.epic(); }catch{} setRunning(false); return 0; } return s-1; }); },1000);
    return ()=>clearInterval(ref.current);
  },[running,mode]);
  const acc=accent||"#FFD700";
  const start=()=>{ let s=0; if(mode==="down") s=Math.max(1,mins)*60; else if(mode==="deadline"){ const [h,m]=(endT||"08:00").split(":").map(Number); const now=new Date(); const end=new Date(); end.setHours(h||0,m||0,0,0); if(end<now) end.setDate(end.getDate()+1); s=Math.max(0,Math.round((end-now)/1000)); } else s=0; setSecs(s); setRunning(true); };
  const fmt=(s)=>{ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60; return (h>0?h+":"+String(m).padStart(2,"0"):String(m))+":"+String(ss).padStart(2,"0"); };
  const low=mode!=="up"&&running&&secs<=60;
  return (
    <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${acc}55`,borderRadius:10,padding:12,marginTop:6}}>
      <div style={{display:"flex",gap:5,marginBottom:8}}>
        {[["down","⏳ Minuterie"],["deadline","⏰ Heure butoir"],["up","⏱ Chrono"]].map(([k,l])=>(
          <button key={k} onClick={()=>{ if(SFX.click)SFX.click(); setMode(k); setRunning(false); setSecs(0); }} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:6,lineHeight:1.4,padding:"7px 3px",background:mode===k?acc:"#1a1a1a",color:mode===k?"#000":"#888",border:`2px solid ${mode===k?acc:"#333"}`,borderRadius:5,cursor:"pointer"}}>{l}</button>
        ))}
      </div>
      {!running && mode==="down" && (
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8,justifyContent:"center"}}>
          {[2,5,10,15,30].map(m=>(<button key={m} onClick={()=>{if(SFX.click)SFX.click();setMins(m);}} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"4px 11px",background:mins===m?acc:"#1a1a1a",color:mins===m?"#000":"#bbb",border:"2px solid #444",borderRadius:12,cursor:"pointer"}}>{m} min</button>))}
        </div>
      )}
      {!running && mode==="deadline" && (
        <div style={{textAlign:"center",marginBottom:8}}>
          <input type="time" value={endT} onChange={e=>setEndT(e.target.value)} style={{fontFamily:"'VT323',monospace",fontSize:18,padding:"6px 10px",background:"#111",color:"#fff",border:`2px solid ${acc}`,borderRadius:6}}/>
        </div>
      )}
      <div style={{textAlign:"center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(20px,5vw,32px)",color:low?"#FF4444":acc,margin:"6px 0 10px"}}>{fmt(secs)}</div>
      <div style={{display:"flex",gap:6}}>
        {!running
          ? <button onClick={()=>{if(SFX.click)SFX.click();start();}} style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"11px",background:"#2ECC40",color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>▶ Partir</button>
          : <button onClick={()=>{if(SFX.click)SFX.click();setRunning(false);}} style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"11px",background:"#FF8C00",color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>⏸ Pause</button>}
        <button onClick={()=>{if(SFX.click)SFX.click();setRunning(false);setSecs(0);}} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"11px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:6,cursor:"pointer"}}>↺ Reset</button>
      </div>
    </div>
  );
}

function PlayerDashboard({ player, playerIdx, pState, config, assignments, allTasks, allRewards, onRequestComplete, onBuy, onEquip, onChildAddTask, onChildPickTask, onChildAddRoutineTask, onRequestRemoval, onUpdatePseudo, onRespondOffer, showToast, onFeedPet, onPlayPet, onChoosePetEvo, onDismissRefusal, onBossAttack, onBossPetAttack, allStates, onLogout, onOpenParentPin, onReportBug, hamOpen, onCloseHam, onUnclaimReward, onHideReward, onClaimDaily, onOpenChest, onUpdateAvatar, parentMode, playerMode, todayDayIdx, onPatchState, onChangeTheme, onDeComplete, onForceComplete, onUpdateCalendar, onCalendarAdd, onGoFamily, onGoCalendars, onGoTimer, th }) {
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
    if(currentEnergy(pState)<AVATAR_ENERGY){ const m=minsToEnergy(pState,AVATAR_ENERGY); showToast&&showToast(`😴 Ton héros se repose… reviens dans ~${m} min pour changer de look!`,"#5DECF5",3500); return; }
    onPatchState&&onPatchState({energy:Math.max(0,currentEnergy(pState)-AVATAR_ENERGY),energyTs:new Date().toISOString()});
    setAvatarOpen(true);
  };
  const [themeRevealed, setThemeRevealed] = useState(false);
  const [badgeInfo, setBadgeInfo] = useState(null); // badge tapé → bulle d'info (tablette-friendly)
  const [finalBattle, setFinalBattle] = useState(false); // v1.77.0 — mini-jeu Combat final de l'Hydre
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
      showToast&&showToast("🌅 Nouvelle journée! Tes routines sont prêtes.","#5DECF5",4000);
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
          <div style={{maxWidth:360,width:"100%",maxHeight:"90vh",overflowY:"auto",textAlign:"center",background:"linear-gradient(160deg,#173a17,#0c220c)",border:`3px solid ${th.accent||"#2ECC40"}`,borderRadius:14,padding:"26px 22px",boxShadow:"0 0 26px rgba(46,204,64,0.5)"}}>
            <div style={{fontSize:60,lineHeight:1}}>{ritualWin.emoji}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.7vw,14px)",color:th.accent||"#2ECC40",margin:"12px 0 6px"}}>RITUEL COMPLÉTÉ!</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#fff",lineHeight:1.3}}>Bravo, tu as fini « {ritualWin.name} » au complet! 🎉</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#9ad29a",marginTop:8}}>Quelle belle job. 👏</div>
            <button onClick={(e)=>{e.stopPropagation();setRitualWin(null);}} style={{marginTop:16,fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 22px",background:th.accent||"#2ECC40",color:"#000",border:"3px solid #000",borderRadius:8,cursor:"pointer",boxShadow:"3px 3px 0 #000"}}>YEAH!</button>
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
        <div key={r.key} style={{display:"flex",alignItems:"center",gap:10,background:"#3a2410",border:"2px solid #FF8C00",borderRadius:8,padding:"9px 11px"}}>
          <span style={{fontSize:20}}>{r.emoji}</span>
          <span style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,color:"#FFD7A0",lineHeight:1.3}}><b>{r.label}</b> — {r.msg}</span>
          <button onClick={()=>{ if(SFX.click)SFX.click(); onDismissRefusal&&onDismissRefusal(r.key); }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px 9px",background:"#FF8C00",color:"#000",border:"2px solid #000",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}}>Archiver</button>
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
            {rows.map((r,i)=>{ const m=r.cat?catMeta(r.cat):null; return (<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",background:"rgba(0,0,0,0.4)",border:"1px solid #2a2a2a",borderRadius:6,marginBottom:5}}><span style={{fontSize:18}}>{r.emoji}</span><span style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#2ECC40",flex:1}}>{r.label}{m?<span style={{color:m.color,fontSize:13}}> · {m.label}</span>:""}</span>{r.time&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>{r.time}</span>}<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#2ECC40"}}>✅</span></div>); })}
            <button onClick={()=>setArchivesOpen(false)} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"13px",marginTop:8,background:pt.accent||player.color,color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer"}}>← Retour</button>
          </div>
        );
      })()}
      {/* 🐛 Signaler un bug → envoyé au parent */}
      {bugOpen && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2600,display:"flex",flexDirection:"column",padding:16,overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:"#FF8C00"}}>🐛 J'ai trouvé un bug</div>
            <button onClick={()=>{setBugOpen(false);setBugText("");}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:6}}>Explique ce qui ne marche pas — ton parent va le recevoir :</div>
          <textarea value={bugText} onChange={e=>setBugText(e.target.value.slice(0,300))} autoFocus placeholder="ex: quand je clique sur..., il se passe..."
            style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"10px 12px",background:"#111",color:"#fff",border:"2px solid #FF8C00",borderRadius:6,outline:"none",minHeight:120,resize:"vertical"}}/>
          <button disabled={!bugText.trim()} onClick={()=>{ if(bugText.trim()&&onReportBug){ const ok=onReportBug(bugText.trim()); if(ok){setBugOpen(false);setBugText("");} } }}
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,11px)",padding:"15px",marginTop:10,background:bugText.trim()?"#FF8C00":"#333",color:"#000",border:"3px solid #000",borderRadius:8,cursor:bugText.trim()?"pointer":"not-allowed",opacity:bugText.trim()?1:0.5,boxShadow:"2px 2px 0 #000"}}>📨 Envoyer au parent</button>
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
          {/* v1.84.0 (Lot 1 #B3) — sieste visible ICI aussi (pas juste sur la carte familier) dès
              qu'au moins une activité plaisir (boutique/avatar) est bloquée par l'énergie */}
          {(()=>{ const cur=currentEnergy(pState); const thresh=Math.max(SHOP_ENERGY,AVATAR_ENERGY);
            if(cur>=thresh) return null;
            const m=minsToEnergy(pState,thresh);
            return <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#5DECF5",marginTop:3}}>😴 Ton héros se repose… prêt dans ~{m} min</div>;
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
        const eColor=cur>=60?"#2ECC40":cur>=30?"#FFD700":"#FF6B6B";
        const napping=cur<PLAY_ENERGY;
        return (
          <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${acc}55`,borderRadius:8,padding:12,display:"flex",flexDirection:"column",gap:10}}>
            {/* Série */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:streak>0?"#FF8C00":"#666"}}>🔥 Série : {streak} jour{streak>1?"s":""}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#777"}}>{streak>0?"Fais une quête chaque jour!":"Fais une quête pour démarrer ta série!"}</div>
            </div>
            {eqPet ? (()=>{ const xp=(pState.petXp||{})[eqPet.id]||0; const lv=petLevel(xp); const bar=petBar(xp); const pctp=bar.max?100:Math.round(bar.cur/bar.needed*100);
              return (<>
                <div style={{display:"flex",alignItems:"center",gap:12}} onClick={openAvatar} >
                  <div style={{fontSize:48,lineHeight:1,cursor:"pointer",filter:`drop-shadow(0 0 6px ${pt.glow||acc})`,opacity:napping?0.6:1}}>{napping?"😴":eqPet.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:acc}}>{eqPet.name} — Niv.{lv}</div>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#bbb",margin:"1px 0 3px"}}>🐾 {petStage(xp)} {napping?"· 💤 fait la sieste":""}</div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888"}}>XP familier</div>
                    <div style={{height:7,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden",margin:"1px 0 4px"}}><div style={{height:"100%",width:pctp+"%",background:acc}}/></div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888"}}>⚡ Énergie {cur}%</div>
                    <div style={{height:7,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden",marginTop:1}}><div style={{height:"100%",width:cur+"%",background:eColor,transition:"width 0.6s"}}/></div>
                  </div>
                </div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:fedToday?"#2ECC40":"#FFD700",lineHeight:1.3}}>
                  {fedToday?"✅ Nourri aujourd'hui — il gagne de l'XP avec tes quêtes!":"🍖 Nourris-le aujourd'hui pour qu'il gagne de l'XP avec tes quêtes!"}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={(e)=>{e.stopPropagation();onFeedPet&&onFeedPet();}} disabled={fedToday}
                    style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"10px",background:fedToday?"#1a1a1a":"#2ECC40",color:fedToday?"#555":"#000",border:"2px solid #000",borderRadius:5,cursor:fedToday?"default":"pointer",opacity:fedToday?0.6:1}}>🍖 Nourrir</button>
                  <button onClick={(e)=>{e.stopPropagation();onPlayPet&&onPlayPet();}}
                    style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"10px",background:napping?"#1a1a1a":acc,color:napping?"#777":"#000",border:"2px solid #000",borderRadius:5,cursor:"pointer"}}>{napping?"💤 Sieste":"🎾 Jouer"}</button>
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
          <div style={{background:"rgba(94,222,245,0.08)",border:"2px solid #5DECF555",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#5DECF5",marginBottom:8}}>📬 DEMANDES DE PIÈCES ({offers.length})</div>
            {offers.map(o=>{ const from=config.players.find(p=>p.id===o.fromId); const enough=(pState.coins||0)>=o.amount;
              return (
                <div key={o.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:120,fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}><b style={{color:from?.color||"#fff"}}>{displayName(from)}</b> te demande {o.amount} 🪙</div>
                  <button disabled={!enough} onClick={()=>{SFX.click();onRespondOffer&&onRespondOffer(o.id,true);}} title={enough?"":"Pas assez de pièces"}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 10px",background:enough?"#2ECC40":"#333",color:"#000",border:"2px solid #000",borderRadius:4,cursor:enough?"pointer":"not-allowed",opacity:enough?1:0.5}}>✅ Donner</button>
                  <button onClick={()=>{SFX.click();onRespondOffer&&onRespondOffer(o.id,false);}}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 10px",background:"#1a1a1a",color:"#FF6B6B",border:"2px solid #FF6B6B55",borderRadius:4,cursor:"pointer"}}>✕</button>
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
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"0 14px",background:pseudoDraft.trim()?(pt.accent||player.color):"#333",color:"#000",border:"2px solid #000",borderRadius:4,cursor:"pointer",opacity:pseudoDraft.trim()?1:0.5}}>✅</button>
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa",marginBottom:3}}>Mon code secret (4 chiffres)</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <input type="password" inputMode="numeric" maxLength={4} value={pinDraft} onChange={e=>setPinDraft(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Nouveau"
                style={{width:92,fontFamily:"'Press Start 2P',monospace",fontSize:13,padding:"9px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center",letterSpacing:3}}/>
              <input type="password" inputMode="numeric" maxLength={4} value={pinDraft2} onChange={e=>setPinDraft2(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Encore"
                style={{width:92,fontFamily:"'Press Start 2P',monospace",fontSize:13,padding:"9px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center",letterSpacing:3}}/>
              <button disabled={!(pinDraft.length===4&&pinDraft===pinDraft2)}
                onClick={()=>{ if(pinDraft.length===4&&pinDraft===pinDraft2){ SFX.click(); onPatchState&&onPatchState({pin:pinDraft}); setProfileMsg("🔑 Code secret changé!"); setPinDraft("");setPinDraft2(""); } }}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"0 14px",alignSelf:"stretch",background:(pinDraft.length===4&&pinDraft===pinDraft2)?(pt.accent||player.color):"#333",color:"#000",border:"2px solid #000",borderRadius:4,cursor:"pointer",opacity:(pinDraft.length===4&&pinDraft===pinDraft2)?1:0.5}}>✅</button>
            </div>
            {pinDraft.length===4&&pinDraft2.length===4&&pinDraft!==pinDraft2 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#FF6B6B",marginTop:5}}>Les deux codes ne sont pas pareils.</div>}
            {profileMsg && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#2ECC40",marginTop:6}}>{profileMsg}</div>}
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
                style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:"rgba(0,0,0,0.5)",border:`2px solid ${isOn?(pt.accent||"#2ECC40"):"#333"}`,borderRadius:6,marginBottom:8,cursor:"pointer"}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:isOn?(pt.accent||"#fff"):"#999"}}>{label}</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888"}}>{desc}</div>
                </div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"6px 10px",borderRadius:20,background:isOn?(pt.accent||"#2ECC40"):"#333",color:isOn?"#000":"#888",minWidth:54,textAlign:"center"}}>{isOn?"ON":"OFF"}</div>
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
                  style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 4px",background:on?(pt.accent||"#2ECC40"):"#1a1a1a",color:on?"#000":"#bbb",border:`2px solid ${on?(pt.accent||"#2ECC40"):"#333"}`,borderRadius:4,cursor:"pointer"}}>{lbl}</button>
              ); })}
            </div>
          </div>
          <button onClick={()=>{SFX.click();setSettingsOpen(false);}}
            style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"14px",marginTop:8,background:pt.accent||player.color,color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>
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
            {weeklyFreeTheme && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#FFD700",marginBottom:10}}>🎲 Thème de la semaine gratuit : {weeklyFreeTheme.icon} {weeklyFreeTheme.name} — débloqué pour tout le monde, sans XP!</div>}
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
                      border:`3px solid ${current?t.accent:isWeeklyFree?"#FFD700":unlocked?"#555":"#2a2a2a"}`,borderRadius:8,
                      cursor:selectable?"pointer":"default",opacity:unlocked?1:0.5,boxShadow:current?`0 0 14px ${t.glow||t.accent}50`:"none"}}>
                    <span style={{fontSize:30,filter:unlocked?"none":"grayscale(1)"}}>{t.icon}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",color:current?t.accent:unlocked?"#ddd":"#666",textAlign:"center",lineHeight:1.3}}>{t.name}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:current?"#2ECC40":unlocked?(t.accent||"#FFD700"):"#777"}}>
                      {current?"✅ ACTUEL":isWeeklyFree&&unlocked?"🎲 Gratuit!":unlocked?"Choisir":`🔒 ${t.xpUnlock} XP`}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={()=>{SFX.click();setThemePicker(false);}}
              style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"14px",marginTop:14,background:pt.accent||player.color,color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>
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
            <div key={rem.id} style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${done?"#2ECC40":"#5DECF5"}`,borderRadius:5,padding:"9px 11px",position:"relative"}}>
              {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"safe center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#2ECC40",borderRadius:5}}>✅ VALIDÉ!</div>}
              <div style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#5DECF5",marginBottom:5,lineHeight:1.3}}>{rem.title}</div>
              <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",background:"rgba(93,236,245,0.1)",border:"1px solid rgba(93,236,245,0.3)",padding:"1px 4px"}}>⚡{rem.xp} XP</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"1px 4px"}}>🪙{rem.coins}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",padding:"1px 4px"}}>{rem._daysLeft===0?"📅 AUJOURD'HUI":`📅 dans ${rem._daysLeft}j`}</span>
              </div>
              {!done&&<button onClick={e=>{SFX.click();onRequestComplete(rem,player.id,e);}}
                style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#000",background:"#5DECF5",border:"3px solid #000",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>
                ✔ J'AI ÉTUDIÉ!
              </button>}
            </div>
          );
        });
      })()}

      </>)}
      {homeTab==="jour" && (<>
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
            <div key={"jour_"+rem.id} style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${done?"#2ECC40":"#5DECF5"}`,borderRadius:5,padding:"9px 11px",position:"relative"}}>
              {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"safe center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#2ECC40",borderRadius:5}}>✅ VALIDÉ!</div>}
              <div style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#5DECF5",marginBottom:5,lineHeight:1.3}}>{rem.title}</div>
              <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",background:"rgba(93,236,245,0.1)",border:"1px solid rgba(93,236,245,0.3)",padding:"1px 4px"}}>⚡{rem.xp} XP</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"1px 4px"}}>🪙{rem.coins}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",padding:"1px 4px"}}>📅 AUJOURD'HUI</span>
              </div>
              {!done&&<button onClick={e=>{SFX.click();onRequestComplete(rem,player.id,e);}}
                style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#000",background:"#5DECF5",border:"3px solid #000",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>
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
        const axp={}; (config.assignments||[]).forEach(a=>{const t=allTasks.find(x=>x.id===a.taskId); axp[a.instanceId]=t?(t.xp||0):0;});
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
                    <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:isClaimed?"#2ECC40":"#ccc"}}>{isClaimed?"✅ ":""}{o.label} <span style={{color:"#5DECF5"}}>+{o.xp} XP{o.coins?` +${o.coins}🪙`:""}</span></span>
                    {done&&!isClaimed&&<button onClick={()=>{SFX.click();onClaimDaily&&onClaimDaily(o);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 8px",background:"#2ECC40",color:"#000",border:"2px solid #000",borderRadius:3,cursor:"pointer"}}>Réclamer</button>}
                  </div>
                  <div style={{height:8,background:"#111",border:"1px solid #333",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:Math.round(o.prog/o.goal*100)+"%",background:isClaimed?"#2ECC40":`linear-gradient(90deg,${player.color},${th.accent})`,transition:"width 0.5s"}}/>
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
              background:active?acc:"rgba(0,0,0,0.4)",color:active?"#000":"#aaa",
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
                      background:on?acc:"#1a1a1a",color:on?"#000":"#bbb",border:`2px solid ${on?acc:"#333"}`,borderRadius:20,cursor:"pointer",fontWeight:on?700:400}}>
                    {r.emoji||"⏰"} {r.name}
                  </button>
                ); })}
                {routineMine.length>0 && (()=>{ const on=!pState.activeRoutineId; return (
                  <button onClick={()=>{SFX.click();onPatchState({mode:"routine",activeRoutineId:null});}}
                    style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"7px 12px",whiteSpace:"nowrap",
                      background:on?acc:"#1a1a1a",color:on?"#000":"#bbb",border:`2px solid ${on?acc:"#333"}`,borderRadius:20,cursor:"pointer",fontWeight:on?700:400}}>
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
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5"}}>⚡{t.xp}</span>
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
            <button disabled={!routineBuilder.name.trim()||routineBuilder.taskIds.length===0}
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
              style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:(routineBuilder.name.trim()&&routineBuilder.taskIds.length)?(th.accent||player.color):"#333",color:"#000",border:"2px solid #000",borderRadius:4,cursor:"pointer",opacity:(routineBuilder.name.trim()&&routineBuilder.taskIds.length)?1:0.5,boxShadow:"3px 3px 0 #000"}}>{routineBuilder.editId?"✅ Enregistrer":"✅ Créer mon rituel"}</button>
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
        if(settings.focus && myAssignments.length>0 && undone.length===0) return <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:"#2ECC40",textAlign:"center",padding:16}}>🎉 Tout est fait! Bravo!</div>;
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
          <div key={ass.instanceId} style={{background:"rgba(0,0,0,0.55)",border:`3px solid ${done?"#2ECC40":pending?"#FFD700":"#333"}`,borderRadius:5,padding:"9px 11px",position:"relative",transition:"border 0.2s"}}>
            {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"safe center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#2ECC40",borderRadius:5}}>✅ VALIDÉ!</div>}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",marginBottom:3}}>{ass.time?`⏰ ${ass.time}`:""}{isWeekAss(ass)?`📅 ${ass.days.map(d=>DAYS_SHORT[d]).join(" ")}`:""}</div>
            <div style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#fff",marginBottom:5,lineHeight:1.3}}><span style={{fontSize:18}}>{task.emoji}</span> {task.label}</div>
            <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",background:"rgba(93,236,245,0.1)",border:"1px solid rgba(93,236,245,0.3)",padding:"1px 4px"}}>⚡{task.xp} XP</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"1px 4px"}}>🪙{task.coins}</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:DIFF_COLOR(task.diff),border:`1px solid ${DIFF_COLOR(task.diff)}40`,padding:"1px 4px"}}>{task.diff.toUpperCase()}</span>
              {task.cat && (()=>{ const m=catMeta(task.cat); return <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:m.color,background:`${m.color}1A`,border:`1px solid ${m.color}55`,padding:"1px 4px"}}>{m.label}</span>; })()}
            </div>
            {!done&&!pending&&<button onClick={e=>{SFX.click();onRequestComplete(ass,player.id,e);}}
              style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",
                color:"#000",background:player.color,border:"3px solid #000",borderRadius:3,cursor:"pointer",
                boxShadow:"2px 2px 0 #000",transition:"all 0.08s"}}>
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
                color:"#000",background:"#FF8C00",border:"2px solid #CC6600",borderRadius:2,cursor:"pointer",marginTop:4}}>
              ⚡ VALIDER SANS CODE (parent)
            </button>}
            {done&&parentMode&&<button onClick={()=>onDeComplete(ass.instanceId+"_"+player.id+"#"+todayStamp(), playerIdx)}
              style={{position:"absolute",top:4,right:4,padding:"3px 7px",fontFamily:"'Press Start 2P',monospace",fontSize:"6px",
                color:"#FF4444",background:"rgba(0,0,0,0.7)",border:"1px solid #FF4444",borderRadius:2,cursor:"pointer",zIndex:10}}>
              ↩️ Annuler
            </button>}
            {pending&&<div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700",textAlign:"center",marginTop:4}}>⏳ En attente de parent…</div>}
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
                    color:allDone?"#2ECC40":"#fff",border:`2px solid ${open?acc:"#333"}`,borderRadius:8,cursor:"pointer"}}>
                  <span>{open?"▼":"▶"} {g.label}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:allDone?"#2ECC40":"#888"}}>{allDone?"✅ ":""}{doneN}/{g.items.length}</span>
                </button>
                {open && <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8,marginBottom:4}}>{g.items.map(renderCard)}</div>}
              </div>
            );
          });
        }
        const _done=a=>pState.completed?.includes(a.instanceId+"_"+player.id+"#"+todayStamp());
        const undoneAll = myAssignments.filter(a=>!_done(a)); // v1.88.0 — nommé pour réutilisation (D'abord→Ensuite)
        const list = settings.focus ? undoneAll.slice(0,1) : undoneAll; // v1.60.0 — les quêtes validées quittent la liste → Archives
        if(list.length===0 && myAssignments.length>0) return <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:"#2ECC40",textAlign:"center",padding:16,lineHeight:1.6}}>🎉 Tout est fait pour aujourd'hui!<br/><span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa"}}>Tes quêtes finies sont rangées dans 🗄️ Archives (menu ☰).</span></div>;
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
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#5DECF5"}}>{ass.days.map(d=>DAYS_SHORT[d]).join(" ")}</span>
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
        <button onClick={()=>{
            if(window.confirm("Terminer le rituel et revenir au mode Semaine?")){ onPatchState({mode:"week",activeRoutineId:null}); SFX.epic && SFX.epic(); }
          }}
          style={{width:"100%",padding:"11px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#000",background:"#2ECC40",border:"3px solid #000",borderRadius:4,cursor:"pointer",boxShadow:"2px 2px 0 #000",marginTop:4}}>
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
            style={{flex:1,padding:"8px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FF6B6B",background:"transparent",border:"1px solid #FF6B6B40",borderRadius:3,cursor:"pointer"}}>
            🗑️ Supprimer
          </button>
        </div>
      )}

      </>)}
      {homeTab==="sem" && (<>
      {/* Calendar CRUD */}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",color:"#5DECF5",marginTop:10,paddingBottom:3,borderBottom:"2px solid #5DECF540"}}>📅 MON CALENDRIER</div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#777",marginBottom:4}}>Note tes devoirs et examens — un rappel avec du XP bonus apparaîtra avant la date!</div>
      <button onClick={()=>{setCalOpen(o=>!o);SFX.click();}}
        style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"12px",
          background:calOpen?"#1a1a1a":"#5DECF5",color:calOpen?"#5DECF5":"#000",
          border:`3px solid ${calOpen?"#5DECF5":"#000"}`,borderRadius:5,cursor:"pointer",
          boxShadow:calOpen?"none":"4px 4px 0 #000",transition:"all 0.12s"}}>
        {calOpen?"✕ Fermer":"➕ Ajouter un devoir ou un examen"}
      </button>
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
        return <div style={{background:"rgba(94,222,245,0.08)",border:"2px solid #5DECF555",borderRadius:6,padding:"8px 10px",fontFamily:"'VT323',monospace",fontSize:14,color:"#9fd",lineHeight:1.3}}>💤 Ton familier est fatigué et fait une sieste — les coffres reviennent dans ~{m} min. En attendant, va faire tes quêtes! 🌟</div>;
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
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700"}}>{ch.cost} 🪙</span>
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
              ? <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#FFD700"}}>Tu l'avais déjà! Doublon → +{chestReveal.refund} 🪙</div>
              : <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#2ECC40"}}>Nouvel item débloqué! 🎉</div>}
            <button onClick={()=>{SFX.click();setChestReveal(null);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"14px 28px",background:rar.color,color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>Super!</button>
          </div>
        );
      })()}

      <div style={{background:"rgba(0,0,0,0.45)",border:"3px solid #FFD700",borderRadius:5,padding:10}}>
        <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
          {Object.entries(SHOP_TABS).map(([k,l])=>(
            <button key={k} onClick={()=>{setShopTab(k);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 7px",background:shopTab===k?"#FFD700":"#222",color:shopTab===k?"#000":"#888",border:`2px solid ${shopTab===k?"#FFD700":"#555"}`,borderRadius:2,cursor:"pointer"}}>{l}</button>
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
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"rgba(0,0,0,0.4)",border:`2px solid ${bought?"#2ECC40":canBuy?"#FFD700":"#333"}`,borderRadius:4,cursor:canBuy&&!bought?"pointer":"default",opacity:!canBuy&&!bought?0.4:1}}>
                  <span style={{fontSize:22}}>{r.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:bought?"#2ECC40":"#ddd",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      {r.label}
                      {REWARD_CAT_BADGE[r.cat] && <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#000",background:REWARD_CAT_BADGE[r.cat].color,borderRadius:3,padding:"2px 5px"}}>{REWARD_CAT_BADGE[r.cat].label}</span>}
                    </div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:bought?"#2ECC40":"#FFD700"}}>{bought?"RÉCLAMÉ!":rPrice+" 🪙"}</div>
                  </div>
                  {!bought&&canBuy&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700"}}>Acheter</span>}
                  {!bought&&!canBuy&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#444"}}>🔒</span>}
                  {bought&&<div style={{display:"flex",flexDirection:"column",gap:3}}>
                    <button onClick={(e)=>{e.stopPropagation();SFX.click();onUnclaimReward&&onUnclaimReward(r);}}
                      style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:"#FF8C00",border:"1px solid #FF8C00",borderRadius:3,cursor:"pointer",whiteSpace:"nowrap"}}>↩️ J'ai changé d'idée</button>
                    <button onClick={(e)=>{e.stopPropagation();SFX.click();onHideReward&&onHideReward(r);}}
                      style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:"#2ECC40",border:"1px solid #2ECC40",borderRadius:3,cursor:"pointer",whiteSpace:"nowrap"}}>✓ Cacher</button>
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
                  style={{background:`linear-gradient(180deg,${rar.color}14,rgba(0,0,0,0.45))`,border:`2px solid ${equipped?"#2ECC40":rar.color}`,borderRadius:6,padding:"7px 5px 5px",textAlign:"center",cursor:equipped?"default":owned||canAfford?"pointer":"not-allowed",opacity:!owned&&!canAfford?0.45:1,boxShadow:rar.min>=45?`0 0 10px ${rar.color}55`:"none",position:"relative"}}>
                  <span style={{position:"absolute",top:2,left:0,right:0,fontFamily:"'Press Start 2P',monospace",fontSize:4,color:rar.color}}>{rar.name.toUpperCase()}</span>
                  {petSpriteKey(item.id)
                    ? <PetSprite itemId={item.id} size={30} style={{margin:"6px auto 2px"}}/>
                    : <ItemSprite itemId={item.id} emoji={item.emoji} size={30} style={{margin:"6px auto 2px",fontSize:20}}/>}
                  <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc",display:"block",marginBottom:2,lineHeight:1.1}}>{item.name}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:equipped?"#2ECC40":owned?"#888":"#FFD700"}}>{equipped?"✅ ON":owned?"Équiper":iPrice+" 🪙"}</span>
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
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:pt.accent||"#FFD700",marginBottom:4}}>🏅 BADGES</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginBottom:8}}>Appuie sur un badge pour voir comment le gagner — certains sont secrets! 🕵️</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {BADGES.filter(b=>b.type==="general"||b.type===resolvedThemeId).map(b=>{
            const earned=(pState.badges||[]).includes(b.id);
            const showing=badgeInfo===b.id;
            return (
              <div key={b.id} title={earned?`${b.name}: ${b.desc}`:`🔒 ${b.desc}`}
                onClick={()=>{SFX.click();setBadgeInfo(showing?null:b.id);}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,width:60,opacity:earned?1:showing?0.7:0.3,transition:"opacity 0.3s",cursor:"pointer",borderRadius:6,outline:showing?`2px solid ${pt.accent||"#FFD700"}`:"none",padding:2}}>
                <BadgeIcon badge={b} earned={earned} size={40}/>
                <div style={{fontFamily:"'VT323',monospace",fontSize:11,color:earned?(pt.accent||"#FFD700"):"#666",textAlign:"center",lineHeight:1.2,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
              </div>
            );
          })}
        </div>
        {badgeInfo&&(()=>{
          const b=BADGES.find(x=>x.id===badgeInfo);
          if(!b)return null;
          const earned=(pState.badges||[]).includes(b.id);
          return (
            <div style={{marginTop:8,background:"rgba(0,0,0,0.5)",border:`2px solid ${earned?(pt.accent||"#FFD700"):"#444"}`,borderRadius:6,padding:"8px 12px",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:24,filter:earned?"none":"grayscale(1)"}}>{b.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:earned?(pt.accent||"#FFD700"):"#aaa"}}>{earned?b.name:"🔒 Pas encore gagné"}</div>
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
            style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 6px",lineHeight:1.5,background:enabled?(boss.color||"#FF5555"):"#1a1a1a",color:enabled?"#000":"#555",border:"2px solid #000",borderRadius:6,cursor:enabled?"pointer":"not-allowed",opacity:enabled?1:0.5,boxShadow:enabled?"2px 2px 0 #000":"none"}}>
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
              <div style={{height:18,background:"#111",border:"2px solid #333",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:hpPct+"%",background:"linear-gradient(90deg,#FF4444,#FFD700)",transition:"width 0.5s"}}/></div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700",marginTop:3}}>{hpLeft} / {hpMax} PV {won?"✓":""}</div>
            </div>
            <button onClick={()=>{ if(SFX.click)SFX.click(); setFinalBattle(true); }}
              style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:9,lineHeight:1.5,padding:"13px 8px",background:"linear-gradient(90deg,#7B2FF2,#FF5555)",color:"#fff",border:"2px solid #000",borderRadius:8,cursor:"pointer",boxShadow:"2px 3px 0 #000"}}>
              🐉 COMBAT FINAL<br/><span style={{fontFamily:"'VT323',monospace",fontSize:13}}>Affronte ta tête d'Hydre en mini-jeu!</span>
            </button>
            {!won && <div style={{background:`${boss.color||"#FF5555"}22`,border:`2px solid ${boss.color||"#FF5555"}55`,borderRadius:8,padding:"7px 10px",textAlign:"center"}}>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700"}}>{mod.emoji} {mod.label} (aujourd'hui)</span>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#eee"}}>{mod.desc}</div>
            </div>}
            {enraged && <div style={{background:"#3a0e0e",border:"2px solid #FF4444",borderRadius:8,padding:"7px 10px",textAlign:"center",fontFamily:"'VT323',monospace",fontSize:15,color:"#FF8888"}}>🔥 Le boss ENRAGE! Il vide les PV de la famille 2× plus vite — achevez-le!</div>}
            <div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888"}}>❤️ PV DE LA FAMILLE</span><span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:fhp<30?"#FF4444":"#2ECC40"}}>{fhp}%</span></div>
              <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:3,overflow:"hidden",marginTop:2}}><div style={{height:"100%",width:fhp+"%",background:fhp<30?"#FF4444":"#2ECC40",transition:"width 0.5s"}}/></div>
              {!won && fhp<40 && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#FF8888",marginTop:5,lineHeight:1.3}}>⚠️ Le boss reprend des forces! Faites des quêtes et attaquez vite pour défendre la famille!</div>}
            </div>
            {won ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:"#2ECC40",textAlign:"center",padding:16}}>🏆 BOSS VAINCU!<br/><span style={{fontFamily:"'VT323',monospace",fontSize:16}}>Bravo toute la famille! 🎉</span></div> : (<>
              <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",textAlign:"center"}}>Tu as <b style={{color:"#FFD700",fontSize:20}}>{myJetons}</b> jeton{myJetons>1?"s":""} d'attaque ⚡<br/><span style={{fontSize:13,color:"#888"}}>1 jeton par quête validée</span></div>
              <div style={{display:"flex",gap:8}}>
                {atkBtn("petite",`${boss.atkEmoji?.petite||"🗡️"} Petite`,`1 jeton · −${bossAtkDamage("petite",mod)} PV`, myJetons>=1)}
                {atkBtn("grosse",`${boss.atkEmoji?.grosse||"💥"} Grosse`,`3 jetons · −${bossAtkDamage("grosse",mod)} PV`, myJetons>=3)}
              </div>
              <button onClick={()=>{ if(SFX.click)SFX.click(); onBossPetAttack&&onBossPetAttack(); }}
                style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:8,lineHeight:1.5,padding:"12px 6px",background:(_petReady&&myJetons>=PET_ATTACK_COST)?"#FFD700":"#2a2418",color:(_petReady&&myJetons>=PET_ATTACK_COST)?"#000":"#999",border:"2px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>
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
      <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:90,display:"flex",justifyContent:"center",background:`${pt.bg||"#1a1a2e"}F2`,borderTop:`2px solid ${(pt.accent||player.color)}55`,backdropFilter:"blur(8px)",boxShadow:"0 -4px 16px rgba(0,0,0,0.45)"}}>
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
}

// ─── FAMILY OVERVIEW ─────────────────────────────────────────
// ─── PLAYER PROFILE MODAL (#8) ───────────────────────────────
function PlayerProfile({ player, pState, config, gameStates, th, onClose, meId, onGiveCoins, onCreateOffer }) {
  const gs = pState;
  const [giveAmt, setGiveAmt] = useState(0);
  const [reqAmt, setReqAmt] = useState(0);
  const meIdx = meId && meId!=="parent" ? config.players.findIndex(p=>p.id===meId) : -1;
  const myCoins = meIdx>=0 ? (gameStates[meIdx]?.coins||0) : 0;
  const canTrade = meIdx>=0 && meId!==player.id; // un enfant connecté regarde un FRÈRE
  const lt = getLevelTitle(gs.xp||0, player.themeId);
  const bar = xpBar(gs.xp||0);
  const pct = Math.min(100, Math.round((bar.cur/bar.needed)*100));
  const myBadges = (gs.badges||[]).map(id=>BADGES.find(b=>b.id===id)).filter(Boolean).slice(-6);
  const myDone = config.assignments.filter(a=>a.playerIds.includes(player.id)&&(gs.completed||[]).includes(a.instanceId+"_"+player.id+"#"+todayStamp())).length;
  const siblings = config.players.map((pl,i)=>({name:displayName(pl),xp:gameStates[i]?.xp||0,color:pl.color,isMe:pl.id===player.id})).sort((a,b)=>b.xp-a.xp);
  const maxXp = Math.max(...siblings.map(s=>s.xp),1);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16}} onClick={onClose}>
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
        {/* 🎒 Inventaire (lecture seule) — voir ce que l'autre possède + son familier */}
        {(()=>{ const owned=(gs.owned||[]).map(shopItemById).filter(Boolean); if(!owned.length) return null; const eqi=gs.equipped||{};
          return (
            <div style={{marginBottom:14}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:6}}>🎒 INVENTAIRE ({owned.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {owned.map(it=>{ const isEq=eqi[it.slot]===it.id; const rar=rarityOf(it.cost);
                  const petLvl = it.slot==="pet" ? petLevel((gs.petXp||{})[it.id]||0) : null;
                  return (
                    <div key={it.id} title={(it.name||"")+(isEq?" — équipé":"")+(petLvl?` — familier Niv.${petLvl}`:"")}
                      style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",width:46,height:46,background:isEq?`${rar.color}22`:"rgba(0,0,0,0.4)",border:`2px solid ${isEq?player.color:rar.color+"66"}`,borderRadius:6}}>
                      <span style={{fontSize:22}}>{it.emoji}</span>
                      {isEq && <span style={{position:"absolute",top:-5,right:-5,fontSize:11}}>✅</span>}
                      {petLvl && <span style={{position:"absolute",bottom:-2,fontFamily:"'Press Start 2P',monospace",fontSize:4,color:rar.color}}>N{petLvl}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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
        {/* 🪙 Échange de pièces — un enfant peut DONNER des pièces à un frère */}
        {canTrade && (
          <div style={{background:"rgba(255,215,0,0.07)",border:"2px solid #FFD70055",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700",marginBottom:6}}>🎁 DONNER DES PIÈCES</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa",marginBottom:8}}>Tu as {myCoins} 🪙. Choisis combien donner à {displayName(player)} :</div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              {[5,10,25].map(v=>(
                <button key={v} disabled={v>myCoins} onClick={()=>setGiveAmt(v)}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"7px 10px",background:giveAmt===v?"#FFD700":"#1a1a1a",color:giveAmt===v?"#000":(v>myCoins?"#555":"#FFD700"),border:`2px solid ${v>myCoins?"#333":"#FFD700"}`,borderRadius:4,cursor:v>myCoins?"not-allowed":"pointer",opacity:v>myCoins?0.5:1}}>{v}</button>
              ))}
              <input type="number" min="1" max={myCoins} value={giveAmt||""} onChange={e=>setGiveAmt(Math.max(0,Math.min(myCoins,parseInt(e.target.value)||0)))}
                placeholder="autre" style={{width:64,fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center"}}/>
              <button disabled={!(giveAmt>0&&giveAmt<=myCoins)}
                onClick={()=>{ if(giveAmt>0&&giveAmt<=myCoins&&onGiveCoins){ const ok=onGiveCoins(meId,player.id,giveAmt); if(ok){SFX.coin&&SFX.coin();setGiveAmt(0);onClose&&onClose();} } }}
                style={{flex:1,minWidth:90,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:(giveAmt>0&&giveAmt<=myCoins)?"#FFD700":"#333",color:"#000",border:"2px solid #000",borderRadius:4,cursor:(giveAmt>0&&giveAmt<=myCoins)?"pointer":"not-allowed",opacity:(giveAmt>0&&giveAmt<=myCoins)?1:0.5}}>🎁 Donner</button>
            </div>
            {/* 📨 Demander des pièces (offre que le frère doit accepter) */}
            <div style={{borderTop:"1px solid #FFD70033",marginTop:10,paddingTop:8}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#5DECF5",marginBottom:6}}>📨 DEMANDER DES PIÈCES</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa",marginBottom:8}}>{displayName(player)} a {gs.coins||0} 🪙. Demande-lui un montant — il devra accepter.</div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                {[5,10,25].map(v=>(
                  <button key={v} onClick={()=>setReqAmt(v)}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"7px 10px",background:reqAmt===v?"#5DECF5":"#1a1a1a",color:reqAmt===v?"#000":"#5DECF5",border:"2px solid #5DECF5",borderRadius:4,cursor:"pointer"}}>{v}</button>
                ))}
                <input type="number" min="1" value={reqAmt||""} onChange={e=>setReqAmt(Math.max(0,parseInt(e.target.value)||0))}
                  placeholder="autre" style={{width:64,fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center"}}/>
                <button disabled={!(reqAmt>0)}
                  onClick={()=>{ if(reqAmt>0&&onCreateOffer){ const ok=onCreateOffer(meId,player.id,reqAmt); if(ok){SFX.click&&SFX.click();setReqAmt(0);onClose&&onClose();} } }}
                  style={{flex:1,minWidth:90,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:reqAmt>0?"#5DECF5":"#333",color:"#000",border:"2px solid #000",borderRadius:4,cursor:reqAmt>0?"pointer":"not-allowed",opacity:reqAmt>0?1:0.5}}>📨 Demander</button>
              </div>
            </div>
          </div>
        )}
        <button onClick={onClose} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:10,background:player.color,color:"#000",border:"2px solid #000",borderRadius:4,cursor:"pointer",boxShadow:"3px 3px 0 #000"}}>✕ FERMER</button>
      </div>
    </div>
  );
}

// v1.95.0 (Lot 5 #23) — memo() : évite un re-render quand ses props n'ont pas vraiment changé
// (efficace maintenant que App() passe des callbacks/allTasks stabilisés, voir plus bas).
const FamilyOverview = memo(function FamilyOverview({ config, gameStates, allTasks, onSelectPlayer, canOpen, th, meId, onLike, onPostChat, onGiveCoins, onCreateOffer }) {
  const [profileIdx, setProfileIdx] = useState(null);
  const [chatText, setChatText] = useState("");
  const mayOpen = (i)=> canOpen ? canOpen(i) : true;
  const feedName = (pid)=> pid==="parent" ? "👤 Parent" : (displayName((config.players||[]).find(p=>p.id===pid))||"?");
  const feedColor = (pid)=> pid==="parent" ? "#FF8C00" : ((config.players||[]).find(p=>p.id===pid)?.color||"#888");
  const timeAgo = (ts)=>{ const s=Math.floor((Date.now()-(ts||0))/1000); if(s<60)return "à l'instant"; const m=Math.floor(s/60); if(m<60)return `il y a ${m} min`; const h=Math.floor(m/60); if(h<24)return `il y a ${h} h`; return `il y a ${Math.floor(h/24)} j`; };
  return (
    <div style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:10}}>
      {profileIdx!==null&&(
        <PlayerProfile player={config.players[profileIdx]} pState={gameStates[profileIdx]||{xp:0,coins:0,completed:[],badges:[]}} config={config} gameStates={gameStates} th={th} meId={meId} onGiveCoins={onGiveCoins} onCreateOffer={onCreateOffer} onClose={()=>setProfileIdx(null)}/>
      )}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:th.accent,marginBottom:4}}>👨‍👩‍👧‍👦 VUE FAMILLE</div>

      {/* ⚔️ Boss de famille — PV du boss (attaqué via les jetons gagnés en quêtes) */}
      {config.boss && (()=>{
        const b=config.boss; const hpMax=b.hpMax||80;
        const total=bossDamageTotal(gameStates, b.startedAt); const hpLeft=Math.max(0,hpMax-total);
        const pct=Math.min(100,Math.round(hpLeft/hpMax*100));
        const won=!!b.defeatedAt; const fhp=familyHp(b);
        return (
          <div style={{background:won?"rgba(20,55,25,0.5)":"rgba(50,18,35,0.5)",border:`2px solid ${won?"#2ECC40":b.color}`,borderRadius:10,padding:12,display:"flex",gap:12,alignItems:"center"}}>
            <BossSprite boss={b} size={84} style={{flexShrink:0,filter:won?"grayscale(0.6) opacity(0.7)":"none"}}/>
            {b.forest && <span style={{fontSize:22,flexShrink:0}}>🌲{won?"":"🔥"}🌲</span>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:won?"#2ECC40":b.color}}>{won?`🏆 ${b.name} vaincu!`:`${b.emoji} ${b.name}`}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ccc",margin:"3px 0"}}>{won?"Bravo la famille! Vous l'avez battu ensemble! 🎉":"Faites des quêtes → attaquez le boss dans l'onglet ⚔️ BOSS!"}</div>
              <div style={{height:14,background:"#111",border:"2px solid #333",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,#FF4444,#FFD700)`,transition:"width 0.6s ease"}}/>
              </div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700",marginTop:3}}>{hpLeft} / {hpMax} PV{won?" ✓":` · ❤️ Famille ${fhp}%`}</div>
            </div>
          </div>
        );
      })()}
      {/* Player cards grid */}
      <div className="fo-grid" style={{display:"grid",gridTemplateColumns:`repeat(${Math.min((config.players||[]).length,2)},1fr)`,gap:10}}>
        {(config.players||[]).map((player,i)=>{
          const ps=gameStates[i]||{xp:0,coins:0,completed:[]};
          const myDone=(config.assignments||[]).filter(a=>a.playerIds.includes(player.id)&&ps.completed?.includes(a.instanceId+"_"+player.id+"#"+todayStamp())).length;
          const myTotal=(config.assignments||[]).filter(a=>a.playerIds.includes(player.id)).length;
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
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#5DECF5"}}>⚡ {ps.xp}</span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFD700"}}>🪙 {ps.coins}</span>
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
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#5DECF5"}}>⚡{total}</span>
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
              <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#FFD700",marginTop:4,textAlign:"center"}}>🏆 En tête cette semaine : <b style={{color:leader[0].p.color}}>{displayName(leader[0].p)}</b> ({leader[0].total} XP) — continuez! 🔥</div>
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
            style={{flexShrink:0,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 12px",background:th.accent,color:"#000",border:"2px solid #000",borderRadius:5,cursor:"pointer"}}>Envoyer</button>
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
            return grouped;
          })().map(f=>{
            const liked=(f.likes||[]).includes(meId);
            return (
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:`1px solid ${f.type==="chat"?(feedColor(f.playerId)+"55"):"#2a2a2a"}`,borderRadius:6}}>
                <span style={{fontSize:18}}>{f.emoji||"✨"}</span>
                <div style={{flex:1,minWidth:0}}>
                  {f.type==="chat"
                    ? <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",lineHeight:1.25}}><b style={{color:feedColor(f.playerId)}}>{feedName(f.playerId)}:</b> {f.text}</div>
                    : <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",lineHeight:1.25}}>{f.text}</div>}
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#666",marginTop:2}}>{timeAgo(f.ts)}</div>
                </div>
                <button onClick={()=>{onLike&&onLike(f.id);SFX.click();}}
                  style={{flexShrink:0,fontFamily:"'VT323',monospace",fontSize:15,padding:"4px 8px",background:liked?"#3a1a1a":"transparent",color:liked?"#FF6B6B":"#888",border:`1px solid ${liked?"#FF6B6B":"#444"}`,borderRadius:14,cursor:"pointer"}}>
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
  onExport, onImport, onSetup, players, th }) {
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
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={onExitParent} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,
            padding:"6px 9px",background:"#000",color:"#FF8C00",border:"none",cursor:"pointer",borderRadius:2}}>🔒 Quitter</button>
          <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,
            padding:"5px 10px",background:"#000",color:"#FF8C00",border:"none",cursor:"pointer",borderRadius:2}}>✕</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,padding:"8px 10px",flexShrink:0,background:"#111",flexWrap:"wrap"}}>
        <TabBtn k="valid"    l={`✅ À valider${nbValid>0?` (${nbValid})`:""}`}/>
        <TabBtn k="tasks"    l="📋 Tâches"/>
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
                const ass=(config.assignments||[]).find(a=>a.instanceId===instanceId);
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
                      style={{marginLeft:"auto",fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 8px",background:"#1a3a1a",color:"#2ECC40",border:"1px solid #2ECC4055",borderRadius:3,cursor:"pointer"}}>✅ Tout valider</button>
                  </div>
                  {its.map(it=>(
                <div key={it.doneKey} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${it.pl?.color||"#444"}50`,borderRadius:5,padding:"10px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:18}}>{it.emoji}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",lineHeight:1.2}}>{it.label}</div>
                      <div style={{display:"flex",gap:8,marginTop:2}}>
                        {it.xp!=null&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5"}}>⚡{it.xp}</span>}
                        {it.coins!=null&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700"}}>🪙{it.coins}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <PBtn onClick={()=>onApprovePending(it.playerIdx,it.doneKey)} color="#1a3a1a" textColor="#2ECC40" style={{flex:1}}>✅ Valider</PBtn>
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
                          <PBtn onClick={()=>onApproveRemoval(req.id)} color="#1a3a1a" textColor="#2ECC40" style={{flex:1}}>✅ Retirer la tâche</PBtn>
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
              style={{width:"100%",textAlign:"left",background:"#111",border:"2px solid #FF8C00",color:addTaskId?"#fff":"#888",padding:"10px",fontFamily:"'VT323',monospace",fontSize:16,borderRadius:3,marginBottom:8,cursor:"pointer"}}>
              {(()=>{ const t=allTasks.find(x=>x.id===addTaskId); return t ? `${t.emoji} ${t.label} (⚡${t.xp} 🪙${t.coins})` : "— Choisir une tâche —"; })()}
            </button>
            {chooserOpen && <TaskChooser allTasks={allTasks} th={{accent:"#FF8C00"}}
              onPick={(id)=>{setAddTaskId(id);setChooserOpen(false);}}
              onCreateOwn={()=>{setChooserOpen(false);setCustomOpen(true);}}
              onClose={()=>setChooserOpen(false)}/>}
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
              {players.map(pl=>{
                const sel=addPlayerIds.includes(pl.id);
                return <div key={pl.id} onClick={()=>setAddPlayerIds(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#000":"#555",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {displayName(pl)}
                </div>;
              })}
            </div>
            {/* v1.71.0 — Quand : rituel (chaque jour, sans planif) OU planifié (jours choisis = récurrence) */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",margin:"2px 0 5px"}}>QUAND?</div>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[["routine","⏰ Rituel"],["week","📅 Planifié"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setAddType(k);SFX.click();}}
                  style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px",background:addType===k?"#FF8C00":"#1a1a1a",color:addType===k?"#000":"#888",border:`2px solid ${addType===k?"#FF8C00":"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
            </div>
            {addType==="week" && (()=>{ const eq=(dd)=>JSON.stringify([...addDays].sort((a,b)=>a-b))===JSON.stringify([...dd].sort((a,b)=>a-b)); return (
              <div style={{marginBottom:8}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",marginBottom:5}}>RÉCURRENCE — QUELS JOURS?</div>
                <div style={{display:"flex",gap:5,marginBottom:6,flexWrap:"wrap"}}>
                  {[["Chaque jour",[0,1,2,3,4,5,6]],["Lun–Ven",[0,1,2,3,4]],["Fin de sem.",[5,6]]].map(([lbl,dd])=>(
                    <button key={lbl} onClick={()=>{SFX.click();setAddDays(dd);}} style={{fontFamily:"'VT323',monospace",fontSize:14,padding:"4px 10px",background:eq(dd)?"#FF8C00":"#1a1a1a",color:eq(dd)?"#000":"#bbb",border:"2px solid #444",borderRadius:14,cursor:"pointer"}}>{lbl}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:3}}>
                  {DAYS_SHORT.map((d,i)=>{ const on=addDays.includes(i); return (
                    <button key={i} onClick={()=>{SFX.click();setAddDays(a=>on?a.filter(x=>x!==i):[...a,i]);}} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px 0",background:on?"#FF8C00":"#1a1a1a",color:on?"#000":"#666",border:`2px solid ${on?"#FF8C00":"#333"}`,borderRadius:3,cursor:"pointer"}}>{d[0]}</button>
                  );})}
                </div>
              </div>
            ); })()}
            <PBtn onClick={()=>{ if(addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)){ onAddAssignment(addTaskId,addPlayerIds,addType,addDays); setAddTaskId(""); } }}
              color={addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)?"#FF8C00":"#333"} textColor="#000" style={{width:"100%",opacity:addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)?1:0.5,marginBottom:8}}>
              ➕ Ajouter {addType==="week"?`(${addDays.length} jour${addDays.length>1?"s":""}/sem.)`:"(rituel)"}
            </PBtn>
            <button onClick={()=>{ SFX.click(); setCustomOpen(true); }}
              style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px",background:"rgba(0,0,0,0.4)",border:"2px dashed #FF8C0060",color:"#FF8C00",borderRadius:4,cursor:"pointer",marginBottom:14}}>
              + Créer une tâche personnalisée
            </button>
            {customOpen && <CustomTaskModal title="Nouvelle tâche personnalisée" confirmLabel="Créer la tâche" th={{accent:"#FF8C00"}}
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
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:(Array.isArray(ass.days)&&ass.days.length>0)?"#5DECF5":"#FFA94D"}}>{(Array.isArray(ass.days)&&ass.days.length>0)?"📅 semaine":"⏰ routine"}</span>
                      {ass.time&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#888"}}>⏰{ass.time}</span>}
                    </div>
                  </div>
                  <button onClick={()=>onRemoveAssignment(ass.instanceId)} style={{background:"none",border:"none",color:"#FF4444",cursor:"pointer",fontSize:16,padding:4}}>×</button>
                </div>
              );
            })}
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#444",marginTop:8,lineHeight:1.4}}>
              Pour les horaires et les jours de la semaine, passe par ⚙️ Modifier le livre (onglet Actions).
            </div>
            {/* 🧹 Ménage : supprimer les tâches qu'un enfant s'est créées */}
            {(config.customTasks||[]).some(t=>t.child) && (
              <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #333"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FF8C00",marginBottom:6}}>🧹 MÉNAGE — TÂCHES PERSO DES ENFANTS</div>
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
                        style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:rChildIdx===i?pl.color:"#1a1a1a",color:rChildIdx===i?"#000":"#666",border:`2px solid ${rChildIdx===i?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>
                    ))}
                  </div>
                  <input value={rName} onChange={e=>setRName(e.target.value.slice(0,16))} placeholder="Nom du rituel (ex: Matin)"
                    style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,marginBottom:8,outline:"none"}}/>
                  {childRoutineTasks.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#666",marginBottom:8}}>Cet enfant n'a pas encore de tâche de type ⏰ Rituel. Ajoute-lui-en en haut (type Routine).</div>}
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8,maxHeight:"26vh",overflowY:"auto"}}>
                    {childRoutineTasks.map(a=>{ const t=allTasks.find(x=>x.id===a.taskId); if(!t)return null; const sel=rTaskIds.includes(a.instanceId);
                      return (
                        <div key={a.instanceId} onClick={()=>{SFX.click();setRTaskIds(ids=>sel?ids.filter(x=>x!==a.instanceId):[...ids,a.instanceId]);}}
                          style={{display:"flex",alignItems:"center",gap:8,padding:"6px 9px",background:sel?"#1a3a1a":"rgba(0,0,0,0.4)",border:`2px solid ${sel?"#2ECC40":"#333"}`,borderRadius:4,cursor:"pointer"}}>
                          <span style={{fontSize:15}}>{sel?"✅":t.emoji}</span>
                          <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",flex:1}}>{t.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <PBtn onClick={()=>{ if(rName.trim()&&rTaskIds.length){ onAssignRoutine&&onAssignRoutine(rChildIdx,{name:rName.trim(),emoji:"🌅",taskIds:rTaskIds}); setRName("");setRTaskIds([]); } }}
                    color={rName.trim()&&rTaskIds.length?"#2ECC40":"#333"} textColor="#000" style={{width:"100%",opacity:rName.trim()&&rTaskIds.length?1:0.5}}>
                    🧩 Assigner ce rituel à {child?displayName(child):"…"}
                  </PBtn>
                </div>
              );
            })()}
          </div>
        )}

        {/* ACTIONS TAB */}
        {tab==="actions" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>ACTIONS GLOBALES</div>
          {/* Boss de famille surprise */}
          <div style={{background:"rgba(50,18,35,0.4)",border:"2px solid #7B3FF2",borderRadius:6,padding:"10px",marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#C9B3F7",marginBottom:5}}>🐉 BOSS DE FAMILLE</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#999",marginBottom:8}}>Lance un boss : chaque quête faite donne un jeton d'attaque. La famille l'attaque dans l'onglet ⚔️ BOSS. Choisis sa difficulté (ses PV).</div>
            {bossActive
              ? <PBtn onClick={()=>{}} color="#333" textColor="#fff" style={{width:"100%",opacity:0.6}}>⚔️ Un boss est déjà en cours…</PBtn>
              : <div style={{display:"flex",gap:6}}>
                  {[["facile","Facile"],["moyen","Moyen"],["costaud","Costaud"]].map(([k,l])=>(
                    <PBtn key={k} onClick={()=>{ onLaunchBoss&&onLaunchBoss(k); }} color="#7B3FF2" textColor="#fff" style={{flex:1}}>{l}</PBtn>
                  ))}
                </div>}
          </div>
          <Row>
            {undoStack.length>0
              ? <PBtn onClick={onUndo} color="#FF6464" textColor="#000" style={{flex:1}}>↩️ Annuler dernière</PBtn>
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
                <PBtn onClick={()=>onAdjustXP(i,10)} color="#1a3a1a" textColor="#2ECC40" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+10 XP</PBtn>
                <PBtn onClick={()=>onAdjustXP(i,25)} color="#1a3a1a" textColor="#2ECC40" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+25 XP</PBtn>
                <PBtn onClick={()=>onAdjustXP(i,-10)} color="#3a1a1a" textColor="#FF6464" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>-10 XP</PBtn>
                <PBtn onClick={()=>onResetPlayer(i)} color="#2a0a0a" textColor="#FF4444" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>🔄 À zéro</PBtn>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                <PBtn onClick={()=>onAdjustCoins&&onAdjustCoins(i,10)} color="#3a3000" textColor="#FFD700" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+10 🪙</PBtn>
                <PBtn onClick={()=>onAdjustCoins&&onAdjustCoins(i,50)} color="#3a3000" textColor="#FFD700" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+50 🪙</PBtn>
                <PBtn onClick={()=>{const v=parseInt(prompt("Combien de pièces ajouter (ou négatif pour retirer)?","50")||"0",10); if(v)onAdjustCoins&&onAdjustCoins(i,v);}} color="#3a3000" textColor="#FFD700" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>🪙 Montant…</PBtn>
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
                style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #5DECF5",borderRadius:4,marginBottom:8,outline:"none"}}/>
              <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
                {[["evenement","📅 Événement"],["devoir","📚 Devoir"],["examen","📝 Examen"],
                  ["sante",CAL_TYPES.sante.label],["sport",CAL_TYPES.sport.label],["intervenant",CAL_TYPES.intervenant.label],["camp",CAL_TYPES.camp.label]].map(([v,l])=>(
                  <button key={v} onClick={()=>{setCeType(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 8px",background:ceType===v?"#5DECF5":"#1a1a1a",color:ceType===v?"#000":"#888",border:`2px solid ${ceType===v?"#5DECF5":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
                {[["none","Une date"],["weekly","Chaque semaine"],["daily","Chaque jour"]].map(([v,l])=>(
                  <button key={v} onClick={()=>{setCeRecur(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 8px",background:ceRecur===v?"#FF8C00":"#1a1a1a",color:ceRecur===v?"#000":"#888",border:`2px solid ${ceRecur===v?"#FF8C00":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
              {ceRecur==="none" && <input type="date" value={ceDate} onChange={e=>setCeDate(e.target.value)} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,marginBottom:8,outline:"none",display:"block"}}/>}
              {ceRecur==="weekly" && <select value={ceDay} onChange={e=>setCeDay(+e.target.value)} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,marginBottom:8}}>{DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}</select>}
              <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888",marginBottom:4}}>Pour quel enfant?</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                {players.map(pl=>{ const sel=cePlayers.includes(pl.id); return (
                  <div key={pl.id} onClick={()=>setCePlayers(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#000":"#555",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>
                ); })}
              </div>
              <PBtn onClick={()=>{ if(ceLabel.trim()&&cePlayers.length&&(ceRecur!=="none"||ceDate)){ onAddCalendarEvent&&onAddCalendarEvent(cePlayers,{type:ceType,label:ceLabel.trim(),date:ceRecur==="none"?ceDate:null,recur:ceRecur==="none"?null:(ceRecur==="weekly"?{freq:"weekly",day:ceDay}:{freq:"daily"})}); setCeLabel("");setCeDate(""); } }}
                color={ceLabel.trim()&&cePlayers.length&&(ceRecur!=="none"||ceDate)?"#5DECF5":"#333"} textColor="#000" style={{width:"100%",marginBottom:14,opacity:ceLabel.trim()&&cePlayers.length&&(ceRecur!=="none"||ceDate)?1:0.5}}>➕ Ajouter au calendrier</PBtn>

              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:10}}>CALENDRIER COMMUN</div>
              {allEntries.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#555",textAlign:"center",padding:16}}>Aucun événement.</div>}
              {allEntries.map(e=>(
                <div key={e.id+"_"+e.playerName} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:`2px solid ${(e.date&&e.date<today)?"#333":e.date===today?"#FFD700":"#444"}`,borderRadius:4,marginBottom:6,opacity:(e.date&&e.date<today)?0.4:1}}>
                  <span style={{fontSize:16}}>{calEventIcon(e)}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}>{e.label}</div>
                    <div style={{display:"flex",gap:6,marginTop:2}}>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:e.playerColor}}>{e.playerName}</span>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:e.date===today?"#FFD700":"#666"}}>{recurLbl(e)}</span>
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
            <div style={{background:"rgba(255,140,0,0.08)",border:"2px solid #FF8C0055",borderRadius:6,padding:"10px 12px",marginBottom:12}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FF8C00",marginBottom:8}}>🐛 BUGS SIGNALÉS ({(config.bugs||[]).length})</div>
              {(config.bugs||[]).map(b=>(
                <div key={b.id} style={{marginBottom:8,paddingBottom:6,borderBottom:"1px solid #FF8C0022"}}>
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
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:14}}>CHANGER LE CODE PARENT</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",marginBottom:10}}>Code actuel : {config.pin}</div>
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
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:14}}>SAUVEGARDE</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#666",marginBottom:12,lineHeight:1.4}}>
            Télécharge une copie du livre de quêtes pour le transférer sur un autre appareil ou garder une sauvegarde.
          </div>
          <PBtn onClick={onExport} color="#1a3a1a" textColor="#2ECC40" style={{width:"100%",marginBottom:10}}>
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
function PinKeypad({ onDigit, onBack, onClose, onSubmit, closeLabel="✕" }) {
  useEffect(() => {
    const handle = (e) => {
      if (e.key >= "0" && e.key <= "9") { SFX.click(); onDigit(e.key); }
      else if (e.key === "Backspace") { SFX.click(); onBack(); }
      else if (e.key === "Enter" && onSubmit) { SFX.click(); onSubmit(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onDigit, onBack, onClose, onSubmit]);
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:8,padding:12,overflowY:"auto",boxSizing:"border-box"}}>
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
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:"#FFD700"}}>{isGift ? "🎁 CADEAU SURPRISE!" : `🎉 NIVEAU ${level} ATTEINT!`}</div>
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
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:"#FFD700"}}>{isGift ? "🎁 CADEAU SURPRISE!" : `🎉 NIVEAU ${level} ATTEINT!`}</div>
        <div style={{fontSize:64,lineHeight:1}}>{INFO.icon}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,18px)",color:pt.accent,textShadow:`0 0 14px ${pt.glow}80`}}>{INFO.name}</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(17px,2.6vw,21px)",color:"#fff",maxWidth:380,lineHeight:1.35}}>{INFO.how}</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#FFD700"}}>🏆 Paliers de récompense :</div>
        {minigameTierRow(type)}
        <button onClick={()=>{SFX.click&&SFX.click();setCount(3);setPhase("countdown");}}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,14px)",padding:"16px 30px",background:pt.accent,color:"#000",border:"4px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"5px 5px 0 #000",marginTop:6}}>
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
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:count>0?"clamp(44px,12vw,90px)":"clamp(30px,9vw,64px)",color:count>0?"#fff":"#2ECC40",textShadow:`0 0 30px ${pt.glow}`,animation:"bounceIn 0.3s ease"}}>
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
  const acc=th.accent||(child?.color)||"#FFD700";
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
          <span style={{flex:1,fontFamily:"'VT323',monospace",fontSize:16,color:st==="done"?"#2ECC40":"#eee",textDecoration:st?"line-through":"none",opacity:st?0.65:1}}>{t.label}</span>
          {st==="done" ? <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#2ECC40"}}>✅</span>
           : st==="pending" ? <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFC107"}}>⏳ attente</span>
           : <button onClick={()=>{ SFX.click&&SFX.click(); onCompleteTask&&onCompleteTask(ass,_pid); }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"7px 10px",background:"#2ECC40",color:"#000",border:"2px solid #000",borderRadius:4,cursor:"pointer"}}>Fait!</button>}
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
        {config.players.map((pl,i)=>(<div key={pl.id} onClick={()=>{setChildIdx(i);setRitualId(null);setStartTs(null);setTimeUp(false);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:cidx===i?pl.color:"#1a1a1a",color:cidx===i?"#000":"#666",border:`2px solid ${cidx===i?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>))}
      </div>}

      {!startTs && (<>
        {/* Choix du mode */}
        <div style={{display:"flex",gap:6}}>
          {[["deadline","🕐 Heure de fin"],["down","⏳ Minutes"],["up","⏱ Chrono"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setMode(k);SFX.click();}}
              style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,0.85vw,7px)",padding:"11px 4px",background:mode===k?acc:"#1a1a1a",color:mode===k?"#000":"#999",border:`2px solid ${mode===k?acc:"#333"}`,borderRadius:6,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        {/* Quelle tâche on chronomètre (libre) */}
        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb"}}>Qu'est-ce que tu chronomètres?</div>
        <input value={taskLabel} onChange={e=>{setTaskLabel(e.target.value.slice(0,40));setRitualId(null);}} placeholder="ex: Ranger ma chambre, brosser mes dents…"
          style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"9px 11px",background:"#111",color:"#fff",border:`2px solid ${ritualId?"#333":acc}`,borderRadius:6,outline:"none"}}/>
        {routines.length>0 && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <span style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777",alignSelf:"center"}}>ou un rituel (donne de l'XP 🎁) :</span>
          {routines.map(r=>(<button key={r.id} onClick={()=>{setRitualId(r.id);setTaskLabel("");if(r.endTime){setMode("deadline");setEndTime(r.endTime);}SFX.click();}} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 11px",background:ritualId===r.id?acc:"#1a1a1a",color:ritualId===r.id?"#000":"#bbb",border:`2px solid ${ritualId===r.id?acc:"#333"}`,borderRadius:20,cursor:"pointer"}}>{r.emoji||"⏰"} {r.name}{r.endTime?` · ${r.endTime.replace(":","h")}`:""}</button>))}
        </div>}
        {/* Rappel clair : outil vs rituel */}
        <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:ritual?"#2ECC40":"#888",lineHeight:1.3,background:"rgba(0,0,0,0.3)",borderRadius:5,padding:"6px 9px"}}>
          {ritual ? `🎁 Rituel « ${ritual.name} » : le réussir dans les temps donne de l'XP!` : "🛠️ Minuterie libre : c'est juste un outil pour t'aider — pas de récompense. Choisis un rituel ci-dessus pour gagner de l'XP."}
        </div>
        {/* v1.68.0 (B4) — les tâches du rituel, cochables ici même */}
        {ritualChecklistEl}
        {/* Durée (compte à rebours) */}
        {mode==="down" && <>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginTop:2}}>Combien de minutes? <b style={{color:acc}}>{targetMin} min</b></div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {[1,2,5,10,15,20].map(v=>(
              <button key={v} onClick={()=>{setTargetMin(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 11px",background:targetMin===v?acc:"#1a1a1a",color:targetMin===v?"#000":acc,border:`2px solid ${acc}`,borderRadius:5,cursor:"pointer"}}>{v}</button>
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
              <button key={v} onClick={()=>{setEndTime(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 11px",background:endTime===v?acc:"#1a1a1a",color:endTime===v?"#000":acc,border:`2px solid ${acc}`,borderRadius:5,cursor:"pointer"}}>{v.replace(":","h")}</button>
            ))}
            <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value||"07:30")}
              style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:5,outline:"none"}}/>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777"}}>Le minuteur va compter jusqu'à cette heure. À 5 minutes : « Let's go! » 🚀</div>
        </>}
        <button onClick={start}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#2ECC40",color:"#000",border:"3px solid #000",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #000",marginTop:4}}>
          ▶️ {mode==="deadline"?`Partir (jusqu'à ${endTime.replace(":","h")})`:mode==="down"?`Partir (${targetMin} min)`:"Partir le chrono"}
        </button>
      </>)}

      {startTs && !timeUp && (<>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:acc,textAlign:"center"}}>{ritual?`${ritual.emoji||"⏰"} ${ritual.name}`:`⏳ ${taskName()}`}{mode==="deadline"?` — jusqu'à ${endTime.replace(":","h")}`:""}</div>
        {mode==="deadline" && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:urgent5?"#FF6B6B":"#bbb",textAlign:"center"}}>il reste <b>{Math.ceil(remaining/60000)}</b> min</div>}
        {/* v1.88.0 (Lot 3 #13) — disque visuel, seulement quand on a une vraie durée totale (pas en chrono libre) */}
        {(mode==="down"||mode==="deadline") && (()=>{ const totalMs = mode==="down" ? targetMin*60000 : Math.max(1,deadlineMs-(startTs||0)); return (
          <TimeTimerDisc progress={remaining/totalMs} color={acc} urgent={lowTime}/>
        ); })()}
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(34px,9vw,64px)",color:lowTime?"#FF6B6B":urgent5?"#FFA94D":"#fff",textAlign:"center",letterSpacing:2,animation:lowTime?"pulse 0.6s infinite":"none"}}>{String(mm).padStart(2,"0")}:{String(ss).padStart(2,"0")}</div>
        {mode==="down" && <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:Math.round(remaining/(targetMin*60000)*100)+"%",background:lowTime?"#FF6B6B":acc,transition:"width 0.25s linear"}}/></div>}
        {urgent5
          ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,15px)",color:"#FFA94D",textAlign:"center",animation:"pulse 0.7s infinite"}}>🚀 LET'S GO! Plus que {Math.ceil(remaining/60000)} min!</div>
          : <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:acc,textAlign:"center",minHeight:24}}>{TIMER_ENCOURAGE[Math.floor(elapsed/20000)%TIMER_ENCOURAGE.length]}</div>}
        {/* v1.68.0 (B4) — coche les tâches du rituel pendant que le minuteur tourne */}
        {ritualChecklistEl}
        <button onClick={succeed}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#2ECC40",color:"#000",border:"3px solid #000",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>🎉 J'ai réussi!</button>
        <button onClick={fail} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px",background:"#1a1a1a",color:"#888",border:"2px solid #333",borderRadius:5,cursor:"pointer"}}>✕ Abandonner</button>
      </>)}

      {startTs && timeUp && (<>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,16px)",color:acc,textAlign:"center"}}>⏰ Temps écoulé!</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#ddd",textAlign:"center",lineHeight:1.3}}>As-tu réussi « {taskName()} »?</div>
        <button onClick={succeed}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#2ECC40",color:"#000",border:"3px solid #000",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #000"}}>🎉 Oui, réussi!</button>
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
  const accentColor = player?.color || "#FFD700";

  const BtnBack = ({onClick, label="← Retour"}) => (
    <button onClick={()=>{SFX.click();onClick();}} style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#444",background:"none",border:"none",cursor:"pointer",marginTop:8}}>{label}</button>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0d0d0d",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",padding:"20px 16px",position:"relative",overflow:"hidden"}}>
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
            ["🎨","13 Thèmes","Minecraft, Harry Potter, Marvel, Ghibli, Roblox… Chaque thème change les couleurs et les titres de toute la page. Tu choisis le tien à ta première connexion!"],
            ["🏅","Badges","Des badges secrets à débloquer en faisant des tâches. Streaks, premières fois, défis épiques… survole un badge pour voir comment le gagner!"],
            ["📅","Calendrier","Note tes devoirs et examens ici! Un rappel va apparaître automatiquement quand la date approche, avec de l'XP bonus pour compléter."],
            ["🎮","Mini-jeux","Quand tu montes de niveau, choisis TOI-MÊME ton mini-jeu! 🎮 Trois jeux possibles: Whack-a-Mole (tape les monstres!), Runner (saute les obstacles!) ou Pac-Quest (mange les pellets, évite le fantôme!). Les paliers de récompense sont affichés avant de jouer — fais un score parfait pour gagner le max de XP et de pièces bonus. 🏆"],
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
          {pPin.length===4&&<button onClick={doPlayerSubmit} style={{marginTop:10,width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"10px 0",background:accentColor,color:"#000",border:"none",borderRadius:6,cursor:"pointer"}}>✅ VALIDER</button>}
        </div>
      )}

      {/* ── PIN parent ── */}
      {mode === "parent" && (
        <div style={{background:"rgba(0,0,0,0.85)",border:"3px solid #FF8C00",borderRadius:12,padding:"24px 28px",textAlign:"center",maxWidth:300,width:"100%"}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#FF8C00",marginBottom:16}}>🔐 PIN PARENT</div>
          <PinDots value={ppPin} error={pinError} color="#FF8C00"/>
          <PinKeypad
            onDigit={handleParentDigit}
            onBack={()=>{ ppPinRef.current=ppPinRef.current.slice(0,-1); setPpPin(ppPinRef.current); }}
            onClose={()=>{setMode("who");setPpPin("");setPinError(false);}}
            onSubmit={ppPin.length===4?doParentSubmit:undefined}
          />
          {ppPin.length===4&&<button onClick={doParentSubmit} style={{marginTop:10,width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"10px 0",background:"#FF8C00",color:"#000",border:"none",borderRadius:6,cursor:"pointer"}}>✅ VALIDER</button>}
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
      return {...g, coins:(g.coins||0)+40, xp:(g.xp||0)+50,
        owned:[...new Set([...(g.owned||[]), _it.id])],
        badges:[...new Set([...(g.badges||[]),"b_boss"])],
        pendingCelebrations:[...(g.pendingCelebrations||[]), {bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]};
    });
    const nb = {...boss, defeatedAt:now};
    const fe = {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`};
    const ncfg = {...cfgRef.current, boss:nb, feed:[fe,...(cfgRef.current.feed||[])].slice(0,60)};
    setConfig(ncfg); setGameStates(n); persist(ncfg, n);
  },[gameStates, config?.boss]);

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
    showToast("📨 Envoyée à tes parents pour validation!","#5DECF5",3500);
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
    const ass=(config.assignments||[]).find(a=>a.instanceId===instanceId);
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
      const updatedPs={...p,xp:newXp,coins:newCoins,completed:[...new Set([...(p.completed||[]),doneKey])],pending:(p.pending||[]).filter(k=>k!==doneKey),completedAt:{...(p.completedAt||{}), [doneKey]:new Date().toISOString()}};
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
      showToast(`✅ Validé! ${displayName(player)} aura sa surprise${prevLv<newLv?" et son jeu de niveau":""} à sa prochaine connexion 🎉`,"#2ECC40",4000);
      return n;
    });
    logAction(`✅ Validé: ${displayName(player)} — ${task.label}`,"#2ECC40");
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
    logAction(`✗ Refusé: ${displayName(player)} — ${task?.label||doneKey}`,"#FF8C00");
    showToast(`✗ Demande refusée`,"#FF8C00");
  },[config,persist,resolvePendingTask,logAction,showToast]);

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
    if(currentEnergy(p0)<SHOP_ENERGY){ const m=minsToEnergy(p0,SHOP_ENERGY); showToast(`😴 Ton héros se repose… la boutique rouvre dans ~${m} min!`,"#5DECF5",3500); return; }
    setGameStates(gs=>{
      const p=gs[idx];
      const isReward=!item.slot;
      const price=priceOf(item); // items (.cost) ET récompenses (.coins), ×PRICE_MULT
      if((p.coins||0)<price)return gs;
      SFX.buy();
      const n=[...gs]; n[idx]={...p,coins:(p.coins||0)-price,owned:[...new Set([...(p.owned||[]),item.id])],boughtRewards:isReward?[...new Set([...(p.boughtRewards||[]),item.id])]:p.boughtRewards,equipped:item.slot?{...(p.equipped||{}),[item.slot]:item.id}:(p.equipped||{}),energy:Math.max(0,currentEnergy(p)-SHOP_ENERGY),energyTs:new Date().toISOString()};
      persist(config,n);
      showToast(`🎉 ${item.emoji} ${item.name||item.label} acheté!`,"#FFD700");
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
    showToast(`${delta>0?"+":""}${delta} XP pour ${player?.name}`,"#5DECF5");
  },[config,persist,logAction,showToast]);

  // Ajuster les pièces seulement (ex: rembourser une récompense)
  const handleAdjustCoins = useCallback((playerIdx, delta) => {
    const player = config.players[playerIdx];
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],coins:Math.max(0,(n[playerIdx].coins||0)+delta)}; persist(config,n); return n; });
    logAction(`${delta>0?"+":""}${delta} 🪙 → ${player?.name}`,"#FFD700");
    showToast(`${delta>0?"+":""}${delta} 🪙 pour ${player?.name}`,"#FFD700");
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
      n[playerIdx]={...p,xp:p.xp+task.xp,coins:p.coins+task.coins,
        completed:[...new Set([...(p.completed||[]),doneKey])],
        pending:(p.pending||[]).filter(k=>k!==doneKey)};
      persist(config,n); return n; });
    logAction(`✅ Override: ${player?.name} — ${task.label}`,"#2ECC40");
    showToast(`✅ Tâche forcée pour ${player?.name}`,"#2ECC40");
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
    logAction(`➕ Tâche ajoutée: ${task?.label||taskId} (${playerIds.length} joueur${playerIds.length>1?"s":""})`,"#2ECC40");
    showToast("➕ Tâche ajoutée!","#2ECC40");
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
    showToast(`${boss.emoji} ${boss.name} apparaît! Battez-le en famille!`,"#FF6B6B",4500);
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
      if(defeated){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, xp:(n[i].xp||0)+50, owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], pendingCelebrations:[...(n[i].pendingCelebrations||[]), {bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } } // v1.74.0 — +40🪙 +50XP + badge + item ULTRA LÉGENDAIRE + notif différée à chaque enfant
      const fe = defeated ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#FFD700",5000); },150); }
      else { setTimeout(()=>{ try{ if(!CALM) spawnParticles(locked?"🐉":atk.emoji); SFX.task&&SFX.task(); }catch{} showToast(locked?`🐉 L'Hydre RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`:(dmg>0?`${atk.emoji} −${dmg} PV au boss!`:`🛡️ La carapace bloque — vise plus gros!`),"#FF6B6B",locked?3600:2200); },60); }
      return n;
    });
  },[persist,showToast]);

  // v1.58.0 — attaque du FAMILIER : il frappe le boss s'il est en forme (nourri) et assez évolué (niv ≥4). Légendaire = bonus de dégâts.
  const handleBossPetAttack = useCallback((playerIdx)=>{
    const boss = cfgRef.current?.boss; if(!boss || boss.defeatedAt) return;
    const p0 = gameStates[playerIdx]; const petId = p0?.equipped?.pet;
    if(!petId){ showToast("Équipe un familier pour qu'il attaque! 🐾","#FF8C00",2800); return; }
    if(p0.lastFedDay!==todayStamp()){ showToast("Ton familier a faim — nourris-le pour qu'il se batte! 🍖","#FF8C00",3000); return; }
    const petLv = petLevel((p0.petXp||{})[petId]||0);
    if(petLv<4){ showToast("Ton familier est trop jeune pour se battre (niv. 4) 🐣","#FF8C00",3000); return; }
    const bid = boss.startedAt;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      const bb=(p.bossBattle&&p.bossBattle.bossId===bid)?p.bossBattle:{bossId:bid,earned:0,spent:0,dmg:0};
      if((bb.earned-bb.spent) < PET_ATTACK_COST){ setTimeout(()=>showToast(`Il faut ${PET_ATTACK_COST} jetons (fais des quêtes) pour lancer ton familier!`,"#FF8C00",3000),0); return gs; }
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
      if(defeated){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, xp:(n[i].xp||0)+50, owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], pendingCelebrations:[...(n[i].pendingCelebrations||[]), {bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } } // v1.74.0 — +40🪙 +50XP + badge + item ULTRA LÉGENDAIRE + notif différée à chaque enfant
      const fe = defeated ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#FFD700",5000); },150); }
      else { setTimeout(()=>{ try{ if(!CALM) spawnParticles(locked?"🐉":"🐾"); SFX.epic&&SFX.epic(); }catch{} showToast(locked?`🐉 L'Hydre RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`:`🐾 Ton familier frappe! −${dmg} PV${legend?" — Légendaire! 👑":""}`,"#FFD700",locked?3600:2800); },60); }
      return n;
    });
  },[gameStates,persist,showToast]);

  // Le parent crée/assigne une routine à un enfant (atterrit dans gs[idx].routines)
  const handleAssignRoutine = useCallback((playerIdx, routine)=>{
    if(playerIdx==null||!routine?.name?.trim()||!(routine.taskIds||[]).length)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]||{}; const r={id:"rt_"+uid(), emoji:"🌅", endTime:"", ...routine, name:routine.name.trim()}; n[playerIdx]={...p, routines:[...(p.routines||[]), r]}; persist(config,n); return n; });
    logAction(`🧩 Routine « ${routine.name.trim()} » assignée à ${config.players[playerIdx]?.name||""}`,"#2ECC40");
    showToast("✅ Routine assignée à l'enfant!","#2ECC40");
  },[config,persist,logAction,showToast]);

  const handleRemoveAssignment = useCallback((instanceId)=>{
    const ass=(config.assignments||[]).find(a=>a.instanceId===instanceId);
    const task=ass?[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId):null;
    // Tombstone : la fusion ré-ajouterait l'assignation sinon → on mémorise les supprimées
    const newCfg={...config,
      assignments:(config.assignments||[]).filter(a=>a.instanceId!==instanceId),
      removedAssignments:_uniq([...(config.removedAssignments||[]), instanceId]).slice(-800)};
    setConfig(newCfg); persist(newCfg,gameStates);
    logAction(`🗑️ Tâche retirée: ${task?.label||instanceId}`,"#FF8C00");
    showToast("🗑️ Tâche retirée","#FF8C00");
  },[config,gameStates,persist,logAction,showToast]);

  // v1.83.0 (Lot 1 #B6) — l'enfant DEMANDE à retirer une tâche (pas de suppression directe :
  // le parent approuve, même esprit que la validation des tâches complétées).
  const handleRequestRemoval = useCallback((playerIdx, instanceId)=>{
    const pid=config.players[playerIdx]?.id; if(!pid) return;
    if((config.removalRequests||[]).some(r=>r.instanceId===instanceId && r.playerId===pid)) return; // déjà demandé
    const req={id:"rmreq_"+uid(), instanceId, playerId:pid, requestedAt:Date.now()};
    const newCfg={...config, removalRequests:[...(config.removalRequests||[]), req]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("🗑️ Demande envoyée au parent","#FFD700");
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
    logAction(`🗑️ Retrait approuvé: ${task?.label||req.instanceId}`,"#FF8C00");
    showToast("🗑️ Tâche retirée","#FF8C00");
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
    showToast(`🗑️ ${toRemove.length} tâche(s) perso supprimée(s)`,"#FF8C00");
  },[config,gameStates,persist,showToast]);

  const handleAddCustomTask = useCallback((data)=>{
    if(!data?.label?.trim())return null;
    const label=data.label.trim();
    // v1.82.0 (Lot 1 #3/B7) — anti-doublon côté parent, même règle que côté enfant (v1.53.0,
    // handleChildAddTask) : un libellé déjà présent réutilise la tâche existante au lieu d'en
    // empiler une nouvelle — évite que le catalogue/menu de choix grossisse à l'infini.
    const existing=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(label));
    if(existing){ showToast(`${existing.emoji} «${existing.label}» existe déjà — réutilisée!`,"#FFD700",4000); return existing.id; }
    const newTask={id:"cust_"+uid(),emoji:data.emoji||"⭐",label,xp:20,coins:10,diff:"medium",cat:"custom"};
    const newCfg={...config,customTasks:[...(config.customTasks||[]),newTask]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast(`${newTask.emoji} «${newTask.label}» créée — assigne-la maintenant!`,"#2ECC40",4000);
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
    showToast("➕ Quête ajoutée à ta journée!","#2ECC40");
  },[config,gameStates,persist,showToast]);

  // v1.57.0 — l'enfant choisit la voie d'évolution de son familier (tier 1/2/3 → élément)
  const handleChoosePetEvo = useCallback((playerIdx, petId, tier, element)=>{
    if(playerIdx==null||!petId||!tier||!element)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]||{}; const pe={...(p.petEvo||{})}; pe[petId]={...(pe[petId]||{}), [tier]:element}; n[playerIdx]={...p, petEvo:pe}; persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("✨"); SFX.epic&&SFX.epic(); }catch{} },120);
    showToast("✨ Ton familier a évolué!","#FFD700",3500);
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
    showToast("➕ Quête ajoutée à ta journée!","#2ECC40");
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
    showToast("➕ Tâche ajoutée à ton rituel!","#2ECC40");
    return instanceId;
  },[config,gameStates,persist,showToast]);

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
      showToast(`🪙 ${amt} pièces envoyées à ${displayName(toP)}!`,"#FFD700",3000);
    } else { showToast("Pas assez de pièces 😅","#FF6B6B",2500); }
    return ok;
  },[config,persist,showToast,pushFeed]);

  // 🐛 Signalement de bug → stocké dans config.bugs, visible dans le portail parent
  const handleReportBug = useCallback((text, who)=>{
    const t=(text||"").trim(); if(!t) return false;
    const cfg=cfgRef.current||{};
    const bug={ id:"bug_"+uid(), ts:Date.now(), who:who||"?", text:t.slice(0,300) };
    const n={...cfg, bugs:[bug, ...(cfg.bugs||[])].slice(0,50)};
    setConfig(n); persist(n, gsRef.current);
    showToast("🐛 Merci! Le bug a été envoyé au parent.","#2ECC40",3500);
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
    showToast(`📨 Demande envoyée à ${displayName(toP)} (${amt} 🪙)`,"#5DECF5",3000);
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
      showToast(`✅ ${offer.amount} 🪙 envoyées!`,"#FFD700",3000);
    } else showToast("Tu n'as pas assez de pièces 😅","#FF6B6B",2500);
  },[persist,showToast,pushFeed]);

  // L'enfant change SON pseudo (dans config.players)
  const handleUpdatePseudo = useCallback((playerIdx, pseudo)=>{
    const clean=(pseudo||"").trim().slice(0,16); if(!clean||!config.players[playerIdx])return;
    const newCfg={...config, players:config.players.map((pl,i)=>i===playerIdx?{...pl,pseudo:clean}:pl)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("✅ Pseudo changé!","#2ECC40");
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
    if(did) showToast("↩️ J'ai changé d'idée — pièces remises!","#FF8C00");
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
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("⏱"); SFX.epic&&SFX.epic(); }catch{} showToast(`⏱ Rituel fini en ${minutes} min! +${bonus} XP 🎉`,"#FFD700",4500); },150);
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
    showToast("📅 Événement ajouté au calendrier!","#5DECF5");
  },[config,persist,showToast]);

  // Objectif du jour réclamé → bonus XP/pièces (une fois par jour)
  const handleClaimDaily = useCallback((playerIdx, obj)=>{
    const wk=todayStamp();
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]; const dc=(p.dailyClaimed&&p.dailyClaimed.day===wk)?p.dailyClaimed:{day:wk,ids:[]};
      if(dc.ids.includes(obj.id))return gs;
      n[playerIdx]={...p, xp:(p.xp||0)+(obj.xp||0), coins:(p.coins||0)+(obj.coins||0), dailyClaimed:{day:wk,ids:[...dc.ids,obj.id]}};
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🎯"); SFX.epic&&SFX.epic(); }catch{} },120);
    showToast(`🎯 Objectif réussi! +${obj.xp} XP${obj.coins?` +${obj.coins} 🪙`:""}`,"#2ECC40",3500);
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
    if(p.lastFedDay===today){ showToast("Ton familier a déjà mangé aujourd'hui 🐾 Reviens demain!","#FF8C00",3000); return; }
    const eqPet=p.equipped?.pet;
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]; const _g=gainPet(q,eqPet,12);
      n[playerIdx]={...q, lastFedDay:today, energy:Math.min(ENERGY_MAX, currentEnergy(q)+FEED_ENERGY), energyTs:new Date().toISOString(),
        petXp:_g.petXp, petDay:_g.petDay };
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🍖"); SFX.coin&&SFX.coin(); }catch{} },80);
    showToast("🍖 Miam! Ton familier est rassasié et plein d'énergie!","#2ECC40",3000);
  },[gameStates,config,persist,showToast]);

  // 🎾 Jouer avec le familier → coûte de l'énergie, donne de l'XP au familier
  const handlePlayPet = useCallback((playerIdx)=>{
    const p=gameStates[playerIdx]; if(!p) return;
    const eqPet=p.equipped?.pet;
    if(!eqPet){ showToast("Équipe d'abord un familier 🐾","#FF8C00",2500); return; }
    if(currentEnergy(p)<PLAY_ENERGY){ const m=minsToEnergy(p,PLAY_ENERGY); showToast(`💤 Ton familier fait une sieste… reviens dans ~${m} min!`,"#5DECF5",3500); return; }
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]; const _g=gainPet(q,eqPet,10);
      n[playerIdx]={...q, energy:Math.max(0, currentEnergy(q)-PLAY_ENERGY), energyTs:new Date().toISOString(),
        petXp:_g.petXp, petDay:_g.petDay };
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🎾"); SFX.click&&SFX.click(); }catch{} },80);
    showToast("🎾 Vous vous êtes bien amusés! Ton familier gagne de l'XP 🌟","#FFD700",2800);
  },[gameStates,config,persist,showToast]);

  // Cacher une récompense (terminée/utilisée) → une nouvelle prend sa place
  const handleHideReward = useCallback((playerId, reward)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    const wk=todayStamp();
    setGameStates(gs=>{ const n=[...gs]; const p=n[idx]; const sameWeek=p.hiddenWeek===wk; const hidden=sameWeek?[...(p.hiddenRewards||[])]:[]; if(!hidden.includes(reward.id))hidden.push(reward.id); n[idx]={...p, hiddenRewards:hidden, hiddenWeek:wk}; persist(config,n); return n; });
    showToast("✅ Récompense rangée — une nouvelle apparaît!","#2ECC40");
  },[config,persist,showToast]);

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
  SFX_MUTED = curSettings.sound === false;
  CALM = !!curSettings.calm;
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
  const onParentPanelExit = useCallback(()=>{ setParentMode(false); setParentPanel(false); showToast("🔒 Mode parent quitté","#FF8C00"); }, [showToast]);
  const onParentPanelReset = useCallback(()=>{ if(window.confirm("Remettre tous les joueurs à zéro?")){ (config?.players||[]).forEach((_,i)=>handleResetPlayer(i)); } }, [config?.players, handleResetPlayer]);
  const onParentPanelSetup = useCallback(()=>{ setEditingBook(true); setScreen("setup"); setParentPanel(false); }, []);

  if(screen==="loading") return <div style={{minHeight:"100vh",background:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"safe center"}}><style>{GLOBAL_CSS}</style><div style={{fontFamily:"'Press Start 2P',monospace",fontSize:12,color:"#FFD700",animation:"pulse 1s infinite"}}>⚔️ Chargement…</div></div>;
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
            style={{fontFamily:"'VT323',monospace",fontSize:13,color:fresh?"#2ECC40":"#666",whiteSpace:"nowrap"}}>☁️{fresh?" ✓":" …"}</div>; })()}
        {/* Contrôles header */}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {parentMode ? (<>
            <button onClick={()=>{SFX.click();setParentPanel(true);}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 12px",background:"#FF8C00",color:"#000",border:"2px solid #FF8C00",borderRadius:3,cursor:"pointer",boxShadow:"0 0 10px #FF8C0060",position:"relative"}}>
              🔓 PARENT ▸
              {(()=>{ const nb=gameStates.reduce((s,gs)=>s+(gs.pending||[]).length,0);
                return nb>0?<span style={{position:"absolute",top:-7,right:-7,background:"#FF4444",color:"#fff",borderRadius:"50%",minWidth:16,height:16,fontSize:9,lineHeight:"16px",fontFamily:"'Press Start 2P',monospace",padding:"0 2px",border:"2px solid #000"}}>{nb}</span>:null; })()}
            </button>
            <button onClick={()=>{SFX.click();setParentMode(false);setParentPanel(false);showToast("🔒 Mode parent quitté","#FF8C00");}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 10px",background:"#222",color:"#FF8C00",border:"2px solid #FF8C00",borderRadius:3,cursor:"pointer"}} title="Quitter le mode parent">🔒</button>
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
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="family"?th.accent:"transparent",color:view==="family"?"#000":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          👨‍👩‍👧‍👦 Famille
        </button>
        <button onClick={()=>{setView("calendars");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="calendars"?th.accent:"transparent",color:view==="calendars"?"#000":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          📅 Calendriers
        </button>
        <button onClick={()=>{setView("timer");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="timer"?th.accent:"transparent",color:view==="timer"?"#000":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          ⏱ Minuterie
        </button>
        {/* Un enfant connecté ne voit QUE son onglet. Le parent voit tout le monde. */}
        {(config.players||[]).map((pl,i)=>({pl,i})).filter(({i})=> parentMode || sessionPlayer===null || sessionPlayer===i).map(({pl,i})=>(
          <button key={pl.id} onClick={()=>{setView(i);SFX.click();}} className="nav-btn"
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view===i?pl.color:"transparent",color:view===i?"#000":"#888",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,borderBottom:view===i?`3px solid ${pl.color}`:"none"}}>
            {displayName(pl)}
          </button>
        ))}
      </div>}

      {/* ── FOOTER COLLANT enfant : retour à l'accueil depuis Famille/Calendrier/Minuterie ── */}
      {(sessionPlayer!=null && !parentMode && (view==="family"||view==="calendars"||view==="timer")) && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:60,background:"rgba(0,0,0,0.92)",borderTop:"2px solid #333",display:"flex",justifyContent:"center",padding:"8px 10px"}}>
          <button onClick={()=>{setView(sessionPlayer);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#000",background:th.accent,border:"none",borderRadius:10,padding:"12px 26px",cursor:"pointer"}}>🏠 Accueil</button>
        </div>
      )}

      {/* ── CONTENT ── */}
      {/* paddingBottom dégage le footer fixe pour que la dernière tâche reste atteignable */}
      <div style={{position:"relative",zIndex:10,maxWidth:view==="week"?"100%":900,margin:"0 auto",paddingBottom:48}}>
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
                        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5",minWidth:46}}>{fmt(d)}</span>
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
            <div style={{background:th.card||"rgba(0,0,0,0.5)",border:`2px solid ${(th.accent||"#FFD700")}55`,borderRadius:10,padding:14,margin:"4px 0 12px"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:th.accent||"#FFD700",marginBottom:4}}>📊 Stats de la famille</div>
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
            assignments={config.assignments}
            allTasks={allTasks}
            allRewards={allRewards}
            onRequestComplete={requestComplete}
            onBuy={handleBuy}
            onEquip={handleEquip}
            onUpdateAvatar={(av,pid)=>{
              const i=config.players.findIndex(p=>p.id===pid); if(i<0)return;
              setGameStates(gs=>{ const n=[...gs]; n[i]={...n[i],avatar:av}; persist(config,n); return n; });
            }}
            onChildAddTask={(data)=>handleChildAddTask(view,data)}
            onChildPickTask={(taskId)=>handleChildPickTask(view,taskId)}
            onChildAddRoutineTask={(data)=>handleChildAddRoutineTask(view,data)}
            onRequestRemoval={(instanceId)=>handleRequestRemoval(view,instanceId)}
            showToast={showToast}
            onUpdatePseudo={(pseudo)=>handleUpdatePseudo(view,pseudo)}
            onRespondOffer={handleRespondOffer}
            onFeedPet={()=>handleFeedPet(view)}
            onPlayPet={()=>handlePlayPet(view)}
            onChoosePetEvo={(petId,tier,el)=>handleChoosePetEvo(view,petId,tier,el)}
            onDismissRefusal={(key)=>handleDismissRefusal(view,key)}
            onBossAttack={(type)=>handleBossAttack(view,type)}
            onBossPetAttack={()=>handleBossPetAttack(view)}
            allStates={gameStates}
            onLogout={()=>{SFX.click();setParentMode(false);setSessionPlayer(null);setParentPanel(false);setParentPinOpen(false);setView("family");setScreen("login");}}
            onOpenParentPin={()=>{SFX.click();setParentPinOpen(true);}}
            onReportBug={(text)=>handleReportBug(text, displayName(config.players[view]))}
            hamOpen={hamOpen} onCloseHam={()=>setHamOpen(false)}
            onGoFamily={()=>{setView("family");SFX.click();}}
            onGoCalendars={()=>{setView("calendars");SFX.click();}}
            onGoTimer={(ritualId)=>{setTimerRitual(ritualId&&typeof ritualId==="string"?ritualId:null);setView("timer");SFX.click();}}
            onUnclaimReward={(reward)=>handleUnclaimReward(config.players[view]?.id, reward)}
            onHideReward={(reward)=>handleHideReward(config.players[view]?.id, reward)}
            onClaimDaily={(obj)=>handleClaimDaily(view, obj)}
            onOpenChest={(payload)=>handleOpenChest(config.players[view]?.id, payload)}
            parentMode={parentMode}
            playerMode={gameStates[view]?.mode || config.mode || "routine"}
            todayDayIdx={todayDayIdx}
            onPatchState={(patch)=>{
              setGameStates(gs=>{ const n=[...gs]; n[view]={...n[view],...patch}; persist(config,n); return n; });
              SFX.click();
            }}
            onChangeTheme={(themeId)=>{
              const now=new Date().toISOString();
              const newCfg={...config, players: config.players.map((pl,i)=> i===view ? {...pl, themeId, themeChosenAt:now} : pl)};
              setConfig(newCfg); persist(newCfg, gameStates); SFX.epic&&SFX.epic();
              showToast("🎨 Nouveau thème activé pour la semaine!","#FFD700",3000);
            }}
            onDeComplete={handleDeComplete}
            onForceComplete={handleForceComplete}
            onUpdateCalendar={(newCal)=>{
              const gs=[...gameStates];
              gs[view]={...gs[view],calendar:newCal};
              setGameStates(gs);
              save({config,gameStates:gs,savedAt:new Date().toISOString()});
            }}
            onCalendarAdd={(type)=>{
              // Plus de XP/pièces juste pour AVOIR noté un devoir (c'était exploitable en spammant).
              // La récompense vient quand l'enfant ÉTUDIE vraiment (rappel → validation parent).
              const label=type==="examen"?"📝 Examen noté au calendrier!":"📚 Devoir noté au calendrier!";
              showToast(`${label} Un rappel apparaîtra avant la date.`,"#5DECF5",3000);
            }}
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
        />
      )}

      {parentPinOpen&&(
        <PinPad pin={config.pin} label="Accès mode parent" onSuccess={()=>{ const turningOn=!parentMode; setParentMode(turningOn); setParentPinOpen(false); if(turningOn){ setSessionPlayer(null); setView("family"); } showToast(turningOn?"🔓 Mode parent activé!":"🔒 Mode parent désactivé","#FF8C00"); }} onCancel={()=>setParentPinOpen(false)} th={th}/>
      )}
      {bossWin&&(
        <div onClick={()=>{setBossWin(null);SFX.click&&SFX.click();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:3200,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto",cursor:"pointer"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(160deg,#1a2e1a,#0c220c)",border:`5px solid ${bossWin.color||"#FFD700"}`,borderRadius:16,padding:"28px 26px",maxWidth:380,width:"100%",maxHeight:"90vh",overflowY:"auto",textAlign:"center",boxShadow:`0 0 50px ${bossWin.color||"#FFD700"}70`,animation:"bounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1)"}}>
            <div style={{fontSize:64,lineHeight:1,marginBottom:6}}>{bossWin.emoji||"🐲"}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,18px)",color:"#FFD700",marginBottom:8}}>🏆 VICTOIRE!</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:19,color:"#fff",marginBottom:8,lineHeight:1.3}}>Vous avez vaincu<br/><b style={{color:bossWin.color||"#FFD700"}}>{bossWin.name}</b> en équipe! 💪</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#2ECC40",margin:"12px 0 8px",lineHeight:1.6}}>+40 🪙 · +50 ⚡<br/>🐲 Badge « Tombeur de Boss »!</div>
            {bossWin.items && bossWin.items.length>0 && (
              <div style={{background:"rgba(255,91,174,0.12)",border:"2px solid #FF5BAE",borderRadius:10,padding:"10px 12px",margin:"4px 0 8px"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FF5BAE",marginBottom:6}}>🎁 ITEM ULTRA LÉGENDAIRE!</div>
                {bossWin.items.map((it,i)=>(<div key={i} style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#fff"}}><span style={{fontSize:22}}>{it.emoji}</span> {it.name}</div>))}
              </div>
            )}
            <button onClick={()=>{setBossWin(null);SFX.click&&SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 24px",background:"#2ECC40",color:"#000",border:"3px solid #000",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #000",marginTop:4}}>🎉 Bravo!</button>
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
      <div style={{position:"fixed",bottom:0,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"safe center",gap:10,padding:"5px 12px",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",zIndex:50,borderTop:"1px solid #222"}}>
        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#444"}}>Livre de Quêtes v{APP_VERSION}</span>
        <button
          onClick={()=>{
            // Copie l'adresse au presse-papier + confirme (mailto ne mène nulle part sans app de courriel)
            try{ navigator.clipboard&&navigator.clipboard.writeText(BUG_EMAIL); }catch{}
            showToast(`🐛 Bug? Écris à ${BUG_EMAIL} (adresse copiée!)`,"#FF8C00",7000);
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
