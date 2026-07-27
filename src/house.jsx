// ─── MA MAISON : décor modulable façon Finch (refonte avatar 2026-07-27) ─────
// La pièce de l'enfant : tapisserie + plancher + meubles sur ANCRES FIXES (patron
// AVATAR_EQUIP_ANCHORS — pas de drag-drop libre en v1), l'avatar debout au centre,
// le familier équipé à côté. Palette de base = thème choisi par l'enfant ; les items
// déco s'achètent en Boutique (nouveau puits de dépense de pièces, tiers Phase 2).
// Chaque élément : PNG /sprites/deco/<id>.png si présent, sinon emoji (patron ItemSprite).
// Aucune animation — conforme au mode calme d'office.
import { useState } from "react";
import { PT_LIST, getPlayerTheme } from "./themes.js";
import { AvatarCanvas, DEFAULT_AVATAR } from "./avatar.jsx";
import { PetSprite } from "./sprites.jsx";
import { petSpriteKey } from "./pets.js";

export const DEFAULT_HOUSE = { wallpaper:null, floor:null, placed:{} };

// Ancres fixes de la pièce (% du conteneur, centre de l'item). left/bottom pour le sol,
// left/top pour les murs. `size` = fraction de la largeur de la scène.
export const HOUSE_ANCHORS = {
  poster: { x:14, y:20,  wall:true,  size:0.14, label:"Mur gauche" },
  trophy: { x:36, y:16,  wall:true,  size:0.12, label:"Tablette" },
  window: { x:80, y:22,  wall:true,  size:0.20, label:"Fenêtre" },
  lamp:   { x:8,  y:30,  wall:false, size:0.13, label:"Coin gauche" },
  bed:    { x:24, y:12,  wall:false, size:0.24, label:"Lit" },
  rug:    { x:52, y:2,   wall:false, size:0.26, label:"Tapis" },
  chest:  { x:72, y:10,  wall:false, size:0.15, label:"Coffre" },
  plant:  { x:92, y:26,  wall:false, size:0.13, label:"Coin droit" },
};

// Catalogue déco — slot:"deco" (jamais équipé sur le perso ; se place dans la pièce).
// decoType : wallpaper | floor | furniture (furniture → `anchor` fixe).
export const DECO_CATALOG = [
  { id:"dw1", emoji:"🟪", name:"Tapisserie rayée",   cost:30, slot:"deco", decoType:"wallpaper" },
  { id:"dw2", emoji:"✨", name:"Tapisserie étoilée", cost:45, slot:"deco", decoType:"wallpaper" },
  { id:"df1", emoji:"🪵", name:"Plancher de bois",   cost:30, slot:"deco", decoType:"floor" },
  { id:"df2", emoji:"🏁", name:"Plancher damier",    cost:45, slot:"deco", decoType:"floor" },
  { id:"dn1", emoji:"🪟", name:"Fenêtre ensoleillée",cost:35, slot:"deco", decoType:"furniture", anchor:"window" },
  { id:"db1", emoji:"🛏️", name:"Lit douillet",       cost:50, slot:"deco", decoType:"furniture", anchor:"bed" },
  { id:"ds1", emoji:"📚", name:"Étagère à trésors",  cost:35, slot:"deco", decoType:"furniture", anchor:"trophy" },
  { id:"dr1", emoji:"🟠", name:"Tapis rond",         cost:25, slot:"deco", decoType:"furniture", anchor:"rug" },
  { id:"dp1", emoji:"🪴", name:"Plante verte",       cost:20, slot:"deco", decoType:"furniture", anchor:"plant" },
  { id:"dl1", emoji:"🛋️", name:"Fauteuil moelleux",  cost:40, slot:"deco", decoType:"furniture", anchor:"lamp" },
  { id:"dc1", emoji:"🧸", name:"Coffre à jouets",    cost:40, slot:"deco", decoType:"furniture", anchor:"chest" },
  { id:"da1", emoji:"🖼️", name:"Cadre de héros",     cost:25, slot:"deco", decoType:"furniture", anchor:"poster" },
  // Items uniques par thème — visibles en Boutique SEULEMENT quand ce thème est choisi
  // (patron du gating des shopCategory de thème). Achetés = possédés pour toujours,
  // affichés dans la pièce seulement quand leur thème est actif (cohérent avec `themed`).
  ...PT_LIST.filter(t=>t.id!=="none").map(t=>({
    id:`deco_${t.id}`, emoji:t.icon, name:`Trophée ${t.name.replace(/[\p{Emoji_Presentation}\u{FE0F}]/gu,"").trim()||t.id}`,
    cost:45, slot:"deco", decoType:"furniture", anchor:"trophy", themeId:t.id,
  })),
];
export const decoById = (id) => DECO_CATALOG.find(d=>d.id===id);
// Items déco visibles en Boutique pour un joueur (génériques + ceux de SON thème actif)
export const decoForTheme = (themeId) => DECO_CATALOG.filter(d=>!d.themeId || d.themeId===themeId);

