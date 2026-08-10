// ─── BOSS DE FAMILLE + MINI-JEUX HÉRITÉS ────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : pool de sprites illustrés des
// boss + leur rendu canvas de repli, et deux composants sans appelant restant dans
// App.jsx (Platformer, HydraFinalGame) — gardés à l'identique (zéro suppression),
// mêmes commentaires qu'à l'origine.
import { useState, useEffect, useRef, useMemo } from "react";
import { SFX } from "./sfx.js";
import { getPlayerTheme, ALL_SHOP_ITEMS } from "./themes.js";
import { petSpriteKey, renderPetToCtx, petPalOverride, petIsLegendary, petLevel } from "./pets.js";
import { DEFAULT_AVATAR } from "./avatar.jsx";
import { renderAvatarSprite } from "./sprites.jsx";
import { displayName, todayStamp } from "./shared.js";

// ─── PLATFORMER MINI-GAME (theme-aware) ─────────────────────
export const Platformer = ({ player, onClose }) => {
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
      {!done && <button onClick={()=>onClose(collected)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"var(--txt-dim,#666)",border:"2px solid #444",cursor:"pointer"}}>Passer</button>}
    </div>
  );
};
const darken = (hex) => { try{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgb(${Math.floor(r*0.6)},${Math.floor(g*0.6)},${Math.floor(b*0.6)})`;}catch{return "#333";} };

// ─── COMBAT DE BOSS FAMILIAL ──────────────────────────────────
// Extrait d'App.jsx le 2026-08-06 (Lot 5/#24) : toute la logique PURE du combat de boss (PV,
// jetons, dégâts, modificateur du jour, verrou des corvées) rassemblée ici, dans le module qui
// portait déjà `BOSSES`/`BossSprite`. Zéro composant, zéro avatar — donc entièrement hors de la
// réserve avatar. Aucun changement de comportement — mêmes formules, mêmes commentaires.
// Les seuils de coût côté gameplay (CHEST_ENERGY, PLAY_ENERGY…) restent volontairement dans
// `App.jsx` : ce sont des réglages, pas de la mécanique de calcul (même choix qu'en v2.16.38).
// Faire des quêtes = gagner des JETONS d'attaque. On les dépense (petite/grosse attaque)
// pour enlever des PV au boss. Le boss riposte si la famille ralentit (PV de famille baissent).
export const BOSS_DIFF = { facile:{label:"Facile",hp:40}, moyen:{label:"Moyen",hp:80}, costaud:{label:"Costaud",hp:140} };
export const ATTACKS = {
  petite:{ label:"Petite attaque", cost:1, dmg:1, emoji:"🗡️" },
  grosse:{ label:"Grosse attaque", cost:3, dmg:4, emoji:"💥" }, // 3 jetons → 4 dégâts (bonus à viser gros)
};
export const FAMILY_HP_MAX = 100;
export const BOSS_DRAIN_PER_H = FAMILY_HP_MAX / 36; // PV famille vidés en ~36 h sans attaque (recharge en attaquant)
// PV de famille restants = baisse selon le temps écoulé depuis la dernière attaque
export const familyHp = (boss, enraged=false) => {
  if (!boss || boss.defeatedAt || !boss.lastHitTs) return FAMILY_HP_MAX;
  const drain = BOSS_DRAIN_PER_H * (enraged ? 2 : 1); // v1.58.0 — le boss enragé vide les PV 2× plus vite
  const h = (Date.now() - new Date(boss.lastHitTs).getTime()) / 3600000;
  return Math.max(0, Math.min(FAMILY_HP_MAX, Math.round(FAMILY_HP_MAX - h * drain)));
};
const _bb = (gs, bossId) => (gs && gs.bossBattle && gs.bossBattle.bossId === bossId) ? gs.bossBattle : null;
// v2.6.0 — 3e param optionnel : les quêtes de réparation 🕊️ (config.repairEvents) ajoutent leurs
// dégâts au total du boss visé. Les events portent un dmg DÉJÀ plafonné à l'écriture (cap HPMAX-1).
export const repairDamageFor = (repairEvents, bossId) => (repairEvents || []).reduce((s, e) => s + ((e && e.bossStartedAt === bossId) ? (e.dmg || 0) : 0), 0);
export const bossDamageTotal = (gameStates, bossId, repairEvents) => (gameStates || []).reduce((s, g) => s + ((_bb(g, bossId)?.dmg) || 0), 0) + repairDamageFor(repairEvents, bossId);
export const bossJetons = (gs, bossId) => { const b = _bb(gs, bossId); return b ? Math.max(0, (b.earned || 0) - (b.spent || 0)) : 0; };
// v2.16.4 — Chantier 6.3 : petits cœurs vintage pixel-art pour la tuile boss (remplace le mini-jeu
// Hydre déconnecté). 1 cœur = 20% (5 cœurs total), même patron que l'ancien combat-hydre.html:312.
export const heartsRow = (pct, count=5) => {
  const filled = Math.max(0, Math.min(count, Math.round((pct/100)*count)));
  return "❤️".repeat(filled) + "🖤".repeat(count-filled);
};

// v1.76.0 — le boss actif ne peut être ACHEVÉ que si toutes ses corvées du jour sont complétées par les enfants assignés.
// v2.5.2 (Bug boss #1) — généralisé au boss RÉELLEMENT actif (config.boss.id) au lieu du préfixe "cust_hydre_" codé
// en dur : avant, un verrou pouvait se déclencher à cause d'anciennes tâches "cust_hydre_*" orphelines (données de
// test du 1er juillet, jamais nettoyées) même quand le boss actif n'avait plus rien à voir avec l'Hydre.
export const bossQuestsAllDone = (config, states) => {
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
export const BOSS_MODIFIERS = [
  { id:"grosse",   emoji:"💥", label:"Jour des grosses", desc:"Les grosses attaques font +2 dégâts!" },
  { id:"petite",   emoji:"🗡️", label:"Pluie de coups",   desc:"Les petites attaques font +1 dégât!" },
  { id:"carapace", emoji:"🛡️", label:"Carapace",         desc:"Les petites rebondissent — vise les grosses!" },
  { id:"frenesie", emoji:"⚡", label:"Frénésie",          desc:"Toutes les attaques font +1!" },
  { id:"familier", emoji:"🐾", label:"Jour du familier",  desc:"L'attaque du familier fait DOUBLE!" },
];
export const bossModifierOfDay = (bossId) => { const s=todayStamp()+"#"+(bossId||""); let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return BOSS_MODIFIERS[h%BOSS_MODIFIERS.length]; };
export const bossAtkDamage = (type, mod) => { let d=ATTACKS[type]?.dmg||0; if(mod){ if(mod.id==="grosse"&&type==="grosse") d+=2; if(mod.id==="petite"&&type==="petite") d+=1; if(mod.id==="carapace"&&type==="petite") d=0; if(mod.id==="frenesie") d+=1; } return Math.max(0,d); };
export const PET_ATTACK_COST = 3; // jetons pour lancer l'attaque du familier
export const petAttackDamage = (petLv, legendary, mod) => { let d = 3 + Math.floor((petLv||1)/2) + Math.floor(Math.random()*3) + (legendary?3:0); if(mod&&mod.id==="familier") d*=2; return d; };

// ─── BOSS DE FAMILLE — grand pool de sprites illustrés (v1.103.0) ──────
// v1.103.0 (Lot 6, audit 2.0) — remplace les 4 silhouettes procédurales recolorées
// (même forme générique, seule la couleur changeait) par 18 monstres illustrés
// distincts, choisis et validés un par un avec Gen. handleLaunchBoss() tire déjà
// au hasard dans BOSSES (inchangé) — agrandir ce tableau suffit à faire tourner
// le "grand pool" décidé avec elle, sans toucher à la logique de tirage.
export const BOSSES = [
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
export function BossSprite({ boss, size=120, style={} }){
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
// ⚠️ v2.16.4 — DÉLIÉ (Chantier 6.3, demande de Gen) : toujours l'Hydre peu importe le vrai boss actif,
// et gagner/perdre n'affectait pas les vrais PV (seul "hg-close" écouté, jamais "hg-win"). Remplacé par
// la tuile boss-agnostique dans l'onglet BOSS (voir heartsRow). Plus aucun appelant dans App.jsx —
// gardé ici pour l'instant (pas encore supprimé, ni public/combat-hydre.html) le temps d'une passe de
// vérification propre ; à supprimer ensuite comme nettoyage de code mort.
export function HydraFinalGame({ player, pState, color, onClose }){
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
