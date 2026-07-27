// ─── AVATAR : CATALOGUE DE PARTIES + MOTEUR DE RENDU EN COUCHES ──────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif). Débloqué par le refactor CALM
// (src/calm.js, patron sfx.js/setSfxMuted).
//
// Refonte 2026-07-27 (session interactive avec Gen) : moteur de COUCHES HYBRIDES.
// Chaque pièce est une couche indépendante qui peut être un PNG registré
// (/sprites/avatar/<partId>.png, trame pleine 72×72 ou multiple exact, pièce déjà
// positionnée anatomiquement) OU le dessin procédural ci-dessous en repli — même
// esprit que le repli 3 niveaux d'ItemSprite (sprites.jsx). Aujourd'hui aucun PNG
// n'existe : le rendu est identique pixel pour pixel à l'ancien code.
// JAMAIS de sprite sheet de combos (2 304 identités) — uniquement des PNG par pièce.
import { useState, useEffect, useRef } from "react";
import { CALM } from "./calm.js";

export const AVATAR_PARTS = {
  skin: [
    {id:"sk1",label:"Clair",  color:"#FFCC99"}, {id:"sk2",label:"Doré",   color:"#E8A060"},
    {id:"sk3",label:"Brun",   color:"#C07840"}, {id:"sk4",label:"Foncé",  color:"#7B4A20"},
    {id:"sk5",label:"Azur",   color:"#99CCFF"}, {id:"sk6",label:"Vert",   color:"#88CC88"},
    {id:"sk7",label:"Rose",   color:"#FFAACC"}, {id:"sk8",label:"Violet", color:"#CC88FF"},
    // Peaux à DÉBLOQUER (suggestion des enfants 2026-07-27) : achetables en Boutique
    // (item `unlock` dans owned[]). Zéro asset requis — la re-teinte runtime fait tout.
    {id:"sk9", label:"Or",     color:"#E8C34A", unlock:"usk9"},
    {id:"sk10",label:"Zombie", color:"#8FAE7B", unlock:"usk10"},
    {id:"sk11",label:"Lave",   color:"#E85A30", unlock:"usk11"},
    {id:"sk12",label:"Glace",  color:"#BFE8F5", unlock:"usk12"},
  ],
  eyes: [
    {id:"ey1",emoji:"👀",label:"Normal",    eyeColor:"#333",  eyeShape:"round"},
    {id:"ey2",emoji:"😊",label:"Joyeux",    eyeColor:"#2244AA",eyeShape:"happy"},
    {id:"ey3",emoji:"😎",label:"Cool",      eyeColor:"#0d0d0d",  eyeShape:"cool"},
    {id:"ey4",emoji:"⭐",label:"Étoile",    eyeColor:"#D9BC5C",eyeShape:"star"},
    {id:"ey5",emoji:"😺",label:"Chat",      eyeColor:"#00AA66",eyeShape:"cat"},
    {id:"ey6",emoji:"👾",label:"Alien",     eyeColor:"#D97070",eyeShape:"alien"},
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
    {id:"ha3",emoji:"🟡",label:"Blond",        color:"#D9BC5C",style:"short"},
    {id:"ha4",emoji:"🔴",label:"Roux",         color:"#CC4400",style:"short"},
    {id:"ha5",emoji:"⚪",label:"Blanc",        color:"#EEE",   style:"short"},
    {id:"ha6",emoji:"🟣",label:"Violet",       color:"#9933CC",style:"short"},
    {id:"ha7",emoji:"🔵",label:"Bleu",         color:"#2244AA",style:"short"},
    {id:"ha8",emoji:"🩷",label:"Rose",         color:"#FF69B4",style:"short"},
  ],
  // Refonte avatar 2026-07-27 (validé avec Gen) — nouveaux slots d'identité gratuits.
  // Id *0 = "Aucun" (défaut, aucune couche dessinée, jamais de fetch PNG).
  // Pas de slot "accessoires de tête" : les chapeaux/visages ÉQUIPÉS couvrent déjà ça.
  back: [ // couche ARRIÈRE, derrière tout le personnage
    {id:"bk0",emoji:"🚫",label:"Aucun"},
    // bk1 : ailes de fée → ailes PLUMÉES (décision Gen 2026-07-27 — 4 garçons)
    {id:"bk1",emoji:"🕊️",label:"Ailes plumées",   color:"#E8E0CC"},
    {id:"bk2",emoji:"🦇",label:"Ailes de dragon", color:"#7A4A9E"},
    {id:"bk3",emoji:"🧣",label:"Cape",            color:"#B0413E"},
  ],
  // Extras (demande Gen 2026-07-27) : cornes+queue, tentacules… (bras supp. à venir).
  // Rendu UNIQUEMENT en mode détaillé v2 (aucun repli procédural — trop fin pour les blocs).
  extra: [
    {id:"xt0",emoji:"🚫",label:"Aucun"},
    {id:"xt1",emoji:"😈",label:"Cornes de démon", color:"#8B2500"},
    {id:"xt2",emoji:"🐙",label:"Tentacules",      color:"#9B59B6"},
  ],
  // Silhouette (demande Gen 2026-07-27, choisie à la création de compte) — pas de couche
  // dessinée : aucune différence dans le rendu procédural actuel. Sélectionnera le jeu de
  // PNG du personnage détaillé (chantier E : pièces par silhouette). Extensible sans migration.
  build: [
    {id:"bd_ado",   emoji:"🧑",label:"Ado"},
    {id:"bd_enfant",emoji:"🧒",label:"Enfant"},
  ],
  shoes: [ // par-dessus le bas des jambes (y59-64)
    {id:"sh0",emoji:"🚫",label:"Aucun"},
    {id:"sh1",emoji:"👟",label:"Baskets",   color:"#C8524A"},
    {id:"sh2",emoji:"🥾",label:"Bottes",    color:"#7B5230"},
    {id:"sh3",emoji:"👞",label:"Souliers",  color:"#3A6EA5"},
    {id:"sh4",emoji:"🩰",label:"Pantoufles",color:"#E8A0C8"},
  ],
};