// Élément déco : PNG /sprites/deco/<id>.png → repli emoji (patron ItemSprite, sprites.jsx).
export function DecoSprite({ decoId, emoji, size=32, style={} }) {
  const [imgFail, setImgFail] = useState(false);
  if (!imgFail && decoId)
    return <img src={`/sprites/deco/${decoId}.png`} alt="" width={size} height={size}
      onError={()=>setImgFail(true)} style={{imageRendering:"pixelated",display:"block",...style}}/>;
  return <span style={{fontSize:Math.round(size*0.82),lineHeight:1,display:"block",...style}}>{emoji}</span>;
}

// Motifs CSS des surfaces (repli quand pas de PNG /sprites/deco/<id>.png — v1 : toujours CSS).
const wallpaperStyle = (id, pt) => {
  const base = pt.bg || "#1a1a2e";
  if (id==="dw1") return { background:`repeating-linear-gradient(90deg, ${base}, ${base} 26px, ${pt.primary||"#333"}55 26px, ${pt.primary||"#333"}55 34px)` };
  if (id==="dw2") return { background:`radial-gradient(circle at 18% 30%, ${pt.glow||"#D9BC5C"}44 2px, transparent 3px), radial-gradient(circle at 62% 14%, ${pt.glow||"#D9BC5C"}36 2px, transparent 3px), radial-gradient(circle at 84% 44%, ${pt.glow||"#D9BC5C"}40 2px, transparent 3px), radial-gradient(circle at 38% 58%, ${pt.glow||"#D9BC5C"}30 2px, transparent 3px), ${base}` };
  return { background:`linear-gradient(180deg, ${base} 0%, ${pt.primary||"#222"}33 100%)` }; // défaut : teinte du thème
};
const floorStyle = (id, pt) => {
  if (id==="df1") return { background:`repeating-linear-gradient(0deg, #4a3220, #4a3220 7px, #3a2718 7px, #3a2718 8px)` };
  if (id==="df2") return { background:`conic-gradient(#2a2a3a 90deg, #383850 90deg 180deg, #2a2a3a 180deg 270deg, #383850 270deg) 0 0/26px 26px` };
  return { background:`linear-gradient(180deg, ${pt.primary||"#222"}44, #111)` }; // défaut : teinte du thème
};

// La scène. `pState.house` = { wallpaper, floor, placed:{anchorId:itemId} }.
// Les items d'un AUTRE thème que celui du joueur restent possédés mais ne s'affichent pas.
export function HouseScene({ player, pState, width=320, style={} }) {
  const pt = getPlayerTheme(player.themeId);
  const house = { ...DEFAULT_HOUSE, ...(pState.house||{}) };
  const H = Math.round(width*0.78), floorH = Math.round(H*0.34);
  const visible = (d) => d && (!d.themeId || d.themeId===(player.themeId||"none"));
  const wp = visible(decoById(house.wallpaper)) ? house.wallpaper : null;
  const fl = visible(decoById(house.floor)) ? house.floor : null;
  return (
    <div style={{position:"relative",width,height:H,borderRadius:10,overflow:"hidden",border:`3px solid ${pt.accent||"#D9BC5C"}66`,...style}}>
      <div style={{position:"absolute",inset:0,...wallpaperStyle(wp,pt)}}/>
      <div style={{position:"absolute",left:0,right:0,bottom:0,height:floorH,borderTop:`2px solid #0d0d0d`,...floorStyle(fl,pt)}}/>
      {Object.entries(HOUSE_ANCHORS).map(([aid,a])=>{
        const d = decoById(house.placed?.[aid]);
        if(!visible(d)) return null;
        const sz = Math.round(width*a.size);
        const pos = a.wall
          ? { left:`${a.x}%`, top:`${a.y}%`, transform:"translate(-50%,-50%)" }
          : { left:`${a.x}%`, bottom:`${(a.y/100)*floorH}px`, transform:"translateX(-50%)" };
        return <div key={aid} style={{position:"absolute",...pos,pointerEvents:"none"}}>
          <DecoSprite decoId={d.id} emoji={d.emoji} size={sz}/>
        </div>;
      })}
      {/* L'enfant, debout sur le plancher, avec son familier */}
      <div style={{position:"absolute",left:"50%",bottom:Math.round(floorH*0.12),transform:"translateX(-50%)"}}>
        <AvatarCanvas avatarDef={pState.avatar||DEFAULT_AVATAR} bodyColor={pt.charBodyColor||player.color} size={Math.round(width*0.30)}/>
      </div>
      {(pState.equipped?.pet && petSpriteKey(pState.equipped.pet)) &&
        <div style={{position:"absolute",left:"66%",bottom:Math.round(floorH*0.10),pointerEvents:"none"}}>
          <PetSprite itemId={pState.equipped.pet} size={Math.round(width*0.14)}/>
        </div>}
    </div>
  );
}
