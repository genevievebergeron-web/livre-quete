// ─── MA MAISON : décor modulable façon Finch (refonte avatar 2026-07-27) ─────
// La pièce de l'enfant : tapisserie + plancher + meubles sur ANCRES FIXES (patron
// AVATAR_EQUIP_ANCHORS — pas de drag-drop libre en v1), l'avatar debout au centre,
// le familier équipé à côté. Palette de base = thème choisi par l'enfant ; les items
// déco s'achètent en Boutique (nouveau puits de dépense de pièces, tiers Phase 2).
// Chaque élément : PNG /sprites/deco/<id>.png si présent, sinon emoji (patron ItemSprite).
// Aucune animation — conforme au mode calme d'office.
import { useState, useRef, useEffect } from "react";
import { PT_LIST, getPlayerTheme, ALL_SHOP_ITEMS } from "./themes.js";
import { AvatarCanvas, DEFAULT_AVATAR } from "./avatar.jsx";
import { PetSprite, EquippedGear } from "./sprites.jsx";
import { petSpriteKey, petLevel, petPalOverride, petIsLegendary } from "./pets.js";

export const DEFAULT_HOUSE = { wallpaper:null, floor:null, placed:{} };

// Ancres fixes de la pièce (% du conteneur, centre de l'item). left/bottom pour le sol,
// left/top pour les murs. `size` = fraction de la largeur de la scène.
export const HOUSE_ANCHORS = {
  poster: { x:14, y:20,  wall:true,  size:0.14, label:"Mur gauche" },
  trophy: { x:36, y:16,  wall:true,  size:0.12, label:"Tablette" },
  window: { x:50, y:18,  wall:true,  size:0.20, label:"Fenêtre" }, // centrée (V3 approuvée par Gen)
  lamp:   { x:8,  y:30,  wall:false, size:0.13, label:"Coin gauche" },
  bed:    { x:24, y:12,  wall:false, size:0.24, label:"Lit" },
  rug:    { x:52, y:2,   wall:false, flat:true, size:0.26, label:"Tapis" }, // flat : posé à plat, confiné à la bande de plancher
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
  // Phase 7 (28-07, demande Gen) — déco ÉPIQUE inspirée de la vraie maison
  { id:"df3", emoji:"◼️", name:"Plancher de la cuisine", cost:55, slot:"deco", decoType:"floor" },
  { id:"dd1", emoji:"🚪", name:"Porte jaune",             cost:60, slot:"deco", decoType:"furniture", anchor:"poster" },
  { id:"dg1", emoji:"🥕", name:"Bac à jardin",            cost:50, slot:"deco", decoType:"furniture", anchor:"plant" },
  { id:"dpp1",emoji:"🪑", name:"Papasan",                 cost:55, slot:"deco", decoType:"furniture", anchor:"lamp" },
  { id:"dpf1",emoji:"🟢", name:"Pouf vert pâle",          cost:50, slot:"deco", decoType:"furniture", anchor:"rug" },
  { id:"dlg1",emoji:"🧱", name:"Tablette à constructions",cost:55, slot:"deco", decoType:"furniture", anchor:"trophy" },
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
// `maxH` (optionnel) : hauteur plafond en px — les PNG non carrés (dr1 128×64, db1 112×96,
// dp1 64×80) rendus en `height:auto` pouvaient dépasser la bande de plancher (tapis « qui
// flotte » sur le mur en bannière). On réduit alors la largeur en respectant le ratio
// naturel de l'image (pas de déformation, pixel art intact).
export function DecoSprite({ decoId, emoji, size=32, maxH=null, style={} }) {
  const [imgFail, setImgFail] = useState(false);
  const [ratio, setRatio] = useState(null); // naturalWidth/naturalHeight, connu au onLoad
  if (!imgFail && decoId) {
    const w = (maxH && ratio && size/ratio > maxH) ? Math.max(1, Math.floor(maxH*ratio)) : size;
    return <img src={`/sprites/deco/${decoId}.png`} alt="" width={w}
      onLoad={e=>setRatio(e.target.naturalWidth/e.target.naturalHeight)}
      onError={()=>setImgFail(true)} style={{imageRendering:"pixelated",display:"block",width:w,height:"auto",...style}}/>;
  }
  return <span style={{fontSize:Math.round(size*0.82),lineHeight:1,display:"block",color:"#eee",...style}}>{emoji}</span>;
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
  if (id==="df3") return { background:`conic-gradient(#e8e8e2 90deg, #17171c 90deg 180deg, #e8e8e2 180deg 270deg, #17171c 270deg) 0 0/26px 26px` }; // Phase 7 — plancher de la cuisine (carrelé noir et blanc)
  return { background:`linear-gradient(180deg, ${pt.primary||"#222"}44, #111)` }; // défaut : teinte du thème
};

// Familier CORPS COMPLET pour la pièce : /sprites/pets/full/<clé>.png → repli PetSprite
// (portrait/canvas habituel) si le PNG complet n'existe pas encore.
function FullPetSprite({ petKey, size }){
  const [fail, setFail] = useState(false);
  if(fail) return <PetSprite petKey={petKey} size={size}/>;
  return <img src={`/sprites/pets/full/${petKey}.png`} alt="" width={size} onError={()=>setFail(true)}
    style={{imageRendering:"pixelated",display:"block",width:size,height:"auto"}}/>;
}

// Pièce PixelLab par défaut (perspective, /sprites/deco/room.png) — masquée si le PNG
// manque (onError), la base CSS en dessous reste alors visible (repli garanti).
function RoomImg(){
  const [fail, setFail] = useState(false);
  if(fail) return null;
  return <img src="/sprites/deco/room.png" alt="" onError={()=>setFail(true)}
    style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 78%",imageRendering:"pixelated"}}/>;
}

// La scène. `pState.house` = { wallpaper, floor, placed:{anchorId:itemId} }.
// Les items d'un AUTRE thème que celui du joueur restent possédés mais ne s'affichent pas.
// `ratio` : hauteur/largeur — 0.78 pour la pièce du popup, ~0.36 pour la BANNIÈRE d'accueil.
// Fond : /sprites/deco/room.png (pièce PixelLab en perspective) en priorité, dégradés CSS en
// repli natif (background multiple : si l'URL 404, le dégradé en dessous reste visible).
// Tapisserie/plancher achetés = textures tuilées /sprites/deco/<id>.png par-dessus leurs zones.
// `editable` + `onMoveDeco(aid,{x,y})` : glisser-déposer des meubles (popup Maison seulement).
// Position personnalisée `house.pos[aid] = {x,y}` — mêmes unités que HOUSE_ANCHORS (x % de
// la largeur ; y : sol = % de floorH depuis le bas, mur = % de H depuis le haut), donc la
// position vaut pour TOUTES les échelles (popup et bannière). Sans `pos` : ancres par défaut.
export function HouseScene({ player, pState, width=320, ratio=0.78, style={}, editable=false, onMoveDeco=null }) {
  const pt = getPlayerTheme(player.themeId);
  const house = { ...DEFAULT_HOUSE, ...(pState.house||{}) };
  // innerWidth peut valoir 0 au 1er montage (volet caché/pré-rendu) → largeurs négatives en
  // cascade (bannerW = innerWidth-16) jusqu'au crash du halo Légendaire. Plancher défensif.
  width = Math.max(80, Math.round(width));
  const H = Math.round(width*ratio), floorH = Math.round(H*0.34);
  const [drag, setDrag] = useState(null); // {aid, x, y} pendant un glissement
  const dragRef = useRef(null);           // {aid, px, py, x0, y0, wall}
  const dragLiveRef = useRef(null);       // miroir de `drag` (lecture synchrone au pointerup)
  const geomRef = useRef({ width, H, floorH });
  geomRef.current = { width, H, floorH };
  // v2.16.16 — bug signalé (« les enfants n'arrivent pas à déplacer leurs meubles ») : move/up
  // n'étaient posés QUE sur le petit sprite lui-même, et comptaient sur setPointerCapture pour
  // continuer à les recevoir si le doigt dérive hors de sa (petite) zone — ce que Safari iOS ne
  // garantit pas de façon fiable. Un doigt réel dérive beaucoup plus facilement qu'un curseur de
  // souris précis, donc le test de Gen (souris) passait alors que les enfants (tactile) restaient
  // bloqués dès que le doigt quittait le sprite. Fix : écoute move/up sur `window` pendant tout le
  // glissement, peu importe où le pointeur se déplace ensuite — setPointerCapture reste posé en
  // renfort (inoffensif) mais n'est plus le seul mécanisme de suivi.
  useEffect(()=>{
    if(!editable) return;
    const onMove = (e)=>{
      const st = dragRef.current;
      if(!st) return;
      const { width:w, H:h, floorH:fh } = geomRef.current;
      const dx = (e.clientX - st.px)/w*100;
      const clamp = (v,lo,hi)=>Math.min(hi,Math.max(lo,v));
      const x = clamp(st.x0 + dx, 6, 94);
      const y = st.wall
        ? clamp(st.y0 + (e.clientY - st.py)/h*100, 6, 62)          // mur : % de H depuis le haut
        : clamp(st.y0 - (e.clientY - st.py)/fh*100, 0, 60);        // sol : % de floorH depuis le bas
      const next = { aid:st.aid, x:Math.round(x*10)/10, y:Math.round(y*10)/10 };
      dragLiveRef.current = next;
      setDrag(next);
    };
    const onUp = ()=>{
      const st = dragRef.current;
      if(!st) return;
      dragRef.current = null;
      const cur = dragLiveRef.current;
      dragLiveRef.current = null;
      setDrag(null);
      if(cur && onMoveDeco) onMoveDeco(cur.aid, { x:cur.x, y:cur.y });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return ()=>{
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [editable, onMoveDeco]);
  const visible = (d) => d && (!d.themeId || d.themeId===(player.themeId||"none"));
  const wp = visible(decoById(house.wallpaper)) ? house.wallpaper : null;
  const fl = visible(decoById(house.floor)) ? house.floor : null;
  return (
    <div style={{position:"relative",width,height:H,borderRadius:10,overflow:"hidden",border:`3px solid ${pt.accent||"#D9BC5C"}66`,...style}}>
      {/* Base garantie (repli) : mur dégradé + bande de plancher CSS */}
      <div style={{position:"absolute",inset:0,...wallpaperStyle(wp,pt),imageRendering:"pixelated",
        ...(wp?{background:`url(/sprites/deco/${wp}.png) repeat, ${wallpaperStyle(wp,pt).background}`}:null)}}/>
      <div style={{position:"absolute",left:0,right:0,bottom:0,height:floorH,borderTop:`2px solid #0d0d0d`,imageRendering:"pixelated",
        background:fl?`url(/sprites/deco/${fl}.png) repeat, ${floorStyle(fl,pt).background}`:floorStyle(null,pt).background}}/>
      {/* Pièce PixelLab complète (perspective) quand aucune surface achetée n'est placée */}
      {!wp && !fl && <RoomImg/>}
      {Object.entries(HOUSE_ANCHORS).map(([aid,a])=>{
        const d = decoById(house.placed?.[aid]);
        if(!visible(d)) return null;
        const sz = Math.round(width*a.size);
        // Position effective : glissement en cours > position personnalisée > ancre par défaut
        const ov = (drag && drag.aid===aid) ? drag : house.pos?.[aid];
        const ax = ov?.x ?? a.x, ay = ov?.y ?? a.y;
        const pos = a.wall
          ? { left:`${ax}%`, top:`${ay}%`, transform:"translate(-50%,-50%)" }
          : { left:`${ax}%`, bottom:`${(ay/100)*floorH}px`, transform:"translateX(-50%)" };
        // Plafond de hauteur : objets à plat confinés à la bande de plancher (depuis leur
        // position EFFECTIVE), meubles debout tolérés un peu au-dessus de l'horizon.
        const bottomPx = Math.round((ay/100)*floorH);
        const maxH = a.wall ? null : (a.flat ? Math.max(8, floorH - bottomPx) : Math.round(floorH + H*0.25));
        const startDrag = (e)=>{
          if(!editable) return;
          e.preventDefault();
          dragRef.current = { aid, px:e.clientX, py:e.clientY, x0:ax, y0:ay, wall:!!a.wall };
          dragLiveRef.current = { aid, x:ax, y:ay };
          setDrag({ aid, x:ax, y:ay });
          try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointeur synthétique */ }
        };
        const dragging = drag?.aid===aid;
        return <div key={aid}
          onPointerDown={startDrag}
          style={{position:"absolute",...pos,
            pointerEvents:editable?"auto":"none", touchAction:editable?"none":undefined,
            cursor:editable?(dragging?"grabbing":"grab"):undefined,
            filter:dragging?`drop-shadow(0 0 6px ${pt.accent||"#D9BC5C"})`:undefined,
            zIndex:dragging?5:undefined}}>
          <DecoSprite decoId={d.id} emoji={d.emoji} size={sz} maxH={maxH}/>
        </div>;
      })}
      {/* L'enfant, debout sur le plancher, avec son familier. Taille bornée par la HAUTEUR
          de la scène (sinon l'avatar déborde en format bannière large). */}
      {/* Échelles retours Gen (prod 2026-07-27) : perso plus présent (« humain rétréci »),
          familier ~1/3 du perso (« immense »). */}
      {(()=>{ const avSz = Math.round(Math.min(width*0.38, H*0.80)); return (<>
      <div style={{position:"absolute",left:"50%",bottom:Math.round(floorH*0.12),transform:"translateX(-50%)"}}>
        <div style={{position:"relative"}}>
          <AvatarCanvas avatarDef={pState.avatar||DEFAULT_AVATAR} bodyColor={pt.charBodyColor||player.color} size={avSz}/>
          <EquippedGear eq={pState.equipped} items={ALL_SHOP_ITEMS} size={avSz} avatarDef={pState.avatar}/>
        </div>
      </div>
      {(pState.equipped?.pet && petSpriteKey(pState.equipped.pet)) && (()=>{
        // Gen : « le familier devrait être complet » — les PNG pets/ historiques sont des
        // PORTRAITS (têtes, dessinés par le fils) : parfaits en icône, mais tête flottante
        // dans la pièce. Ici : corps complet /sprites/pets/full/<clé>.png (PixelLab), repli
        // sur le sprite habituel ; les ÉVOLUÉS gardent leur canvas recoloré (leur vraie forme).
        const pid = pState.equipped.pet;
        const evo = (pState.petEvo||{})[pid];
        const lv = petLevel((pState.petXp||{})[pid]||0);
        const pal = petPalOverride(evo), leg = petIsLegendary(evo, lv);
        return <div style={{position:"absolute",left:"67%",bottom:Math.round(floorH*0.06),pointerEvents:"none"}}>
          {(!pal && !leg)
            ? <FullPetSprite petKey={petSpriteKey(pid)} size={Math.round(avSz*0.42)}/>
            : <PetSprite itemId={pid} size={Math.round(avSz*0.42)} palOverride={pal} legendary={leg}/>}
        </div>;})()}
      </>);})()}
    </div>
  );
}