export const DEFAULT_AVATAR = { skin:"sk1", eyes:"ey1", mouth:"mo1", hair:"ha1", back:"bk0", shoes:"sh0", extra:"xt0", build:"bd_ado" };

// Refonte visuelle Phase 5 — humeurs : surcharges locales yeux/bouche, même patron que `blink`,
// jamais de sprite sheet. L'identité (peau/cheveux/couleurs) ne bouge JAMAIS, seule l'expression change.
export const AVATAR_MOODS = ["neutral","happy","proud","tired","levelup","equipped"];

// ─── Cache PNG per-part : /sprites/avatar/<partId>.png ───────────────────────
// 100 % synchrone au moment du rendu (renderAvatarToCtx DOIT rester synchrone —
// la rasterisation dataURL du Combat Hydre dans App.jsx en dépend). Une seule
// tentative réseau par id et par session : onerror fige "fail", plus jamais retenté.
const _pngCache = new Map();            // partId -> {status:"loading"|"ok"|"fail", img}
const _pngListeners = new Set();
function getAvatarPng(partId){
  if(!partId || partId.endsWith("0")) return null; // option "Aucun" (bk0/hd0/sh0) : jamais de fetch
  let e = _pngCache.get(partId);
  if(!e){
    const img = new Image();
    e = { status:"loading", img };
    img.onload  = ()=>{ e.status="ok";   _pngListeners.forEach(f=>f()); };
    img.onerror = ()=>{ e.status="fail"; }; // repli procédural déjà dessiné, rien à notifier
    img.src = `/sprites/avatar/${partId}.png`;
    _pngCache.set(partId, e);
  }
  return e.status==="ok" ? e.img : null;  // null = dessine le procédural
}
// Les canvases s'abonnent pour se redessiner quand un PNG finit de charger
// (événement ponctuel de chargement, pas une animation — conforme au mode calme).
export function onAvatarPngLoaded(cb){ _pngListeners.add(cb); return ()=>_pngListeners.delete(cb); }

// ─── MOTEUR DÉTAILLÉ v2 (chantier E, 2026-07-27) ─────────────────────────────
// Pièces 144×144 registrées dans /sprites/avatar/v2/ (générées PixelLab, pipeline
// scripts/avatar-lot.py). Le mode détaillé s'active dès que le CORPS de la silhouette
// est chargé ; sinon le rendu procédural 72 sert de repli intégral (jamais de mélange
// des deux anatomies). Suffixe _e = silhouette enfant.
const _v2Cache = new Map();
function getV2Png(name){
  if(!name) return null;
  let e = _v2Cache.get(name);
  if(!e){
    const img = new Image();
    e = { status:"loading", img };
    img.onload  = ()=>{ e.status="ok";   _pngListeners.forEach(f=>f()); };
    img.onerror = ()=>{ e.status="fail"; };
    img.src = `/sprites/avatar/v2/${name}.png`;
    _v2Cache.set(name, e);
  }
  return e.status==="ok" ? e.img : null;
}
const v2Suffix = (av)=> (av.build==="bd_enfant" ? "_e" : "");
const v2Body   = (av)=> (av.build==="bd_enfant" ? "body_enfant" : "body_ado");
// Le mode détaillé est-il prêt pour cet avatar ? (utilisé aussi par EquippedGear)
export function isDetailedReady(avatarDef){
  const av = {...DEFAULT_AVATAR, ...avatarDef};
  return !!getV2Png(v2Body(av));
}

