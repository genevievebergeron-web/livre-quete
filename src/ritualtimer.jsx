// ─── MINUTEUR INLINE POUR LA VUE RITUEL ─────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif). Débloqué par le refactor CALM
// (src/calm.js) + l'extraction de spawnParticles (src/particles.js). Zéro changement
// de comportement — état local uniquement.
import { useState, useEffect, useRef } from "react";
import { SFX } from "./sfx.js";
import { CALM } from "./calm.js";
import { spawnParticles } from "./particles.js";

// v1.73.0 — minuteur compact INLINE pour la vue rituel (3 modes : minuterie / heure butoir / chrono)
export function InlineRitualTimer({ endTime, accent }){
  const [mode,setMode]=useState("down"); const [running,setRunning]=useState(false);
  const [secs,setSecs]=useState(0); const [mins,setMins]=useState(10); const [endT,setEndT]=useState(endTime||"08:00");
  const ref=useRef(null);
  useEffect(()=>{ if(!running){ if(ref.current)clearInterval(ref.current); return; }
    ref.current=setInterval(()=>{ setSecs(s=>{ if(mode==="up") return s+1; if(s<=1){ try{ if(!CALM)spawnParticles("⏰"); SFX.epic&&SFX.epic(); }catch{} setRunning(false); return 0; } return s-1; }); },1000);
    return ()=>clearInterval(ref.current);
  },[running,mode]);
  const acc=accent||"#D9BC5C";
  const start=()=>{ let s=0; if(mode==="down") s=Math.max(1,mins)*60; else if(mode==="deadline"){ const [h,m]=(endT||"08:00").split(":").map(Number); const now=new Date(); const end=new Date(); end.setHours(h||0,m||0,0,0); if(end<now) end.setDate(end.getDate()+1); s=Math.max(0,Math.round((end-now)/1000)); } else s=0; setSecs(s); setRunning(true); };
  const fmt=(s)=>{ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60; return (h>0?h+":"+String(m).padStart(2,"0"):String(m))+":"+String(ss).padStart(2,"0"); };
  const low=mode!=="up"&&running&&secs<=60;
  return (
    <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${acc}55`,borderRadius:10,padding:12,marginTop:6}}>
      <div style={{display:"flex",gap:5,marginBottom:8}}>
        {[["down","⏳ Minuterie"],["deadline","⏰ Heure butoir"],["up","⏱ Chrono"]].map(([k,l])=>(
          <button key={k} onClick={()=>{ if(SFX.click)SFX.click(); setMode(k); setRunning(false); setSecs(0); }} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:6,lineHeight:1.4,padding:"7px 3px",background:mode===k?acc:"#1a1a1a",color:mode===k?"#0d0d0d":"#888",border:`2px solid ${mode===k?acc:"#333"}`,borderRadius:5,cursor:"pointer"}}>{l}</button>
        ))}
      </div>
      {!running && mode==="down" && (
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8,justifyContent:"center"}}>
          {[2,5,10,15,30].map(m=>(<button key={m} onClick={()=>{if(SFX.click)SFX.click();setMins(m);}} style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"4px 11px",background:mins===m?acc:"#1a1a1a",color:mins===m?"#0d0d0d":"#bbb",border:"2px solid #444",borderRadius:12,cursor:"pointer"}}>{m} min</button>))}
        </div>
      )}
      {!running && mode==="deadline" && (
        <div style={{textAlign:"center",marginBottom:8}}>
          <input type="time" value={endT} onChange={e=>setEndT(e.target.value)} style={{fontFamily:"'VT323',monospace",fontSize:18,padding:"6px 10px",background:"#111",color:"#fff",border:`2px solid ${acc}`,borderRadius:6}}/>
        </div>
      )}
      <div style={{textAlign:"center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(20px,5vw,32px)",color:low?"#D97070":acc,margin:"6px 0 10px"}}>{fmt(secs)}</div>
      <div style={{display:"flex",gap:6}}>
        {!running
          ? <button onClick={()=>{if(SFX.click)SFX.click();start();}} style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"11px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>▶ Partir</button>
          : <button onClick={()=>{if(SFX.click)SFX.click();setRunning(false);}} style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"11px",background:"#D99248",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>⏸ Pause</button>}
        <button onClick={()=>{if(SFX.click)SFX.click();setRunning(false);setSecs(0);}} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"11px",background:"#222",color:"#888",border:"2px solid #444",borderRadius:6,cursor:"pointer"}}>↺ Reset</button>
      </div>
    </div>
  );
}
