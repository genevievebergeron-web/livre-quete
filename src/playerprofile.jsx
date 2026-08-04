// ─── FICHE PROFIL D'UN JOUEUR (popup) ───────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif). Débloqué par le refactor CALM
// (src/calm.js) qui a permis d'extraire AvatarCanvas (src/avatar.jsx) en premier. Zéro
// changement de comportement — état local (useState) uniquement.
import { useState } from "react";
import { SFX } from "./sfx.js";
import { getPlayerTheme, shopItemById } from "./themes.js";
import { getLevelTitle, xpBar } from "./leveling.js";
import { BADGES, rarityOf, TASK_CATALOG } from "./catalog.js";
import { petLevel } from "./pets.js";
import { displayName, todayStamp, streakOf } from "./shared.js";
import { LEAGUES, leagueOf, leagueRank, activeDaysThisWeek } from "./leagues.js";
import { AvatarCanvas, DEFAULT_AVATAR } from "./avatar.jsx";

export function PlayerProfile({ player, pState, config, gameStates, th, onClose, meId, onGiveCoins, onCreateOffer, assignments }) {
  const gs = pState;
  const [giveAmt, setGiveAmt] = useState(0);
  const [reqAmt, setReqAmt] = useState(0);
  const meIdx = meId && meId!=="parent" ? config.players.findIndex(p=>p.id===meId) : -1;
  const myCoins = meIdx>=0 ? (gameStates[meIdx]?.coins||0) : 0;
  const canTrade = meIdx>=0 && meId!==player.id; // un enfant connecté regarde un FRÈRE
  const lt = getLevelTitle(gs.xp||0, player.themeId, gs.settings?.femTitles);
  const bar = xpBar(gs.xp||0);
  const pct = Math.min(100, Math.round((bar.cur/bar.needed)*100));
  const myBadges = (gs.badges||[]).map(id=>BADGES.find(b=>b.id===id)).filter(Boolean).slice(-6);
  const myDone = assignments.filter(a=>a.playerIds.includes(player.id)&&(gs.completed||[]).includes(a.instanceId+"_"+player.id+"#"+todayStamp())).length;
  const streak = streakOf(gs.activeDays);
  const siblings = config.players.map((pl,i)=>({name:displayName(pl),xp:gameStates[i]?.xp||0,color:pl.color,isMe:pl.id===player.id})).sort((a,b)=>b.xp-a.xp);
  const maxXp = Math.max(...siblings.map(s=>s.xp),1);
  // v2.16.33 — Backlog #13, incrément 2 : courbe XP des 30 derniers jours. Source PAR JOUR :
  // `xpLog` (toutes sources, depuis v2.16.32) quand il a une entrée ce jour-là, sinon repli sur
  // `completedAt` (quêtes seulement, historique pré-xpLog). Jamais les deux additionnés — un jour
  // avec au moins 1 entrée xpLog est forcément un jour où xpLog était déjà actif, donc complet et
  // fiable pour CE jour ; les additionner aurait compté les quêtes en double. Date tirée du SUFFIXE
  // `#YYYY-MM-DD` du doneKey (date locale posée par todayStamp() au moment de l'action), jamais de
  // l'ISO de completedAt (UTC — même piège que le bug v2.5.24 du reset de pièces).
  const xpHistory = (() => {
    const ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const today = new Date(); today.setHours(0,0,0,0);
    const dates = [...Array(30)].map((_,i)=>{ const d=new Date(today); d.setDate(d.getDate()-(29-i)); return ds(d); });
    const xpLogByDate = {}; (gs.xpLog||[]).forEach(e=>{ if(e&&e.date) xpLogByDate[e.date]=(xpLogByDate[e.date]||0)+(e.amount||0); });
    const xpLogDates = new Set(Object.keys(xpLogByDate));
    // Backlog #17 — garde-fou défensif : une tâche teamSplit n'a jamais accordé le plein XP catalogue.
    // En pratique ce repli ne sert qu'aux jours antérieurs à xpLog (v2.16.32), donc antérieurs à teamSplit
    // (v2.16.35) lui-même — le cas ne peut pas survenir — mais on garde la même règle partout par cohérence.
    const assXp = {}; (assignments||[]).forEach(a=>{ const t=[...TASK_CATALOG,...(config.customTasks||[])].find(x=>x.id===a.taskId); const raw=t?(t.xp||0):0; assXp[a.instanceId]=a.teamSplit?Math.round(raw/2):raw; });
    const completedAtByDate = {};
    Object.keys(gs.completedAt||{}).forEach(doneKey=>{
      const dateStr=doneKey.split("#")[1]; if(!dateStr) return;
      const base=doneKey.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_"));
      completedAtByDate[dateStr]=(completedAtByDate[dateStr]||0)+(assXp[inst]||0);
    });
    const days = dates.map(dateStr => xpLogDates.has(dateStr) ? (xpLogByDate[dateStr]||0) : (completedAtByDate[dateStr]||0));
    return { dates, days, todayDs: ds(today), total: days.reduce((a,b)=>a+b,0), maxDay: Math.max(1,...days) };
  })();
  // v2.16.34 — Backlog #13, incrément 3 : ligue individuelle (voir src/leagues.js — non comparative,
  // ratchet déjà appliqué en amont dans migrateGameState/mergeGS, ici juste l'affichage).
  const myLeague = leagueOf(gs.leagueTier || "bronze");
  const nextLeague = LEAGUES[leagueRank(myLeague.id) + 1] || null;
  const activeThisWeek = activeDaysThisWeek(gs.activeDays);
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
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[["⚡",gs.xp||0,"XP"],["🪙",gs.coins||0,"Pièces"],["✅",myDone,"Quêtes"],["🔥",streak,"Série"]].map(([icon,val,lbl])=>(
            <div key={lbl} style={{background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:6,padding:"8px 4px",textAlign:"center"}}>
              <div style={{fontSize:18,marginBottom:2}}>{icon}</div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#fff"}}>{val}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#888"}}>{lbl}</div>
            </div>
          ))}
        </div>
        {/* 📊 Courbe XP des 30 derniers jours (Backlog #13, incrément 2) */}
        <div style={{marginBottom:14,background:"rgba(0,0,0,0.4)",border:"2px solid #33333366",borderRadius:8,padding:"10px 10px 8px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888"}}>📊 30 DERNIERS JOURS</span>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1"}}>⚡{xpHistory.total}</span>
          </div>
          {xpHistory.total===0
            ? <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#666"}}>Pas encore d'XP sur cette période.</div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(30,1fr)",gap:1,alignItems:"end",height:34}}>
                {xpHistory.days.map((v,i)=>(
                  <div key={xpHistory.dates[i]} title={`${xpHistory.dates[i].slice(5)} : ${v} XP`}
                    style={{width:"100%",height:`${Math.max(v>0?2:1,(v/xpHistory.maxDay)*30)}px`,
                      background:xpHistory.dates[i]===xpHistory.todayDs?player.color:`${player.color}77`,
                      borderRadius:"1px 1px 0 0",border:xpHistory.dates[i]===xpHistory.todayDs?"1px solid #fff":"none"}}/>
                ))}
              </div>}
        </div>
        {/* 🎖️ Ligue individuelle (Backlog #13, incrément 3) — jamais de comparaison entre enfants,
            jamais de rétrogradation : le palier ne peut que monter (voir migrateGameState/mergeGS). */}
        <div style={{marginBottom:14,background:`${myLeague.color}18`,border:`2px solid ${myLeague.color}66`,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:28}}>{myLeague.emoji}</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:myLeague.color}}>Ligue {myLeague.name}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#999"}}>
              {nextLeague
                ? `${activeThisWeek}/7 jours actifs cette semaine — encore ${Math.max(0,nextLeague.minActiveDays-activeThisWeek)} pour ${nextLeague.name} ${nextLeague.emoji}`
                : `${activeThisWeek}/7 jours actifs — palier le plus haut atteint !`}
            </div>
          </div>
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
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:rank===0?"#D9BC5C":"#666",width:14}}>#{rank+1}</span>
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
          <div style={{background:"rgba(255,215,0,0.07)",border:"2px solid #D9BC5C55",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginBottom:6}}>🎁 DONNER DES PIÈCES</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa",marginBottom:8}}>Tu as {myCoins} 🪙. Choisis combien donner à {displayName(player)} :</div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              {[5,10,25].map(v=>(
                <button key={v} disabled={v>myCoins} onClick={()=>setGiveAmt(v)}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"7px 10px",background:giveAmt===v?"#D9BC5C":"#1a1a1a",color:giveAmt===v?"#0d0d0d":(v>myCoins?"#555":"#D9BC5C"),border:`2px solid ${v>myCoins?"#333":"#D9BC5C"}`,borderRadius:4,cursor:v>myCoins?"not-allowed":"pointer",opacity:v>myCoins?0.5:1}}>{v}</button>
              ))}
              <input type="number" min="1" max={myCoins} value={giveAmt||""} onChange={e=>setGiveAmt(Math.max(0,Math.min(myCoins,parseInt(e.target.value)||0)))}
                placeholder="autre" style={{width:64,fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center"}}/>
              <button disabled={!(giveAmt>0&&giveAmt<=myCoins)}
                onClick={()=>{ if(giveAmt>0&&giveAmt<=myCoins&&onGiveCoins){ const ok=onGiveCoins(meId,player.id,giveAmt); if(ok){SFX.coin&&SFX.coin();setGiveAmt(0);onClose&&onClose();} } }}
                style={{flex:1,minWidth:90,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:(giveAmt>0&&giveAmt<=myCoins)?"#D9BC5C":"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:(giveAmt>0&&giveAmt<=myCoins)?"pointer":"not-allowed",opacity:(giveAmt>0&&giveAmt<=myCoins)?1:0.5}}>🎁 Donner</button>
            </div>
            {/* 📨 Demander des pièces (offre que le frère doit accepter) */}
            <div style={{borderTop:"1px solid #D9BC5C33",marginTop:10,paddingTop:8}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1",marginBottom:6}}>📨 DEMANDER DES PIÈCES</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#aaa",marginBottom:8}}>{displayName(player)} a {gs.coins||0} 🪙. Demande-lui un montant — il devra accepter.</div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                {[5,10,25].map(v=>(
                  <button key={v} onClick={()=>setReqAmt(v)}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"7px 10px",background:reqAmt===v?"#85CDD1":"#1a1a1a",color:reqAmt===v?"#0d0d0d":"#85CDD1",border:"2px solid #85CDD1",borderRadius:4,cursor:"pointer"}}>{v}</button>
                ))}
                <input type="number" min="1" value={reqAmt||""} onChange={e=>setReqAmt(Math.max(0,parseInt(e.target.value)||0))}
                  placeholder="autre" style={{width:64,fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center"}}/>
                <button disabled={!(reqAmt>0)}
                  onClick={()=>{ if(reqAmt>0&&onCreateOffer){ const ok=onCreateOffer(meId,player.id,reqAmt); if(ok){SFX.click&&SFX.click();setReqAmt(0);onClose&&onClose();} } }}
                  style={{flex:1,minWidth:90,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:reqAmt>0?"#85CDD1":"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:reqAmt>0?"pointer":"not-allowed",opacity:reqAmt>0?1:0.5}}>📨 Demander</button>
              </div>
            </div>
          </div>
        )}
        <button onClick={onClose} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:10,background:player.color,color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",boxShadow:"3px 3px 0 #0d0d0d"}}>✕ FERMER</button>
      </div>
    </div>
  );
}
