// ─── PETITS COMPOSANTS DE SPRITES PIXEL-ART ────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : composants d'affichage React
// (canvas pixel-art) qui ne dépendent que de leurs props + des modules déjà extraits
// (pets.js pour PET_SPRITES/ITEM_SPRITES, catalog.js pour rarityOf) — zéro état partagé
// au niveau module, zéro changement de comportement.
import { useState, useRef, useEffect } from "react";
import { petSpriteKey, renderPetToCtx, ITEM_SPRITES, renderItemToCtx, PET_SPRITES } from "./pets.js";
import { rarityOf } from "./catalog.js";
import { renderAvatarToCtx, isDetailedReady, onAvatarPngLoaded } from "./avatar.jsx";

// v1.56.0 — Familier en pixel-art (canvas). petKey direct OU itemId (mappé). palOverride = recolorage d'élément.
export function PetSprite({ petKey, itemId, size=64, palOverride=null, legendary=false, style={} }) {
  const key = petKey || petSpriteKey(itemId);
  const [imgFail, setImgFail] = useState(false); // v1.75.0 — repli sur le canvas si pas de PNG
  const canvasRef = useRef(null);
  // PNG seulement pour la forme de base (pas évoluée) : `public/sprites/pets/<key>.png`. Évolué/Légendaire = canvas recoloré.
  // Phase 7 : les familiers PNG-seulement (pas de grille 16×16, ex. Boulette/Phibi/Chewy)
  // gardent leur PNG même évolués — sinon canvas vide (renderPetToCtx est un no-op sans grille).
  const usePng = !imgFail && !!key && (( !palOverride && !legendary ) || !PET_SPRITES[key]);
  useEffect(()=>{ if(usePng) return; const c=canvasRef.current; if(!c)return; renderPetToCtx(c.getContext("2d"), key, size, palOverride, legendary); },[usePng,key,size,palOverride,legendary]);
  if(!key) return null;
  if(usePng) return <img src={`/sprites/pets/${key}.png`} width={size} height={size} alt="" onError={()=>setImgFail(true)} style={{imageRendering:"pixelated",objectFit:"contain",...style}}/>;
  return <canvas ref={canvasRef} width={size} height={size} style={{imageRendering:"pixelated",...style}}/>;
}

