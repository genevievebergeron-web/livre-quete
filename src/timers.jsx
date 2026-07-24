// ─── PETITS COMPOSANTS D'HORLOGE SANS ÉTAT PARTAGÉ ─────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : chacun gère son propre tick
// via un état + interval LOCAL (pattern déjà en place depuis v1.94.0), donc leur re-render
// n'affecte jamais App() — zéro dépendance externe au-delà de React, zéro changement de
// comportement. InlineRitualTimer reste dans App.jsx : il dépend de CALM (flag mutable
// partagé) et spawnParticles (état applicatif plus large), pas un candidat aussi sûr.
import { useState, useEffect } from "react";

export function Countdown({ endTime, th, calm }) {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i); },[]);
  const [eh,em]=endTime.split(":").map(Number);
  const target=new Date(); target.setHours(eh,em,0,0);
  const diff=target-now;
  const isLate=diff<0;
  const abs=Math.abs(diff);
  const h=Math.floor(abs/3600000), m=Math.floor((abs%3600000)/60000), s=Math.floor((abs%60000)/1000);
  const pct=isLate?100:Math.max(0,100-(diff/(3600000*2))*100); // 2h window
  const urgent=!calm && diff>0&&diff<900000; // <15min (jamais en mode calme)
  // Mode calme : pas de rouge, pas d'urgence, pas de pulsation — juste l'heure et une barre neutre
  const danger = !calm && isLate;
  return (
    <div style={{padding:"10px 14px",background:danger?"rgba(255,50,50,0.2)":urgent?"rgba(255,180,0,0.15)":"rgba(0,0,0,0.4)",border:`3px solid ${danger?"#D97070":urgent?"#D9BC5C":th.accent}60`,borderRadius:6,animation:(urgent||danger)?"redPulse 1s ease-in-out infinite":"none"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:danger?"#D97070":urgent?"#D9BC5C":th.accent,marginBottom:6,textAlign:"center"}}>
        {calm ? "⏱ Rituel jusqu'à "+endTime : (isLate?"⚠️ EN RETARD!":urgent?"🏃 DÉPÊCHE-TOI!":"⏱ RITUEL TERMINE À "+endTime)}
      </div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(22px,4vw,44px)",color:danger?"#D97070":urgent?"#D9BC5C":"#fff",textAlign:"center",textShadow:calm?"none":`0 0 20px ${danger?"#D97070":urgent?"#D9BC5C":th.accent}`,letterSpacing:2,marginBottom:8}}>
        {isLate?(calm?"":"+"):""}{h>0?h+"h ":""}{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}
      </div>
      <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,${th.primary},${danger?"#D97070":th.accent})`,transition:"width 1s ease"}}/>
      </div>
    </div>
  );
}

// v1.94.0 (Lot 5 #22) — horloge du header isolée dans son propre petit composant (comme
// Countdown/InlineRitualTimer) : son tick de 1s ne fait re-render QUE ce composant, plus
// jamais tout l'arbre App() en cascade. La logique métier qui a vraiment besoin de "now"
// (barre de progression, compte à rebours, indicateur de synchro) reste dans App(), mais
// son propre tick a été ralenti de 1s à 30s (aucune de ces valeurs n'a besoin d'une
// précision à la seconde près) — App() ne re-render donc plus que 2x/min au lieu de 60x/min.
export function HeaderClock({ style }) {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i); },[]);
  const H=String(now.getHours()).padStart(2,"0"), M=String(now.getMinutes()).padStart(2,"0");
  return <div style={style}>{H}:{M}</div>;
}

// Disque Time Timer (anneau qui rétrécit) — SVG pur, aucune dépendance au-delà de ses props.
export function TimeTimerDisc({ progress, size=110, color="#85CDD1", urgentColor="#D98C8C", urgent=false }) {
  const r = size/2 - 8;
  const c = 2*Math.PI*r;
  const p = Math.max(0, Math.min(1, progress||0));
  const offset = c * (1-p);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display:"block",margin:"0 auto"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#222" strokeWidth="10"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={urgent?urgentColor:color} strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 0.9s linear, stroke 0.3s"}}/>
    </svg>
  );
}
