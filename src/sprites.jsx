// ─── PETITS COMPOSANTS DE SPRITES PIXEL-ART ────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : composants d'affichage React
// (canvas pixel-art) qui ne dépendent que de leurs props + des modules déjà extraits
// (pets.js pour PET_SPRITES/ITEM_SPRITES, catalog.js pour rarityOf) — zéro état partagé
// au niveau module, zéro changement de comportement.
import { useState, useRef, useEffect } from "react";
import { petSpriteKey, renderPetToCtx, ITEM_SPRITES, renderItemToCtx } from "./pets.js";
import { rarityOf } from "./catalog.js";

// v1.56.0 — Familier en pixel-art (canvas). petKey direct OU itemId (mappé). palOverride = recolorage d'élément.
export function PetSprite({ petKey, itemId, size=64, palOverride=null, legendary=false, style={} }) {
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
export function ItemSprite({ itemId, emoji, size=48, style={} }) {
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
export const HELD_WEAPON_IDS = new Set(["a1","a2","a3","a5"]);
export const AVATAR_EQUIP_ANCHORS = {
  hat:    { cx:18, cy:1,  wRatio:0.40, shadow:true },              // sommet de la tête (tête native x3-33 y2-24, centre x18)
  face:   { cx:18, cy:13, wRatio:0.235 },                          // niveau des yeux
  armor:  { cx:18, cy:39, wRatio:0.34, shadow:true },               // centré sur le torse (corps natif x2-34 y26-50, centre x18 y38)
  weapon: { cx:37, cy:32, wRatio:0.36, rotate:22, shadow:true },    // tenue dans la main droite (bras natif x32-38 y28-42), légère inclinaison
  themed: { cx:29, cy:53, wRatio:0.22 },                           // accessoire secondaire, à la ceinture/jambe
};
export function equipAnchorStyle(key, size) {
  const A = AVATAR_EQUIP_ANCHORS[key];
  const w = Math.round(size*A.wRatio);
  return {
    position:"absolute", left:Math.round(A.cx/72*size), top:Math.round(A.cy/72*size),
    width:w, height:w,
    transform:`translate(-50%,-50%)${A.rotate?` rotate(${A.rotate}deg)`:""}`,
    filter:A.shadow?"drop-shadow(0 2px 0 #0d0d0d)":undefined,
    pointerEvents:"none",
  };
}
// Rendu commun des items équipés "portés" sur l'avatar (chapeau/visage/arme-ou-armure au bon endroit anatomique).
// Le familier (eq.pet) reste géré séparément à chaque site d'appel (il est À CÔTÉ du perso, pas porté dessus).
export function EquippedGear({ eq, items, size }) {
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

// ─── BADGES PIXEL-ART (médaillon + symbole représentatif, sans emoji) ─────────
// Symbole déduit du badge (représentatif du défi)
export const badgeSymbol = (b)=>{
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
export function renderBadgeToCtx(ctx, b, earned, W=44){
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
export function BadgeIcon({ badge, earned, size=44, style={} }){
  const ref=useRef(null);
  useEffect(()=>{ const c=ref.current; if(c) renderBadgeToCtx(c.getContext("2d"), badge, earned, size); },[badge,earned,size]);
  return <canvas ref={ref} width={size} height={size} style={{imageRendering:"pixelated",...style}}/>;
}

// ─── COFFRES MYSTÈRES (loot boxes) ────────────────────────────
export const CHESTS = [
  { id:"common", name:"Coffre Commun",     cost:80,  color:"#9AA0A6", bands:["Commun","Rare"],                    w:[70,30] },
  { id:"rare",   name:"Coffre Rare",        cost:170, color:"#4FA3FF", bands:["Rare","Ultra Rare","Légendaire"],  w:[55,35,10] },
  { id:"epic",   name:"Coffre Légendaire",  cost:320, color:"#FFB02E", bands:["Ultra Rare","Légendaire","Unique"],w:[55,33,12] },
];
export const pickFromChest = (pool, chest) => {
  // tire une bande selon les poids, puis un item de cette bande (repli: tout le pool)
  let r=Math.random()*chest.w.reduce((a,b)=>a+b,0), band=chest.bands[0];
  for(let i=0;i<chest.bands.length;i++){ if(r<chest.w[i]){band=chest.bands[i];break;} r-=chest.w[i]; }
  let cand=pool.filter(it=>rarityOf(it.cost).name===band);
  if(!cand.length) cand=pool;
  return cand[Math.floor(Math.random()*cand.length)];
};
export function renderChestToCtx(ctx, open, W=96){
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
export function ChestSprite({ open, size=96, style={} }){
  const ref=useRef(null);
  useEffect(()=>{ const c=ref.current; if(c) renderChestToCtx(c.getContext("2d"), open, size); },[open,size]);
  return <canvas ref={ref} width={size} height={size} style={{imageRendering:"pixelated",...style}}/>;
}