// Corps re-teint (peau + chandail) — la base est générée avec une peau pêche et un
// chandail gris VOULUS pour ça. Détection par heuristique de couleur, remap de
// luminance vers la cible ; résultat mis en cache par (corps, peau, chandail).
const _tintCache = new Map();
function tintedBody(bodyName, skinColor, shirtColor){
  const key = `${bodyName}|${skinColor}|${shirtColor}`;
  const hit = _tintCache.get(key);
  if(hit) return hit;
  const img = getV2Png(bodyName);
  if(!img) return null;
  const c = document.createElement("canvas"); c.width = c.height = 144;
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = false;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, 144, 144);
  const px = d.data;
  const hex = (h)=>{ h=h.replace("#",""); if(h.length===3) h=h.split("").map(v=>v+v).join(""); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; };
  const skin = hex(skinColor||"#FFCC99"), shirt = hex(shirtColor||"#4A90D9");
  for(let i=0;i<px.length;i+=4){
    if(px[i+3] < 40) continue;
    const r=px[i], g=px[i+1], b=px[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), lum=(r*3+g*6+b)/10;
    const f = Math.min(1.7, Math.max(0.3, lum/170));
    if(r>110 && r>g && g>b && (r-b)>28 && (r-b)<130 && mx>140){        // peau pêche
      px[i]=Math.min(255,skin[0]*f); px[i+1]=Math.min(255,skin[1]*f); px[i+2]=Math.min(255,skin[2]*f);
    } else if((mx-mn)<26 && lum>95 && lum<235){                        // gris du chandail
      const g2 = Math.min(1.6, Math.max(0.35, lum/165));
      px[i]=Math.min(255,shirt[0]*g2); px[i+1]=Math.min(255,shirt[1]*g2); px[i+2]=Math.min(255,shirt[2]*g2);
    }
  }
  x.putImageData(d, 0, 0);
  _tintCache.set(key, c);
  return c;
}

