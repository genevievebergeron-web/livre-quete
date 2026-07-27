// ─── AVATAR : CATALOGUE DE PARTIES + RENDU CANVAS ───────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif). Débloqué par le refactor CALM
// (src/calm.js, patron sfx.js/setSfxMuted) — AvatarCanvas lisait le `let CALM` mutable
// de App.jsx, ce qu'un import ES ne permet pas depuis un autre module. Zéro changement
// de comportement.
import { useState, useEffect, useRef } from "react";
import { CALM } from "./calm.js";

export const AVATAR_PARTS = {
  skin: [
    {id:"sk1",label:"Clair",  color:"#FFCC99"}, {id:"sk2",label:"Doré",   color:"#E8A060"},
    {id:"sk3",label:"Brun",   color:"#C07840"}, {id:"sk4",label:"Foncé",  color:"#7B4A20"},
    {id:"sk5",label:"Azur",   color:"#99CCFF"}, {id:"sk6",label:"Vert",   color:"#88CC88"},
    {id:"sk7",label:"Rose",   color:"#FFAACC"}, {id:"sk8",label:"Violet", color:"#CC88FF"},
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
};

export const DEFAULT_AVATAR = { skin:"sk1", eyes:"ey1", mouth:"mo1", hair:"ha1" };

// Refonte visuelle Phase 5 — humeurs : surcharges locales yeux/bouche, même patron que `blink`
// ci-dessous (lignes ~70-72), jamais de sprite sheet (2 304 combos d'identité rendraient ça
// impossible). L'identité (peau/cheveux/couleurs) ne bouge JAMAIS, seule l'expression change.
export const AVATAR_MOODS = ["neutral","happy","proud","tired","levelup","equipped"];

// Render avatar to canvas (used both in-panel and in popup)
export function renderAvatarToCtx(ctx, avatarDef, bodyColor, W=72, H=72, blink=false, mood="neutral") {
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
  // Eyes — blink (réflexe involontaire) gagne toujours ; sinon l'humeur (Phase 5) surcharge la
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
  // Mouth — même patron : l'humeur surcharge le choix de l'enfant, sinon rendu normal.
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
  // Body
  ctx.fillStyle = bodyColor || "#4A90D9";
  ctx.fillRect(s(2),s(26),s(32),s(24));
  // Outline
  ctx.strokeStyle="#0d0d0d"; ctx.lineWidth=1;
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
// `mood` (Phase 5, défaut "neutral" = rétrocompatible) vient d'une machine à états dans App.jsx,
// branchée aux événements existants (validation, level-up, victoire boss…), non persistée.
export function AvatarCanvas({ avatarDef, bodyColor, size=72, style={}, animate=true, mood="neutral" }) {
  const canvasRef = useRef(null);
  const [blink, setBlink] = useState(false);
  useEffect(()=>{
    const c=canvasRef.current; if(!c)return;
    renderAvatarToCtx(c.getContext("2d"), avatarDef||DEFAULT_AVATAR, bodyColor, size, size, blink, mood);
  },[avatarDef, bodyColor, size, blink, mood]);
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
