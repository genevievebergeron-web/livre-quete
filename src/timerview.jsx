import { useState, useEffect } from "react";
import { SFX } from "./sfx.js";
import { CALM } from "./calm.js";
import { TASK_CATALOG } from "./catalog.js";
import { TimeTimerDisc } from "./timers.jsx";
import { UIIcon } from "./sprites.jsx";
import { displayName, todayStamp } from "./shared.js";
import { spawnParticles } from "./particles.js";

const TIMER_ENCOURAGE=["Continue, tu es capable! 💪","Super rythme! ⚡","Tu gères ça comme un·e champion·ne! 🔥","Presque là, lâche pas! 🌟","Wow, quelle belle énergie! 🚀","Tu fais ça super bien! 👏"];
export function TimerView({ config, gameStates, sessionPlayer, parentMode, th, onComplete, initialRitualId, onCompleteTask }){
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
  const acc=th.accent||(child?.color)||"#D9BC5C";
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
          <UIIcon name={"task_"+t.id} emoji={t.emoji} size={18}/>
          <span style={{flex:1,fontFamily:"'VT323',monospace",fontSize:16,color:st==="done"?"#5CAD68":"#eee",textDecoration:st?"line-through":"none",opacity:st?0.65:1}}>{t.label}</span>
          {st==="done" ? <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5CAD68"}}>✅</span>
           : st==="pending" ? <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFC107"}}>⏳ attente</span>
           : <button onClick={()=>{ SFX.click&&SFX.click(); onCompleteTask&&onCompleteTask(ass,_pid); }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"7px 10px",background:"#5CAD68",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer"}}>Fait!</button>}
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
        {config.players.map((pl,i)=>(<div key={pl.id} onClick={()=>{setChildIdx(i);setRitualId(null);setStartTs(null);setTimeUp(false);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:cidx===i?pl.color:"#1a1a1a",color:cidx===i?"#0d0d0d":"#666",border:`2px solid ${cidx===i?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>))}
      </div>}

      {!startTs && (<>
        {/* Choix du mode */}
        <div style={{display:"flex",gap:6}}>
          {[["deadline","🕐 Heure de fin"],["down","⏳ Minutes"],["up","⏱ Chrono"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setMode(k);SFX.click();}}
              style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,0.85vw,7px)",padding:"11px 4px",background:mode===k?acc:"#1a1a1a",color:mode===k?"#0d0d0d":"#999",border:`2px solid ${mode===k?acc:"#333"}`,borderRadius:6,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        {/* Quelle tâche on chronomètre (libre) */}
        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb"}}>Qu'est-ce que tu chronomètres?</div>
        <input value={taskLabel} onChange={e=>{setTaskLabel(e.target.value.slice(0,40));setRitualId(null);}} placeholder="ex: Ranger ma chambre, brosser mes dents…"
          style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"9px 11px",background:"#111",color:"#fff",border:`2px solid ${ritualId?"#333":acc}`,borderRadius:6,outline:"none"}}/>
        {routines.length>0 && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <span style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777",alignSelf:"center"}}>ou un rituel (donne de l'XP 🎁) :</span>
          {routines.map(r=>(<button key={r.id} onClick={()=>{setRitualId(r.id);setTaskLabel("");if(r.endTime){setMode("deadline");setEndTime(r.endTime);}SFX.click();}} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 11px",background:ritualId===r.id?acc:"#1a1a1a",color:ritualId===r.id?"#0d0d0d":"#bbb",border:`2px solid ${ritualId===r.id?acc:"#333"}`,borderRadius:20,cursor:"pointer"}}>{r.emoji||"⏰"} {r.name}{r.endTime?` · ${r.endTime.replace(":","h")}`:""}</button>))}
        </div>}
        {/* Rappel clair : outil vs rituel */}
        <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:ritual?"#5CAD68":"#888",lineHeight:1.3,background:"rgba(0,0,0,0.3)",borderRadius:5,padding:"6px 9px"}}>
          {ritual ? `🎁 Rituel « ${ritual.name} » : le réussir dans les temps donne de l'XP!` : "🛠️ Minuterie libre : c'est juste un outil pour t'aider — pas de récompense. Choisis un rituel ci-dessus pour gagner de l'XP."}
        </div>
        {/* v1.68.0 (B4) — les tâches du rituel, cochables ici même */}
        {ritualChecklistEl}
        {/* Durée (compte à rebours) */}
        {mode==="down" && <>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginTop:2}}>Combien de minutes? <b style={{color:acc}}>{targetMin} min</b></div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {[1,2,5,10,15,20].map(v=>(
              <button key={v} onClick={()=>{setTargetMin(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 11px",background:targetMin===v?acc:"#1a1a1a",color:targetMin===v?"#0d0d0d":acc,border:`2px solid ${acc}`,borderRadius:5,cursor:"pointer"}}>{v}</button>
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
              <button key={v} onClick={()=>{setEndTime(v);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 11px",background:endTime===v?acc:"#1a1a1a",color:endTime===v?"#0d0d0d":acc,border:`2px solid ${acc}`,borderRadius:5,cursor:"pointer"}}>{v.replace(":","h")}</button>
            ))}
            <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value||"07:30")}
              style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:5,outline:"none"}}/>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#777"}}>Le minuteur va compter jusqu'à cette heure. À 5 minutes : « Let's go! » 🚀</div>
        </>}
        <button className="btn-press" onClick={start}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d",marginTop:4}}>
          ▶️ {mode==="deadline"?`Partir (jusqu'à ${endTime.replace(":","h")})`:mode==="down"?`Partir (${targetMin} min)`:"Partir le chrono"}
        </button>
      </>)}

      {startTs && !timeUp && (<>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:acc,textAlign:"center"}}>{ritual?`${ritual.emoji||"⏰"} ${ritual.name}`:`⏳ ${taskName()}`}{mode==="deadline"?` — jusqu'à ${endTime.replace(":","h")}`:""}</div>
        {mode==="deadline" && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:urgent5?"#D98C8C":"#bbb",textAlign:"center"}}>il reste <b>{Math.ceil(remaining/60000)}</b> min</div>}
        {/* v1.88.0 (Lot 3 #13) — disque visuel, seulement quand on a une vraie durée totale (pas en chrono libre) */}
        {(mode==="down"||mode==="deadline") && (()=>{ const totalMs = mode==="down" ? targetMin*60000 : Math.max(1,deadlineMs-(startTs||0)); return (
          <TimeTimerDisc progress={remaining/totalMs} color={acc} urgent={lowTime}/>
        ); })()}
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(34px,9vw,64px)",color:lowTime?"#D98C8C":urgent5?"#FFA94D":"#fff",textAlign:"center",letterSpacing:2,animation:lowTime?"pulse 0.6s infinite":"none"}}>{String(mm).padStart(2,"0")}:{String(ss).padStart(2,"0")}</div>
        {mode==="down" && <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:Math.round(remaining/(targetMin*60000)*100)+"%",background:lowTime?"#D98C8C":acc,transition:"width 0.25s linear"}}/></div>}
        {urgent5
          ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,15px)",color:"#FFA94D",textAlign:"center",animation:"pulse 0.7s infinite"}}>🚀 LET'S GO! Plus que {Math.ceil(remaining/60000)} min!</div>
          : <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:acc,textAlign:"center",minHeight:24}}>{TIMER_ENCOURAGE[Math.floor(elapsed/20000)%TIMER_ENCOURAGE.length]}</div>}
        {/* v1.68.0 (B4) — coche les tâches du rituel pendant que le minuteur tourne */}
        {ritualChecklistEl}
        <button className="btn-press" onClick={succeed}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>🎉 J'ai réussi!</button>
        <button onClick={fail} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px",background:"#1a1a1a",color:"#888",border:"2px solid #333",borderRadius:5,cursor:"pointer"}}>✕ Abandonner</button>
      </>)}

      {startTs && timeUp && (<>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,16px)",color:acc,textAlign:"center"}}>⏰ Temps écoulé!</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#ddd",textAlign:"center",lineHeight:1.3}}>As-tu réussi « {taskName()} »?</div>
        <button className="btn-press" onClick={succeed}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",padding:"16px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>🎉 Oui, réussi!</button>
        <button onClick={fail}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"13px",background:"#1a1a1a",color:"#FFA94D",border:"2px solid #FFA94D55",borderRadius:8,cursor:"pointer"}}>😅 Oups, prochaine fois (pas de récompense)</button>
      </>)}
    </div>
  );
}
