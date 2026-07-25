// ─── AVATAR POPUP (creator + inventaire + familier) ─────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif). Débloqué par le refactor CALM/avatar
// (src/avatar.jsx) — dépend d'AvatarCanvas. Zéro changement de comportement.
import { useState } from "react";
import { SFX } from "./sfx.js";
import { getPlayerTheme } from "./themes.js";
import { getLevelTitle } from "./leveling.js";
import { rarityOf } from "./catalog.js";
import { PET_LEVELS, petLevel, petBar, petStage, petSpriteKey, petIsLegendary, petFormLabel, petPalOverride } from "./pets.js";
import { PetSprite, EquippedGear } from "./sprites.jsx";
import { displayName } from "./shared.js";
import { DEFAULT_AVATAR, AVATAR_PARTS, AvatarCanvas } from "./avatar.jsx";

export function AvatarPopup({ player, pState, onClose, onUpdateAvatar, onEquip, allShopItems, th }) {
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
      <div style={{background:pt.bg||"#1a1a2e",border:`2px solid ${pt.accent||"#D9BC5C"}88`,borderRadius:10,padding:20,width:"min(520px,95vw)",maxHeight:"85vh",display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>
        {/* Header — sticky (Backlog UX #6) : reste visible même en scrollant loin dans l'inventaire/familiers.
            Marges/paddings négatifs+positifs pour étendre le header par-dessus le padding du conteneur
            scrollable (ligne juste au-dessus) tout en gardant le même espacement visuel. */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:5,background:pt.bg||"#1a1a2e",marginTop:-20,marginLeft:-20,marginRight:-20,paddingTop:20,paddingLeft:20,paddingRight:20,paddingBottom:10}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:pt.accent||"#D9BC5C"}}>{displayName(player)} — Mon Perso</div>
          <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"5px 10px",background:"#333",color:"#888",border:"2px solid #555",borderRadius:3,cursor:"pointer"}}>✕</button>
        </div>

        {/* Preview */}
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:20,padding:"10px 0"}}>
          <div style={{position:"relative"}}>
            <AvatarCanvas avatarDef={avatarDef} bodyColor={pt.charBodyColor||player.color} size={120}
              style={{border:`4px solid ${pt.accent||"#D9BC5C"}`,boxShadow:`0 0 20px ${pt.glow||"#D9BC5C"}50`}}/>
            {/* v1.81.0 — items équipés PORTÉS sur l'avatar, ancrés sur la vraie géométrie du corps (EquippedGear) */}
            <EquippedGear eq={eq} items={allShopItems} size={120}/>
            {eq.pet   && (petSpriteKey(eq.pet) ? <div style={{position:"absolute",bottom:-10,left:-14,pointerEvents:"none"}}><PetSprite itemId={eq.pet} size={48}/></div> : <span style={{position:"absolute",bottom:-12,left:-12,fontSize:28,pointerEvents:"none"}}>{allShopItems.find(i=>i.id===eq.pet)?.emoji}</span>)}
          </div>
          <div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:player.color,marginBottom:6}}>{displayName(player)}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:pt.accent||"#D9BC5C",marginBottom:4}}>{getLevelTitle(pState.xp,player.themeId).title}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1"}}>⚡ {pState.xp} XP</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginTop:3}}>🪙 {pState.coins} {pt.coinName||"pièces"}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#555",marginTop:4}}>Items équipés: {Object.values(eq).filter(Boolean).length}</div>
          </div>
        </div>

        {/* Main tabs */}
        <div style={{display:"flex",gap:6}}>
          {[["creator","✏️ Créer"],["pet","🐾 Familier"],["inventory","🎒 Inventaire"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setTab(k);SFX.click();}}
              style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px",background:tab===k?(pt.accent||"#D9BC5C"):"#222",color:tab===k?"#0d0d0d":"#888",border:`2px solid ${tab===k?(pt.accent||"#D9BC5C"):"#444"}`,borderRadius:4,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>

        {/* CREATOR TAB */}
        {tab==="creator" && <>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {Object.entries(PART_TABS).map(([k,l])=>(
              <button key={k} onClick={()=>{setPartTab(k);SFX.click();}}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"5px 9px",background:partTab===k?(pt.accent||"#D9BC5C"):"#222",color:partTab===k?"#0d0d0d":"#888",border:`2px solid ${partTab===k?(pt.accent||"#D9BC5C"):"#444"}`,borderRadius:3,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
          {partTab==="skin" && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {AVATAR_PARTS.skin.map(s=>(
                <div key={s.id} onClick={()=>update("skin",s.id)}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"8px 4px",background:avatarDef.skin===s.id?`${s.color}30`:"rgba(0,0,0,0.4)",border:`3px solid ${avatarDef.skin===s.id?s.color:"#333"}`,borderRadius:5,cursor:"pointer",boxShadow:avatarDef.skin===s.id?`0 0 10px ${s.color}80`:"none"}}>
                  <div style={{width:28,height:28,background:s.color,borderRadius:4,border:"2px solid #0d0d0d"}}/>
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
                  <div style={{width:28,height:14,background:h.color,borderRadius:"4px 4px 0 0",border:"2px solid #0d0d0d"}}/>
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
                    border:`2px solid ${isEq?(pt.accent||"#5CAD68"):rar.color}`,borderRadius:6,cursor:item.slot?"pointer":"default",
                    boxShadow:isEq?`0 0 10px ${pt.glow||"#D9BC5C"}60`:(rar.min>=45?`0 0 8px ${rar.color}55`:"none")}}>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:4,color:rar.color}}>{rar.name.toUpperCase()}</span>
                  <span style={{fontSize:24}}>{item.emoji}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:11,color:"#ccc",textAlign:"center",lineHeight:1.2}}>{item.name||item.label}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:isEq?"#5CAD68":"#888"}}>
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
          const acc = pt.accent||"#D9BC5C";
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
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:acc,marginTop:8}}>{pState.petNickname?.[eqPet.id]||eqPet.name} — Niv.{lv}</div>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:_leg?"#FFD45A":"#fff",marginTop:2}}>Stade : {petFormLabel(_evo,lv)} {lv>=PET_LEVELS.length?"✨ (max!)":""}</div>
                    <div style={{height:14,background:"#111",border:"2px solid #333",borderRadius:4,overflow:"hidden",margin:"8px 0 4px"}}>
                      <div style={{height:"100%",width:pctp+"%",background:`linear-gradient(90deg,${acc},#85CDD1)`,transition:"width 0.8s ease"}}/>
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
                        <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc"}}>{pState.petNickname?.[p.id]||p.name}</span>
                        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:acc}}>Niv.{lv} · {petStage(xp)}</span>
                        <div style={{height:6,width:"90%",background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:pctp+"%",background:acc}}/>
                        </div>
                        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:isEq?"#5CAD68":"#777"}}>{isEq?"✅ ÉQUIPÉ":"Équiper"}</span>
                      </div>
                    );
                  })}
                </div>
              </>}
            </div>
          );
        })()}
        <button onClick={onClose} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"13px",marginTop:6,background:pt.accent||"#D9BC5C",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>← Retour</button>
      </div>
    </div>
  );
}