// ─── Fonctions de tracé procédural (repli) — repère natif 72 unités ──────────
// Géométrie = CONTRAT partagé avec AVATAR_EQUIP_ANCHORS (sprites.jsx) :
// tête x3-33 y2-24 (centre x18), corps x2-34 y26-50, bras x-2..38, jambes y50-64.
function drawBack(ctx, s, { backPart }){
  // Couche arrière. ⚠️ La silhouette (tête x3-33, corps x2-34, bras x-2..38, jambes
  // x6-32 y50-64) recouvre presque tout — les zones qui restent VISIBLES derrière sont :
  // pointes hautes à droite (x33-40 y10-26), fines colonnes latérales (x0-2 / x34-40),
  // et les évasements du bas de chaque côté des jambes (x0-6 / x32-40, y50-58).
  ctx.fillStyle = backPart.color;
  ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=1;
  if(backPart.id==="bk3"){ // cape : pan derrière le corps qui dépasse sur les côtés et en bas
    ctx.fillRect(s(0),s(24),s(40),s(32));
    ctx.strokeRect(s(0),s(24),s(40),s(32));
  } else { // ailes : colonnes latérales + évasements bas visibles des deux côtés
    ctx.fillRect(s(0),s(28),s(2),s(24));   // colonne gauche (sliver)
    ctx.fillRect(s(34),s(24),s(6),s(28));  // colonne droite
    ctx.fillRect(s(0),s(50),s(6),s(7));    // évasement bas gauche
    ctx.fillRect(s(32),s(50),s(8),s(7));   // évasement bas droit
    if(backPart.id==="bk1"){ // fée : pointe haute arrondie côté droit + nub gauche
      ctx.fillRect(s(34),s(14),s(5),s(10)); ctx.fillRect(s(0),s(22),s(3),s(6));
    } else { // dragon : pointes basses anguleuses
      ctx.fillRect(s(36),s(54),s(4),s(5)); ctx.fillRect(s(0),s(55),s(4),s(4));
    }
    ctx.strokeRect(s(34),s(24),s(6),s(28));
    ctx.strokeRect(s(0),s(50),s(6),s(7));
    ctx.strokeRect(s(32),s(50),s(8),s(7));
  }
}
function drawShoes(ctx, s, { shoesPart }){
  // Par-dessus le bas des jambes (jambes x6-18 / x20-32, y50-64) + bout de pied.
  ctx.fillStyle = shoesPart.color;
  ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=1;
  ctx.fillRect(s(4),s(59),s(14),s(5));
  ctx.fillRect(s(20),s(59),s(14),s(5));
  ctx.strokeRect(s(4),s(59),s(14),s(5));
  ctx.strokeRect(s(20),s(59),s(14),s(5));
}
function drawHairBack(ctx, s, { hairPart }){
  ctx.fillStyle = hairPart.color;
  ctx.fillRect(s(3),s(0),s(30),s(8));
  ctx.fillRect(s(0),s(4),s(4),s(18));
  ctx.fillRect(s(29),s(4),s(4),s(18));
}
function drawHead(ctx, s, { skinPart }){
  ctx.fillStyle = skinPart.color;
  ctx.fillRect(s(3),s(2),s(30),s(22));
}
function drawHairTop(ctx, s, { hairPart }){
  ctx.fillStyle = hairPart.color;
  ctx.fillRect(s(3),s(2),s(30),s(5));
}
function drawEyes(ctx, s, { eyePart, blink, mood }){
  // blink (réflexe involontaire) gagne toujours ; sinon l'humeur (Phase 5) surcharge la
  // forme choisie par l'enfant ; sinon la forme choisie s'affiche normalement.
  ctx.fillStyle = eyePart.eyeColor;
  if(blink){ // yeux fermés (clignement) — petites lignes plates
    ctx.fillStyle="#0d0d0d"; ctx.fillRect(s(9),s(12),s(6),s(2)); ctx.fillRect(s(21),s(12),s(6),s(2));
  }
  else if(mood==="tired"){ // paupières mi-closes, plus basses qu'un clignement normal
    ctx.fillStyle="#0d0d0d"; ctx.fillRect(s(9),s(13),s(6),s(2)); ctx.fillRect(s(21),s(13),s(6),s(2));
  }
  else if(mood==="proud"||mood==="levelup"){ // étincelles — fierté / jalon
    ctx.fillStyle="#D9BC5C"; ctx.font=`${s(10)}px serif`; ctx.textAlign="center";
    ctx.fillText("★",s(12),s(15)); ctx.fillText("★",s(24),s(15));
  }
  else if(mood==="happy"){ctx.fillRect(s(9),s(11),s(5),s(3));ctx.fillRect(s(21),s(11),s(5),s(3));}
  else if(mood==="equipped"){ // clin d'œil : un œil fermé, l'autre normal
    ctx.fillRect(s(21),s(9),s(5),s(5)); ctx.fillStyle="#0d0d0d"; ctx.fillRect(s(9),s(12),s(6),s(2));
  }
  else if(eyePart.eyeShape==="happy"){ctx.fillRect(s(9),s(11),s(5),s(3));ctx.fillRect(s(21),s(11),s(5),s(3));}
  else if(eyePart.eyeShape==="cat"){ctx.fillRect(s(9),s(10),s(6),s(2));ctx.fillRect(s(21),s(10),s(6),s(2));ctx.fillStyle="#0d0d0d";ctx.fillRect(s(11),s(10),s(2),s(4));ctx.fillRect(s(23),s(10),s(2),s(4));}
  else if(eyePart.eyeShape==="star"){ctx.font=`${s(10)}px serif`;ctx.textAlign="center";ctx.fillText("★",s(12),s(15));ctx.fillText("★",s(24),s(15));}
  else if(eyePart.eyeShape==="cool"){ctx.fillStyle="#111";ctx.fillRect(s(8),s(10),s(8),s(4));ctx.fillRect(s(20),s(10),s(8),s(4));}
  else if(eyePart.eyeShape==="alien"){ctx.fillStyle=eyePart.eyeColor;ctx.fillRect(s(8),s(9),s(8),s(6));ctx.fillRect(s(20),s(9),s(8),s(6));ctx.fillStyle="#0d0d0d";ctx.fillRect(s(10),s(11),s(4),s(3));ctx.fillRect(s(22),s(11),s(4),s(3));}
  else{ctx.fillRect(s(9),s(9),s(5),s(5));ctx.fillRect(s(21),s(9),s(5),s(5));}
}
function drawMouth(ctx, s, { av, mouthPart, mood }){
  // Même patron : l'humeur surcharge le choix de l'enfant, sinon rendu normal.
  ctx.fillStyle = mouthPart.color;
  if(mood==="happy"||mood==="proud"||mood==="equipped"){ // grand sourire
    ctx.fillRect(s(11),s(18),s(14),s(3));ctx.fillRect(s(10),s(16),s(2),s(3));ctx.fillRect(s(24),s(16),s(2),s(3));
  }
  else if(mood==="levelup"){ // bouche grande ouverte — "wow"
    ctx.fillRect(s(12),s(17),s(12),s(7));
  }
  else if(mood==="tired"){ // petite bouche plate, légèrement affaissée
    ctx.fillRect(s(12),s(19),s(12),s(2));
  }
  else if(av.mouth==="mo2"){ctx.fillRect(s(11),s(18),s(14),s(3));ctx.fillRect(s(10),s(16),s(2),s(3));ctx.fillRect(s(24),s(16),s(2),s(3));}
  else if(av.mouth==="mo4"){ctx.fillRect(s(11),s(18),s(14),s(3));ctx.fillStyle="#FF88AA";ctx.fillRect(s(14),s(21),s(8),s(4));}
  else if(av.mouth==="mo6"){ctx.fillRect(s(10),s(18),s(16),s(2));ctx.fillRect(s(10),s(18),s(2),s(5));ctx.fillRect(s(24),s(18),s(2),s(5));}
  else{ctx.fillRect(s(11),s(18),s(14),s(3));}
}
function drawBody(ctx, s, { bodyColor }){
  ctx.fillStyle = bodyColor || "#4A90D9";
  ctx.fillRect(s(2),s(26),s(32),s(24));
  ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=1;
  ctx.strokeRect(s(2),s(26),s(32),s(24));
}
function drawArms(ctx, s, { skinPart }){
  ctx.fillStyle = skinPart.color;
  ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=1;
  ctx.fillRect(s(-2),s(28),s(6),s(14));
  ctx.fillRect(s(32),s(28),s(6),s(14));
  ctx.strokeRect(s(-2),s(28),s(6),s(14));
  ctx.strokeRect(s(32),s(28),s(6),s(14));
}
function drawLegs(ctx, s){
  ctx.fillStyle="#1A3A8A";
  ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=1;
  ctx.fillRect(s(6),s(50),s(12),s(14));
  ctx.fillRect(s(20),s(50),s(12),s(14));
  ctx.strokeRect(s(6),s(50),s(12),s(14));
  ctx.strokeRect(s(20),s(50),s(12),s(14));
}

