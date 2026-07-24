// ─── PETITS WIDGETS D'INTERFACE RÉUTILISABLES ──────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : composants purement présentationnels
// (aucun state applicatif, seulement leurs props + SFX pour le clic clavier) — zéro état
// partagé au niveau module, zéro changement de comportement.
import { useEffect } from "react";
import { SFX } from "./sfx.js";

// ─── TOAST ───────────────────────────────────────────────────
export function Toast({ msg, color }) {
  return <div style={{position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.93)",border:`3px solid ${color||"#2ECC40"}`,borderRadius:4,padding:"9px 18px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:color||"#2ECC40",zIndex:990,whiteSpace:"nowrap",animation:"toastIn 0.3s ease",maxWidth:"90vw",textAlign:"center"}}>{msg}</div>;
}

export function PinDots({ value, error, color="#FFD700" }) {
  return (
    <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:14}}>
      {[0,1,2,3].map(n=>(
        <div key={n} style={{width:30,height:38,background:error?"#FF4444":(value.length>n?color:"#1a1a1a"),borderRadius:4,border:`2px solid ${error?"#FF4444":(value.length>n?color:"#444")}`,transition:"all 0.12s",transform:error?"scale(1.1)":"scale(1)"}}/>
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
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,padding:"11px 0",background:d===closeLabel?"#330000":"#1a1a1a",color:d===closeLabel?"#FF4444":"#ccc",border:"2px solid #2a2a2a",borderRadius:4,cursor:"pointer"}}>
          {d}
        </button>
      ))}
    </div>
  );
}