// Refonte Phase 7 — icône UI en pixel-art. PNG (public/sprites/ui/<name>.png) → repli emoji.
// Cache module UI_FAILED : App.jsx re-rend beaucoup — un seul 404 par nom et par session,
// ensuite le repli emoji est rendu directement (pas de rafale de requêtes réseau).
const UI_FAILED = new Set();
export function UIIcon({ name, emoji, size=18, style={}, block=false }) {
  const [, force] = useState(0);
  if (!name || UI_FAILED.has(name))
    return <span style={{fontSize:size, lineHeight:1, ...style}} aria-hidden>{emoji}</span>;
  return <img src={`/sprites/ui/${name}.png`} width={size} height={size} alt=""
    onError={()=>{ UI_FAILED.add(name); force(x=>x+1); }}
    style={{imageRendering:"pixelated", objectFit:"contain",
      display: block?"block":"inline-block", verticalAlign: block?undefined:"-0.18em", ...style}}/>;
}
// Raccourcis pour les deux glyphes les plus fréquents (monnaie et XP) — se comportent
// comme un caractère dans du texte : `+5 <Coin/>`.
export const Coin = (p)=><UIIcon name="coin" emoji="🪙" {...p}/>;
export const Xp   = (p)=><UIIcon name="xp"   emoji="⚡" {...p}/>;

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
  // Repli emoji : centré dans sa boîte (le glyphe se calait en haut-gauche → items
  // « décalés du torse », retour Gen sur le 👕 équipé).
  return <span style={{fontSize:Math.round(size*0.78),lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",...style}}>{emoji}</span>;
}

// v1.81.0 — Ancrage anatomique des items équipés. AVANT : hat/face/armor étaient centrés sur le CANVAS
// (72 unités, left:"50%") — mais le personnage dessiné par renderAvatarToCtx (bras compris, x:-2..38) est
// décalé à gauche dedans, son vrai centre est x=18, pas 36. Résultat : les items flottaient à côté du corps
// au lieu de sembler portés. Les ancres ci-dessous utilisent le même repère 72 unités que renderAvatarToCtx,
// donc l'alignement reste correct à N'IMPORTE QUELLE taille d'avatar (cx/cy en unités natives ÷72×size).
// a1/a2/a3/a5 (bouclier/épée/arc/bâton) sont en fait des ARMES tenues en main, pas de l'armure de torse —
// a4 (armure diamant) reste seule à utiliser l'ancre "armor" (centrée sur le torse).
export const HELD_WEAPON_IDS = new Set(["a1","a2","a3","a5","a10","a13"]); // a10 bouclier fromage, a13 bâton (Phase 7)
export const AVATAR_EQUIP_ANCHORS = {
  hat:    { cx:18, cy:1,  wRatio:0.40, shadow:true },              // sommet de la tête (tête native x3-33 y2-24, centre x18)
  face:   { cx:18, cy:13, wRatio:0.235 },                          // niveau des yeux
  armor:  { cx:18, cy:39, wRatio:0.34, shadow:true },               // centré sur le torse (corps natif x2-34 y26-50, centre x18 y38)
  weapon: { cx:37, cy:32, wRatio:0.36, rotate:22, shadow:true },    // tenue dans la main droite (bras natif x32-38 y28-42), légère inclinaison
  themed: { cx:29, cy:53, wRatio:0.22 },                           // accessoire secondaire, à la ceinture/jambe
};
// Ancres pour le PERSONNAGE DÉTAILLÉ v2 (trame 144, chantier E), PAR SILHOUETTE —
// anatomie MESURÉE (bbox alpha>40 des PNG, pas les valeurs supposées d'origine qui
// plaçaient la main à x100 hors du corps, bbox max x≈92) :
//   body_ado    : tête centre (72,22) larg≈26 (x59-84, y8-36), torse (72,66), main droite ≈(88,89)
//   body_enfant : tête centre (72,40) (y27-52), torse (72,80), main droite ≈(88,100)
export const AVATAR_EQUIP_ANCHORS_V2 = {
  hat:    { cx:72, cy:12,  wRatio:0.28, shadow:true, base:144 },
  face:   { cx:72, cy:23,  wRatio:0.18, base:144 },
  armor:  { cx:72, cy:66,  wRatio:0.30, shadow:true, base:144 },
  weapon: { cx:88, cy:88,  wRatio:0.30, rotate:22, shadow:true, base:144 },
  themed: { cx:84, cy:105, wRatio:0.18, base:144 },
};
export const AVATAR_EQUIP_ANCHORS_V2_ENFANT = {
  hat:    { cx:72, cy:30,  wRatio:0.28, shadow:true, base:144 },
  face:   { cx:72, cy:41,  wRatio:0.18, base:144 },
  armor:  { cx:72, cy:80,  wRatio:0.30, shadow:true, base:144 },
  weapon: { cx:88, cy:99,  wRatio:0.28, rotate:22, shadow:true, base:144 },
  themed: { cx:84, cy:112, wRatio:0.18, base:144 },
};
export const v2AnchorsFor = (build) => build==="bd_enfant" ? AVATAR_EQUIP_ANCHORS_V2_ENFANT : AVATAR_EQUIP_ANCHORS_V2;
export function equipAnchorStyle(key, size, detailed=false, build="bd_ado") {
  const A = detailed ? v2AnchorsFor(build)[key] : AVATAR_EQUIP_ANCHORS[key];
  const base = A.base || 72;
  const w = Math.round(size*A.wRatio);
  return {
    position:"absolute", left:Math.round(A.cx/base*size), top:Math.round(A.cy/base*size),
    width:w, height:w,
    transform:`translate(-50%,-50%)${A.rotate?` rotate(${A.rotate}deg)`:""}`,
    filter:A.shadow?"drop-shadow(0 2px 0 #0d0d0d)":undefined,
    pointerEvents:"none",
  };
}
// Correction de CENTRAGE par item (mesurée hors-ligne : centre de masse du PNG vs centre
// du cadre — ex. h3 : casque à gauche, plumeau à droite → le cadre est centré mais le
// casque paraît décalé, bug signalé 2×  par Gen). Fractions de la taille affichée.
export const ITEM_CONTENT_OFFSET = {
  h3:  { dx: 0.11, dy: 0.02 },   // heaume : corps du casque à x0.39 du cadre (plumeau à droite)
  h5:  { dx: -0.05, dy: -0.09 }, // chapeau savant : masse en bas-droite
  a3:  { dx: 0.05, dy: 0.08 },   // arc : masse en haut-gauche
  di1: { dy: -0.10 },
  sc1: { dy: -0.07 },
};
// En mode DÉTAILLÉ, FittedItemSprite recadre déjà sur la bbox opaque : les offsets v1
// (qui compensent des marges) deviennent une DOUBLE correction (casque poussé haut-gauche).
// Seule reste l'asymétrie de MASSE des items dont la bbox remplit le cadre (h3).
export const ITEM_CONTENT_OFFSET_V2 = {
  h3: { dx: 0.11, dy: 0.02 },
};
const withContentOffset = (style, itemId, detailed=false) => {
  const o = (detailed ? ITEM_CONTENT_OFFSET_V2 : ITEM_CONTENT_OFFSET)[itemId];
  if (!o) return style;
  return { ...style,
    left: style.left + Math.round((o.dx||0)*style.width),
    top:  style.top  + Math.round((o.dy||0)*style.height) };
};
// Item ÉQUIPÉ en mode détaillé : canvas recadré sur le CONTENU opaque du PNG puis
// centré — insensible aux marges/asymétries de l'art (heaume h3 décalé 3× chez Gen :
// le panache déportait le casque dans son cadre). Repli ItemSprite (emoji) si pas de PNG.
export function FittedItemSprite({ itemId, emoji, size, style={} }){
  const ref = useRef(null);
  const [fail, setFail] = useState(false);
  useEffect(()=>{
    if(fail || !itemId) return;
    const c = ref.current; if(!c) return;
    const img = new Image();
    img.onload = ()=>{
      const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
      const tx = t.getContext("2d"); tx.drawImage(img, 0, 0);
      let x0=t.width, y0=t.height, x1=0, y1=0;
      const d = tx.getImageData(0, 0, t.width, t.height).data;
      for(let y=0; y<t.height; y++) for(let x=0; x<t.width; x++){
        if(d[(y*t.width+x)*4+3] > 40){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
      }
      if(x1 < x0) return;
      const w=x1-x0+1, h=y1-y0+1, sc=Math.min(size/w, size/h);
      const ctx = c.getContext("2d");
      ctx.clearRect(0,0,size,size); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x0, y0, w, h, (size-w*sc)/2, (size-h*sc)/2, w*sc, h*sc);
    };
    img.onerror = ()=>setFail(true);
    img.src = `/sprites/items/${itemId}.png`;
  },[itemId, size, fail]);
  if(fail || !itemId) return <ItemSprite itemId={itemId} emoji={emoji} size={size} style={style}/>;
  return <canvas ref={ref} width={size} height={size} style={{imageRendering:"pixelated",...style}}/>;
}

// Armures générées en couche PLEINE TRAME v2 (a6-a9) : portées exactement sur le corps
// détaillé — jamais utilisées en mode procédural (repli = emoji à l'ancre armor).
export const V2_FULLFRAME_ARMOR = new Set(["a6","a7","a8","a9"]);
function FullFrameArmor({ id, sfx, size }){
  const [fail, setFail] = useState(false);
  if(fail) return null;
  return <img src={`/sprites/avatar/v2/${id}${sfx}.png`} alt="" onError={()=>setFail(true)}
    style={{position:"absolute",left:0,top:0,width:size,height:size,imageRendering:"pixelated",pointerEvents:"none"}}/>;
}
// Rendu commun des items équipés "portés" sur l'avatar (chapeau/visage/arme-ou-armure au bon endroit anatomique).
// Le familier (eq.pet) reste géré séparément à chaque site d'appel (il est À CÔTÉ du perso, pas porté dessus).
// `avatarDef` (optionnel) : active les ancres v2 + les armures pleine-trame quand le
// personnage détaillé est chargé pour cette silhouette. Sans lui : comportement v1.
export function EquippedGear({ eq, items, size, avatarDef=null }) {
  // Bug prod (Antoinou, casque décalé) : au premier rendu le corps détaillé n'est pas
  // encore chargé → ancres v1 sur un corps v2 sans repositionnement. On se réabonne au
  // chargement des PNG pour recalculer les ancres dès que le mode détaillé est prêt.
  const [, setTick] = useState(0);
  useEffect(()=> onAvatarPngLoaded(()=>setTick(t=>t+1)), []);
  if (!eq) return null;
  const find = id => items.find(i=>i.id===id);
  const det = avatarDef ? isDetailedReady(avatarDef) : false;
  const sfx = det && avatarDef?.build==="bd_enfant" ? "_e" : "";
  const armorAnchor = eq.armor && HELD_WEAPON_IDS.has(eq.armor) ? "weapon" : "armor";
  const armorFull = det && eq.armor && V2_FULLFRAME_ARMOR.has(eq.armor);
  const Spr = det ? FittedItemSprite : ItemSprite; // détaillé : centrage par contenu, offsets inutiles
  // ⚠️ Les DEUX mécanismes sont nécessaires (régression v2.14.0, 4e signalement du heaume) :
  // le recadrage par contenu neutralise les MARGES, mais pas l'asymétrie de MASSE (h3 :
  // casque à gauche + panache à droite remplissent 97 % du cadre → bbox ≈ cadre).
  const st = (key, id) => withContentOffset(equipAnchorStyle(key, size, det, avatarDef?.build), id, det);
  return (<>
    {eq.hat    && <Spr itemId={eq.hat}    emoji={find(eq.hat)?.emoji}    size={st("hat",eq.hat).width}         style={st("hat",eq.hat)}/>}
    {eq.face   && <Spr itemId={eq.face}   emoji={find(eq.face)?.emoji}   size={st("face",eq.face).width}        style={st("face",eq.face)}/>}
    {eq.armor  && (armorFull
      ? <FullFrameArmor id={eq.armor} sfx={sfx} size={size}/>
      : <Spr itemId={eq.armor}  emoji={find(eq.armor)?.emoji}  size={st(armorAnchor,eq.armor).width}   style={st(armorAnchor,eq.armor)}/>)}
    {eq.themed && <Spr itemId={eq.themed} emoji={find(eq.themed)?.emoji} size={st("themed",eq.themed).width}      style={st("themed",eq.themed)}/>}
  </>);
}

// ─── EXPORT SPRITE JOUABLE (refonte avatar 2026-07-27, chantier F) ────────────
// Rasterise l'avatar COMPLET (couches + items équipés PORTÉS) en un canvas, pour
// les mini-jeux (Combat Hydre : dataURL → postMessage vers l'iframe) et toute
// future interaction famille. 100 % SYNCHRONE : les PNG d'items déjà en cache
// navigateur sont composés ; sinon repli grille ITEM_SPRITES (canvas synchrone),
// sinon emoji via fillText — le héros n'est jamais vide.
const _itemPngCache = new Map(); // clé src -> {status, img} (même patron que le cache avatar)
function getPngBySrc(src){
  if(!src) return null;
  let e = _itemPngCache.get(src);
  if(!e){
    const img = new Image();
    e = { status:"loading", img };
    img.onload = ()=>{ e.status="ok"; };
    img.onerror = ()=>{ e.status="fail"; };
    img.src = src;
    _itemPngCache.set(src, e);
  }
  return e.status==="ok" ? e.img : null;
}
const getItemPng = (itemId)=> itemId ? getPngBySrc(`/sprites/items/${itemId}.png`) : null;
const _bboxCache = new Map(); // boîte du contenu opaque par item (pour le centrage par contenu)
export function renderAvatarSprite(avatarDef, bodyColor, { size=96, mood="neutral", equipped=null, items=[] } = {}){
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  renderAvatarToCtx(ctx, avatarDef, bodyColor, size, size, false, mood);
  const eq = equipped || {};
  const det = isDetailedReady(avatarDef||{});
  const sfx = det && avatarDef?.build==="bd_enfant" ? "_e" : "";
  const drawGear = (id, anchorKey) => {
    if(!id) return;
    if(det && V2_FULLFRAME_ARMOR.has(id)){ // armure pleine-trame portée sur le corps détaillé
      const im = getPngBySrc(`/sprites/avatar/v2/${id}${sfx}.png`);
      if(im) ctx.drawImage(im, 0, 0, size, size);
      return;
    }
    const A = det ? v2AnchorsFor(avatarDef?.build)[anchorKey] : AVATAR_EQUIP_ANCHORS[anchorKey];
    const base = A.base || 72;
    const w = Math.round(size*A.wRatio);
    const off = (det ? ITEM_CONTENT_OFFSET_V2 : ITEM_CONTENT_OFFSET)[id] || {};
    const cx = A.cx/base*size + (off.dx||0)*w, cy = A.cy/base*size + (off.dy||0)*w;
    ctx.save();
    ctx.translate(cx, cy);
    if(A.rotate) ctx.rotate(A.rotate*Math.PI/180);
    const img = getItemPng(id);
    if(img){
      // Même règle que FittedItemSprite : centrer le CONTENU opaque, pas le cadre.
      let bb = _bboxCache.get(id);
      if(!bb){
        const t=document.createElement("canvas"); t.width=img.width; t.height=img.height;
        const tx=t.getContext("2d"); tx.drawImage(img,0,0);
        const dd=tx.getImageData(0,0,t.width,t.height).data;
        let x0=t.width,y0=t.height,x1=0,y1=0;
        for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){ if(dd[(y*t.width+x)*4+3]>40){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
        bb = x1>=x0 ? {x0,y0,w:x1-x0+1,h:y1-y0+1} : {x0:0,y0:0,w:img.width,h:img.height};
        _bboxCache.set(id, bb);
      }
      const sc2 = Math.min(w/bb.w, w/bb.h);
      ctx.drawImage(img, bb.x0, bb.y0, bb.w, bb.h, -bb.w*sc2/2, -bb.h*sc2/2, bb.w*sc2, bb.h*sc2);
    }
    else if(ITEM_SPRITES[id]){
      const t = document.createElement("canvas"); t.width=t.height=w;
      renderItemToCtx(t.getContext("2d"), id, w);
      ctx.drawImage(t, -w/2, -w/2);
    } else {
      const emoji = items.find(i=>i.id===id)?.emoji;
      if(emoji){ ctx.font = `${Math.round(w*0.9)}px serif`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(emoji, 0, 0); }
    }
    ctx.restore();
  };
  drawGear(eq.hat, "hat");
  drawGear(eq.face, "face");
  if(eq.armor) drawGear(eq.armor, HELD_WEAPON_IDS.has(eq.armor) ? "weapon" : "armor");
  drawGear(eq.themed, "themed");
  return c; // canvas — .toDataURL("image/png") pour les iframes
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
export function renderBadgeToCtx(ctx, b, earned, W=44, noSymbol=false){
  const sc=W/24, s=v=>Math.round(v*sc); ctx.clearRect(0,0,W,W);
  const gold=earned?"#FFCB2E":"#4a4a4a", goldD=earned?"#C7860A":"#333", sym=earned?"#3a2400":"#222";
  // Médaillon (disque)
  ctx.fillStyle=goldD; ctx.beginPath(); ctx.arc(W/2,W/2,s(11.5),0,7); ctx.fill();
  ctx.fillStyle=gold;  ctx.beginPath(); ctx.arc(W/2,W/2,s(10),0,7); ctx.fill();
  ctx.fillStyle=earned?"#FFE48A":"#5a5a5a"; ctx.beginPath(); ctx.arc(W/2,W/2,s(8.2),0,7); ctx.fill();
  ctx.fillStyle=gold; ctx.beginPath(); ctx.arc(W/2,W/2,s(7),0,7); ctx.fill();
  if(noSymbol) return; // Refonte Phase 7 — le glyphe PixelLab est superposé par-dessus (BadgeIcon)
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
// Refonte Phase 7 — le médaillon canvas reste le CADRE ; si un glyphe PixelLab existe
// (public/sprites/ui/badge_<id>.png), il remplace le symbole dessiné (superposé, ~58 %
// du médaillon, grisé si non gagné). Repli : médaillon + symbole dessiné, comme avant.
const BADGE_PNG_FAILED = new Set();
export function BadgeIcon({ badge, earned, size=44, style={} }){
  const ref=useRef(null);
  const [pngOk, setPngOk] = useState(!BADGE_PNG_FAILED.has(badge?.id));
  useEffect(()=>{ setPngOk(!BADGE_PNG_FAILED.has(badge?.id)); },[badge?.id]);
  useEffect(()=>{ const c=ref.current; if(c) renderBadgeToCtx(c.getContext("2d"), badge, earned, size, pngOk); },[badge,earned,size,pngOk]);
  const g=Math.round(size*0.58);
  return (
    <span style={{position:"relative",display:"inline-block",width:size,height:size,lineHeight:0,...style}}>
      <canvas ref={ref} width={size} height={size} style={{imageRendering:"pixelated"}}/>
      {pngOk && <img src={`/sprites/ui/badge_${badge?.id}.png`} width={g} height={g} alt=""
        onError={()=>{ BADGE_PNG_FAILED.add(badge?.id); setPngOk(false); }}
        style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",
          imageRendering:"pixelated",objectFit:"contain",
          filter:earned?undefined:"grayscale(1) brightness(0.55)"}}/>}
    </span>
  );
}

// ─── COFFRES MYSTÈRES (loot boxes) ────────────────────────────
// v2.16.21 — rééquilibrage éthique (demande de Gen, reprend ANALYSE-GAME-DESIGN.md §"coffres
// surpayés de 50-64%") : prix ramenés à un niveau honnête par rapport à la valeur espérée réelle.
export const CHESTS = [
  { id:"common", name:"Coffre Commun",     cost:50,  color:"#9AA0A6", bands:["Commun","Rare"],                    w:[70,30] },
  { id:"rare",   name:"Coffre Rare",        cost:120, color:"#4FA3FF", bands:["Rare","Ultra Rare","Légendaire"],  w:[55,35,10] },
  { id:"epic",   name:"Coffre Légendaire",  cost:250, color:"#FFB02E", bands:["Ultra Rare","Légendaire","Unique"],w:[55,33,12] },
];
// v2.16.21 — garantie anti-doublon (pity) : dans la bande tirée, on exclut les items déjà
// possédés quand c'est possible — on ne retombe sur la bande complète (doublons inclus) que si
// TOUT y est déjà possédé. Plus honnête que rembourser après coup (33% déjà en place ailleurs).
export const pickFromChest = (pool, chest, owned=[]) => {
  // tire une bande selon les poids, puis un item de cette bande (repli: tout le pool)
  let r=Math.random()*chest.w.reduce((a,b)=>a+b,0), band=chest.bands[0];
  for(let i=0;i<chest.bands.length;i++){ if(r<chest.w[i]){band=chest.bands[i];break;} r-=chest.w[i]; }
  let cand=pool.filter(it=>rarityOf(it.cost).name===band);
  if(!cand.length) cand=pool;
  const fresh=cand.filter(it=>!owned.includes(it.id));
  const finalCand=fresh.length?fresh:cand;
  return finalCand[Math.floor(Math.random()*finalCand.length)];
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
