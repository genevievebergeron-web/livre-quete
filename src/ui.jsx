// ─── PETITS WIDGETS D'INTERFACE RÉUTILISABLES ──────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : composants purement présentationnels
// (aucun state applicatif, seulement leurs props + SFX pour le clic clavier) — zéro état
// partagé au niveau module, zéro changement de comportement.
import { useState, useEffect } from "react";
import { SFX } from "./sfx.js";

// ─── TOAST ───────────────────────────────────────────────────
export function Toast({ msg, color }) {
  return <div style={{position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.93)",border:`3px solid ${color||"#5CAD68"}`,borderRadius:4,padding:"9px 18px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:color||"#5CAD68",zIndex:990,whiteSpace:"nowrap",animation:"toastIn 0.3s ease",maxWidth:"90vw",textAlign:"center"}}>{msg}</div>;
}

export function PinDots({ value, error, color="#D9BC5C" }) {
  return (
    <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:14}}>
      {[0,1,2,3].map(n=>(
        <div key={n} style={{width:30,height:38,background:error?"#D97070":(value.length>n?color:"#1a1a1a"),borderRadius:4,border:`2px solid ${error?"#D97070":(value.length>n?color:"#444")}`,transition:"all 0.12s",transform:error?"scale(1.1)":"scale(1)"}}/>
      ))}
    </div>
  );
}
export function PinKeypad({ onDigit, onBack, onClose, onSubmit, closeLabel="✕" }) {
  useEffect(() => {
    const handle = (e) => {
      if (e.key >= "0" && e.key <= "9") { SFX.click(); onDigit(e.key); }
      else if (e.key === "Backspace") { SFX.click(); onBack(); }
      else if (e.key === "Enter" && onSubmit) { SFX.click(); onSubmit(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onDigit, onBack, onClose, onSubmit]);
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
      {["1","2","3","4","5","6","7","8","9","⌫","0",closeLabel].map(d=>(
        <button key={d} onClick={()=>{ SFX.click(); if(d==="⌫") onBack(); else if(d===closeLabel) onClose(); else onDigit(d); }}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,padding:"11px 0",background:d===closeLabel?"#330000":"#1a1a1a",color:d===closeLabel?"#D97070":"#ccc",border:"2px solid #2a2a2a",borderRadius:4,cursor:"pointer"}}>
          {d}
        </button>
      ))}
    </div>
  );
}

// v2.6.0 — case à cocher locale (éphémère) pour les tâches des annonces parent
export function TaskCheck({ text }) {
  const [done, setDone] = useState(false);
  return (
    <div onClick={()=>setDone(!done)} style={{cursor:"pointer",padding:"4px 0",display:"flex",gap:8,alignItems:"flex-start",
      color:done?"var(--txt-faint,#555)":"#ddd",textDecoration:done?"line-through":"none",fontSize:14,lineHeight:1.4}}>
      <span style={{flexShrink:0,fontSize:16}}>{done?"✅":"⬜"}</span>
      <span>{text}</span>
    </div>
  );
}
// v2.6.0 — compte à rebours live vers l'heure cible d'une annonce parent
// v2.14.1 — textes personnalisables par annonce (label = suite du temps, doneText = à zéro)
export function AnnouncementCountdown({ target, label, doneText }) {
  const [remaining, setRemaining] = useState("");
  useEffect(()=>{
    const suffix = label || "avant que les invités commencent à arriver !";
    const tick = ()=>{
      const diff = new Date(target) - new Date();
      if(diff<=0){ setRemaining(doneText || "Les invités arrivent maintenant ! 🎉"); return; }
      const h = Math.floor(diff/3600000);
      const m = Math.floor((diff%3600000)/60000);
      const s = Math.floor((diff%60000)/1000);
      setRemaining(h>0 ? `⏱ ${h}h ${m}min ${suffix}`
                       : `⏱ ${m}min ${s}s ${suffix}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return ()=>clearInterval(id);
  }, [target, label, doneText]);
  return <div style={{marginTop:10,color:"#FFD54F",fontWeight:"bold",fontSize:14,textAlign:"center"}}>{remaining}</div>;
}