// ─── Registre de couches, ordonné par plan z (arrière → avant) ───────────────
// png:true = couche hybride (PNG /sprites/avatar/<partId>.png si chargé, sinon draw).
// eyes/mouth/skin/body : JAMAIS de PNG — les humeurs/blink sont des surcharges
// procédurales (des PNG par humeur × forme seraient des combos, interdit), et
// peau/corps sont teintés dynamiquement (couleur choisie / thème joueur).
// Cas cheveux : un PNG haN.png couvre arrière + dessus en une pièce, dessiné APRÈS
// la tête ; la passe hairBack est alors sautée (géré dans la boucle).
const AVATAR_LAYERS = [
  { key:"back",     slot:"back",  png:true,  draw:drawBack },
  { key:"hairBack", slot:"hair",  png:false, draw:drawHairBack },
  { key:"head",     slot:"skin",  png:false, draw:drawHead },
  { key:"hairTop",  slot:"hair",  png:true,  draw:drawHairTop },
  { key:"eyes",     slot:"eyes",  png:false, draw:drawEyes },
  { key:"mouth",    slot:"mouth", png:false, draw:drawMouth },
  { key:"body",     slot:null,    png:false, draw:drawBody },
  { key:"arms",     slot:"skin",  png:false, draw:drawArms },
  { key:"legs",     slot:null,    png:false, draw:drawLegs },
  { key:"shoes",    slot:"shoes", png:true,  draw:drawShoes },
];

// Render avatar to canvas (used both in-panel and in popup). SYNCHRONE — voir cache PNG.
export function renderAvatarToCtx(ctx, avatarDef, bodyColor, W=72, H=72, blink=false, mood="neutral") {
  const av = {...DEFAULT_AVATAR, ...avatarDef};
  const skinPart = AVATAR_PARTS.skin.find(s=>s.id===av.skin) || AVATAR_PARTS.skin[0];
  const eyePart  = AVATAR_PARTS.eyes.find(e=>e.id===av.eyes) || AVATAR_PARTS.eyes[0];
  const mouthPart= AVATAR_PARTS.mouth.find(m=>m.id===av.mouth) || AVATAR_PARTS.mouth[0];
  const hairPart = AVATAR_PARTS.hair.find(h=>h.id===av.hair) || AVATAR_PARTS.hair[0];
  const backPart = AVATAR_PARTS.back.find(b=>b.id===av.back) || AVATAR_PARTS.back[0];
  const shoesPart= AVATAR_PARTS.shoes.find(b=>b.id===av.shoes)|| AVATAR_PARTS.shoes[0];
  const sc = W/72; // scale factor
  const s = (v) => Math.round(v*sc);
  const layerCtx = { av, skinPart, eyePart, mouthPart, hairPart, backPart, shoesPart, bodyColor, blink, mood };

  ctx.clearRect(0,0,W,H);
  ctx.imageSmoothingEnabled = false; // pixel art net à toute échelle

  // ── MODE DÉTAILLÉ v2 : personnage PixelLab 144, activé dès que le corps est chargé.
  // Tout-ou-rien : jamais de pièce 144 sur l'anatomie 72 (et vice-versa). Le clignement
  // et les formes d'yeux/bouche choisies restent propres au mode procédural (le visage
  // détaillé = neutre + surcouches d'humeur, décision documentée au README sprites).
  {
    const body = tintedBody(v2Body(av), skinPart.color, bodyColor || "#4A90D9");
    if (body) {
      const sfx = v2Suffix(av);
      const draw = (name)=>{ const im = name && getV2Png(name); if(im) ctx.drawImage(im, 0, 0, W, H); };
      if (av.back  && !av.back.endsWith("0"))  draw(av.back + sfx);   // ailes/cape (derrière)
      ctx.drawImage(body, 0, 0, W, H);                                 // corps re-teint
      if (av.extra && !av.extra.endsWith("0")) draw(av.extra + sfx);  // cornes/tentacules
      if (av.hair)                             draw(av.hair + sfx);   // chevelure
      // Choix d'yeux/bouche (retour des enfants : « ils ne changent pas ») — surcouches
      // v2 ; ey1/mo1 = visage neutre de la base. L'humeur garde le dernier mot.
      if (av.eyes  && av.eyes  !== "ey1")      draw(av.eyes + sfx);
      if (av.mouth && av.mouth !== "mo1")      draw(av.mouth + sfx);
      if (mood && mood !== "neutral")          draw(`face_${mood}${sfx}`); // humeur
      if (av.shoes && !av.shoes.endsWith("0")) draw(av.shoes + sfx);  // souliers
      return;
    }
  }

  const hairImg = getAvatarPng(av.hair);
  for (const L of AVATAR_LAYERS) {
    if (L.key==="hairBack" && hairImg) continue; // le PNG cheveux couvre les deux passes
    if (L.slot && String(av[L.slot]||"").endsWith("0")) continue; // option "Aucun" (bk0/sh0)
    const img = L.png ? getAvatarPng(av[L.slot]) : null;
    if (img) ctx.drawImage(img, 0, 0, W, H);     // trame registrée 72 → échelle W
    else L.draw(ctx, s, layerCtx);
  }
}

// Inline avatar component (renders canvas) — clignement subtil des yeux (sauf mode calme)
// `mood` (Phase 5, défaut "neutral" = rétrocompatible) vient d'une machine à états dans App.jsx,
// branchée aux événements existants (validation, level-up, victoire boss…), non persistée.
export function AvatarCanvas({ avatarDef, bodyColor, size=72, style={}, animate=true, mood="neutral" }) {
  const canvasRef = useRef(null);
  const [blink, setBlink] = useState(false);
  const [pngTick, setPngTick] = useState(0); // redessin ponctuel quand un PNG de pièce arrive
  useEffect(()=> onAvatarPngLoaded(()=>setPngTick(t=>t+1)), []);
  useEffect(()=>{
    const c=canvasRef.current; if(!c)return;
    renderAvatarToCtx(c.getContext("2d"), avatarDef||DEFAULT_AVATAR, bodyColor, size, size, blink, mood);
  },[avatarDef, bodyColor, size, blink, mood, pngTick]);
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
